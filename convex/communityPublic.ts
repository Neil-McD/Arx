import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type PublicPlanSummaryLike,
  communityMembershipRowIsActive,
  mapActivePlanSummaries,
  mapJoinRequestRow,
  normalizeOptionalText,
  normalizeSlug,
  pickPreferredActivePlan,
  resolveCommunityBrandingFields,
  resolveCommunityEntryPolicy,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { resolveCommunityFunnelConfigByCommunityId } from "./communityFunnel";

type PublicCommunityFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

async function listCurrentCommunitySellablePlans(ctx: any, communityId: any): Promise<PublicPlanSummaryLike[]> {
  const currentPricePoints = (await ctx.db
    .query("communityPricePoints" as any)
    .withIndex("by_community_current", (q: any) => q.eq("communityId", communityId).eq("isCurrent", true))
    .collect()) as CommunityPricePointLike[];
  const activePricePoints = currentPricePoints.filter((row) => !row.archivedAt);
  return mapActivePlanSummaries(activePricePoints);
}

export const resolvePublicFunnelBySlug = query({
  args: {
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) return { ok: false };

    const mappedPlans = await listCurrentCommunitySellablePlans(ctx, community._id);
    const activePlan = pickPreferredActivePlan(mappedPlans);
    const branding = await resolveCommunityBrandingFields(ctx, community);
    const entryPolicy = resolveCommunityEntryPolicy(community);
    const funnel = await resolveCommunityFunnelConfigByCommunityId(ctx, community._id);
    const memberships = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community", (q) => q.eq("communityId", community._id))
      .collect()) as CommunityMembershipLike[];
    const activeMemberships = memberships.filter((row) => communityMembershipRowIsActive(row));
    const memberCount = activeMemberships.length;
    const adminUserIds = new Set<string>([String(community.ownerId)]);
    for (const membership of activeMemberships) {
      if (String(membership.role ?? "").trim().toLowerCase() === "admin") {
        adminUserIds.add(String(membership.userId));
      }
    }
    const featuredUserIds: any[] = [];
    const featuredUserKeys = new Set<string>();
    const appendFeaturedUserId = (userId: unknown) => {
      const normalized = String(userId ?? "").trim();
      if (!normalized || featuredUserKeys.has(normalized)) return;
      featuredUserKeys.add(normalized);
      featuredUserIds.push(userId);
    };
    appendFeaturedUserId(community.ownerId);
    for (const userId of adminUserIds) appendFeaturedUserId(userId);
    for (const membership of activeMemberships) appendFeaturedUserId(membership.userId);
    const featuredFaces = (
      await Promise.all(
        featuredUserIds.slice(0, 8).map(async (userId): Promise<PublicCommunityFace | null> => {
          const user = await ctx.db.get(userId);
          if (!user) return null;
          return {
            user_id: String(user._id),
            display_name: user.displayName ?? null,
            avatar_url: user.avatarUrl ?? null,
          };
        }),
      )
    ).filter(Boolean) as PublicCommunityFace[];

    return {
      ok: true,
      community: {
        slug: community.slug,
        name: community.name,
        description: community.description ?? null,
        avatar_url: branding.avatar_url,
        banner_url: branding.banner_url,
        banner_focus_x: branding.banner_focus_x,
        banner_focus_y: branding.banner_focus_y,
        banner_zoom: branding.banner_zoom,
        visibility: community.visibility,
        entry_policy: entryPolicy,
        created_at: toIsoString(community.createdAt),
        updated_at: toIsoString(community.updatedAt),
        funnel,
        member_count: memberCount,
        admin_count: adminUserIds.size,
        featured_faces: featuredFaces,
      },
      active_plan: activePlan,
      active_plans: mappedPlans,
    };
  },
});

