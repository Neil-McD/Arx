import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  communityJoinRequestCanReapply,
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type PublicPlanSummaryLike,
  communityMembershipRowIsActive,
  mapActivePlanSummaries,
  mapJoinRequestRow,
  normalizeSlug,
  pickPreferredActivePlan,
  requireCommunityChatAccess,
  resolveCommunityBrandingFields,
  resolveCommunityEntryPolicy,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { resolveCommunityFunnelConfigByCommunityId } from "./communityFunnel";

type PublicCommunityFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

const COMMUNITY_ONLINE_WINDOW_MS = 90_000;

function logPublicJoinEvent(event: string, payload: Record<string, unknown>): void {
  console.log("[public-join]", event, payload);
}

async function listCurrentCommunitySellablePlans(ctx: any, communityId: any): Promise<PublicPlanSummaryLike[]> {
  const currentPricePoints = (await ctx.db
    .query("communityPricePoints" as any)
    .withIndex("by_community_current", (q: any) => q.eq("communityId", communityId).eq("isCurrent", true))
    .collect()) as CommunityPricePointLike[];
  const activePricePoints = currentPricePoints.filter((row) => !row.archivedAt);
  return mapActivePlanSummaries(activePricePoints);
}

async function resolvePublicCommunityStats(ctx: any, community: CommunityLike): Promise<{
  memberCount: number;
  adminCount: number;
  onlineCount: number;
  onlineFaces: PublicCommunityFace[];
}> {
  const memberships = (await ctx.db
    .query("communityMemberships")
    .withIndex("by_community", (q) => q.eq("communityId", community._id))
    .collect()) as CommunityMembershipLike[];
  const activeMemberships = memberships.filter((row) => communityMembershipRowIsActive(row));
  const memberCount = activeMemberships.length;

  const eligibleUserIds = new Set<string>([String(community.ownerId)]);
  const adminUserIds = new Set<string>([String(community.ownerId)]);
  for (const membership of activeMemberships) {
    const normalizedUserId = String(membership.userId);
    eligibleUserIds.add(normalizedUserId);
    if (String(membership.role ?? "").trim().toLowerCase() === "admin") {
      adminUserIds.add(normalizedUserId);
    }
  }

  const cutoff = Date.now() - COMMUNITY_ONLINE_WINDOW_MS;
  const recentPresenceRows = (await ctx.db
    .query("communityPresence" as any)
    .withIndex("by_community_lastSeenAt", (q: any) => q.eq("communityId", community._id).gte("lastSeenAt", cutoff))
    .collect()) as Array<{
    userId: any;
    lastSeenAt: number;
  }>;

  const onlineUserIds: any[] = [];
  const seenOnlineUserIds = new Set<string>();
  const userIdCache = new Map<string, string | null>();
  for (const row of recentPresenceRows) {
    const normalizedUserId = String(row.userId ?? "").trim();
    if (!normalizedUserId || seenOnlineUserIds.has(normalizedUserId) || !eligibleUserIds.has(normalizedUserId)) {
      continue;
    }
    seenOnlineUserIds.add(normalizedUserId);
    onlineUserIds.push(row.userId);
  }

  const onlineFaces = (
    await Promise.all(
      onlineUserIds.slice(0, 8).map(async (userId): Promise<PublicCommunityFace | null> => {
        const user = await ctx.db.get(userId);
        if (!user) return null;
        return {
          user_id: (await resolvePublicUserId(ctx, user._id, userIdCache)) ?? String(user._id),
          display_name: user.displayName ?? null,
          avatar_url: user.avatarUrl ?? null,
        };
      }),
    )
  ).filter(Boolean) as PublicCommunityFace[];

  return {
    memberCount,
    adminCount: adminUserIds.size,
    onlineCount: onlineUserIds.length,
    onlineFaces,
  };
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
    const stats = await resolvePublicCommunityStats(ctx, community);

    return {
      ok: true,
      community: {
        slug: community.slug,
        name: community.name,
        one_liner: community.oneLiner ?? null,
        about: community.about ?? null,
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
        member_count: stats.memberCount,
        admin_count: stats.adminCount,
        online_count: stats.onlineCount,
        online_faces: stats.onlineFaces,
      },
      active_plan: activePlan,
    };
  },
});

