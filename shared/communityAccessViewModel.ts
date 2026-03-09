import type { CommunityAccess } from "./communityTypes";

export type CommunityAccessCapabilities = {
  canViewCommunity: boolean;
  isOwner: boolean;
  canViewSettings: boolean;
  canPostMessages: boolean;
  canManageResources: boolean;
  canManageMembers: boolean;
  canReviewJoinRequests: boolean;
  canViewAnalytics: boolean;
};

export type CommunityNavVisibility = {
  canViewSettings: boolean;
  canManageMembers: boolean;
  canViewAnalytics: boolean;
};

export type CommunityActionGuards = {
  canPostMessages: boolean;
  canManageResources: boolean;
  canManageMembers: boolean;
  canReviewJoinRequests: boolean;
  canViewCommunity: boolean;
};

export function deriveCommunityAccessCapabilities(
  access: CommunityAccess | null | undefined,
): CommunityAccessCapabilities {
  const isOwner = Boolean(access?.is_owner);
  const canManageMembers = Boolean(access?.can_manage_members);
  const canEnterCommunity = access ? Boolean(access.can_enter_community ?? access.can_view) : true;
  const effectiveRole = String(access?.effective_role ?? "").trim().toLowerCase();
  return {
    canViewCommunity: canEnterCommunity,
    isOwner,
    canViewSettings: canEnterCommunity,
    canPostMessages: Boolean(access?.can_post_chat ?? access?.can_post_message),
    canManageResources: Boolean(access?.can_manage_resources),
    canManageMembers,
    canReviewJoinRequests:
      Boolean(access?.can_review_join_requests) || isOwner || effectiveRole === "admin" || effectiveRole === "moderator",
    canViewAnalytics: canManageMembers,
  };
}

export function deriveCommunityNavVisibility(
  capabilities: Pick<CommunityAccessCapabilities, "canViewSettings" | "canManageMembers" | "canViewAnalytics">,
): CommunityNavVisibility {
  return {
    canViewSettings: capabilities.canViewSettings,
    canManageMembers: capabilities.canManageMembers,
    canViewAnalytics: capabilities.canViewAnalytics,
  };
}

export function deriveCommunityActionGuards(
  capabilities: Pick<
    CommunityAccessCapabilities,
    | "canPostMessages"
    | "canManageResources"
    | "canManageMembers"
    | "canReviewJoinRequests"
    | "canViewCommunity"
  >,
): CommunityActionGuards {
  return {
    canPostMessages: capabilities.canPostMessages,
    canManageResources: capabilities.canManageResources,
    canManageMembers: capabilities.canManageMembers,
    canReviewJoinRequests: capabilities.canReviewJoinRequests,
    canViewCommunity: capabilities.canViewCommunity,
  };
}
