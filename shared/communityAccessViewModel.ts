import type { CommunityAccess } from "./communityTypes";

export type CommunityAccessCapabilities = {
  canViewCommunity: boolean;
  isOwner: boolean;
  canInvite: boolean;
  canViewSettings: boolean;
  canPostMessages: boolean;
  canCreateResources: boolean;
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
  canInvite: boolean;
  canPostMessages: boolean;
  canCreateResources: boolean;
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
  return {
    canViewCommunity: access ? Boolean(access.can_view) : true,
    isOwner,
    canInvite: Boolean(access?.can_invite),
    canViewSettings: Boolean(access?.can_view),
    canPostMessages: Boolean(access?.can_post_message),
    canCreateResources: Boolean(access?.can_create_resource),
    canManageResources: Boolean(access?.can_manage_resources),
    canManageMembers,
    canReviewJoinRequests:
      isOwner || String(access?.effective_role ?? "").trim().toLowerCase() === "admin",
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
    | "canInvite"
    | "canPostMessages"
    | "canCreateResources"
    | "canManageResources"
    | "canManageMembers"
    | "canReviewJoinRequests"
    | "canViewCommunity"
  >,
): CommunityActionGuards {
  return {
    canInvite: capabilities.canInvite,
    canPostMessages: capabilities.canPostMessages,
    canCreateResources: capabilities.canCreateResources,
    canManageResources: capabilities.canManageResources,
    canManageMembers: capabilities.canManageMembers,
    canReviewJoinRequests: capabilities.canReviewJoinRequests,
    canViewCommunity: capabilities.canViewCommunity,
  };
}
