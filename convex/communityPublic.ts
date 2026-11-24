import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityLike,
  type CommunityPricePointLike,
  type PublicPlanSummaryLike,
  communityMembershipRowIsActive,
  communityMembershipState,
  getUniqueCommunityMembershipByPair,
  hasActiveAppGrant,
  mapActivePlanSummaries,
  normalizeSlug,
  pickPreferredActivePlan,
  requireCommunityChatAccess,
  requireCommunityUserNotBlocked,
  resolveCommunityBrandingFields,
  buildCommunityVisualIdentity,
  resolveCommunityEntryPolicy,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  assertCanonicalCommunityJoinRequest,
  communityJoinRequestCanReapply,
  deleteCommunityJoinRequestByPair,
  ensurePendingCommunityJoinRequest,
  getCurrentCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";
import {
  communityMembershipRequiresManagerReapproval,
} from "./platformHomeCommunity";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import {
  COMMUNITY_PRESENCE_HEARTBEAT_COALESCE_WINDOW_MS,
  listCommunityOnlineMembers,
  renewCommunityPresenceLease,
  resolveMemberCommunityPresenceSummary,
} from "./communityPresenceCore";
import { communityIsActive } from "../shared/communityLifecycle";
import type { CommunityPublicFace } from "../shared/communityTypes";
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
  // The base membership; tiers are sold from the builder's app (one door).
  const activePricePoints = currentPricePoints.filter((row) => !row.archivedAt && !row.tierKey);
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
      minRefreshIntervalMs: COMMUNITY_PRESENCE_HEARTBEAT_COALESCE_WINDOW_MS,
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
    const lease = await renewCommunityPresenceLease({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      minRefreshIntervalMs: COMMUNITY_PRESENCE_HEARTBEAT_COALESCE_WINDOW_MS,
    });
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
    const nowMs = Date.now();
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
          // For the card (Nov 16): who hosts it, how many are in it, and
          // whether anyone has been there lately.
          host: await discoverHost(ctx, community),
          member_count: Math.max(0, Math.floor(Number((community as any).activeMemberCount) || 0)),
          ...(await discoverActivity(ctx, community, nowMs)),
        };
      }),
    );

    return {
      ok: true,
      communities,
    };
  },
});

// The host on a card: the owner's name and face, nothing else.
async function discoverHost(ctx: QueryCtx, community: CommunityLike): Promise<{
  name: string;
  avatar_url: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
} | null> {
  const ownerId = (community as any).ownerId;
  const face = ownerId ? await resolveUserProfileDisplayProjection(ctx, ownerId) : null;
  const name = String((face as any)?.display_name ?? "").trim();
  return name
    ? {
        name,
        avatar_url: (face as any)?.avatar_url ?? null,
        avatar_focus_x: (face as any)?.avatar_focus_x ?? 0.5,
        avatar_focus_y: (face as any)?.avatar_focus_y ?? 0.5,
        avatar_zoom: (face as any)?.avatar_zoom ?? 1,
      }
    : null;
}

const DISCOVER_WEEK_MS = 7 * 86_400_000;
const DISCOVER_POSTS_CAP = 50;
const DISCOVER_POSTS_SCAN = 200;
const DISCOVER_ACTIVITY_CACHE_TTL_MS_INTERNAL = 25 * 60_000;

// A sign of life: when someone last posted, and how many posts this week
// (counted up to a cap; a card says "50+" past it). Only what any member can
// see: posts by people, in channels open to all members. Never the guide's
// own posts, a removed post, a private talk with the guide, or a pod's room.
// The newest DISCOVER_POSTS_SCAN posts of the week are looked through, so a
// run of posts that don't count can't hide the ones that do.
async function discoverActivity(
  ctx: QueryCtx,
  community: CommunityLike,
  nowMs: number,
): Promise<{ last_active_at: string | null; posts_this_week: number }> {
  const computedAt = (community as any).discoverActivityComputedAt;
  if (typeof computedAt === "number" && nowMs - computedAt < DISCOVER_ACTIVITY_CACHE_TTL_MS_INTERNAL) {
    const rawLastActiveAt = (community as any).discoverLastActiveAt;
    const rawPosts = Math.max(0, Math.floor(Number((community as any).discoverPosts7dCount) || 0));
    if (
      typeof rawLastActiveAt === "number"
      && rawLastActiveAt >= nowMs - DISCOVER_WEEK_MS
      && rawPosts > 0
    ) {
      return {
        last_active_at: toIsoString(rawLastActiveAt),
        posts_this_week: Math.min(DISCOVER_POSTS_CAP, rawPosts),
      };
    }
    return { last_active_at: null, posts_this_week: 0 };
  }
  const stats = await computeCommunityDiscoverActivity(ctx, community._id, nowMs);
  return {
    last_active_at: stats.lastActiveAt === null ? null : toIsoString(stats.lastActiveAt),
    posts_this_week: stats.postsThisWeek,
  };
}

