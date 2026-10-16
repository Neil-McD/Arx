import { internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import {
  COMMUNITY_APP_MAX_REQUEST_BYTES,
  hashCommunityAppSessionToken,
  isCommunityAppTool,
  normalizeCommunityAppOrigin,
  readCommunityAppBearerToken,
} from "../shared/communityAppSession";
import type { PolynetCanonicalToolName } from "../shared/polynetCanonicalToolContract";

export const COMMUNITY_APP_RUNTIME_PATH = "/runtime/app";

type HttpRouterLike = {
  route: (config: { path: string; method: "POST" | "OPTIONS"; handler: PublicHttpAction }) => void;
};
type HttpActionLike = (handler: (ctx: any, req: Request) => Promise<Response>) => PublicHttpAction;

// CORS is granted only to the exact origin of an active community app; the
// response never reflects an arbitrary Origin.
function corsHeaders(origin: string | null): Record<string, string> {
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

function reply(status: number, body: Record<string, unknown>, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

export function registerCommunityAppRoutes(args: { http: HttpRouterLike; httpAction: HttpActionLike }) {
  args.http.route({
    path: COMMUNITY_APP_RUNTIME_PATH,
    method: "OPTIONS",
    handler: args.httpAction(async (ctx, req) => {
      const origin = normalizeCommunityAppOrigin(req.headers.get("origin") ?? "");
      const allowed = origin
        ? await ctx.runQuery(internal.communityApps.isActiveCommunityAppOriginInternal, { origin })
        : false;
      return new Response(null, { status: allowed ? 204 : 403, headers: corsHeaders(allowed ? origin : null) });
    }),
  });

  args.http.route({
    path: COMMUNITY_APP_RUNTIME_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const origin = normalizeCommunityAppOrigin(req.headers.get("origin") ?? "");
      const token = readCommunityAppBearerToken(req.headers.get("authorization"));
      if (!origin || !token) {
        return reply(401, { ok: false, code: "community_app_session_required", message: "A community app session is required." }, null);
      }
      const session = (await ctx.runQuery(internal.communityApps.resolveCommunityAppSessionInternal, {
        tokenHash: await hashCommunityAppSessionToken(token),
        origin,
      })) as
        | { ok: false }
        | { ok: true; userId: string; authSubject: string; communityId: string; appId: string; allowedTools: string[] };
      if (!session.ok) {
        return reply(401, { ok: false, code: "community_app_session_invalid", message: "The app session is invalid or expired." }, null);
      }
      const raw = await req.text();
      if (raw.length > COMMUNITY_APP_MAX_REQUEST_BYTES) {
        return reply(413, { ok: false, code: "request_too_large", message: "Request body is too large." }, origin);
      }
      let body: Record<string, unknown>;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
        body = parsed as Record<string, unknown>;
      } catch {
        return reply(400, { ok: false, code: "invalid_json", message: "Body must be a JSON object." }, origin);
      }
      const tool = body.tool;
      const input = body.input && typeof body.input === "object" && !Array.isArray(body.input)
        ? (body.input as Record<string, unknown>)
        : null;
      if (!isCommunityAppTool(tool) || !input) {
        return reply(400, { ok: false, code: "invalid_tool_args", message: "Provide a Polynet tool and an input object." }, origin);
      }
      if (!session.allowedTools.includes(tool)) {
        return reply(403, { ok: false, code: "community_app_tool_not_allowed", message: "This app is not allowed to use that tool." }, origin);
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
        ? reply(200, { ok: true, value: execution.value }, origin)
        : reply(200, { ok: false, code: execution.code, message: execution.message }, origin);
    }),
  });
}
