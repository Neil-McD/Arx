import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  type CommunityLike,
  type CommunityPricePointLike,
  type CommunityResourceModuleLike,
  type PublicPlanSummaryLike,
  communityMembershipRowIsActive,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  countCanonicalCommunityMembersFromRows,
  listCanonicalCommunityMemberMembershipRows,
  mapActivePlanSummaries,
  getUniqueCommunityMembershipByPair,
  normalizeCommunityRoleForOutput,
  normalizeSlug,
  pickPreferredActivePlan,
  requireCommunityChatAccess,
  requireCommunityUserNotBlocked,
  resolveCommunityBrandingFields,
  resolveCommunityEntryPolicy,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  assertCanonicalCommunityJoinRequest,
  cancelPendingCommunityJoinRequest,
  communityJoinRequestCanReapply,
  deleteCommunityJoinRequestByPair,
  ensurePendingCommunityJoinRequest,
  getUniqueCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import { resolveCommunityFunnelConfigByCommunityId } from "./communityFunnel";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";
import {
  communityMembershipRequiresManagerReapproval,
  isPlatformHomeCommunity,
  platformHomeMembershipRequiresReapproval,
} from "./platformHomeCommunity";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { hashBusinessVisitorKey } from "./businessAnalyticsCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

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

const PUBLIC_ACTIVITY_COUNT_CAP = 200;
const PUBLIC_MEMBER_FACES_PREVIEW_LIMIT = 5;
const PUBLIC_MESSAGES_TODAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const PUBLIC_JOINED_RECENTLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/* Parity with MEMBER_READABLE_STATUSES in communityIntelligenceDirectory:
   the visitor number must only count notes a member could actually read. */
const PUBLIC_MEMORY_NOTE_STATUSES = ["promising", "validated", "canonical", "contested", "stale"];

/* True-metadata counts for the visitor surface (locked tabs + gate receipt).
   Serves unauthenticated traffic: capped index-range reads only, and every
   number is one a member could verify from inside — live messages,
   member-visible resources, member-readable memory notes. */
async function resolvePublicCommunityActivityCounts(ctx: any, communityId: any): Promise<{
  messagesTodayCount: number;
  messagesTodayCapped: boolean;
  resourceCount: number;
  resourceCountCapped: boolean;
  memoryNoteCount: number;
  memoryNoteCountCapped: boolean;
}> {
  const cap = PUBLIC_ACTIVITY_COUNT_CAP;
  const sinceMs = Date.now() - PUBLIC_MESSAGES_TODAY_WINDOW_MS;
  const liveRootsToday = await ctx.db
    .query("communityInteractionRoots" as any)
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", communityId).eq("status", "live").gte("createdAt", sinceMs),
    )
    .take(cap);
  const liveRepliesToday = await ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", communityId).eq("status", "live").gte("createdAt", sinceMs),
    )
    .take(cap);
  const rawMessagesToday = liveRootsToday.length + liveRepliesToday.length;

  const resourceRows = await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(cap);
  const moduleRows = (await ctx.db
    .query("communityResourceModules" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(cap)) as CommunityResourceModuleLike[];
  const liveModuleIds = new Set(
    moduleRows.filter(communityResourceModuleIsLive).map((module) => String(module._id)),
  );
  const memberVisibleResources = resourceRows.filter((row: any) =>
    communityResourceIsLiveModulePage(row, liveModuleIds),
  );

  let memoryNoteCount = 0;
  let memoryNoteCountCapped = false;
  for (const status of PUBLIC_MEMORY_NOTE_STATUSES) {
    const bucket = await ctx.db
      .query("communityIntelligenceNodes" as any)
      .withIndex("by_community_status_updatedAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", status),
      )
      .take(cap);
    if (bucket.length >= cap) memoryNoteCountCapped = true;
    memoryNoteCount += bucket.filter(
      (row: any) => row.visibilityScope === "community" || row.visibilityScope === "public",
    ).length;
  }

  return {
    messagesTodayCount: Math.min(rawMessagesToday, cap),
    messagesTodayCapped: rawMessagesToday >= cap,
    resourceCount: memberVisibleResources.length,
    resourceCountCapped: resourceRows.length >= cap,
    memoryNoteCount,
    memoryNoteCountCapped,
  };
}

