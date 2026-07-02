import { mutation, query } from "./_generated/server";
import { extractMessageText } from "./communityChat";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  adjustCommunityActiveMemberCountForMembershipTransition,
  communityJoinRequestCanReapply,
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type PublicPlanSummaryLike,
  communityMembershipRowIsActive,
  countCanonicalCommunityMembersFromRows,
  listCanonicalCommunityMemberMembershipRows,
  mapActivePlanSummaries,
  mapJoinRequestRow,
  normalizeCommunityRoleForOutput,
  normalizeSlug,
  pickMostRelevantCommunityJoinRequest,
  pickMostRelevantCommunityMembership,
  pickPreferredActivePlan,
  requireCommunityChatAccess,
  requireCommunityUserNotBlocked,
  resolveCommunityAccessBundle,
  resolveCommunityBrandingFields,
  resolveCommunityEntryPolicy,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { findAuthenticatedActorState } from "./authActor";
import { resolveCommunityFunnelConfigByCommunityId } from "./communityFunnel";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";
import {
  clearPlatformHomeCommunityAutojoinOptOut,
  isPlatformHomeAutojoinOptOutRequest,
  isPlatformHomeCommunity,
  readPlatformHomeAutojoinOptOut,
} from "./platformHomeCommunity";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { hashBusinessVisitorKey } from "./businessAnalyticsCore";

const FUNNEL_VISIT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

type PublicCommunityFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

const COMMUNITY_ONLINE_WINDOW_MS = 90_000;

async function resolvePublicProfileFaceFields(ctx: any, userId: any): Promise<Omit<PublicCommunityFace, "user_id">> {
  return await resolveUserProfileDisplayProjection(ctx, userId);
}

async function scheduleCommunityAppGrantSeedingBestEffort(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
  reason: string;
}): Promise<void> {
  try {
    await args.ctx.scheduler.runAfter(
      0,
      internal.userPlatformAppMounts.seedCommunityAppGrantsForUserInternal,
      {
        communityId: args.communityId,
        userId: args.userId,
        nowMs: args.nowMs,
      },
    );
  } catch (error) {
    console.warn("community_app_grant_seed_schedule_failed", {
      community_id: String(args.communityId),
      user_id: String(args.userId),
      reason: args.reason,
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
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
  onlineUserIds: string[];
}> {
  const { rows: activeMemberships } = await listCanonicalCommunityMemberMembershipRows({
    ctx,
    communityId: community._id,
    community,
  });

  const eligibleUserIds = new Set<string>([String(community.ownerId)]);
  const adminUserIds = new Set<string>([String(community.ownerId)]);
  for (const membership of activeMemberships) {
    const normalizedUserId = String(membership.userId);
    eligibleUserIds.add(normalizedUserId);
    if (String(membership.role ?? "").trim().toLowerCase() === "admin") {
      adminUserIds.add(normalizedUserId);
    }
  }
  const memberCount = countCanonicalCommunityMembersFromRows(activeMemberships);

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
          ...(await resolvePublicProfileFaceFields(ctx, user._id)),
        };
      }),
    )
  ).filter(Boolean) as PublicCommunityFace[];

  const onlineUserPublicIds = (
    await Promise.all(
      onlineUserIds.map(
        async (userId) => (await resolvePublicUserId(ctx, userId, userIdCache)) ?? String(userId),
      ),
    )
  ).filter(Boolean) as string[];

  return {
    memberCount,
    adminCount: adminUserIds.size,
    onlineCount: onlineUserIds.length,
    onlineFaces,
    onlineUserIds: onlineUserPublicIds,
  };
}

function mapPublicCommunityStats(stats: {
  memberCount: number;
  adminCount: number;
  onlineCount: number;
  onlineFaces: PublicCommunityFace[];
  onlineUserIds: string[];
}) {
  return {
    member_count: stats.memberCount,
    admin_count: stats.adminCount,
    online_count: stats.onlineCount,
    online_faces: stats.onlineFaces,
    online_user_ids: stats.onlineUserIds,
  };
}

