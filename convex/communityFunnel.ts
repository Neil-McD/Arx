import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  normalizeSlug,
  requireActiveCommunity,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  type CommunityLike,
} from "./communityCore";

// The funnel editor, drafts and publishing, the AI funnel builder and the
// external funnel link are retired (POL-23). The public join page at /c/:slug
// stays plain; it keeps one thing from the old funnel rows: the founder's intro
// media (hero image or video), until that moves onto the community.
//
// The four public functions below are stand-ins for the production web released
// before POL-23, which still calls them. Delete them after the next production
// release.

type CommunityFunnelRowLike = {
  heroMediaUrl?: string | null;
  heroMediaKind?: "image" | "video" | null;
};

function normalizeHeroMediaUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return raw.trim().slice(0, 2_000) || null;
}

/** Public projection for the join page: intro media only, never custom content. */
export function buildCommunityFunnelPublicConfig(row: CommunityFunnelRowLike | null) {
  return {
    hero_media_url: normalizeHeroMediaUrl(row?.heroMediaUrl),
    hero_media_kind: row?.heroMediaKind === "video" ? ("video" as const) : ("image" as const),
    active_slot: "default" as const,
    published_vsl_url: null,
    published_content_v2: null,
  };
}

export async function resolveCommunityFunnelConfigByCommunityId(ctx: any, communityId: any) {
  const rows = (await ctx.db
    .query("communityFunnels" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityFunnelRowLike[];
  return buildCommunityFunnelPublicConfig(rows.find((row) => normalizeHeroMediaUrl(row.heroMediaUrl)) ?? null);
}

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
    ...(await resolveCommunityFunnelConfigByCommunityId(ctx, communityId)),
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
