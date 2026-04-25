import type { CommunityAccess } from "./communityTypes";

export type CommunityAccessCapabilities = {
  canViewCommunity: boolean;
  isOwner: boolean;
  canViewMembers: boolean;
  canViewSettings: boolean;
  canPostMessages: boolean;
  canManageResources: boolean;
  canModerateContent: boolean;
  canManageMembers: boolean;
  canReviewJoinRequests: boolean;
  canManagePricing: boolean;
  canManageBranding: boolean;
  canManagePublishing: boolean;
  canManagePayouts: boolean;
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
  canModerateContent: boolean;
  canManageMembers: boolean;
  canReviewJoinRequests: boolean;
  canManagePricing: boolean;
  canManageBranding: boolean;
  canManagePublishing: boolean;
  canManagePayouts: boolean;
  canViewCommunity: boolean;
};

export function deriveCommunityAccessCapabilities(
  access: CommunityAccess | null | undefined,
): CommunityAccessCapabilities {
  const isOwner = Boolean(access?.is_owner);
  const canManageMembers = Boolean(access?.can_manage_members);
  const effectiveRole = String(access?.effective_role ?? "").trim().toLowerCase();
  const isAdmin = effectiveRole === "admin";
  const isModerator = effectiveRole === "moderator";
  const canEnterCommunity = access ? Boolean(access.can_enter_community ?? access.can_view) : true;
  const canManageResources = Boolean(access?.can_manage_resources) && (isOwner || isAdmin);
  const canModerateContent = Boolean(
    access?.can_moderate_content ?? (isOwner || isAdmin || isModerator),
  );
  return {
    canViewCommunity: canEnterCommunity,
    isOwner,
    canViewMembers: canEnterCommunity,
    canViewSettings: canEnterCommunity,
    canPostMessages: Boolean(access?.can_post_chat ?? access?.can_post_message),
    canManageResources,
    canModerateContent,
    canManageMembers,
    canReviewJoinRequests: Boolean(access?.can_review_join_requests),
    canManagePricing: Boolean(access?.can_manage_pricing ?? canManageMembers),
    canManageBranding: Boolean(access?.can_manage_branding ?? isOwner),
    canManagePublishing: Boolean(access?.can_manage_publishing ?? isOwner),
    canManagePayouts: Boolean(access?.can_manage_payouts ?? isOwner),
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
    | "canModerateContent"
    | "canManageMembers"
    | "canReviewJoinRequests"
    | "canManagePricing"
    | "canManageBranding"
    | "canManagePublishing"
    | "canManagePayouts"
    | "canViewCommunity"
  >,
): CommunityActionGuards {
  return {
    canPostMessages: capabilities.canPostMessages,
    canManageResources: capabilities.canManageResources,
    canModerateContent: capabilities.canModerateContent,
    canManageMembers: capabilities.canManageMembers,
    canReviewJoinRequests: capabilities.canReviewJoinRequests,
    canManagePricing: capabilities.canManagePricing,
    canManageBranding: capabilities.canManageBranding,
    canManagePublishing: capabilities.canManagePublishing,
    canManagePayouts: capabilities.canManagePayouts,
    canViewCommunity: capabilities.canViewCommunity,
  };
}
