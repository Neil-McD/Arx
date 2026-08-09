import { mutation, query } from "./_generated/server";
import { extractMessageText } from "./communityChat";
import { v } from "convex/values";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type CommunityResourceModuleLike,
  type PublicPlanSummaryLike,
  communityMembershipRowIsActive,
  communityUserIsBlocked,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  countCanonicalCommunityMembersFromRows,
  getUniqueCommunityMembershipByPair,
  listCanonicalCommunityMemberMembershipRows,
  mapActivePlanSummaries,
  normalizeCommunityRoleForOutput,
  normalizeSlug,
  pickMostRelevantCommunityMembership,
  pickPreferredActivePlan,
  requireCommunityChatAccess,
  requireCommunityUserNotBlocked,
  resolveCommunityAccessBundle,
  resolveCommunityBrandingFields,
  buildCommunityVisualIdentity,
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
  getCurrentCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import { findAuthenticatedActorState } from "./authActor";
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
import {
  COMMUNITY_PRESENCE_FACE_LIMIT,
  renewCommunityPresenceLease,
  resolveAuthorizedCommunityPresenceWindow,
  resolveMemberCommunityPresenceSummary,
} from "./communityPresenceCore";
import {
  listAllActiveChannelReadableRows,
} from "./communityChannelCore";
import { communityIsActive } from "../shared/communityLifecycle";
import {
  requireCommunityBuilderAccess,
  resolveCommunityBuilderAccess,
} from "./communityBuilderAccessCore";
import { requireAccountSetupCompleteForUser } from "./accountSetupCore";

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

type PublicCommunityInteractionActivityRow = {
  _id: any;
  communityId: any;
  channelId?: any;
  visibilityScope: "private" | "admin" | "community" | "public";
  status: "live" | "hidden" | "deleted";
  createdAt: number;
};

export async function resolvePublicCommunityInteractionActivityCounts(
  ctx: any,
  communityId: any,
  options: { nowMs?: number; cap?: number } = {},
): Promise<{ messagesTodayCount: number; messagesTodayCapped: boolean }> {
  const requestedCap = Number(options.cap ?? PUBLIC_ACTIVITY_COUNT_CAP);
  const cap = Math.min(
    PUBLIC_ACTIVITY_COUNT_CAP,
    Number.isFinite(requestedCap) && requestedCap > 0
      ? Math.floor(requestedCap)
      : PUBLIC_ACTIVITY_COUNT_CAP,
  );
  const sinceMs = (options.nowMs ?? Date.now()) - PUBLIC_MESSAGES_TODAY_WINDOW_MS;
  const [readableRoots, readableReplies] = await Promise.all([
    listAllActiveChannelReadableRows<PublicCommunityInteractionActivityRow>({
      ctx,
      tableName: "communityInteractionRoots",
      communityId,
      limit: cap,
    }),
    listAllActiveChannelReadableRows<PublicCommunityInteractionActivityRow>({
      ctx,
      tableName: "communityInteractionReplies",
      communityId,
      limit: cap,
    }),
  ]);
  const rawMessagesToday =
    readableRoots.filter((row) => row.createdAt >= sinceMs).length +
    readableReplies.filter((row) => row.createdAt >= sinceMs).length;
  return {
    messagesTodayCount: Math.min(rawMessagesToday, cap),
    messagesTodayCapped: rawMessagesToday >= cap,
  };
}

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
  const interactionActivity = await resolvePublicCommunityInteractionActivityCounts(
    ctx,
    communityId,
    { cap },
  );

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
    ...interactionActivity,
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
  onlineCountCapped: boolean;
  onlineFaces: PublicCommunityFace[];
  joinedLast30dCount: number;
  memberFacesPreview: PublicCommunityFace[];
}> {
  const { rows: activeMemberships } = await listCanonicalCommunityMemberMembershipRows({
    ctx,
    communityId: community._id,
    community,
  });

  const adminUserIds = new Set<string>([String(community.ownerId)]);
  for (const membership of activeMemberships) {
    if (String(membership.role ?? "").trim().toLowerCase() === "admin") {
      adminUserIds.add(String(membership.userId));
    }
  }
  const memberCount = countCanonicalCommunityMembersFromRows(activeMemberships);
  const presenceWindow = await resolveAuthorizedCommunityPresenceWindow(
    ctx,
    community,
  );
  const userIdCache = new Map<string, string | null>();

  const onlineFaces = (
    await Promise.all(
      presenceWindow.entries
        .slice(0, COMMUNITY_PRESENCE_FACE_LIMIT)
        .map(async ({ userId }): Promise<PublicCommunityFace | null> => {
          const user = await ctx.db.get(userId);
          if (!user) return null;
          return {
            user_id:
              (await resolvePublicUserId(ctx, user._id, userIdCache))
              ?? String(user._id),
            ...(await resolvePublicProfileFaceFields(ctx, user._id)),
          };
        }),
    )
  ).filter(Boolean) as PublicCommunityFace[];

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
    onlineCount: presenceWindow.entries.length,
    onlineCountCapped: presenceWindow.countCapped,
    onlineFaces,
    joinedLast30dCount,
    memberFacesPreview,
  };
}

