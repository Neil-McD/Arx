import type { CommunityAccess } from "./communityTypes";

export type CommunityAccessCapabilities = {
  canViewCommunity: boolean;
  isOwner: boolean;
  canViewMembers: boolean;
  canViewSettings: boolean;
  canPostMessages: boolean;
  canManageResources: boolean;
  canManageMembers: boolean;
  canReviewJoinRequests: boolean;
  canViewAnalytics: boolean;
};

export type CommunityNavVisibility = {
  canViewMembers: boolean;
  canViewSettings: boolean;
  canManageMembers: boolean;
  canViewAnalytics: boolean;
};

export type CommunitySettingsLayer = "member" | "admin" | "owner";

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
  return {
    canViewCommunity: canEnterCommunity,
    isOwner,
    canViewMembers: canEnterCommunity,
    canViewSettings: canEnterCommunity,
    canPostMessages: Boolean(access?.can_post_chat ?? access?.can_post_message),
    canManageResources: Boolean(access?.can_manage_resources),
    canManageMembers,
    canReviewJoinRequests: Boolean(access?.can_review_join_requests),
    canViewAnalytics: canManageMembers,
  };
}

export function deriveCommunitySettingsLayer(
  access: CommunityAccess | null | undefined,
): CommunitySettingsLayer {
  if (Boolean(access?.is_owner)) return "owner";
  const effectiveRole = String(access?.effective_role ?? "").trim().toLowerCase();
  if (effectiveRole === "admin") return "admin";
  return "member";
}

export function deriveCommunityNavVisibility(
  capabilities: Pick<
    CommunityAccessCapabilities,
    "canViewMembers" | "canViewSettings" | "canManageMembers" | "canViewAnalytics"
  >,
): CommunityNavVisibility {
  return {
    canViewMembers: capabilities.canViewMembers,
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
