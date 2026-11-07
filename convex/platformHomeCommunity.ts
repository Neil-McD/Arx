import {
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  communityMembershipState,
} from "./communityCore";

const PLATFORM_HOME_COMMUNITY_SLUG = "polynet";

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
  return communityMembershipState(membership) === "removed";
}
