import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityLike,
  type CommunityPricePointLike,
  type PublicPlanSummaryLike,
  communityMembershipRowIsActive,
  countCanonicalCommunityMembersFromRows,
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
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";
import {
  communityMembershipRequiresManagerReapproval,
  isPlatformHomeCommunity,
  platformHomeMembershipRequiresReapproval,
} from "./platformHomeCommunity";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import {
  COMMUNITY_PRESENCE_FACE_LIMIT,
  listCommunityOnlineMembers,
  renewCommunityPresenceLease,
  resolveAuthorizedCommunityPresenceWindow,
  resolveMemberCommunityPresenceSummary,
} from "./communityPresenceCore";
import { communityIsActive } from "../shared/communityLifecycle";
import { communityMemberExperience, communitySiteUrl, registeredSiteOrigin } from "./communitySites";
import type { CommunityPublicFace } from "../shared/communityTypes";
import {
  requireCommunityBuilderAccess,
  resolveCommunityBuilderAccess,
} from "./communityBuilderAccessCore";
import { requireAccountSetupCompleteForUser } from "./accountSetupCore";
import { acceptCommunityJoin } from "./starterProfile";

// The join page's funnel projection is always the plain default: the funnel
// editor and hero media are retired (POL-23) and no custom content renders.
const COMMUNITY_FUNNEL_PUBLIC_CONFIG = {
  hero_media_url: null,
  hero_media_kind: "image" as const,
  active_slot: "default" as const,
  published_vsl_url: null,
  published_content_v2: null,
};


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

const PUBLIC_MEMBER_FACES_PREVIEW_LIMIT = 5;
const PUBLIC_JOINED_RECENTLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
        funnel: COMMUNITY_FUNNEL_PUBLIC_CONFIG,
        // Its own site: the community's front door, so this page sends visitors there,
        // and where its members spend time (Polynet's app unless the owner chose the site).
        site_url: await communitySiteUrl(ctx, community),
        members_use: await communityMemberExperience(ctx, community),
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
  await acceptCommunityJoin(args.ctx, args.userId, args.nowMs);
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



