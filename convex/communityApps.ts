import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import {
  COMMUNITY_APP_HANDOFF_TTL_MS,
  COMMUNITY_APP_SESSION_ABSOLUTE_MS,
  COMMUNITY_APP_SESSION_EXTEND_AFTER_MS,
  COMMUNITY_APP_SESSION_TTL_MS,
  COMMUNITY_APP_TOOLS,
  normalizeCommunityAppOrigin,
  normalizeCommunityAppSlug,
} from "../shared/communityAppSession";

// Community front ends: a registered address (origin) for a community whose
// front end acts for one signed-in member, in that community and the member
// lane. Members sign in at Polynet; a one-time handoff code becomes a session
// on the community's own domain, held by the community edge. Authority is
// re-derived from current membership on every request by the canonical executor.

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

// Operator setup for staging and support, until founders register front ends
// through their own management surface. Same validation as registerCommunityApp.
export const registerCommunityAppInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    slug: v.string(),
    name: v.string(),
    origin: v.string(),
    allowedTools: v.array(toolValidator),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_not_found");
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
      createdByUserId: community.ownerId, createdAt: nowMs, updatedAt: nowMs,
    });
    return mapApp((await ctx.db.get(appId))!);
  },
});

async function activeAppForCommunityOrigin(ctx: any, communityId: any, origin: string) {
  const rows = await ctx.db
    .query("communityApps")
    .withIndex("by_origin_status", (q: any) => q.eq("origin", origin).eq("status", "active"))
    .take(10);
  return rows.find((row: any) => row.communityId === communityId) ?? null;
}

async function memberHasAccess(ctx: any, communityId: any, userId: any): Promise<boolean> {
  try {
    await requireCommunityChatAccess({ ctx, communityId, userId });
    return true;
  } catch {
    return false;
  }
}

// Step 1 of sign-in, called by Polynet's login bridge for an already-verified
// Polynet session. Issues a one-time code for a registered community address.
export const createCommunityAppHandoffInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communitySlug: v.string(),
    origin: v.string(),
    codeHash: v.string(),
    stateHash: v.string(),
  },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.codeHash) || !/^[a-f0-9]{64}$/.test(args.stateHash)) {
      return { ok: false as const, reason: "invalid_request" as const };
    }
    const origin = normalizeCommunityAppOrigin(args.origin);
    const community = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", args.communitySlug))
      .first();
    if (!origin || !community) return { ok: false as const, reason: "address_not_registered" as const };
    const app = await activeAppForCommunityOrigin(ctx, community._id, origin);
    if (!app) return { ok: false as const, reason: "address_not_registered" as const };
    if (!(await memberHasAccess(ctx, community._id, args.userId))) {
      return { ok: false as const, reason: "not_a_member" as const, communitySlug: community.slug };
    }
    const nowMs = Date.now();
    const expired = await ctx.db
      .query("communityAppHandoffs")
      .withIndex("by_user_expiresAt", (q) => q.eq("userId", args.userId).lt("expiresAt", nowMs))
      .take(MAX_SESSIONS_PRUNED_PER_MINT);
    for (const row of expired) await ctx.db.delete(row._id);
    await ctx.db.insert("communityAppHandoffs", {
      codeHash: args.codeHash, stateHash: args.stateHash, appId: app._id, communityId: community._id,
      userId: args.userId, origin, expiresAt: nowMs + COMMUNITY_APP_HANDOFF_TTL_MS, createdAt: nowMs,
    });
    return { ok: true as const };
  },
});

// Step 2 of sign-in, called only by the community edge. A code works once,
// within its lifetime, for the address and state it was issued to.
export const consumeCommunityAppHandoffInternal = internalMutation({
  args: { codeHash: v.string(), stateHash: v.string(), origin: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    const handoff = await ctx.db
      .query("communityAppHandoffs")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .first();
    const nowMs = Date.now();
    if (!handoff || handoff.usedAt !== undefined || handoff.expiresAt <= nowMs) {
      return { ok: false as const, reason: "code_invalid" as const };
    }
    // Any presentation of a live code burns it, so a leaked code cannot be retried.
    await ctx.db.patch(handoff._id, { usedAt: nowMs });
    const origin = normalizeCommunityAppOrigin(args.origin);
    if (handoff.stateHash !== args.stateHash || !origin || origin !== handoff.origin || !/^[a-f0-9]{64}$/.test(args.tokenHash)) {
      return { ok: false as const, reason: "code_invalid" as const };
    }
    const app = await ctx.db.get(handoff.appId);
    if (!app || app.status !== "active" || app.origin !== origin || app.communityId !== handoff.communityId) {
      return { ok: false as const, reason: "address_not_registered" as const };
    }
    if (!(await memberHasAccess(ctx, handoff.communityId, handoff.userId))) {
      return { ok: false as const, reason: "not_a_member" as const };
    }
    const absoluteExpiresAt = nowMs + COMMUNITY_APP_SESSION_ABSOLUTE_MS;
    const expiresAt = Math.min(nowMs + COMMUNITY_APP_SESSION_TTL_MS, absoluteExpiresAt);
    await ctx.db.insert("communityAppSessions", {
      tokenHash: args.tokenHash, appId: app._id, communityId: handoff.communityId, userId: handoff.userId,
      origin, expiresAt, absoluteExpiresAt, createdAt: nowMs,
    });
    return { ok: true as const, expiresAt };
  },
});

// Sliding lifetime: extend at most about once a day, never past the absolute cap.
export const extendCommunityAppSessionInternal = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    const nowMs = Date.now();
    if (!session || session.expiresAt <= nowMs) return { extended: false };
    const absolute = session.absoluteExpiresAt ?? session.expiresAt;
    const target = Math.min(nowMs + COMMUNITY_APP_SESSION_TTL_MS, absolute);
    if (target - session.expiresAt < COMMUNITY_APP_SESSION_EXTEND_AFTER_MS) return { extended: false };
    await ctx.db.patch(session._id, { expiresAt: target });
    return { extended: true };
  },
});

export const revokeCommunityAppSessionInternal = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (session) await ctx.db.delete(session._id);
    return { revoked: Boolean(session) };
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
      expiresAt: session.expiresAt,
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
  | { ok: true; userId: string; authSubject: string; communityId: string; appId: string; allowedTools: Array<(typeof COMMUNITY_APP_TOOLS)[number]>; expiresAt: number };