const PUBLIC_FEATURED_MESSAGE_LIMIT = 6;

/* Public-safe projection of host-featured messages for the visitor funnel:
   text body + sender face + timestamps + reaction counts. No attachments,
   no thread context, nothing the host didn't explicitly feature. */
async function resolvePublicFeaturedMessages(ctx: any, communityId: any) {
  const rows = await ctx.db
    .query("communityFeaturedMessages")
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .take(PUBLIC_FEATURED_MESSAGE_LIMIT * 2);
  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (out.length >= PUBLIC_FEATURED_MESSAGE_LIMIT) break;
    const message = await ctx.db.get(row.messageId);
    if (!message) continue;
    const body = extractMessageText(message.contentJson);
    if (!body) continue;
    const senderFace = message.senderUserId
      ? await resolvePublicProfileFaceFields(ctx, message.senderUserId)
      : null;
    const reactionRows = await ctx.db
      .query("communityMessageReactions")
      .withIndex("by_message", (q: any) => q.eq("messageId", row.messageId))
      .take(200);
    const counts: Record<string, number> = {};
    for (const reaction of reactionRows) {
      const emoji = String(reaction.emoji ?? "").trim();
      if (!emoji) continue;
      counts[emoji] = (counts[emoji] ?? 0) + 1;
    }
    out.push({
      id: String(row.messageId),
      body,
      created_at: toIsoString(message.createdAt),
      featured_at: toIsoString(row.createdAt),
      sender: senderFace,
      reactions: Object.entries(counts)
        .map(([emoji, count]) => ({ emoji, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4),
    });
  }
  return out;
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
    const owner = community.ownerId ? await ctx.db.get(community.ownerId) : null;
    const host = owner ? await resolvePublicProfileFaceFields(ctx, owner._id) : null;

    return {
      ok: true,
      community: {
        slug: community.slug,
        name: community.name,
        host,
        featured_messages: await resolvePublicFeaturedMessages(ctx, community._id),
        one_liner: community.oneLiner ?? null,
        about: community.about ?? null,
        avatar_url: branding.avatar_url,
        avatar_focus_x: branding.avatar_focus_x,
        avatar_focus_y: branding.avatar_focus_y,
        avatar_zoom: branding.avatar_zoom,
        banner_url: branding.banner_url,
        banner_focus_x: branding.banner_focus_x,
        banner_focus_y: branding.banner_focus_y,
        banner_zoom: branding.banner_zoom,
        visibility: community.visibility,
        entry_policy: entryPolicy,
        created_at: toIsoString(community.createdAt),
        updated_at: toIsoString(community.updatedAt),
        funnel,
      },
      active_plan: activePlan,
    };
  },
});

export const resolvePublicFunnelStatsBySlug = query({
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

    return {
      ok: true,
      community: mapPublicCommunityStats(await resolvePublicCommunityStats(ctx, community)),
    };
  },
});

export const resolvePublicCommunityAccessBySlug = query({
  args: {
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) return { ok: false as const };

    let userId: any = null;
    try {
      const { actor } = await findAuthenticatedActorState({ ctx, authSubject: null });
      userId = actor?.dbUserId ?? null;
    } catch {
      userId = null;
    }

    let membership: CommunityMembershipLike | null = null;
    if (userId) {
      const membershipRows = (await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) => q.eq("communityId", community._id).eq("userId", userId))
        .collect()) as CommunityMembershipLike[];
      membership = pickMostRelevantCommunityMembership(membershipRows);
    }

    const access = await resolveCommunityAccessBundle({
      ctx,
      community,
      membership,
      userId,
    });
    if (!access.relation) return { ok: false as const };

    return {
      ok: true as const,
      access: {
        ...access,
        user_id: userId ? access.user_id : null,
      },
    };
  },
});

