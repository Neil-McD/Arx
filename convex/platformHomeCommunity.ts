import { internal } from "./_generated/api";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

const PLATFORM_HOME_COMMUNITY_SLUG = "polynet";
export const PLATFORM_HOME_MEMBER_LEFT_REVOKED_REASON = "left_by_member";

const PLATFORM_HOME_REAPPROVAL_REVOKED_REASONS = new Set([
  "removed_by_manager",
  "removed_by_manager_stripe_canceled",
  "banned_by_manager",
  "banned_by_manager_stripe_canceled",
]);

async function scheduleCommunityAppGrantSeedingBestEffort(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
  reason: string;
}): Promise<void> {
  try {
    await args.ctx.scheduler.runAfter(
      0,
      internal.userPlatformAppMounts.seedCommunityAppGrantsForUserInternal,
      {
        communityId: args.communityId,
        userId: args.userId,
        nowMs: args.nowMs,
      },
    );
  } catch (error) {
    console.warn("community_app_grant_seed_schedule_failed", {
      community_id: String(args.communityId),
      user_id: String(args.userId),
      reason: args.reason,
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
}

export function isPlatformHomeCommunity(args: {
  communitySlug?: string | null;
}): boolean {
  return (
    String(args.communitySlug ?? "")
      .trim()
      .toLowerCase() === PLATFORM_HOME_COMMUNITY_SLUG
  );
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
    String(membership?.revokedReason ?? "")
      .trim()
      .toLowerCase(),
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

  const communityId = String(community._id);
  if (String(community.ownerId) === String(args.userId)) {
    return { status: "owner", communityId };
  }

  const existingMembership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: community._id,
    userId: args.userId,
  });
  if (
    existingMembership &&
    communityMembershipRowIsActive(existingMembership)
  ) {
    await scheduleCommunityAppGrantSeedingBestEffort({
      ctx: args.ctx,
      communityId: community._id,
      userId: args.userId,
      nowMs: args.nowMs,
      reason: "platform_home_autojoin_already_member",
    });
    return { status: "already_member", communityId };
  }
  if (platformHomeMembershipDisablesAutojoin(existingMembership)) {
    return { status: "disabled", communityId };
  }

  if (resolveCommunityEntryPolicy(community) !== "open") {
    return { status: "not_open", communityId };
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
  await scheduleCommunityAppGrantSeedingBestEffort({
    ctx: args.ctx,
    communityId: community._id,
    userId: args.userId,
    nowMs: args.nowMs,
    reason: "platform_home_autojoin_joined",
  });

  return {
    status: "joined",
    communityId,
  };
}
