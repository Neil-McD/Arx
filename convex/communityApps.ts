import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import {
  COMMUNITY_APP_SESSION_TTL_MS,
  COMMUNITY_APP_TOOLS,
  generateCommunityAppSessionToken,
  hashCommunityAppSessionToken,
  normalizeCommunityAppOrigin,
  normalizeCommunityAppSlug,
} from "../shared/communityAppSession";

// Community apps: founder-registered experiences that act for one signed-in
// member, confined to one community and the member lane. An app session token
// identifies member + community + app + origin; authority is re-derived from
// current membership on every request by the canonical executor.

const identityArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()) };
const toolValidator = v.union(
  v.literal("polynet_list"),
  v.literal("polynet_read"),
  v.literal("polynet_search"),
  v.literal("polynet_write"),
  v.literal("polynet_call"),
);
const MAX_SESSIONS_PRUNED_PER_MINT = 20;

function requireAppOrigin(raw: string): string {
  const origin = normalizeCommunityAppOrigin(raw);
  if (!origin) throw new Error("community_app_origin_invalid");
  let polynetOrigin: string | null = null;
  try {
    polynetOrigin = readCanonicalPublicAppOrigin();
  } catch {
    polynetOrigin = null;
  }
  if (polynetOrigin && origin === polynetOrigin) throw new Error("community_app_origin_invalid");
  return origin;
}

function mapApp(row: any) {
  return {
    id: String(row._id),
    slug: row.slug,
    name: row.name,
    origin: row.origin,
    allowed_tools: row.allowedTools,
    status: row.status,
    updated_at: new Date(row.updatedAt).toISOString(),
  };
}

export const registerCommunityApp = mutation({
  args: {
    ...identityArgs,
    communityId: v.id("communities"),
    slug: v.string(),
    name: v.string(),
    origin: v.string(),
    allowedTools: v.array(toolValidator),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const slug = normalizeCommunityAppSlug(args.slug);
    const name = args.name.replace(/\s+/g, " ").trim();
    if (!slug) throw new Error("community_app_slug_invalid");
    if (!name || name.length > 80) throw new Error("community_app_name_invalid");
    const origin = requireAppOrigin(args.origin);
    const allowedTools = COMMUNITY_APP_TOOLS.filter((tool) => args.allowedTools.includes(tool));
    if (allowedTools.length === 0) throw new Error("community_app_tools_required");
    const existing = await ctx.db
      .query("communityApps")
      .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", slug))
      .first();
    if (existing) throw new Error("community_app_slug_taken");
    const nowMs = Date.now();
    const appId = await ctx.db.insert("communityApps", {
      communityId: args.communityId, slug, name, origin, allowedTools, status: "active",
      createdByUserId: userId, createdAt: nowMs, updatedAt: nowMs,
    });
    return mapApp((await ctx.db.get(appId))!);
  },
});

export const setCommunityAppStatus = mutation({
  args: {
    ...identityArgs,
    communityId: v.id("communities"),
    slug: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const app = await ctx.db
      .query("communityApps")
      .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", args.slug))
      .first();
    if (!app) throw new Error("community_app_not_found");
    await ctx.db.patch(app._id, { status: args.status, updatedAt: Date.now() });
    return mapApp((await ctx.db.get(app._id))!);
  },
});

export const listCommunityApps = query({
  args: { ...identityArgs, communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const rows = await ctx.db
      .query("communityApps")
      .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId))
      .take(100);
    return rows.map(mapApp);
  },
});

export const createCommunityAppSessionInternal = internalMutation({
  args: {
    ...identityArgs,
    communityId: v.id("communities"),
    appSlug: v.string(),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) throw new Error("community_app_session_invalid");
    const app = await ctx.db
      .query("communityApps")
      .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", args.appSlug))
      .first();
    if (!app || app.status !== "active") throw new Error("community_app_not_found");
    const nowMs = Date.now();
    const expired = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_app_user_expiresAt", (q) => q.eq("appId", app._id).eq("userId", userId).lt("expiresAt", nowMs))
      .take(MAX_SESSIONS_PRUNED_PER_MINT);
    for (const row of expired) await ctx.db.delete(row._id);
    const expiresAt = nowMs + COMMUNITY_APP_SESSION_TTL_MS;
    await ctx.db.insert("communityAppSessions", {
      tokenHash: args.tokenHash, appId: app._id, communityId: args.communityId, userId,
      origin: app.origin, expiresAt, createdAt: nowMs,
    });
    return { appSlug: app.slug, origin: app.origin, expiresAt };
  },
});

// Called by the member's Polynet shell when it opens an app. The token is
// generated here, in an action, from the platform CSPRNG; only its hash is stored.
export const mintCommunityAppSession = action({
  args: { ...identityArgs, communityId: v.id("communities"), appSlug: v.string() },
  handler: async (ctx, args): Promise<{ token: string; expires_at: string; origin: string; app_slug: string }> => {
    const token = generateCommunityAppSessionToken();
    const tokenHash = await hashCommunityAppSessionToken(token);
    const session = (await ctx.runMutation(internal.communityApps.createCommunityAppSessionInternal, {
      ...(args.userId ? { userId: args.userId } : {}),
      ...(args.authSubject ? { authSubject: args.authSubject } : {}),
      communityId: args.communityId,
      appSlug: args.appSlug,
      tokenHash,
    })) as { appSlug: string; origin: string; expiresAt: number };
    return { token, expires_at: new Date(session.expiresAt).toISOString(), origin: session.origin, app_slug: session.appSlug };
  },
});

export const resolveCommunityAppSessionInternal = internalQuery({
  args: { tokenHash: v.string(), origin: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!session || session.expiresAt <= Date.now() || session.origin !== args.origin) {
      return { ok: false as const };
    }
    const app = await ctx.db.get(session.appId);
    if (!app || app.status !== "active" || app.origin !== args.origin || app.communityId !== session.communityId) {
      return { ok: false as const };
    }
    const user = await ctx.db.get(session.userId);
    const authSubject = typeof user?.authSubject === "string" ? user.authSubject : "";
    if (!authSubject) return { ok: false as const };
    return {
      ok: true as const,
      userId: String(session.userId),
      authSubject,
      communityId: String(session.communityId) as string,
      appId: String(app._id) as string,
      allowedTools: app.allowedTools,
    };
  },
});

export const isActiveCommunityAppOriginInternal = internalQuery({
  args: { origin: v.string() },
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query("communityApps")
      .withIndex("by_origin_status", (q) => q.eq("origin", args.origin).eq("status", "active"))
      .first();
    return Boolean(app);
  },
});

export type CommunityAppSessionResolution =
  | { ok: false }
  | { ok: true; userId: string; authSubject: string; communityId: string; appId: string; allowedTools: Array<(typeof COMMUNITY_APP_TOOLS)[number]> };
