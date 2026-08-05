import {
  communityMembershipRowIsActive,
  requireCommunityChatAccess,
  resolveCommunityBrandingFields,
  buildCommunityVisualIdentity,
  type CommunityLike,
  type CommunityMembershipLike,
} from "./communityCore";
import type { CommunityAvatarSummary, ProfileCommunityContext } from "../shared/communityTypes";
import { communityIsOperational } from "./communityLifecycleCore";

const MAX_PROFILE_RELATIONSHIP_OWNED_ROWS = 24;
const MAX_PROFILE_RELATIONSHIP_MEMBERSHIP_ROWS = 96;
const MAX_PROFILE_RELATIONSHIP_MUTUAL_ROWS = 24;

// Profile strips and fallback DM discovery are bounded; the preferred-community DM path stays exact.
export type ProfileRelationshipMessageUnavailableReason =
  | "self"
  | "no_mutual_community";

type ResolveViewerProfileRelationshipArgs = {
  ctx: any;
  viewerUserId: any;
  targetUserId: any;
  preferredCommunityId?: any | null;
};

type ViewerRelationshipCommunityBundle = {
  viewerIsTarget: boolean;
  ownedCommunities: CommunityLike[];
  viewerCommunityIds: Set<string>;
  mutualCommunities: CommunityLike[];
  messageContextCommunity: CommunityLike | null;
};

export type DirectMessageRelationshipContext = {
  can_message: boolean;
  message_context_community_id: string | null;
  message_unavailable_reason: ProfileRelationshipMessageUnavailableReason | null;
};

async function listActiveCommunityMembershipsByUserId(
  ctx: any,
  userId: any,
): Promise<CommunityMembershipLike[]> {
  const rows = (await ctx.db
    .query("communityMemberships")
    .withIndex("by_user_createdAt", (q: any) => q.eq("userId", userId))
    .order("desc")
    .take(MAX_PROFILE_RELATIONSHIP_MEMBERSHIP_ROWS)) as CommunityMembershipLike[];
  return rows.filter((row) => communityMembershipRowIsActive(row));
}