export const recordPublicFunnelVisitBySlug = mutation({
  args: {
    communitySlug: v.string(),
    visitorKey: v.optional(v.string()),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) return { ok: false };

    let userId: any = undefined;
    const authSubject = String(args.authSubject ?? "").trim();
    if (authSubject) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
        .first();
      userId = user?._id;
    }

    const nowMs = Date.now();
    const visitorKey = String(args.visitorKey ?? "").trim();
    const visitorKeyHash = visitorKey ? await hashBusinessVisitorKey(visitorKey) : undefined;
    if (visitorKeyHash) {
      const recentRows = (await ctx.db
        .query("communityAnalyticsEvents" as any)
        .withIndex("by_community_visitor_hash_event", (q: any) =>
          q.eq("communityId", community._id).eq("visitorKeyHash", visitorKeyHash).eq("eventType", "funnel_visit"),
        )
        .collect()) as Array<{ createdAt: number }>;
      const dedupeAfterMs = nowMs - FUNNEL_VISIT_DEDUPE_WINDOW_MS;
      if (recentRows.some((row) => row.createdAt >= dedupeAfterMs)) {
        return { ok: true, deduped: true };
      }
    }

    await ctx.db.insert("communityAnalyticsEvents", {
      communityId: community._id,
      eventType: "funnel_visit",
      visitorKeyHash,
      userId,
      createdAt: nowMs,
    });
    return { ok: true };
  },
});

