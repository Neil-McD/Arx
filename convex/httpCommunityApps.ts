import { internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import {
  COMMUNITY_APP_MAX_REQUEST_BYTES,
  generateCommunityAppHandoffCode,
  generateCommunityAppSessionToken,
  hashCommunityAppSessionToken,
  isCommunityAppHandoffCode,
  isCommunityAppHandoffState,
  isCommunityAppSessionToken,
  isCommunityAppTool,
  normalizeCommunityAppOrigin,
  readCommunityAppBearerToken,
} from "../shared/communityAppSession";
import type { PolynetCanonicalToolName } from "../shared/polynetCanonicalToolContract";

export const COMMUNITY_APP_RUNTIME_PATH = "/runtime/app";
export const COMMUNITY_APP_HANDOFF_PATH = "/runtime/auth_bridge_community_handoff";
export const COMMUNITY_EDGE_EXCHANGE_PATH = "/runtime/community_edge/session_exchange";
export const COMMUNITY_EDGE_REVOKE_PATH = "/runtime/community_edge/session_revoke";

function readEnv(name: string): string {
  return String((globalThis as any)?.process?.env?.[name] ?? "").trim();
}

// Constant-time comparison of shared secrets.
function secretMatches(provided: string | null, expected: string): boolean {
  const a = new TextEncoder().encode(String(provided ?? ""));
  const b = new TextEncoder().encode(expected);
  if (!expected || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

async function readJsonObject(req: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const raw = await req.text();
  if (raw.length > maxBytes) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type HttpRouterLike = {
  route: (config: { path: string; method: "POST" | "OPTIONS"; handler: PublicHttpAction }) => void;
};
type HttpActionLike = (handler: (ctx: any, req: Request) => Promise<Response>) => PublicHttpAction;

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function fromEdge(req: Request): boolean {
  return secretMatches(req.headers.get("x-polynet-edge-secret"), readEnv("POLYNET_COMMUNITY_EDGE_SECRET"));
}

export function registerCommunityAppRoutes(args: { http: HttpRouterLike; httpAction: HttpActionLike }) {
  // Front-end API calls, forwarded only by the community edge with the member
  // session from its HttpOnly cookie. The browser never calls this directly.
  args.http.route({
    path: COMMUNITY_APP_RUNTIME_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      if (!fromEdge(req)) return reply(401, { ok: false, code: "edge_unauthorized" });
      const origin = normalizeCommunityAppOrigin(req.headers.get("origin") ?? "");
      const token = readCommunityAppBearerToken(req.headers.get("authorization"));
      if (!origin || !token) {
        return reply(401, { ok: false, code: "community_app_session_required", message: "Sign in to this community." });
      }
      const session = (await ctx.runQuery(internal.communityApps.resolveCommunityAppSessionInternal, {
        tokenHash: await hashCommunityAppSessionToken(token),
        origin,
      })) as { ok: false } | { ok: true; userId: string; authSubject: string; communityId: string };
      if (!session.ok) {
        return reply(401, { ok: false, code: "community_app_session_invalid", message: "The session is invalid or expired." });
      }
      const raw = await req.text();
      if (raw.length > COMMUNITY_APP_MAX_REQUEST_BYTES) {
        return reply(413, { ok: false, code: "request_too_large", message: "Request body is too large." });
      }
      let body: Record<string, unknown>;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
        body = parsed as Record<string, unknown>;
      } catch {
        return reply(400, { ok: false, code: "invalid_json", message: "Body must be a JSON object." });
      }
      const tool = body.tool;
      const input = body.input && typeof body.input === "object" && !Array.isArray(body.input)
        ? (body.input as Record<string, unknown>)
        : null;
      if (!isCommunityAppTool(tool) || !input) {
        return reply(400, { ok: false, code: "invalid_tool_args", message: "Provide a Polynet tool and an input object." });
      }
      const execution = await executePolynetCanonicalTool({
        ctx,
        authSubject: session.authSubject,
        userId: session.userId,
        principalKind: "community_app",
        mountedCommunityId: session.communityId,
        evidenceSurface: "external_mcp",
        toolName: tool as PolynetCanonicalToolName,
        input,
      });
      return execution.ok
        ? reply(200, { ok: true, value: execution.value })
        : reply(200, { ok: false, code: execution.code, message: execution.message });
    }),
  });

  // Polynet's login bridge (server-side, bridge secret) asks for a one-time
  // handoff code for an already-signed-in Polynet session.
  args.http.route({
    path: COMMUNITY_APP_HANDOFF_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      if (!secretMatches(req.headers.get("x-arx-auth-bridge-secret"), readEnv("ARX_AUTH_BRIDGE_SECRET"))) {
        return reply(401, { ok: false, code: "auth_bridge_unauthorized" });
      }
      const body = await readJsonObject(req, 4096);
      const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
      const communitySlug = typeof body?.community_slug === "string" ? body.community_slug.trim() : "";
      const origin = normalizeCommunityAppOrigin(typeof body?.origin === "string" ? body.origin : "");
      const state = body?.state;
      if (!sessionId || !communitySlug || !origin || !isCommunityAppHandoffState(state)) {
        return reply(400, { ok: false, code: "invalid_request" });
      }
      const touched = (await ctx.runMutation(internal.authSessions.touchAuthSessionForUseInternal as any, {
        sessionId, nowMs: Date.now(),
      })) as { status: string; sessionId?: string };
      if (touched?.status !== "ready" || !touched.sessionId) {
        return reply(401, { ok: false, code: "sign_in_required" });
      }
      const resolved = (await ctx.runQuery(internal.authSessions.resolveAuthSessionBySessionIdInternal as any, {
        sessionId: touched.sessionId,
      })) as { ok: boolean; row?: { userId?: string } };
      if (!resolved?.ok || !resolved.row?.userId) {
        return reply(401, { ok: false, code: "sign_in_required" });
      }
      const code = generateCommunityAppHandoffCode();
      const result = (await ctx.runMutation(internal.communityApps.createCommunityAppHandoffInternal, {
        userId: resolved.row.userId as any,
        communitySlug,
        origin,
        codeHash: await hashCommunityAppSessionToken(code),
        stateHash: await hashCommunityAppSessionToken(state),
      })) as { ok: true } | { ok: false; reason: string; communitySlug?: string };
      if (!result.ok) {
        return reply(403, { ok: false, code: result.reason, community_slug: result.communitySlug ?? null });
      }
      return reply(200, { ok: true, code });
    }),
  });

  // The community edge (server-side, edge secret) swaps a one-time code for a
  // member session it keeps in an HttpOnly cookie on the community's domain.
  args.http.route({
    path: COMMUNITY_EDGE_EXCHANGE_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      if (!fromEdge(req)) return reply(401, { ok: false, code: "edge_unauthorized" });
      const body = await readJsonObject(req, 4096);
      const origin = normalizeCommunityAppOrigin(typeof body?.origin === "string" ? body.origin : "");
      if (!origin || !isCommunityAppHandoffCode(body?.code) || !isCommunityAppHandoffState(body?.state)) {
        return reply(400, { ok: false, code: "invalid_request" });
      }
      const token = generateCommunityAppSessionToken();
      const result = (await ctx.runMutation(internal.communityApps.consumeCommunityAppHandoffInternal, {
        codeHash: await hashCommunityAppSessionToken(body.code as string),
        stateHash: await hashCommunityAppSessionToken(body.state as string),
        origin,
        tokenHash: await hashCommunityAppSessionToken(token),
      })) as { ok: true; expiresAt: number } | { ok: false; reason: string };
      if (!result.ok) return reply(403, { ok: false, code: result.reason });
      return reply(200, { ok: true, token, expires_at: new Date(result.expiresAt).toISOString() });
    }),
  });

  args.http.route({
    path: COMMUNITY_EDGE_REVOKE_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      if (!fromEdge(req)) return reply(401, { ok: false, code: "edge_unauthorized" });
      const body = await readJsonObject(req, 1024);
      if (!isCommunityAppSessionToken(body?.token)) return reply(400, { ok: false, code: "invalid_request" });
      await ctx.runMutation(internal.communityApps.revokeCommunityAppSessionInternal, {
        tokenHash: await hashCommunityAppSessionToken(body.token as string),
      });
      return reply(200, { ok: true });
    }),
  });
}