async function listOwnedCommunitiesByOwnerId(
  ctx: any,
  ownerId: any,
): Promise<CommunityLike[]> {
  const rows = (await ctx.db
    .query("communities")
    .withIndex("by_owner_createdAt", (q: any) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(MAX_PROFILE_RELATIONSHIP_OWNED_ROWS)) as CommunityLike[];
  return rows.filter((community) => communityIsOperational(community));
}

async function mapCommunityAvatarSummary(
  ctx: any,
  community: CommunityLike,
): Promise<CommunityAvatarSummary> {
  const branding = await resolveCommunityBrandingFields(ctx, community);
  return {
    id: String(community._id),
    slug: community.slug,
    name: community.name,
    avatar_url: branding.avatar_url,
    avatar_focus_x: branding.avatar_focus_x,
    avatar_focus_y: branding.avatar_focus_y,
    avatar_zoom: branding.avatar_zoom,
    branding_revision: community.brandingRevision ?? community.updatedAt,
    visual_identity: buildCommunityVisualIdentity(community, branding),
  };
}

async function userCanChatInCommunity(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<boolean> {
  try {
    await requireCommunityChatAccess(args);
    return true;
  } catch {
    return false;
  }
}

async function resolvePreferredDirectMessageCommunity(args: {
  ctx: any;
  viewerUserId: any;
  targetUserId: any;
  preferredCommunityId?: any | null;
}): Promise<CommunityLike | null> {
  const preferredCommunityId = String(args.preferredCommunityId ?? "").trim();
  if (!preferredCommunityId) return null;
  try {
    const [{ community }] = await Promise.all([
      requireCommunityChatAccess({
        ctx: args.ctx,
        communityId: args.preferredCommunityId,
        userId: args.viewerUserId,
      }),
      requireCommunityChatAccess({
        ctx: args.ctx,
        communityId: args.preferredCommunityId,
        userId: args.targetUserId,
      }),
    ]);
    return community;
  } catch {
    return null;
  }
}

async function resolveViewerRelationshipCommunityBundle(
  args: ResolveViewerProfileRelationshipArgs,
): Promise<ViewerRelationshipCommunityBundle> {
  const [ownedCommunities, viewerOwnedCommunities, viewerMemberships, targetMemberships] = await Promise.all([
    listOwnedCommunitiesByOwnerId(args.ctx, args.targetUserId),
    listOwnedCommunitiesByOwnerId(args.ctx, args.viewerUserId),
    listActiveCommunityMembershipsByUserId(args.ctx, args.viewerUserId),
    listActiveCommunityMembershipsByUserId(args.ctx, args.targetUserId),
  ]);

  const viewerCommunityIds = new Set([
    ...viewerMemberships.map((row) => String(row.communityId)),
    ...viewerOwnedCommunities.map((community) => String(community._id)),
  ]);
  const viewerIsTarget = String(args.viewerUserId) === String(args.targetUserId);
  const mutualCommunityIds = Array.from(
    new Map(
      [
        ...targetMemberships.map((row) => row.communityId),
        ...ownedCommunities.map((community) => community._id),
      ]
        .filter((communityId) => viewerCommunityIds.has(String(communityId)))
        .map((communityId) => [String(communityId), communityId]),
    ).values(),
  );

  const candidateMutualCommunities: CommunityLike[] = [];
  for (const communityId of mutualCommunityIds) {
    if (candidateMutualCommunities.length >= MAX_PROFILE_RELATIONSHIP_MUTUAL_ROWS) break;
    const community = (await args.ctx.db.get(communityId)) as CommunityLike | null;
    if (community && communityIsOperational(community)) {
      candidateMutualCommunities.push(community);
    }
  }
  candidateMutualCommunities.sort((left, right) => left.name.localeCompare(right.name));

  const mutualCommunities: CommunityLike[] = [];
  for (const community of candidateMutualCommunities) {
    const [viewerCanChat, targetCanChat] = await Promise.all([
      userCanChatInCommunity({
        ctx: args.ctx,
        communityId: community._id,
        userId: args.viewerUserId,
      }),
      userCanChatInCommunity({
        ctx: args.ctx,
        communityId: community._id,
        userId: args.targetUserId,
      }),
    ]);
    if (viewerCanChat && targetCanChat) {
      mutualCommunities.push(community);
    }
  }

  const messageEligibleCommunities = viewerIsTarget ? [] : mutualCommunities;
  const preferredCommunityId = String(args.preferredCommunityId ?? "").trim();
  const preferredMessageCommunity = preferredCommunityId
    ? messageEligibleCommunities.find((community) => String(community._id) === preferredCommunityId) ?? null
    : null;
  const messageContextCommunity = preferredMessageCommunity ?? messageEligibleCommunities[0] ?? null;

  return {
    viewerIsTarget,
    ownedCommunities,
    viewerCommunityIds,
    mutualCommunities,
    messageContextCommunity,
  };
}

async function resolveVisibleOwnedCommunities(args: {
  ctx: any;
  viewerUserId: any;
  targetUserId: any;
  viewerIsTarget: boolean;
  viewerCommunityIds: Set<string>;
  ownedCommunities: CommunityLike[];
}): Promise<CommunityLike[]> {
  const visibleOwnedCommunities: CommunityLike[] = [];
  const orderedOwnedCommunities = [...args.ownedCommunities].sort((left, right) => right.createdAt - left.createdAt);
  for (const community of orderedOwnedCommunities) {
    if (community.visibility === "published" || args.viewerIsTarget) {
      visibleOwnedCommunities.push(community);
      continue;
    }
    if (!args.viewerCommunityIds.has(String(community._id))) continue;
    const [viewerCanChat, targetCanChat] = await Promise.all([
      userCanChatInCommunity({
        ctx: args.ctx,
        communityId: community._id,
        userId: args.viewerUserId,
      }),
      userCanChatInCommunity({
        ctx: args.ctx,
        communityId: community._id,
        userId: args.targetUserId,
      }),
    ]);
    if (viewerCanChat && targetCanChat) {
      visibleOwnedCommunities.push(community);
    }
  }
  return visibleOwnedCommunities;
}

export async function resolveViewerDirectMessageRelationship(
  args: ResolveViewerProfileRelationshipArgs,
): Promise<DirectMessageRelationshipContext> {
  const viewerIsTarget = String(args.viewerUserId) === String(args.targetUserId);
  if (viewerIsTarget) {
    return {
      can_message: false,
      message_context_community_id: null,
      message_unavailable_reason: "self",
    };
  }

  const preferredCommunity = await resolvePreferredDirectMessageCommunity(args);
  if (preferredCommunity) {
    return {
      can_message: true,
      message_context_community_id: String(preferredCommunity._id),
      message_unavailable_reason: null,
    };
  }

  const bundle = await resolveViewerRelationshipCommunityBundle(args);
  const canMessage = Boolean(bundle.messageContextCommunity);
  return {
    can_message: canMessage,
    message_context_community_id: bundle.messageContextCommunity ? String(bundle.messageContextCommunity._id) : null,
    message_unavailable_reason: canMessage
      ? null
      : bundle.viewerIsTarget
        ? "self"
        : "no_mutual_community",
  };
}

export async function resolveViewerProfileRelationship(
  args: ResolveViewerProfileRelationshipArgs,
): Promise<ProfileCommunityContext> {
  const bundle = await resolveViewerRelationshipCommunityBundle(args);
  const visibleOwnedCommunities = await resolveVisibleOwnedCommunities({
    ctx: args.ctx,
    viewerUserId: args.viewerUserId,
    targetUserId: args.targetUserId,
    viewerIsTarget: bundle.viewerIsTarget,
    viewerCommunityIds: bundle.viewerCommunityIds,
    ownedCommunities: bundle.ownedCommunities,
  });
  const canMessage = Boolean(bundle.messageContextCommunity);

  return {
    owned_communities: await Promise.all(
      visibleOwnedCommunities.map((community) => mapCommunityAvatarSummary(args.ctx, community)),
    ),
    mutual_communities: await Promise.all(
      bundle.mutualCommunities.map((community) => mapCommunityAvatarSummary(args.ctx, community)),
    ),
    is_self: bundle.viewerIsTarget,
    can_message: canMessage,
    message_context_community_id: bundle.messageContextCommunity ? String(bundle.messageContextCommunity._id) : null,
    message_unavailable_reason: canMessage
      ? null
      : bundle.viewerIsTarget
        ? "self"
        : "no_mutual_community",
  };
}
