import {
  type CommunityLike,
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { communityIsActive } from "../shared/communityLifecycle";

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

export function platformHomeMembershipDisablesAutojoin(
  membership: CommunityMembershipLike | null | undefined,
): boolean {
  return Boolean(membership && !communityMembershipRowIsActive(membership));
}

export function communityMembershipRequiresManagerReapproval(
  membership: CommunityMembershipLike | null | undefined,
): boolean {
  if (!platformHomeMembershipDisablesAutojoin(membership)) return false;
  return PLATFORM_HOME_REAPPROVAL_REVOKED_REASONS.has(
    String(membership?.revokedReason ?? "").trim().toLowerCase(),
  );
}

export function platformHomeMembershipRequiresReapproval(
  membership: CommunityMembershipLike | null | undefined,
): boolean {
  return communityMembershipRequiresManagerReapproval(membership);
}

export async function ensurePlatformHomeCommunityMembership(args: {
  ctx: any;
  userId: any;
  nowMs: number;
}): Promise<{
  status:
    | "disabled"
    | "missing"
    | "owner"
    | "not_open"
    | "already_member"
    | "joined";
  communityId: string | null;
}> {
  const slug = String(PLATFORM_HOME_COMMUNITY_SLUG ?? "")
    .trim()
    .toLowerCase();
  if (!slug) {
    return { status: "disabled", communityId: null };
  }

  const community = (await args.ctx.db
    .query("communities")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .first()) as CommunityLike | null;
  if (!community) {
    return { status: "missing", communityId: null };
  }
  if (!communityIsActive(community)) {
    return { status: "disabled", communityId: null };
  }

  const communityId = String(community._id);
  if (String(community.ownerId) === String(args.userId)) {
    return { status: "owner", communityId };
  }

  if (resolveCommunityEntryPolicy(community) !== "open") {
    return { status: "not_open", communityId };
  }

  const existingMembership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: community._id,
    userId: args.userId,
  });
  if (existingMembership && communityMembershipRowIsActive(existingMembership)) {
    return { status: "already_member", communityId };
  }
  if (platformHomeMembershipDisablesAutojoin(existingMembership)) {
    return { status: "disabled", communityId };
  }

  await activateCommunityMembershipCore({
    ctx: args.ctx,
    communityId: community._id,
    userId: args.userId,
    role: "member",
    accessSource: "free_grant",
    activationReason: "platform_home_autojoin",
    nowMs: args.nowMs,
  });
  return {
    status: "joined",
    communityId,
  };
}
