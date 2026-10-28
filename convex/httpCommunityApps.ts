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
  isCommunityAppSignoutTicket,
  signCommunityAppSignoutTicket,
  verifyCommunityAppSignoutTicket,
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
export const COMMUNITY_EDGE_DISCOVER_PATH = "/runtime/community_edge/discover";
export const COMMUNITY_APP_ACCOUNT_PATH = "/runtime/app/account";
// Members' own pages: only sessions minted on a site's private twin.
export const COMMUNITY_APP_MY_COMMUNITIES_PATH = "/runtime/app/me/communities";
// Settings, each through the same core Studio's settings use.
export const COMMUNITY_APP_MY_SETTINGS_PATH = "/runtime/app/me/settings";
export const COMMUNITY_APP_MY_HANDLE_PATH = "/runtime/app/me/handle";
export const COMMUNITY_APP_MY_PROFILE_PATH = "/runtime/app/me/profile";
export const COMMUNITY_APP_MY_AVATAR_UPLOAD_PATH = "/runtime/app/me/avatar_upload";
export const COMMUNITY_APP_MY_AVATAR_PATH = "/runtime/app/me/avatar";
export const COMMUNITY_APP_MY_NOTIFICATIONS_PATH = "/runtime/app/me/notifications";
export const COMMUNITY_APP_MY_LEAVE_PATH = "/runtime/app/me/leave";
const SETTINGS_MAX_BYTES = 8 * 1024;

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

type AppSession = { userId: string; authSubject: string; communityId: string; kind: "site" | "private" };

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

// Every personal endpoint (the member's communities now; messages and settings
// next): a session minted on the site's private twin, where only Polynet's code
// runs. A site's own session, whatever its page's code asks, is refused.
async function requirePrivateAppSession(ctx: any, req: Request): Promise<AppSession | Response> {
  const session = await requireAppSession(ctx, req);
  if (session instanceof Response) return session;
  if (session.kind !== "private") {
    return reply(403, { ok: false, code: "private_session_required", message: "Open this from your own pages." });
  }
  return session;
}

// Settings: a private session, of someone still in this community (a session
// outlives a member who leaves or is removed). Their role here, for the page.
async function requirePrivateMemberSession(ctx: any, req: Request): Promise<(AppSession & { community: { name: string; role: string } }) | Response> {
  const session = await requirePrivateAppSession(ctx, req);
  if (session instanceof Response) return session;
  const account = (await ctx.runQuery(internal.communityApps.getCommunityAppAccountInternal, {
    userId: session.userId as any, currentCommunityId: session.communityId as any,
  })) as { community: { name: string; role: string } } | null;
  if (!account) return reply(403, { ok: false, code: "not_a_member", message: "Join this community to change its settings." });
  return { ...session, community: account.community };
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

// The refusals Studio's settings cores give, by code, for the twin to explain.
// Anything else is a plain failure (never the core's raw message).
const SETTINGS_REFUSALS = [
  "profile_display_name_too_long", "profile_bio_too_long", "profile_handle_taken", "profile_handle_empty",
  "profile_handle_reserved", "profile_handle_too_short", "profile_handle_too_long", "profile_handle_invalid_format",
  "profile_avatar_invalid", "profile_link_invalid_youtube", "profile_link_invalid_x", "profile_link_invalid_instagram",
  "community_owner_cannot_leave", "community_forbidden", "community_entitlement_required", "community_not_found",
];
function settingsRefusal(error: unknown): string | null {
  const data = (error as { data?: unknown } | null)?.data;
  const code = typeof (data as { code?: unknown } | null)?.code === "string" ? String((data as { code: string }).code) : "";
  const message = code || String((error as { message?: unknown } | null)?.message ?? "");
  return SETTINGS_REFUSALS.find((known) => message === known || message.includes(known)) ?? null;
}

async function runSettingsWrite(run: () => Promise<unknown>): Promise<{ ok: true; value: any } | Response> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const code = settingsRefusal(error);
    if (code) return reply(400, { ok: false, code });
    return reply(500, { ok: false, code: "settings_unavailable", message: "That didn't save. Try again." });
  }
}

// The profile fields the twin's settings page shows: what Studio's own read returns.
function settingsProfile(profile: any) {
  const links = profile?.social_links ?? {};
  return {
    display_name: profile?.display_name ?? null,
    handle: profile?.handle ?? null,
    bio: profile?.bio ?? null,
    avatar_url: profile?.avatar_url ?? null,
    social_links: { youtube: links.youtube ?? "", x: links.x ?? "", instagram: links.instagram ?? "" },
  };
}

