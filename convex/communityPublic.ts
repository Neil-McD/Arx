import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { requireNotTestMemberOutsideCommunity } from "./communityTestMemberCore";
import { normalizeCommunityReferralRef } from "../shared/communityClients";
import { v } from "convex/values";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type CommunityResourceModuleLike,
  type PublicPlanSummaryLike,
  communityMembershipRowIsActive,
  communityMembershipIsCoCreator,
  communityUserIsBlocked,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  countPeopleFacingMembers,
  listActiveTestMemberUserIds,
  getUniqueCommunityMembershipByPair,
  listCanonicalCommunityMemberMembershipRows,
  mapActivePlanSummaries,
  normalizeSlug,
  pickPreferredActivePlan,
  requireCommunityChatAccess,
  requireCommunityUserNotBlocked,
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
import { readPublishedCommunityLayout } from "./communityLayouts";
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
  listCommunityOnlineMembers,
  renewCommunityPresenceLease,
  resolveAuthorizedCommunityPresenceWindow,
  resolveMemberCommunityPresenceSummary,
} from "./communityPresenceCore";
import {
  listSharedChannelReadableRows,
} from "./communityChannelCore";
import { communityIsActive } from "../shared/communityLifecycle";
import { registeredSiteOrigin } from "./communitySites";
import type { CommunityPublicFace } from "../shared/communityTypes";
import {
  requireCommunityBuilderAccess,
  resolveCommunityBuilderAccess,
} from "./communityBuilderAccessCore";
import { requireAccountSetupCompleteForUser } from "./accountSetupCore";

// The join page's funnel projection is always the plain default: the funnel
// editor and hero media are retired (POL-23) and no custom content renders.
const COMMUNITY_FUNNEL_PUBLIC_CONFIG = {
  hero_media_url: null,
  hero_media_kind: "image" as const,
  active_slot: "default" as const,
  published_vsl_url: null,
  published_content_v2: null,
};

const FUNNEL_VISIT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

async function resolvePublicProfileFaceFields(ctx: any, userId: any): Promise<Omit<CommunityPublicFace, "user_id">> {
  return await resolveUserProfileDisplayProjection(ctx, userId);
}