async function resolvePublicCommunityStats(ctx: any, community: CommunityLike): Promise<{
  memberCount: number;
  adminCount: number;
  onlineCount: number;
  onlineFaces: PublicCommunityFace[];
  onlineUserIds: string[];
  onlineLastActiveAtByUserId: Record<string, string>;
  joinedLast30dCount: number;
  memberFacesPreview: PublicCommunityFace[];
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

  const onlineUserEntries: Array<{ userId: any; lastSeenAt: number }> = [];
  const seenOnlineUserIds = new Set<string>();
  const userIdCache = new Map<string, string | null>();
  for (const row of recentPresenceRows) {
    const normalizedUserId = String(row.userId ?? "").trim();
    if (!normalizedUserId || seenOnlineUserIds.has(normalizedUserId) || !eligibleUserIds.has(normalizedUserId)) {
      continue;
    }
    seenOnlineUserIds.add(normalizedUserId);
    onlineUserEntries.push({ userId: row.userId, lastSeenAt: row.lastSeenAt });
  }

  const onlineFaces = (
    await Promise.all(
      onlineUserEntries.slice(0, 8).map(async ({ userId }): Promise<PublicCommunityFace | null> => {
        const user = await ctx.db.get(userId);
        if (!user) return null;
        return {
          user_id: (await resolvePublicUserId(ctx, user._id, userIdCache)) ?? String(user._id),
          ...(await resolvePublicProfileFaceFields(ctx, user._id)),
        };
      }),
    )
  ).filter(Boolean) as PublicCommunityFace[];

  const onlineUserPublicIds: string[] = [];
  const onlineLastActiveAtByUserId: Record<string, string> = {};
  for (const entry of onlineUserEntries) {
    const publicUserId = (await resolvePublicUserId(ctx, entry.userId, userIdCache)) ?? String(entry.userId);
    if (!publicUserId) continue;
    onlineUserPublicIds.push(publicUserId);
    onlineLastActiveAtByUserId[publicUserId] = toIsoString(entry.lastSeenAt);
  }

  const joinedSinceMs = Date.now() - PUBLIC_JOINED_RECENTLY_WINDOW_MS;
  const joinedLast30dCount = activeMemberships.reduce(
    (count, membership) => count + (membership.createdAt >= joinedSinceMs ? 1 : 0),
    0,
  );

  /* Visitor members preview: owner + the most recent joins, capped at 5.
     Same public exposure as online_faces (display name + avatar only). */
  const previewUserIds: any[] = [community.ownerId];
  const seenPreviewIds = new Set<string>([String(community.ownerId)]);
  for (const membership of [...activeMemberships].sort((a, b) => b.createdAt - a.createdAt)) {
    if (previewUserIds.length >= PUBLIC_MEMBER_FACES_PREVIEW_LIMIT) break;
    const normalizedUserId = String(membership.userId);
    if (seenPreviewIds.has(normalizedUserId)) continue;
    seenPreviewIds.add(normalizedUserId);
    previewUserIds.push(membership.userId);
  }
  const memberFacesPreview = (
    await Promise.all(
      previewUserIds.slice(0, PUBLIC_MEMBER_FACES_PREVIEW_LIMIT).map(
        async (userId): Promise<PublicCommunityFace | null> => {
          const user = await ctx.db.get(userId);
          if (!user) return null;
          return {
            user_id: (await resolvePublicUserId(ctx, user._id, userIdCache)) ?? String(user._id),
            ...(await resolvePublicProfileFaceFields(ctx, user._id)),
          };
        },
      ),
    )
  ).filter(Boolean) as PublicCommunityFace[];

  return {
    memberCount,
    adminCount: adminUserIds.size,
    onlineCount: onlineUserEntries.length,
    onlineFaces,
    onlineUserIds: onlineUserPublicIds,
    onlineLastActiveAtByUserId,
    joinedLast30dCount,
    memberFacesPreview,
  };
}