export const listPublicDiscoverCommunities = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 60)));
    const published = (await ctx.db
      .query("communities")
      .withIndex("by_visibility_updatedAt", (q) => q.eq("visibility", "published"))
      .order("desc")
      .take(limit)) as CommunityLike[];

    const communities = await Promise.all(
      published.map(async (community) => {
        const mappedPlans = await listCurrentCommunitySellablePlans(ctx, community._id);
        const branding = await resolveCommunityBrandingFields(ctx, community);
        const entryPolicy = resolveCommunityEntryPolicy(community);
        return {
          slug: community.slug,
          name: community.name,
          description: community.description ?? null,
          avatar_url: branding.avatar_url,
          banner_url: branding.banner_url,
          banner_focus_x: branding.banner_focus_x,
          banner_focus_y: branding.banner_focus_y,
          banner_zoom: branding.banner_zoom,
          visibility: community.visibility,
          entry_policy: entryPolicy,
          created_at: toIsoString(community.createdAt),
          updated_at: toIsoString(community.updatedAt),
          active_plan: pickPreferredActivePlan(mappedPlans),
        };
      }),
    );

    return {
      ok: true,
      communities,
    };
  },
});

export const getMyJoinRequestBySlug = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) return null;
    const row = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) => q.eq("communityId", community._id).eq("userId", args.userId))
      .first()) as CommunityJoinRequestLike | null;
    if (!row) return null;
    return mapJoinRequestRow({
      communityId: String(community._id),
      row,
    });
  },
});

export const requestCommunityAccessBySlug = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communitySlug: v.string(),
    message: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    const entryPolicy = resolveCommunityEntryPolicy(community);
    if (entryPolicy === "paid_unlock" || entryPolicy === "paid_subscription") {
      throw new Error("paid_communities_do_not_use_request_access");
    }
    if (entryPolicy === "open") {
      throw new Error("request_access_not_required");
    }

    const existing = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) => q.eq("communityId", community._id).eq("userId", args.userId))
      .first()) as CommunityJoinRequestLike | null;
    const message = normalizeOptionalText(args.message, 5000);

    if (existing) {
      const nextStatus = String(existing.status ?? "").trim().toLowerCase() === "approved" ? "approved" : "pending";
      await ctx.db.patch(existing._id, {
        status: nextStatus,
        message,
        updatedAt: nowMs,
      });
      const refreshed = (await ctx.db.get(existing._id)) as CommunityJoinRequestLike | null;
      if (!refreshed) throw new Error("join_request_not_found");
      return mapJoinRequestRow({
        communityId: String(community._id),
        row: refreshed,
      });
    }

    const id = await ctx.db.insert("communityJoinRequests", {
      communityId: community._id,
      userId: args.userId,
      status: "pending",
      message,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id)) as CommunityJoinRequestLike | null;
    if (!created) throw new Error("join_request_create_failed");
    return mapJoinRequestRow({
      communityId: String(community._id),
      row: created,
    });
  },
});

async function joinPublicCommunityInternal(args: {
  ctx: any;
  community: CommunityLike;
  userId: any;
  nowMs: number;
}): Promise<string> {
  const existingMembership = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
    .first()) as CommunityMembershipLike | null;
  if (existingMembership) {
    if (!communityMembershipRowIsActive(existingMembership)) {
      await args.ctx.db.patch(existingMembership._id as any, {
        accessSource: existingMembership.accessSource ?? "free_grant",
        active: true,
        revokedAt: undefined,
        revokedReason: undefined,
        updatedAt: args.nowMs,
      });
    }
    return String(args.community._id);
  }

  const entryPolicy = resolveCommunityEntryPolicy(args.community);
  if (entryPolicy === "paid_unlock" || entryPolicy === "paid_subscription") {
    throw new Error("paid_plan_required");
  }
  if (entryPolicy === "approval") {
    const joinRequest = (await args.ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
      .first()) as CommunityJoinRequestLike | null;
    const status = String(joinRequest?.status ?? "")
      .trim()
      .toLowerCase();
    if (status !== "approved") {
      throw new Error("approval_required");
    }
  }

  await args.ctx.db.insert("communityMemberships", {
    communityId: args.community._id,
    userId: args.userId,
    role: "member",
    accessSource: "free_grant",
    active: true,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return String(args.community._id);
}

export const joinPublicCommunityBySlug = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communitySlug: v.string(),
    brandosAid: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    void args.brandosAid;
    const communityId = await joinPublicCommunityInternal({
      ctx,
      community,
      userId: args.userId,
      nowMs,
    });
    return [{ community_id: communityId }];
  },
});

export const joinPublicCommunity = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    brandosAid: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    void args.brandosAid;
    const communityId = await joinPublicCommunityInternal({
      ctx,
      community,
      userId: args.userId,
      nowMs,
    });
    return [{ community_id: communityId }];
  },
});
