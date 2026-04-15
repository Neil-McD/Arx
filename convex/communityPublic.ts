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
  normalizeCommunityRoleForOutput,
  normalizeSlug,
  pickMostRelevantCommunityJoinRequest,
  pickMostRelevantCommunityMembership,
  pickPreferredActivePlan,
  requireCommunityChatAccess,
  resolveCommunityBrandingFields,
  resolveCommunityEntryPolicy,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { resolveCommunityFunnelConfigByCommunityId } from "./communityFunnel";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";

type PublicCommunityFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

const COMMUNITY_ONLINE_WINDOW_MS = 90_000;

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
    .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
    .collect()) as CommunityMembershipLike[];
  const activeMemberships = memberships.filter((row) => communityMembershipRowIsActive(row));

  const eligibleUserIds = new Set<string>([String(community.ownerId)]);
  const adminUserIds = new Set<string>([String(community.ownerId)]);
  for (const membership of activeMemberships) {
    const normalizedUserId = String(membership.userId);
    eligibleUserIds.add(normalizedUserId);
    if (String(membership.role ?? "").trim().toLowerCase() === "admin") {
      adminUserIds.add(normalizedUserId);
    }
  }
  const memberCount = eligibleUserIds.size;

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
    const rows = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) => q.eq("communityId", community._id).eq("userId", userId))
      .collect()) as CommunityJoinRequestLike[];
    const row = pickMostRelevantCommunityJoinRequest(rows);
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
  const existingRows = (await args.ctx.db
    .query("communityJoinRequests")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
    .collect()) as CommunityJoinRequestLike[];
  const existing = pickMostRelevantCommunityJoinRequest(existingRows);
  if (existing) {
    if (
      String(existing.status ?? "").trim().toLowerCase() === "denied" &&
      communityJoinRequestCanReapply(existing, args.nowMs)
    ) {
      const reopenedId = await args.ctx.db.insert("communityJoinRequests", {
        communityId: args.communityId,
        userId: args.userId,
        status: "pending",
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      const reopened = (await args.ctx.db.get(reopenedId)) as CommunityJoinRequestLike | null;
      if (!reopened) throw new Error("join_request_reopen_failed");
      return reopened;
    }
    return existing;
  }

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
  const existingMembershipRows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
    .collect()) as CommunityMembershipLike[];
  const existingMembership = pickMostRelevantCommunityMembership(existingMembershipRows);
  let grantedMembershipMarker: string | null = null;
  if (existingMembership) {
    if (!communityMembershipRowIsActive(existingMembership)) {
      const role = normalizeCommunityRoleForOutput(existingMembership.role) || "member";
      const membershipId = await args.ctx.db.insert("communityMemberships", {
        communityId: args.community._id,
        userId: args.userId,
        role,
        accessSource: "free_grant",
        active: true,
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      grantedMembershipMarker = `${String(membershipId)}:${args.nowMs}`;
      await enqueueCommunityAccessGrantedEmailInternal({
        ctx: args.ctx,
        userId: args.userId,
        communityId: args.community._id,
        grantMarker: grantedMembershipMarker,
        nowMs: args.nowMs,
      });
    }
    return {
      outcome: "joined",
      community_id: String(args.community._id),
    };
  }

  const entryPolicy = resolveCommunityEntryPolicy(args.community);
  if (entryPolicy === "paid_subscription") {
    return {
      outcome: "paid_plan_required",
      community_id: String(args.community._id),
    };
  }
  if (entryPolicy === "approval") {
    const joinRequestRows = (await args.ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
      .collect()) as CommunityJoinRequestLike[];
    const joinRequest = pickMostRelevantCommunityJoinRequest(joinRequestRows);
    const status = String(joinRequest?.status ?? "")
      .trim()
      .toLowerCase();
    if (status === "approved") {
      // approved requests may enter immediately
    } else if (status === "pending") {
      return {
        outcome: "approval_pending",
        community_id: String(args.community._id),
      };
    } else if (status === "denied") {
      if (communityJoinRequestCanReapply(joinRequest, args.nowMs)) {
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
      return {
        outcome: "approval_denied",
        community_id: String(args.community._id),
        reapply_at:
          typeof joinRequest?.reapplyAt === "number"
            ? toIsoString(joinRequest.reapplyAt)
            : null,
      };
    } else {
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

  const membershipId = await args.ctx.db.insert("communityMemberships", {
    communityId: args.community._id,
    userId: args.userId,
    role: "member",
    accessSource: "free_grant",
    active: true,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  grantedMembershipMarker = `${String(membershipId)}:${args.nowMs}`;
  await enqueueCommunityAccessGrantedEmailInternal({
    ctx: args.ctx,
    userId: args.userId,
    communityId: args.community._id,
    grantMarker: grantedMembershipMarker,
    nowMs: args.nowMs,
  });
  return {
    outcome: "joined",
    community_id: String(args.community._id),
  };
}

export const joinPublicCommunityBySlug = mutation({
  args: {
    communitySlug: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const nowMs = args.nowMs ?? Date.now();
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    return await joinPublicCommunityInternal({
      ctx,
      community,
      userId,
      nowMs,
    });
  },
});

export const joinPublicCommunity = mutation({
  args: {
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const nowMs = args.nowMs ?? Date.now();
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    return await joinPublicCommunityInternal({
      ctx,
      community,
      userId,
      nowMs,
    });
  },
});

export const cancelMyJoinRequestBySlug = mutation({
  args: {
    communitySlug: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const nowMs = args.nowMs ?? Date.now();
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");

    const joinRequestRows = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", userId))
      .collect()) as CommunityJoinRequestLike[];
    const joinRequest = pickMostRelevantCommunityJoinRequest(joinRequestRows);
    const status = String(joinRequest?.status ?? "").trim().toLowerCase();

    if (!joinRequest || status === "" || status === "canceled") {
      return { outcome: "none" as const };
    }
    if (status !== "pending") {
      return { outcome: "ignored" as const, status };
    }

    await ctx.db.patch(joinRequest._id, {
      status: "canceled",
      updatedAt: nowMs,
    });
    return { outcome: "canceled" as const };
  },
});
