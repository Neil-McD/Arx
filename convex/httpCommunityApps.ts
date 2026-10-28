import { internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { storeCommunityAttachmentUpload } from "./httpCommunityAttachments";
import { handleRuntimeTurnRequest } from "./runtimeTurnHandlers";
import { trustedMemberTurnContext } from "./communityAppAgentTurn";
import { sseResponseWithHeaders, type SseSource } from "./httpStreaming";
import {
  COMMUNITY_APP_MAX_REQUEST_BYTES,
  generateCommunityAppHandoffCode,
  deriveCommunityAppWatchToken,
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
export const COMMUNITY_APP_UPLOAD_PATH = "/runtime/app/upload";
export const COMMUNITY_APP_FILE_PATH = "/runtime/app/file";
export const COMMUNITY_APP_AGENT_PATH = "/runtime/app/agent";
export const COMMUNITY_APP_AGENT_MESSAGES_PATH = "/runtime/app/agent_messages";
const AGENT_MESSAGE_MAX_CHARS = 8_000;
export const COMMUNITY_APP_HANDOFF_PATH = "/runtime/auth_bridge_community_handoff";
export const COMMUNITY_EDGE_EXCHANGE_PATH = "/runtime/community_edge/session_exchange";
export const COMMUNITY_EDGE_REVOKE_PATH = "/runtime/community_edge/session_revoke";
export const COMMUNITY_EDGE_PUBLIC_PATH = "/runtime/community_edge/public";
export const COMMUNITY_APP_ACCOUNT_PATH = "/runtime/app/account";

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

type AppSession = { userId: string; authSubject: string; communityId: string };

// Every front-end route: only the edge, with the member session from its
// HttpOnly cookie, for the community domain it was issued to.
async function requireAppSession(ctx: any, req: Request): Promise<AppSession | Response> {
  if (!fromEdge(req)) return reply(401, { ok: false, code: "edge_unauthorized" });
  const origin = normalizeCommunityAppOrigin(req.headers.get("origin") ?? "");
  const token = readCommunityAppBearerToken(req.headers.get("authorization"));
  if (!origin || !token) {
    return reply(401, { ok: false, code: "community_app_session_required", message: "Sign in to this community." });
  }
  const session = (await ctx.runQuery(internal.communityApps.resolveCommunityAppSessionInternal, {
    tokenHash: await hashCommunityAppSessionToken(token),
    origin,
  })) as { ok: false } | ({ ok: true } & AppSession);
  if (!session.ok) {
    return reply(401, { ok: false, code: "community_app_session_invalid", message: "The session is invalid or expired." });
  }
  return session;
}

// The member's agent conversation for the session's community: the same one
// Studio's agent dock shows for that community.
async function ensureSiteAgentConversation(ctx: any, session: AppSession) {
  return (await ctx.runMutation(internal.threads.ensureCommunityAgentConversationForTrustedUserInternal, {
    communityId: session.communityId as any,
    trustedUserId: session.userId as any,
  })) as { thread_id: string; thread_key: string };
}

const noStoreHeaders = () => new Headers({ "Cache-Control": "no-store" });

export function registerCommunityAppRoutes(args: { http: HttpRouterLike; httpAction: HttpActionLike }) {
  // A turn with the community agent acting for the member, pinned to this community's
  // conversation and the member lane. The page sends only text; it cannot pick
  // the thread, community, model or funding.
  args.http.route({
    path: COMMUNITY_APP_AGENT_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requireAppSession(ctx, req);
      if (session instanceof Response) return session;
      const body = await readJsonObject(req, AGENT_MESSAGE_MAX_CHARS * 4);
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      const messageKey = typeof body?.message_key === "string" ? body.message_key.trim() : "";
      if (!text || text.length > AGENT_MESSAGE_MAX_CHARS || !/^[A-Za-z0-9_-]{8,100}$/.test(messageKey)) {
        return reply(400, { ok: false, code: "invalid_request", message: "Send text and a message_key." });
      }
      let conversation: { thread_id: string; thread_key: string };
      try {
        conversation = await ensureSiteAgentConversation(ctx, session);
      } catch {
        return reply(403, { ok: false, code: "not_a_member", message: "Join this community to use your agent here." });
      }
      const member = { userId: session.userId, authSubject: session.authSubject };
      const turnCtx = trustedMemberTurnContext(ctx, member);
      // The dock saves the member's message before the turn; so does a front end.
      const userMessageKey = `community-app:${messageKey}`;
      await turnCtx.runMutation(internal.threads.addCloudThreadMessageForTrustedOwnerInternal, {
        trustedOwnerId: session.userId as any, threadId: conversation.thread_id as any,
        messageKey: userMessageKey, role: "user", contentJson: { text },
      });
      const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorByTrustedSubjectInternal, {
        authSubject: session.authSubject, userId: session.userId as any,
      })) as { email: string | null; displayName: string | null; avatarUrl: string | null };
      const community = (await ctx.runQuery(internal.communityCapabilityContext.getCommunityRepositoryIdentityInternal, {
        communityId: session.communityId as any,
      })) as { slug: string } | null;
      if (!community?.slug) return reply(404, { ok: false, code: "community_unavailable" });
      const turnRequest = new Request(req.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          thread_id: conversation.thread_key,
          stream: true,
          surface: "web",
          invocation_surface: "member_agent_dock",
          surface_context: { version: 1, kind: "community", community_slug: community.slug, section: "chat" },
          requested_funding_source: "auto",
          requested_agentic_tools: true,
          idempotency_key: `community-app-run:${messageKey}`,
          user_message_key: userMessageKey,
        }),
      });
      return await handleRuntimeTurnRequest({
        ctx: turnCtx,
        req: turnRequest,
        jsonResponse: (_req, status, payload) => reply(status, payload as Record<string, unknown>),
        sseResponse: (_req, source) => sseResponseWithHeaders(noStoreHeaders(), source as SseSource),
        requireAuthenticatedActor: async () => ({
          ok: true,
          actor: {
            userId: String(session.userId), dbUserId: session.userId, authSubject: session.authSubject,
            email: actor.email, displayName: actor.displayName, avatarUrl: actor.avatarUrl,
          },
        }),
      });
    }),
  });

  // The conversation so far, oldest first.
  args.http.route({
    path: COMMUNITY_APP_AGENT_MESSAGES_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requireAppSession(ctx, req);
      if (session instanceof Response) return session;
      let conversation: { thread_id: string; thread_key: string };
      try {
        conversation = await ensureSiteAgentConversation(ctx, session);
      } catch {
        return reply(403, { ok: false, code: "not_a_member", message: "Join this community to use your agent here." });
      }
      const rows = (await ctx.runQuery(internal.threads.listNewestCloudThreadMessagesForTrustedOwnerInternal, {
        trustedOwnerId: session.userId as any, threadId: conversation.thread_id as any, limit: 100,
      })) as Array<{ messageKey?: string; role: string; contentJson: any; createdAt: number }>;
      return reply(200, {
        ok: true,
        messages: rows
          .filter((row) => row.role === "user" || row.role === "assistant")
          .map((row) => ({
            key: row.messageKey ?? null,
            role: row.role,
            text: typeof row.contentJson?.text === "string" ? row.contentJson.text : typeof row.contentJson === "string" ? row.contentJson : "",
            created_at: new Date(row.createdAt).toISOString(),
          })),
      });
    }),
  });

  // A file for a post: stored under a reservation the post claims with the
  // same idempotency key. Same limits and checks as Studio's uploads.
  args.http.route({
    path: COMMUNITY_APP_UPLOAD_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requireAppSession(ctx, req);
      if (session instanceof Response) return session;
      const key = (req.headers.get("x-polynet-idempotency-key") ?? "").trim();
      const slug = (req.headers.get("x-polynet-channel") ?? "").trim();
      const rootId = (req.headers.get("x-polynet-root-id") ?? "").trim();
      if (!key || key.length > 200 || !slug) return reply(400, { ok: false, code: "invalid_request" });
      const channel = (await ctx.runQuery(internal.communityChannels.resolveCommunityChannelBySlugInternal, {
        userId: session.userId as any, communityId: session.communityId as any, slug, actorKind: "human",
      })) as { id?: string } | null;
      if (!channel?.id) return reply(404, { ok: false, code: "channel_unavailable" });
      const result = await storeCommunityAttachmentUpload(ctx, req, {
        ownerId: session.userId, communityId: session.communityId, channelId: channel.id,
        ...(rootId ? { uploadRootId: rootId } : {}),
        // The door's composer claims attachments by its canonical idempotency key.
        messageKey: `polynet:community_app:${key}`,
      });
      return reply(result.status, { ok: result.status === 200, ...result.body });
    }),
  });

  // Streams a file the member can see in this community. Images display
  // inline; anything else downloads.
  args.http.route({
    path: COMMUNITY_APP_FILE_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requireAppSession(ctx, req);
      if (session instanceof Response) return session;
      const attachmentId = req.headers.get("x-polynet-attachment-id") ?? "";
      let upstream: Response | undefined;
      try {
        const queryArgs = { userId: session.userId, communityId: session.communityId, attachmentId };
        const source = (await ctx.runQuery((internal as any).communityAttachmentDownloads.resolveInternal, queryArgs)) as
          { url: string; name: string; mime: string } | null;
        if (!source) return reply(404, { ok: false, code: "file_unavailable" });
        upstream = await fetch(source.url, { redirect: "error", signal: req.signal });
        if (!upstream.ok || !upstream.body) throw new Error("file_unavailable");
        const current = await ctx.runQuery((internal as any).communityAttachmentDownloads.resolveInternal, queryArgs);
        if (!current || current.url !== source.url) throw new Error("file_unavailable");
        const image = /^image\/(jpeg|png|gif|webp|avif)$/.test(source.mime);
        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": image ? source.mime : "application/octet-stream",
            "Content-Disposition": `${image ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(source.name).replace(/'/g, "%27")}`,
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "private, no-store",
          },
        });
      } catch {
        await upstream?.body?.cancel().catch(() => undefined);
        return reply(404, { ok: false, code: "file_unavailable" });
      }
    }),
  });

  // Front-end API calls, forwarded only by the community edge with the member
  // session from its HttpOnly cookie. The browser never calls this directly.
  args.http.route({
    path: COMMUNITY_APP_RUNTIME_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requireAppSession(ctx, req);
      if (session instanceof Response) return session;
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
        watchTokenHash: await hashCommunityAppSessionToken(await deriveCommunityAppWatchToken(token)),
      })) as { ok: true; expiresAt: number } | { ok: false; reason: string };
      if (!result.ok) return reply(403, { ok: false, code: result.reason });
      return reply(200, { ok: true, token, expires_at: new Date(result.expiresAt).toISOString() });
    }),
  });

  // The signed-in member's Polynet account, for the shell every site shows.
  args.http.route({
    path: COMMUNITY_APP_ACCOUNT_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requireAppSession(ctx, req);
      if (session instanceof Response) return session;
      const account = await ctx.runQuery(internal.communityApps.getCommunityAppAccountInternal, {
        userId: session.userId as any, currentCommunityId: session.communityId as any,
      });
      if (!account) return reply(401, { ok: false, code: "community_app_session_invalid", message: "Sign in to this community." });
      return reply(200, { ok: true, account });
    }),
  });

  // The community's public identity for its site, signed in or not.
  args.http.route({
    path: COMMUNITY_EDGE_PUBLIC_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      if (!fromEdge(req)) return reply(401, { ok: false, code: "edge_unauthorized" });
      const body = await readJsonObject(req, 4096);
      const origin = normalizeCommunityAppOrigin(typeof body?.origin === "string" ? body.origin : "");
      if (!origin) return reply(400, { ok: false, code: "invalid_request" });
      const community = await ctx.runQuery(internal.communityApps.getCommunityPublicIdentityByOriginInternal, { origin });
      if (!community) return reply(404, { ok: false, code: "community_unavailable" });
      return reply(200, { ok: true, community });
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