// Text or nothing (null clears), as Studio's profile write takes it; any other type is refused.
function optionalText(body: Record<string, unknown>, key: string): { ok: true; value?: string | null } | { ok: false } {
  if (!(key in body)) return { ok: true };
  const value = body[key];
  return value === null || typeof value === "string" ? { ok: true, value } : { ok: false };
}

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
      const rawRunKey = typeof body?.run_key === "string" ? body.run_key.trim() : "";
      const runKey = /^[A-Za-z0-9_-]{8,100}$/.test(rawRunKey) ? rawRunKey : messageKey;
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
          // Each attempt runs: a retry keeps the question's key (saved once) with a new run key.
          idempotency_key: `community-app-run:${runKey}`,
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

  // Your communities, on a site's private twin only.
  args.http.route({
    path: COMMUNITY_APP_MY_COMMUNITIES_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requirePrivateAppSession(ctx, req);
      if (session instanceof Response) return session;
      const body = await readJsonObject(req, 1024);
      if (!body) return reply(400, { ok: false, code: "invalid_request" });
      const communities = await ctx.runQuery(internal.communityApps.listCommunityAppMemberCommunitiesInternal, {
        userId: session.userId as any,
        sitesDomain: typeof body.sites_domain === "string" ? body.sites_domain : undefined,
        hostSuffix: typeof body.host_suffix === "string" ? body.host_suffix : undefined,
      });
      return reply(200, { ok: true, communities });
    }),
  });

  // Settings on a site's private twin only. The page shows and edits what
  // Studio's member settings do, through the same cores.
  args.http.route({
    path: COMMUNITY_APP_MY_SETTINGS_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requirePrivateMemberSession(ctx, req);
      if (session instanceof Response) return session;
      const ids = { userId: session.userId as any };
      const here = { ...ids, communityId: session.communityId as any };
      const [profile, email, member] = await Promise.all([
        ctx.runQuery(internal.profiles.readOwnProfileDetailForTrustedUserInternal, ids),
        ctx.runQuery(internal.emailPreferences.getEmailPreferencesForTrustedUserInternal, ids),
        ctx.runQuery(internal.communityAdmin.getCommunityMemberSettingsForTrustedUserInternal, here).catch(() => null),
      ]);
      return reply(200, {
        ok: true,
        profile: settingsProfile(profile),
        community: { name: session.community.name, role: session.community.role },
        notifications: { muted: Boolean((member as { muted?: boolean } | null)?.muted), weekly_digest: (email as { weekly_digest_enabled: boolean }).weekly_digest_enabled },
      });
    }),
  });

  // Whether a handle is free, as Studio checks it while the member types.
  args.http.route({
    path: COMMUNITY_APP_MY_HANDLE_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requirePrivateMemberSession(ctx, req);
      if (session instanceof Response) return session;
      const body = await readJsonObject(req, 1024);
      if (typeof body?.handle !== "string") return reply(400, { ok: false, code: "invalid_request" });
      const result = (await ctx.runQuery(internal.profiles.checkHandleAvailabilityForTrustedUserInternal, {
        userId: session.userId as any, handle: body.handle,
      })) as { available: boolean; status: string; handle: string | null };
      return reply(200, { ok: true, available: result.available, status: result.status, handle: result.handle });
    }),
  });

  // Name, handle, bio and links, through Studio's profile write.
  args.http.route({
    path: COMMUNITY_APP_MY_PROFILE_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requirePrivateMemberSession(ctx, req);
      if (session instanceof Response) return session;
      const body = await readJsonObject(req, SETTINGS_MAX_BYTES);
      if (!body) return reply(400, { ok: false, code: "invalid_request" });
      const update: Record<string, unknown> = { userId: session.userId };
      for (const [key, field] of [["display_name", "displayName"], ["handle", "handle"], ["bio", "bio"]] as const) {
        const text = optionalText(body, key);
        if (!text.ok) return reply(400, { ok: false, code: "invalid_request" });
        if (text.value !== undefined) update[field] = text.value;
      }
      if ("social_links" in body) {
        const raw = body.social_links;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return reply(400, { ok: false, code: "invalid_request" });
        const links: Record<string, string | null> = {};
        for (const kind of ["youtube", "x", "instagram"]) {
          const text = optionalText(raw as Record<string, unknown>, kind);
          if (!text.ok) return reply(400, { ok: false, code: "invalid_request" });
          if (text.value !== undefined) links[kind] = text.value;
        }
        update.socialLinks = links;
      }
      const written = await runSettingsWrite(() => ctx.runMutation(internal.profiles.updateProfileDetailForTrustedUserInternal, update as any));
      if (written instanceof Response) return written;
      return reply(200, { ok: true, profile: settingsProfile(written.value) });
    }),
  });

  // A new photo, step 1 of Studio's flow: where to send the file. The browser
  // sends it straight to Polynet's storage, then confirms it below.
  args.http.route({
    path: COMMUNITY_APP_MY_AVATAR_UPLOAD_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requirePrivateMemberSession(ctx, req);
      if (session instanceof Response) return session;
      const issued = await runSettingsWrite(() => ctx.runMutation(internal.profiles.generateProfileAvatarUploadUrlForTrustedUserInternal, {
        userId: session.userId as any,
      }));
      if (issued instanceof Response) return issued;
      return reply(200, { ok: true, upload_url: (issued.value as { uploadUrl: string }).uploadUrl });
    }),
  });

  // Step 2: the uploaded file becomes the photo (or null removes it).
  args.http.route({
    path: COMMUNITY_APP_MY_AVATAR_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requirePrivateMemberSession(ctx, req);
      if (session instanceof Response) return session;
      const body = await readJsonObject(req, 1024);
      const storageId = body?.storage_id;
      if (!body || !(storageId === null || (typeof storageId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(storageId)))) {
        return reply(400, { ok: false, code: "invalid_request" });
      }
      const written = await runSettingsWrite(() => ctx.runMutation(internal.profiles.updateProfileDetailForTrustedUserInternal, {
        userId: session.userId as any, avatarStorageId: storageId as any,
      }));
      if (written instanceof Response) return written;
      return reply(200, { ok: true, profile: settingsProfile(written.value) });
    }),
  });

  // Studio's two notification settings: mute this community, and the weekly
  // digest (one setting for every community, as in Studio).
  args.http.route({
    path: COMMUNITY_APP_MY_NOTIFICATIONS_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requirePrivateMemberSession(ctx, req);
      if (session instanceof Response) return session;
      const body = await readJsonObject(req, 1024);
      const muted = body?.muted;
      const digest = body?.weekly_digest;
      if (!body || (muted !== undefined && typeof muted !== "boolean") || (digest !== undefined && typeof digest !== "boolean") || (muted === undefined && digest === undefined)) {
        return reply(400, { ok: false, code: "invalid_request" });
      }
      const ids = { userId: session.userId as any };
      const written = await runSettingsWrite(async () => ({
        member: typeof muted === "boolean"
          ? await ctx.runMutation(internal.communityAdmin.saveCommunityMemberSettingsForTrustedUserInternal, { ...ids, communityId: session.communityId as any, muted })
          : null,
        email: typeof digest === "boolean"
          ? await ctx.runMutation(internal.emailPreferences.updateWeeklyDigestForTrustedUserInternal, { ...ids, weeklyDigestEnabled: digest })
          : null,
      }));
      if (written instanceof Response) return written;
      const value = written.value as { member: { muted: boolean } | null; email: { weekly_digest_enabled: boolean } | null };
      return reply(200, {
        ok: true,
        notifications: {
          ...(value.member ? { muted: value.member.muted } : {}),
          ...(value.email ? { weekly_digest: value.email.weekly_digest_enabled } : {}),
        },
      });
    }),
  });

  // Leaving this community, as Studio's Leave community does. The owner can't.
  args.http.route({
    path: COMMUNITY_APP_MY_LEAVE_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const session = await requirePrivateMemberSession(ctx, req);
      if (session instanceof Response) return session;
      const left = await runSettingsWrite(() => ctx.runMutation(internal.communityAdmin.leaveCommunityForTrustedUserInternal, {
        userId: session.userId as any, communityId: session.communityId as any,
      }));
      if (left instanceof Response) return left;
      return reply(200, { ok: true });
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

  // Discover on every community site, signed in or not: published communities'
  // public cards. The edge caches it; it names its sites domain so each card
  // can link to that community's own site.
  args.http.route({
    path: COMMUNITY_EDGE_DISCOVER_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      if (!fromEdge(req)) return reply(401, { ok: false, code: "edge_unauthorized" });
      const body = await readJsonObject(req, 1024);
      if (!body) return reply(400, { ok: false, code: "invalid_request" });
      const communities = await ctx.runQuery(internal.communityPublic.listSiteDiscoverCommunitiesInternal, {
        sitesDomain: typeof body.sites_domain === "string" ? body.sites_domain : undefined,
        hostSuffix: typeof body.host_suffix === "string" ? body.host_suffix : undefined,
      });
      return reply(200, { ok: true, communities });
    }),
  });

  args.http.route({
    path: COMMUNITY_EDGE_REVOKE_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      if (!fromEdge(req)) return reply(401, { ok: false, code: "edge_unauthorized" });
      const body = await readJsonObject(req, 1024);
      const ticket = body?.ticket;
      if (!isCommunityAppSessionToken(body?.token) || (ticket !== undefined && !isCommunityAppSignoutTicket(ticket))) {
        return reply(400, { ok: false, code: "invalid_request" });
      }
      const tokenHash = await hashCommunityAppSessionToken(body.token as string);
      const secret = readEnv("POLYNET_COMMUNITY_EDGE_SECRET");
      // The other half of a sign-out: only the same member's session in the same community ends.
      if (ticket !== undefined) {
        const owner = (await ctx.runQuery(internal.communityApps.readCommunityAppSessionOwnerInternal, { tokenHash })) as
          { userId: string; communityId: string } | null;
        if (!owner || !(await verifyCommunityAppSignoutTicket(secret, ticket as string, owner.userId, owner.communityId, Date.now()))) {
          return reply(403, { ok: false, code: "signout_ticket_invalid" });
        }
      }
      const revoked = (await ctx.runMutation(internal.communityApps.revokeCommunityAppSessionInternal, { tokenHash })) as
        { revoked: boolean; userId?: string; communityId?: string };
      // A first sign-out hands back the ticket that ends the site's other origin too.
      if (ticket === undefined && revoked.revoked && revoked.userId && revoked.communityId) {
        return reply(200, { ok: true, signout_ticket: await signCommunityAppSignoutTicket(secret, revoked.userId, revoked.communityId, Date.now()) });
      }
      return reply(200, { ok: true });
    }),
  });
}