// The communities Discover lists, newest activity first: published, active,
// operational (never unlisted) and finished-looking. Studio's Discover and
// every community site's /discover read this one list.
async function listDiscoverableCommunities(ctx: QueryCtx, limit: number): Promise<CommunityLike[]> {
  const published = (await ctx.db
    .query("communities")
    .withIndex("by_visibility_updatedAt", (q) => q.eq("visibility", "published"))
    .order("desc")
    .take(200)) as CommunityLike[];
  const listed = await Promise.all(published.map(async (community) => {
    return community.visibility === "published" && communityIsActive(community) && communityLooksFinished(community as any) ? community : null;
  }));
  return listed.filter((community): community is CommunityLike => community !== null).slice(0, limit);
}

// A community is listed once it looks finished: it has a banner and a
// one-liner (Neil, Nov 16). The host is told so in the community's settings.
export function communityLooksFinished(community: { oneLiner?: string | null; bannerStorageId?: unknown; bannerUrl?: string | null }): boolean {
  const hasBanner = Boolean(community.bannerStorageId) || Boolean(String(community.bannerUrl ?? "").trim());
  return hasBanner && Boolean(String(community.oneLiner ?? "").trim());
}

export const DISCOVER_ACTIVITY_CACHE_TTL_MS = DISCOVER_ACTIVITY_CACHE_TTL_MS_INTERNAL;

export async function computeCommunityDiscoverActivity(
  ctx: any,
  communityId: any,
  nowMs: number,
): Promise<{ lastActiveAt: number | null; postsThisWeek: number }> {
  const recent = await ctx.db
    .query("communityInteractionRoots")
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId).gte("createdAt", nowMs - DISCOVER_WEEK_MS))
    .order("desc")
    .take(DISCOVER_POSTS_SCAN);
  const openChannel = new Map<string, boolean>();
  const inOpenChannel = async (channelId: any): Promise<boolean> => {
    if (!channelId) return false;
    const key = String(channelId);
    if (!openChannel.has(key)) {
      const channel = (await ctx.db.get(channelId)) as { accessMode?: string; status?: string } | null;
      openChannel.set(key, Boolean(channel) && channel!.accessMode === "all_members" && channel!.status === "active");
    }
    return openChannel.get(key)!;
  };
  const posts: any[] = [];
  for (const row of recent as any[]) {
    if (posts.length >= DISCOVER_POSTS_CAP) break;
    if (row.status !== "live" || row.actorType !== "human") continue;
    if (row.visibilityScope !== "community" && row.visibilityScope !== "public") continue;
    if (!(await inOpenChannel(row.channelId))) continue;
    posts.push(row);
  }
  return {
    lastActiveAt: posts.length ? Number(posts[0].createdAt) : null,
    postsThisWeek: posts.length,
  };
}


// The join decision for Studio's funnel and for Join on a community site's
// private twin (communityAppJoin.ts): one gate, whichever page asks.
// One door: who may come back on an app purchase (see joinPublicCommunityInternal).
// Only someone who left (or lapsed): a removal needs a manager, and a payment
// hold (refund, dispute) is cleared only by a payment, never by joining.
export function rejoinsOnAppPurchase(membership: Parameters<typeof communityMembershipRequiresManagerReapproval>[0], hasAppGrant: boolean): boolean {
  if (!hasAppGrant) return false;
  if (!membership) return true;
  const state = communityMembershipState(membership);
  return state === "left" || state === "lapsed";
}

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

  // One door: someone who left while the community's own app still reports
  // their purchase comes back on it, without paying twice. Their own choice
  // only (a sale never puts anyone back); removed members still need a manager.
  if (rejoinsOnAppPurchase(existingMembership, await hasActiveAppGrant(args.ctx, args.community._id, args.userId))) {
    await activateCommunityMembershipCore({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
      accessSource: "app_grant" as any,
      activationReason: "connected_app_rejoin",
      nowMs: args.nowMs,
    });
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

  const requiresManagerReapproval = communityMembershipRequiresManagerReapproval(existingMembership);
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