function mapPublicCommunityStats(stats: {
  memberCount: number;
  adminCount: number;
  onlineCount: number;
  onlineCountCapped: boolean;
  onlineFaces: PublicCommunityFace[];
  joinedLast30dCount: number;
  memberFacesPreview: PublicCommunityFace[];
}) {
  return {
    member_count: stats.memberCount,
    admin_count: stats.adminCount,
    online_count: stats.onlineCount,
    online_count_capped: stats.onlineCountCapped,
    online_faces: stats.onlineFaces,
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
    if (!community || !communityIsActive(community)) return { ok: false };

    const mappedPlans = await listCurrentCommunitySellablePlans(ctx, community._id);
    const activePlan = pickPreferredActivePlan(mappedPlans);
    const branding = await resolveCommunityBrandingFields(ctx, community);
    const entryPolicy = resolveCommunityEntryPolicy(community);
    const funnel = await resolveCommunityFunnelConfigByCommunityId(ctx, community._id);
    const owner = community.ownerId ? await ctx.db.get(community.ownerId) : null;
    const host = owner ? await resolvePublicProfileFaceFields(ctx, owner._id) : null;
    const builderAccess = await resolveCommunityBuilderAccess({
      ctx,
      community,
    });

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
        availability: builderAccess.operational
          ? "available"
          : "temporarily_unavailable",
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
    if (!community || !communityIsActive(community)) return { ok: false };

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
    if (!community || !communityIsActive(community)) return { ok: false as const };

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
    if (!community || !communityIsActive(community)) return { ok: false };

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
      .take(200)) as CommunityLike[];

    const communities = (await Promise.all(
      published.map(async (community) => {
        if (!communityIsActive(community)) return null;
        const builderAccess = await resolveCommunityBuilderAccess({
          ctx,
          community,
        });
        if (!builderAccess.operational) return null;
        const mappedPlans = await listCurrentCommunitySellablePlans(ctx, community._id);
        const branding = await resolveCommunityBrandingFields(ctx, community);
        const entryPolicy = resolveCommunityEntryPolicy(community);
        return {
          id: String(community._id),
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
          branding_revision: community.brandingRevision ?? community.updatedAt,
          visual_identity: buildCommunityVisualIdentity(community, branding),
          active_plan: pickPreferredActivePlan(mappedPlans),
        };
      }),
    )).filter((community) => community !== null).slice(0, limit);

    return {
      ok: true,
      communities,
    };
  },
});

/* Cached production clients still call this operation. The current web app
   uses communityAccessQueries:getMyCommunityAccessBySlug as its sole
   admission projection; remove this compatibility shim only after the pinned
   cached-client contract advances past that build. */
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
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community || !communityIsActive(community)) return null;
    if (String(community.ownerId) === String(userId)) return null;
    if (await communityUserIsBlocked({
      ctx,
      communityId: community._id,
      userId,
    })) return null;
    const membership = await getUniqueCommunityMembershipByPair({
      ctx,
      communityId: community._id,
      userId,
    });
    if (communityMembershipRowIsActive(membership)) return null;
    const request = await getCurrentCommunityJoinRequestByPair({
      ctx,
      communityId: community._id,
      userId,
    });
    if (!request) return null;
    const status = assertCanonicalCommunityJoinRequest(request);
    return {
      community_id: String(community._id),
      status,
      created_at: toIsoString(request.createdAt),
      updated_at: toIsoString(request.updatedAt),
      denied_at:
        typeof request.deniedAt === "number" ? toIsoString(request.deniedAt) : null,
      reapply_at:
        typeof request.reapplyAt === "number" ? toIsoString(request.reapplyAt) : null,
      denied_until:
        typeof request.reapplyAt === "number" ? toIsoString(request.reapplyAt) : null,
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
  await requireAccountSetupCompleteForUser(args.ctx, args.userId);

  if (!communityIsActive(args.community)) {
    throw new Error("community_archived");
  }
  await requireCommunityBuilderAccess({
    ctx: args.ctx,
    community: args.community,
    nowMs: args.nowMs,
  });
  if (String(args.community.ownerId) === String(args.userId)) {
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
    return {
      outcome: "joined",
      community_id: String(args.community._id),
    };
  }

  const joinRequest = await getCurrentCommunityJoinRequestByPair({
    ctx: args.ctx,
    communityId: args.community._id,
    userId: args.userId,
  });
  const joinRequestStatus = joinRequest
    ? assertCanonicalCommunityJoinRequest(joinRequest)
    : null;
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

  const requiresManagerReapproval = isPlatformHomeCommunity({
    communitySlug: args.community.slug,
  })
    ? platformHomeMembershipRequiresReapproval(existingMembership)
    : communityMembershipRequiresManagerReapproval(existingMembership);
  if (
    joinRequestStatus === "denied" &&
    !communityJoinRequestCanReapply(joinRequest!, args.nowMs)
  ) {
    return {
      outcome: "approval_denied",
      community_id: String(args.community._id),
      reapply_at:
        typeof joinRequest?.reapplyAt === "number"
          ? toIsoString(joinRequest.reapplyAt)
          : null,
    };
  }
  if (entryPolicy === "approval" || requiresManagerReapproval) {
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
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    if (!communityIsActive(community)) throw new Error("community_archived");

    return await cancelPendingCommunityJoinRequest({
      ctx,
      communityId: community._id,
      userId,
    });
  },
});