function mapPublicCommunityStats(stats: {
  memberCount: number;
  adminCount: number;
  onlineCount: number;
  onlineFaces: PublicCommunityFace[];
  onlineUserIds: string[];
  joinedLast30dCount: number;
  memberFacesPreview: PublicCommunityFace[];
}) {
  return {
    member_count: stats.memberCount,
    admin_count: stats.adminCount,
    online_count: stats.onlineCount,
    online_faces: stats.onlineFaces,
    online_user_ids: stats.onlineUserIds,
    joined_last_30d_count: stats.joinedLast30dCount,
    member_faces_preview: stats.memberFacesPreview,
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
    const owner = community.ownerId ? await ctx.db.get(community.ownerId) : null;
    const host = owner ? await resolvePublicProfileFaceFields(ctx, owner._id) : null;

    return {
      ok: true,
      community: {
        slug: community.slug,
        name: community.name,
        host,
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

    const activityCounts = await resolvePublicCommunityActivityCounts(ctx, community._id);
    return {
      ok: true,
      community: {
        ...mapPublicCommunityStats(await resolvePublicCommunityStats(ctx, community)),
        messages_today_count: activityCounts.messagesTodayCount,
        messages_today_capped: activityCounts.messagesTodayCapped,
        resource_count: activityCounts.resourceCount,
        resource_count_capped: activityCounts.resourceCountCapped,
        memory_note_count: activityCounts.memoryNoteCount,
        memory_note_count_capped: activityCounts.memoryNoteCountCapped,
      },
    };
  },
});

export const recordPublicFunnelVisitBySlug = mutation({
  args: {
    communitySlug: v.string(),
    visitorKey: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) return { ok: false };

    const nowMs = Date.now();
    const visitorKey = args.visitorKey.trim();
    if (!visitorKey) return { ok: false, reason: "missing_visitor_key" };
    const visitorKeyHash = await hashBusinessVisitorKey(visitorKey);
    const dedupeAfterMs = nowMs - FUNNEL_VISIT_DEDUPE_WINDOW_MS;
    const recentRow = await ctx.db
      .query("communityAnalyticsEvents")
      .withIndex("by_community_visitor_hash_event", (q) =>
        q
          .eq("communityId", community._id)
          .eq("visitorKeyHash", visitorKeyHash)
          .eq("eventType", "funnel_visit")
          .gte("createdAt", dedupeAfterMs),
      )
      .first();
    if (recentRow) {
      return { ok: true, deduped: true };
    }

    await ctx.db.insert("communityAnalyticsEvents", {
      communityId: community._id,
      eventType: "funnel_visit",
      visitorKeyHash,
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
    return {
      ...mapPublicCommunityStats(stats),
      online_last_active_at_by_user_id: stats.onlineLastActiveAtByUserId,
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
  if (String(args.community.ownerId) === String(args.userId)) {
    await deleteCommunityJoinRequestByPair({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
    });
    return {
      outcome: "joined",
      community_id: String(args.community._id),
    };
  }
  await requireCommunityUserNotBlocked({
    ctx: args.ctx,
    communityId: args.community._id,
    userId: args.userId,
  });
  const existingMembership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: args.community._id,
    userId: args.userId,
  });
  let grantedMembershipMarker: string | null = null;

  const grantFreeMembership = async () => {
    const activation = await activateCommunityMembershipCore({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
      role: existingMembership
        ? normalizeCommunityRoleForOutput(existingMembership.role) || "member"
        : "member",
      accessSource: "free_grant",
      activationReason: "public_join",
      nowMs: args.nowMs,
    });
    grantedMembershipMarker = activation.activationMarker;
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
    await deleteCommunityJoinRequestByPair({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
    });
    await scheduleCommunityAppGrantSeedingBestEffort({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
      nowMs: args.nowMs,
      reason: "already_active_public_join",
    });
    return {
      outcome: "joined",
      community_id: String(args.community._id),
    };
  }

  const joinRequest = await getUniqueCommunityJoinRequestByPair({
    ctx: args.ctx,
    communityId: args.community._id,
    userId: args.userId,
  });
  const joinRequestStatus = joinRequest
    ? assertCanonicalCommunityJoinRequest(joinRequest)
    : null;

  const managerReapprovalRequired =
    communityMembershipRequiresManagerReapproval(existingMembership);
  if (managerReapprovalRequired && !joinRequest) {
    throw new Error("community_manager_removal_denial_missing");
  }
  if (
    managerReapprovalRequired &&
    joinRequestStatus === "denied" &&
    !communityJoinRequestCanReapply(joinRequest!, args.nowMs)
  ) {
    return {
      outcome: "approval_denied",
      community_id: String(args.community._id),
      reapply_at: toIsoString(joinRequest!.reapplyAt!),
    };
  }

  const platformHomeRequiresReapproval =
    isPlatformHomeCommunity({ communitySlug: args.community.slug }) &&
    platformHomeMembershipRequiresReapproval(existingMembership);
  if (platformHomeRequiresReapproval) {
    if (joinRequestStatus === "pending") {
      return {
        outcome: "approval_pending",
        community_id: String(args.community._id),
      };
    }
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

  const entryPolicy = resolveCommunityEntryPolicy(args.community);
  if (entryPolicy === "paid_subscription") {
    await deleteCommunityJoinRequestByPair({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
    });
    return {
      outcome: "paid_plan_required",
      community_id: String(args.community._id),
    };
  }
  if (entryPolicy === "approval") {
    if (joinRequestStatus === "pending") {
      return {
        outcome: "approval_pending",
        community_id: String(args.community._id),
      };
    } else if (joinRequestStatus === "denied") {
      if (communityJoinRequestCanReapply(joinRequest!, args.nowMs)) {
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
        reapply_at: toIsoString(joinRequest!.reapplyAt!),
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

export const cancelMyJoinRequestBySlug = mutation({
  args: {
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");

    return await cancelPendingCommunityJoinRequest({
      ctx,
      communityId: community._id,
      userId,
    });
  },
});
