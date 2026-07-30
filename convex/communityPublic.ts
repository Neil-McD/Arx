import { mutation, query } from "./_generated/server";
import { extractMessageText } from "./communityChat";
import { v } from "convex/values";
import {
  communityJoinRequestCanReapply,
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type CommunityResourceModuleLike,
  type PublicPlanSummaryLike,
  communityMembershipRowIsActive,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
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
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import {
  COMMUNITY_PRESENCE_LEASE_DURATION_MS,
  renewCommunityPresenceLease,
  resolveMemberCommunityPresenceSummary,
} from "./communityPresenceCore";

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

async function resolvePublicProfileFaceFields(ctx: any, userId: any): Promise<Omit<PublicCommunityFace, "user_id">> {
  return await resolveUserProfileDisplayProjection(ctx, userId);
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

  const cutoff = Date.now() - COMMUNITY_PRESENCE_LEASE_DURATION_MS;
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const lease = await renewCommunityPresenceLease({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return {
      ok: true,
      active_until: toIsoString(lease.activeUntil),
    };
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
    const summary = await resolveMemberCommunityPresenceSummary(ctx, community);
    return {
      member_count: summary.memberCount,
      admin_count: null,
      online_count: summary.onlineCount,
      online_count_capped: summary.onlineCountCapped,
      online_faces: summary.onlineFaces,
      online_user_ids: summary.onlineUserIds,
      online_last_active_at_by_user_id: summary.onlineLastActiveAtByUserId,
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