export async function listCurrentCommunitySellablePlans(ctx: any, communityId: any): Promise<PublicPlanSummaryLike[]> {
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
    listSharedChannelReadableRows<PublicCommunityInteractionActivityRow>({
      ctx,
      tableName: "communityInteractionRoots",
      communityId,
      limit: cap,
    }),
    listSharedChannelReadableRows<PublicCommunityInteractionActivityRow>({
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
  onlineFaces: CommunityPublicFace[];
  joinedLast30dCount: number;
  memberFacesPreview: CommunityPublicFace[];
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
  const testUserIds = await listActiveTestMemberUserIds(ctx, community._id);
  const realMemberships = activeMemberships.filter((membership) => !testUserIds.has(String(membership.userId)));
  const memberCount = countPeopleFacingMembers(activeMemberships, testUserIds);
  const presenceWindow = await resolveAuthorizedCommunityPresenceWindow(
    ctx,
    community,
  );
  const userIdCache = new Map<string, string | null>();

  const onlineFaces = (
    await Promise.all(
      presenceWindow.entries
        .slice(0, COMMUNITY_PRESENCE_FACE_LIMIT)
        .map(async ({ userId }): Promise<CommunityPublicFace | null> => {
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
  ).filter(Boolean) as CommunityPublicFace[];

  const joinedSinceMs = Date.now() - PUBLIC_JOINED_RECENTLY_WINDOW_MS;
  const joinedLast30dCount = realMemberships.reduce(
    (count, membership) => count + (membership.createdAt >= joinedSinceMs ? 1 : 0),
    0,
  );

  /* Visitor members preview: owner + the most recent joins, capped at 5.
     Same public exposure as online_faces (display name + avatar only). */
  const previewUserIds: any[] = [community.ownerId];
  const seenPreviewIds = new Set<string>([String(community.ownerId)]);
  for (const membership of [...realMemberships].sort((a, b) => b.createdAt - a.createdAt)) {
    if (previewUserIds.length >= PUBLIC_MEMBER_FACES_PREVIEW_LIMIT) break;
    const normalizedUserId = String(membership.userId);
    if (seenPreviewIds.has(normalizedUserId)) continue;
    seenPreviewIds.add(normalizedUserId);
    previewUserIds.push(membership.userId);
  }
  const memberFacesPreview = (
    await Promise.all(
      previewUserIds.slice(0, PUBLIC_MEMBER_FACES_PREVIEW_LIMIT).map(
        async (userId): Promise<CommunityPublicFace | null> => {
          const user = await ctx.db.get(userId);
          if (!user) return null;
          return {
            user_id: (await resolvePublicUserId(ctx, user._id, userIdCache)) ?? String(user._id),
            ...(await resolvePublicProfileFaceFields(ctx, user._id)),
          };
        },
      ),
    )
  ).filter(Boolean) as CommunityPublicFace[];

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
  onlineFaces: CommunityPublicFace[];
  joinedLast30dCount: number;
  memberFacesPreview: CommunityPublicFace[];
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
    const owner = community.ownerId ? await ctx.db.get(community.ownerId) : null;
    const host = owner ? await resolvePublicProfileFaceFields(ctx, owner._id) : null;
    const layout = await readPublishedCommunityLayout(ctx, community._id);

    return {
      ok: true,
      community: {
        id: String(community._id),
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
        funnel: COMMUNITY_FUNNEL_PUBLIC_CONFIG,
        about_presentation: layout?.pages.about.presentation ?? "page",
        about_media: layout?.pages.about.media ?? [],
        about_text: layout?.pages.about.text ?? "",
        about_show_members: layout?.pages.about.show_members ?? true,
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

// A community site's heartbeat for its signed-in member: the same lease Studio
// renews, for the member the site session already established.
export const heartbeatCommunityPresenceForUserInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const lease = await renewCommunityPresenceLease({ ctx, communityId: args.communityId, userId: args.userId });
    return { active_until: toIsoString(lease.activeUntil) };
  },
});

// Who's online, for a member reading through a site or their own harness.
export const listCommunityOnlineMembersForUserInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    return await listCommunityOnlineMembers(ctx, community);
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
    const communities = await Promise.all(
      (await listDiscoverableCommunities(ctx, limit)).map(async (community) => {
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
    );

    return {
      ok: true,
      communities,
    };
  },
});

// The communities Discover lists, newest activity first: published, active and
// operational only (never unlisted). Studio's Discover and every community
// site's /discover read this one list.
async function listDiscoverableCommunities(ctx: QueryCtx, limit: number): Promise<CommunityLike[]> {
  const published = (await ctx.db
    .query("communities")
    .withIndex("by_visibility_updatedAt", (q) => q.eq("visibility", "published"))
    .order("desc")
    .take(200)) as CommunityLike[];
  const listed = await Promise.all(published.map(async (community) => {
    if (community.visibility !== "published" || !communityIsActive(community)) return null;
    const builderAccess = await resolveCommunityBuilderAccess({ ctx, community });
    return builderAccess.operational ? community : null;
  }));
  return listed.filter((community): community is CommunityLike => community !== null).slice(0, limit);
}

// Discover on a community site (the edge's /__polynet/discover, signed in or
// not): the same list, with only what a public card shows. site_url is the
// community's own site on this environment's sites domain, when it has one
// (its origin is registered to it); otherwise the card links to Studio.
export const listSiteDiscoverCommunitiesInternal = internalQuery({
  args: { sitesDomain: v.optional(v.string()), hostSuffix: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const domain = String(args.sitesDomain ?? "").trim().toLowerCase();
    const suffix = String(args.hostSuffix ?? "").trim().toLowerCase();
    const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
    return await Promise.all((await listDiscoverableCommunities(ctx, 100)).map(async (community) => {
      const slug = String(community.slug ?? "");
      const branding = await resolveCommunityBrandingFields(ctx, community);
      return {
        slug,
        name: text(community.name, 120) ?? slug,
        one_liner: text(community.oneLiner, 300),
        avatar_url: branding.avatar_url,
        member_count: Math.max(0, Math.floor(Number((community as any).activeMemberCount) || 0)),
        site_url: await registeredSiteOrigin(ctx, community, domain, suffix),
      };
    }));
  },
});

// The join decision for Studio's funnel and for Join on a community site's
// private twin (communityAppJoin.ts): one gate, whichever page asks.
export async function joinPublicCommunityInternal(args: {
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
  await requireNotTestMemberOutsideCommunity(args.ctx, args.userId, args.community._id);

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

// First touch wins: a later link never rewrites who sent the member.
async function recordCommunityReferral(ctx: any, communityId: any, userId: any, rawRef: unknown, nowMs: number) {
  const ref = normalizeCommunityReferralRef(rawRef);
  if (!ref) return;
  const existing = await ctx.db.query("communityReferrals")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).first();
  if (!existing) await ctx.db.insert("communityReferrals", { communityId, userId, ref, capturedAt: nowMs });
}

export const joinPublicCommunityBySlug = mutation({
  args: {
    communitySlug: v.string(),
    ref: v.optional(v.string()),
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
    await recordCommunityReferral(ctx, community._id, userId, args.ref, nowMs);
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
    ref: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const nowMs = Date.now();
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    await recordCommunityReferral(ctx, community._id, userId, args.ref, nowMs);
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

// The same owner's other public communities, for the "More from this creator"
// block inside each community, so one community can send members to the next.
export const listSiblingCommunities = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const current = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!current || !communityIsActive(current)) return { communities: [] };
    const owned = (await ctx.db.query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", current.ownerId))
      .take(50)) as CommunityLike[];
    const communities = [];
    for (const community of owned) {
      if (community._id === current._id || community.visibility !== "published" || !communityIsActive(community)) continue;
      if (!(await resolveCommunityBuilderAccess({ ctx, community })).operational) continue;
      const branding = await resolveCommunityBrandingFields(ctx, community);
      communities.push({
        id: String(community._id),
        slug: community.slug,
        name: community.name,
        one_liner: community.oneLiner ?? null,
        avatar_url: branding.avatar_url,
      });
      if (communities.length >= 6) break;
    }
    return { communities };
  },
});

// The people who make a community: its owner, then the co-creators the owner
// added, in the order they were added. Public like the community's own page.
export const listCommunityCreators = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community || !communityIsActive(community)) return { creators: [], admins: [] };
    const userIdCache = new Map<string, string | null>();
    const describe = async (userRowId: any, role: "owner" | "co_creator" | "admin") => {
      const user = (await ctx.db.get(userRowId)) as { handle?: string } | null;
      return {
        user_id: (await resolvePublicUserId(ctx, userRowId, userIdCache)) ?? String(userRowId),
        role,
        handle: user?.handle ?? null,
        ...(await resolveUserProfileDisplayProjection(ctx, userRowId)),
      };
    };
    const rows = (await ctx.db.query("communityMemberships")
      .withIndex("by_community_coCreator", (q) => q.eq("communityId", args.communityId).eq("coCreator", true))
      .take(50)) as CommunityMembershipLike[];
    const coCreators = rows
      .filter((row) => communityMembershipIsCoCreator(row) && communityMembershipRowIsActive(row) && String(row.userId) !== String(community.ownerId))
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const creators = [await describe(community.ownerId, "owner")];
    for (const row of coCreators) creators.push(await describe(row.userId, "co_creator"));
    // Admins come after the creators so members can find and message them
    //. A co-creator who is also an admin shows once.
    const { rows: activeMemberships } = await listCanonicalCommunityMemberMembershipRows({ ctx, communityId: args.communityId, community });
    const shown = new Set([String(community.ownerId), ...coCreators.map((row) => String(row.userId))]);
    const admins = [];
    for (const row of activeMemberships) {
      if (String(row.role ?? "").trim().toLowerCase() !== "admin" || shown.has(String(row.userId))) continue;
      shown.add(String(row.userId));
      admins.push(await describe(row.userId, "admin"));
      if (admins.length >= 20) break;
    }
    return { creators, admins };
  },
});
