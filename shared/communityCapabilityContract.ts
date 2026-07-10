import type { CommunityAccess } from "./communityTypes";

export const COMMUNITY_CAPABILITY_NAMES = [
  "community_context",
  "accepted_memory",
  "raw_evidence_search",
  "member_resources",
  "builder_resources",
  "join_request_review",
  "community_admin",
  "owner_controls",
] as const;

export type CommunityCapabilityName = (typeof COMMUNITY_CAPABILITY_NAMES)[number];

export type CommunityCapabilityRelation =
  | "owner"
  | "admin"
  | "moderator"
  | "member"
  | "pending"
  | "no_access";

export type CommunityCapabilityAuthorityLens =
  | "owner_builder"
  | "owner"
  | "admin_builder"
  | "admin"
  | "moderator"
  | "member"
  | "pending"
  | "no_access";

export type CommunityCapabilityFlags = {
  canView: boolean;
  canEnterCommunity: boolean;
  canReadChat: boolean;
  canPostChat: boolean;
  canPostMessage: boolean;
  canManageResources: boolean;
  canModerateContent: boolean;
  canManageMembers: boolean;
  canReviewJoinRequests: boolean;
  canManagePricing: boolean;
  canManageBranding: boolean;
  canManagePublishing: boolean;
  canManagePayouts: boolean;
};

export type CommunityCapabilityAuthority = {
  relation: CommunityCapabilityRelation;
  authorityLens: CommunityCapabilityAuthorityLens;
  capabilities: CommunityCapabilityFlags;
  availableCapabilities: CommunityCapabilityName[];
  unavailableReason: "join_request_pending" | "community_access_required" | null;
};

export type CommunityCapabilityAccessInput = Partial<
  Pick<
    CommunityAccess,
    | "relation"
    | "is_entitled"
    | "can_view"
    | "can_enter_community"
    | "can_read_chat"
    | "can_post_chat"
    | "can_post_message"
    | "can_manage_resources"
    | "can_moderate_content"
    | "can_manage_members"
    | "can_review_join_requests"
    | "can_manage_pricing"
    | "can_manage_branding"
    | "can_manage_publishing"
    | "can_manage_payouts"
  >
>;

export function normalizeCommunityCapabilityRelation(raw: unknown): CommunityCapabilityRelation {
  const relation = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (
    relation === "owner" ||
    relation === "admin" ||
    relation === "moderator" ||
    relation === "member" ||
    relation === "pending"
  ) {
    return relation;
  }
  return "no_access";
}

export function projectCommunityAccessCapabilities(
  access: CommunityCapabilityAccessInput,
): CommunityCapabilityFlags {
  return {
    canView: access.can_view === true,
    canEnterCommunity: access.can_enter_community === true,
    canReadChat: access.can_read_chat === true,
    canPostChat: access.can_post_chat === true,
    canPostMessage: access.can_post_message === true,
    canManageResources: access.can_manage_resources === true,
    canModerateContent: access.can_moderate_content === true,
    canManageMembers: access.can_manage_members === true,
    canReviewJoinRequests: access.can_review_join_requests === true,
    canManagePricing: access.can_manage_pricing === true,
    canManageBranding: access.can_manage_branding === true,
    canManagePublishing: access.can_manage_publishing === true,
    canManagePayouts: access.can_manage_payouts === true,
  };
}

export function deriveCommunityCapabilityAuthority(
  access: CommunityCapabilityAccessInput,
): CommunityCapabilityAuthority {
  const relation = normalizeCommunityCapabilityRelation(access.relation);
  const capabilities = projectCommunityAccessCapabilities(access);
  const availableCapabilities: CommunityCapabilityName[] = ["community_context"];
  const isEntitled = access.is_entitled === true;

  if (isEntitled && (capabilities.canEnterCommunity || capabilities.canReadChat)) {
    availableCapabilities.push(
      "accepted_memory",
      "raw_evidence_search",
      "member_resources",
    );
  }
  if (capabilities.canManageResources) {
    availableCapabilities.push("builder_resources");
  }
  if (capabilities.canReviewJoinRequests) {
    availableCapabilities.push("join_request_review");
  }
  if (
    capabilities.canManageMembers ||
    capabilities.canManagePricing ||
    capabilities.canManageBranding ||
    capabilities.canManagePublishing ||
    capabilities.canManagePayouts
  ) {
    availableCapabilities.push("community_admin");
  }
  if (
    relation === "owner" ||
    capabilities.canManageBranding ||
    capabilities.canManagePublishing ||
    capabilities.canManagePayouts
  ) {
    availableCapabilities.push("owner_controls");
  }

  const authorityLens: CommunityCapabilityAuthorityLens =
    relation === "owner"
      ? capabilities.canManageResources
        ? "owner_builder"
        : "owner"
      : relation === "admin"
        ? capabilities.canManageResources
          ? "admin_builder"
          : "admin"
        : relation === "moderator"
          ? "moderator"
          : relation === "member"
            ? "member"
            : relation === "pending"
              ? "pending"
              : "no_access";

  return {
    relation,
    authorityLens,
    capabilities,
    availableCapabilities: availableCapabilities.filter(
      (value, index, list) => list.indexOf(value) === index,
    ),
    unavailableReason:
      relation === "pending"
        ? "join_request_pending"
        : relation === "no_access"
          ? "community_access_required"
          : null,
  };
}

export function communityAccessIsOpen(access: CommunityCapabilityAccessInput): boolean {
  return (
    access.is_entitled === true &&
    (access.can_enter_community === true || access.can_read_chat === true)
  );
}

export function hasCommunityCapability(
  authority: CommunityCapabilityAuthority,
  capability: CommunityCapabilityName,
): boolean {
  return authority.availableCapabilities.includes(capability);
}