export const heartbeatCommunityPresence = mutation({
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
    const nowMs = Date.now();
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
    return mapPublicCommunityStats(stats);
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
          about: community.about ?? null,
          avatar_url: branding.avatar_url,
          avatar_focus_x: branding.avatar_focus_x,
          avatar_focus_y: branding.avatar_focus_y,
          avatar_zoom: branding.avatar_zoom,
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
  await requireCommunityUserNotBlocked({
    ctx: args.ctx,
    communityId: args.community._id,
    userId: args.userId,
  });
  const existingMembershipRows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
    .collect()) as CommunityMembershipLike[];
  const existingMembership = pickMostRelevantCommunityMembership(existingMembershipRows);
  let grantedMembershipMarker: string | null = null;

  const grantFreeMembership = async () => {
    if (existingMembership && !communityMembershipRowIsActive(existingMembership)) {
      const restoredMembership = {
        ...existingMembership,
        role: normalizeCommunityRoleForOutput(existingMembership.role) || "member",
        accessSource: "free_grant",
        active: true,
        revokedAt: undefined,
        revokedReason: undefined,
        updatedAt: args.nowMs,
      } as CommunityMembershipLike;
      await args.ctx.db.patch(existingMembership._id as any, {
        role: restoredMembership.role,
        accessSource: "free_grant",
        active: true,
        revokedAt: undefined,
        revokedReason: undefined,
        updatedAt: args.nowMs,
      });
      await adjustCommunityActiveMemberCountForMembershipTransition({
        ctx: args.ctx,
        communityId: args.community._id,
        before: existingMembership,
        after: restoredMembership,
      });
      grantedMembershipMarker = `${String(existingMembership._id)}:${args.nowMs}`;
    } else if (!existingMembership) {
      const membershipId = await args.ctx.db.insert("communityMemberships", {
        communityId: args.community._id,
        userId: args.userId,
        role: "member",
        accessSource: "free_grant",
        active: true,
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      await adjustCommunityActiveMemberCountForMembershipTransition({
        ctx: args.ctx,
        communityId: args.community._id,
        before: null,
        after: {
          _id: membershipId,
          communityId: args.community._id,
          userId: args.userId,
          role: "member",
          accessSource: "free_grant",
          active: true,
          createdAt: args.nowMs,
          updatedAt: args.nowMs,
        },
      });
      grantedMembershipMarker = `${String(membershipId)}:${args.nowMs}`;
    }
    if (grantedMembershipMarker) {
      await enqueueCommunityAccessGrantedEmailInternal({
        ctx: args.ctx,
        userId: args.userId,
        communityId: args.community._id,
        grantMarker: grantedMembershipMarker,
        nowMs: args.nowMs,
      });
    }
  };

  if (existingMembership && communityMembershipRowIsActive(existingMembership)) {
    await scheduleCommunityAppGrantSeedingBestEffort({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
      nowMs: args.nowMs,
      reason: "already_active_public_join",
    });
    if (isPlatformHomeCommunity({ communitySlug: args.community.slug })) {
      await clearPlatformHomeCommunityAutojoinOptOut({
        ctx: args.ctx,
        communityId: args.community._id,
        userId: args.userId,
      });
    }
    return {
      outcome: "joined",
      community_id: String(args.community._id),
    };
  }

  const joinRequestRows = (await args.ctx.db
    .query("communityJoinRequests")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
    .collect()) as CommunityJoinRequestLike[];
  const joinRequest = pickMostRelevantCommunityJoinRequest(joinRequestRows);
  const joinRequestStatus = String(joinRequest?.status ?? "")
    .trim()
    .toLowerCase();

  const platformHomeAutojoinOptOut = isPlatformHomeCommunity({
    communitySlug: args.community.slug,
  })
    ? await readPlatformHomeAutojoinOptOut({
        ctx: args.ctx,
        communityId: args.community._id,
        userId: args.userId,
      })
    : null;
  if (platformHomeAutojoinOptOut?.kind === "removed") {
    const explicitJoinRequest = pickMostRelevantCommunityJoinRequest(
      joinRequestRows.filter(
        (row) => !isPlatformHomeAutojoinOptOutRequest(row),
      ),
    );
    const explicitStatus = String(explicitJoinRequest?.status ?? "")
      .trim()
      .toLowerCase();
    if (explicitStatus === "pending") {
      return {
        outcome: "approval_pending",
        community_id: String(args.community._id),
      };
    }
    if (explicitStatus === "approved") {
      await clearPlatformHomeCommunityAutojoinOptOut({
        ctx: args.ctx,
        communityId: args.community._id,
        userId: args.userId,
      });
    } else if (
      !communityJoinRequestCanReapply(
        platformHomeAutojoinOptOut.request,
        args.nowMs,
      )
    ) {
      return {
        outcome: "approval_denied",
        community_id: String(args.community._id),
        reapply_at:
          typeof platformHomeAutojoinOptOut.request.reapplyAt === "number"
            ? toIsoString(platformHomeAutojoinOptOut.request.reapplyAt)
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

  const entryPolicy = resolveCommunityEntryPolicy(args.community);
  if (joinRequestStatus === "denied" && !communityJoinRequestCanReapply(joinRequest, args.nowMs)) {
    return {
      outcome: "approval_denied",
      community_id: String(args.community._id),
      reapply_at:
        typeof joinRequest?.reapplyAt === "number"
          ? toIsoString(joinRequest.reapplyAt)
          : null,
    };
  }
  if (entryPolicy === "paid_subscription") {
    return {
      outcome: "paid_plan_required",
      community_id: String(args.community._id),
    };
  }
  if (entryPolicy === "approval") {
    if (joinRequestStatus === "approved") {
      // approved requests may enter immediately
    } else if (joinRequestStatus === "pending") {
      return {
        outcome: "approval_pending",
        community_id: String(args.community._id),
      };
    } else if (joinRequestStatus === "denied") {
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

  await grantFreeMembership();
  if (grantedMembershipMarker) {
    await scheduleCommunityAppGrantSeedingBestEffort({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
      nowMs: args.nowMs,
      reason: "public_join_granted",
    });
  }
  if (isPlatformHomeCommunity({ communitySlug: args.community.slug })) {
    await clearPlatformHomeCommunityAutojoinOptOut({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
    });
  }
  return {
    outcome: "joined",
    community_id: String(args.community._id),
  };
}

export const joinPublicCommunityBySlug = mutation({
  args: {
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const nowMs = Date.now();
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
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const nowMs = Date.now();
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
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const nowMs = Date.now();
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