export const heartbeatCommunityPresence = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const existing = await ctx.db
      .query("communityPresence" as any)
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: nowMs,
        updatedAt: nowMs,
      });
      return { ok: true };
    }
    await ctx.db.insert("communityPresence" as any, {
      communityId: args.communityId,
      userId,
      lastSeenAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const getCommunityPresenceSummary = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const stats = await resolvePublicCommunityStats(ctx, community);
    return {
      member_count: stats.memberCount,
      admin_count: stats.adminCount,
      online_count: stats.onlineCount,
      online_faces: stats.onlineFaces,
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
          one_liner: community.oneLiner ?? null,
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

async function ensurePendingCommunityJoinRequest(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
}): Promise<CommunityJoinRequestLike> {
  const existing = (await args.ctx.db
    .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
      .first()) as CommunityJoinRequestLike | null;
  if (existing) {
    if (
      String(existing.status ?? "").trim().toLowerCase() === "denied" &&
      communityJoinRequestCanReapply(existing, args.nowMs)
    ) {
      logPublicJoinEvent("join_request_reopen", {
        communityId: String(args.communityId),
        userId: String(args.userId),
      });
      await args.ctx.db.patch(existing._id as any, {
        status: "pending",
        deniedAt: undefined,
        reapplyAt: undefined,
        updatedAt: args.nowMs,
      });
      const reopened = (await args.ctx.db.get(existing._id as any)) as CommunityJoinRequestLike | null;
      if (!reopened) throw new Error("join_request_reopen_failed");
      return reopened;
    }
    logPublicJoinEvent("join_request_existing", {
      communityId: String(args.communityId),
      userId: String(args.userId),
      status: String(existing.status ?? ""),
    });
    return existing;
  }

  logPublicJoinEvent("join_request_create", {
    communityId: String(args.communityId),
    userId: String(args.userId),
  });
  const id = await args.ctx.db.insert("communityJoinRequests", {
    communityId: args.communityId,
    userId: args.userId,
    status: "pending",
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(id)) as CommunityJoinRequestLike | null;
  if (!created) throw new Error("join_request_create_failed");
  return created;
}

async function joinPublicCommunityInternal(args: {
  ctx: any;
  community: CommunityLike;
  userId: any;
  nowMs: number;
}): Promise<{
  outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
  community_id: string;
  reapply_at?: string | null;
}> {
  const existingMembership = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
    .first()) as CommunityMembershipLike | null;
  if (existingMembership) {
    logPublicJoinEvent("join_outcome_joined_existing_membership", {
      communityId: String(args.community._id),
      userId: String(args.userId),
      active: communityMembershipRowIsActive(existingMembership),
    });
    if (!communityMembershipRowIsActive(existingMembership)) {
      await args.ctx.db.patch(existingMembership._id as any, {
        accessSource: existingMembership.accessSource ?? "free_grant",
        active: true,
        revokedAt: undefined,
        revokedReason: undefined,
        updatedAt: args.nowMs,
      });
    }
    return {
      outcome: "joined",
      community_id: String(args.community._id),
    };
  }

  const entryPolicy = resolveCommunityEntryPolicy(args.community);
  if (entryPolicy === "paid_subscription") {
    logPublicJoinEvent("join_outcome_paid_plan_required", {
      communityId: String(args.community._id),
      userId: String(args.userId),
    });
    return {
      outcome: "paid_plan_required",
      community_id: String(args.community._id),
    };
  }
  if (entryPolicy === "approval") {
    const joinRequest = (await args.ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
      .first()) as CommunityJoinRequestLike | null;
    const status = String(joinRequest?.status ?? "")
      .trim()
      .toLowerCase();
    if (status === "approved") {
      // approved requests may enter immediately
    } else if (status === "pending") {
      logPublicJoinEvent("join_outcome_approval_pending_existing", {
        communityId: String(args.community._id),
        userId: String(args.userId),
      });
      return {
        outcome: "approval_pending",
        community_id: String(args.community._id),
      };
    } else if (status === "denied") {
      if (communityJoinRequestCanReapply(joinRequest, args.nowMs)) {
        logPublicJoinEvent("join_outcome_approval_reapply", {
          communityId: String(args.community._id),
          userId: String(args.userId),
        });
        await ensurePendingCommunityJoinRequest({
          ctx: args.ctx,
          communityId: args.community._id,
          userId: args.userId,
          nowMs: args.nowMs,
        });
        return {
          outcome: "approval_pending",
          community_id: String(args.community._id),
        };
      }
      logPublicJoinEvent("join_outcome_approval_denied_locked", {
        communityId: String(args.community._id),
        userId: String(args.userId),
        reapplyAt:
          typeof joinRequest?.reapplyAt === "number"
            ? toIsoString(joinRequest.reapplyAt)
            : null,
      });
      return {
        outcome: "approval_denied",
        community_id: String(args.community._id),
        reapply_at:
          typeof joinRequest?.reapplyAt === "number"
            ? toIsoString(joinRequest.reapplyAt)
            : null,
      };
    } else {
      logPublicJoinEvent("join_outcome_approval_pending_created", {
        communityId: String(args.community._id),
        userId: String(args.userId),
      });
      await ensurePendingCommunityJoinRequest({
        ctx: args.ctx,
        communityId: args.community._id,
        userId: args.userId,
        nowMs: args.nowMs,
      });
      return {
        outcome: "approval_pending",
        community_id: String(args.community._id),
      };
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
  logPublicJoinEvent("join_outcome_joined_new_membership", {
    communityId: String(args.community._id),
    userId: String(args.userId),
  });
  return {
    outcome: "joined",
    community_id: String(args.community._id),
  };
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
    logPublicJoinEvent("join_by_slug_start", {
      communitySlug: slug,
      communityId: String(community._id),
      userId: String(args.userId),
    });
    try {
      return await joinPublicCommunityInternal({
        ctx,
        community,
        userId: args.userId,
        nowMs,
      });
    } catch (error) {
      console.error("[public-join] join_by_slug_error", {
        communitySlug: slug,
        communityId: String(community._id),
        userId: String(args.userId),
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
    logPublicJoinEvent("join_by_id_start", {
      communityId: String(community._id),
      userId: String(args.userId),
    });
    try {
      return await joinPublicCommunityInternal({
        ctx,
        community,
        userId: args.userId,
        nowMs,
      });
    } catch (error) {
      console.error("[public-join] join_by_id_error", {
        communityId: String(community._id),
        userId: String(args.userId),
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
