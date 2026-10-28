import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  normalizeSlug,
  requireActiveCommunity,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  type CommunityLike,
} from "./communityCore";

// The funnel editor, drafts and publishing, the AI funnel builder, the external
// funnel link and the hero-media editor are retired (POL-23). The public join
// page at /c/:slug is plain: it never renders custom funnel content or intro
// media (the default page never did), so nothing here reads communityFunnels.
//
// The four public functions below are stand-ins for the production web released
// before POL-23, which still calls them. Delete them after the next production
// release.

/** Public projection for the join page: always the plain default. */
export const COMMUNITY_FUNNEL_PUBLIC_CONFIG = {
  hero_media_url: null,
  hero_media_kind: "image" as const,
  active_slot: "default" as const,
  published_vsl_url: null,
  published_content_v2: null,
};

async function requireManager(args: { ctx: any; userId?: any; authSubject?: string | null; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  await requireCommunityManager({ ctx: args.ctx, communityId: args.communityId, userId });
}

async function retiredManagerConfig(ctx: any, communityId: any) {
  const community = (await ctx.db.get(communityId)) as CommunityLike | null;
  return {
    ...COMMUNITY_FUNNEL_PUBLIC_CONFIG,
    external_funnel_url: null,
    external_funnel_active: false,
    settings_revision: Math.max(0, Math.floor(Number(community?.settingsRevision ?? 0)) || 0),
    custom_funnels: { custom_1: null, custom_2: null },
  };
}

export const getCommunityFunnelConfig = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    await requireManager({ ctx, ...args });
    return await retiredManagerConfig(ctx, args.communityId);
  },
});

export const getCommunityFunnelDraftPreview = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", normalizeSlug(args.slug)))
      .first()) as CommunityLike | null;
    if (!community) throw new ConvexError({ code: "community_not_found" });
    requireActiveCommunity(community);
    await requireManager({ ctx, userId: args.userId, authSubject: args.authSubject, communityId: community._id });
    return await retiredManagerConfig(ctx, community._id);
  },
});

export const setCommunityExternalFunnelUrl = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedSettingsRevision: v.number(),
    url: v.union(v.string(), v.null()),
  },
  handler: async () => {
    throw new ConvexError({ code: "community_funnel_retired" });
  },
});

export const setCommunityExternalFunnelActive = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedSettingsRevision: v.number(),
    expectedUrl: v.string(),
    active: v.boolean(),
  },
  handler: async () => {
    throw new ConvexError({ code: "community_funnel_retired" });
  },
});
