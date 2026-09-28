import {
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
} from "./communityCore";

const PLATFORM_HOME_COMMUNITY_SLUG = "polynet";
export const PLATFORM_HOME_MEMBER_LEFT_REVOKED_REASON = "left_by_member";

const PLATFORM_HOME_REAPPROVAL_REVOKED_REASONS = new Set([
  "removed_by_manager",
  "removed_by_manager_stripe_canceled",
  "banned_by_manager",
  "banned_by_manager_stripe_canceled",
]);

export function isPlatformHomeCommunity(args: {
  communitySlug?: string | null;
}): boolean {
  return String(args.communitySlug ?? "")
    .trim()
    .toLowerCase() === PLATFORM_HOME_COMMUNITY_SLUG;
}

export function communityMembershipIsInactive(
  membership: CommunityMembershipLike | null | undefined,
): boolean {
  return Boolean(membership && !communityMembershipRowIsActive(membership));
}

export function communityMembershipRequiresManagerReapproval(
  membership: CommunityMembershipLike | null | undefined,
): boolean {
  if (!communityMembershipIsInactive(membership)) return false;
  return PLATFORM_HOME_REAPPROVAL_REVOKED_REASONS.has(
    String(membership?.revokedReason ?? "").trim().toLowerCase(),
  );
}

export function platformHomeMembershipRequiresReapproval(
  membership: CommunityMembershipLike | null | undefined,
): boolean {
  return communityMembershipRequiresManagerReapproval(membership);
}
