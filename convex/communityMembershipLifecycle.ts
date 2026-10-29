import {
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  normalizeCommunityRoleForOutput,
  syncCommunityActiveMemberCount,
} from "./communityCore";
import { recordCommunityActivityEventBestEffort } from "./communityActivity";
import { ensureCommunityPresenceBaseline } from "./communityPresenceCore";
import { deleteCommunityJoinRequestByPair } from "./communityJoinRequestCore";
import { enrollWorkflowMilestoneTimers } from "./communityMemberWorkflowTimerCore";
import { scheduleFirstMemberWorkflowJoin } from "./communityMemberWorkflowJoinCore";
import { syncCommunityAccessForUser } from "./communityAccessSync";

export type CommunityMembershipAccessSource =
  | "free_grant"
  | "manual_grant"
  | "paid_subscription";

export async function activateCommunityMembershipCore(args: {
  ctx: any;
  communityId: any;
  userId: any;
  role?: "admin" | "moderator" | "member";
  accessSource: CommunityMembershipAccessSource;
  pricePointId?: any;
  activationReason: string;
  nowMs: number;
  // The owner-grant flow writes its grant row after activating and syncs once itself.
  skipAccessSync?: boolean;
}): Promise<{
  membership: CommunityMembershipLike;
  accessGranted: boolean;
  activationMarker: string | null;
}> {
  const existing = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  if (existing && communityMembershipRowIsActive(existing)) {
    const role = args.role ?? (normalizeCommunityRoleForOutput(existing.role) || "member");
    await args.ctx.db.patch(existing._id, {
      role,
      accessSource: args.accessSource,
      ...(args.pricePointId ? { pricePointId: args.pricePointId } : {}),
      updatedAt: args.nowMs,
    });
    const refreshed = (await args.ctx.db.get(existing._id)) as CommunityMembershipLike | null;
    if (!refreshed) throw new Error("community_membership_not_found");
    await ensureCommunityPresenceBaseline({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.userId,
      baselineAt: Number(existing.activatedAt ?? existing.createdAt ?? args.nowMs),
    });
    await deleteCommunityJoinRequestByPair({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    if (!args.skipAccessSync) {
      await syncCommunityAccessForUser(args.ctx, {
        communityId: args.communityId,
        userId: args.userId,
        nowMs: args.nowMs,
        reason: args.activationReason,
      });
    }
    return {
      membership: refreshed,
      accessGranted: false,
      activationMarker: null,
    };
  }

  const activationSequence = Math.max(0, Math.floor(Number(existing?.activationSequence ?? 0))) + 1;
  // Coming back after leaving, removal or a ban starts as a member: a role
  // held before is never restored by rejoining.
  const role = args.role ?? "member";
  let membershipId: any;
  if (existing) {
    membershipId = existing._id;
    await args.ctx.db.patch(existing._id, {
      role,
      accessSource: args.accessSource,
      ...(args.pricePointId ? { pricePointId: args.pricePointId } : {}),
      active: true,
      activationSequence,
      activatedAt: args.nowMs,
      revokedAt: undefined,
      revokedReason: undefined,
      updatedAt: args.nowMs,
    });
  } else {
    membershipId = await args.ctx.db.insert("communityMemberships" as any, {
      communityId: args.communityId,
      userId: args.userId,
      role,
      accessSource: args.accessSource,
      ...(args.pricePointId ? { pricePointId: args.pricePointId } : {}),
      active: true,
      activationSequence,
      activatedAt: args.nowMs,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
  const membership = (await args.ctx.db.get(membershipId)) as CommunityMembershipLike | null;
  if (!membership) throw new Error("community_membership_activation_failed");
  if (!existing) await scheduleFirstMemberWorkflowJoin(args.ctx, membership);
  await enrollWorkflowMilestoneTimers({ ctx: args.ctx, membership, nowMs: args.nowMs });
  await ensureCommunityPresenceBaseline({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
    baselineAt: args.nowMs,
  });
  await syncCommunityActiveMemberCount({ ctx: args.ctx, communityId: args.communityId });
  await recordCommunityActivityEventBestEffort({
    ctx: args.ctx,
    communityId: args.communityId,
    type: "member_joined",
    actorUserId: args.userId,
    targetType: "membership",
    targetId: membershipId,
    dedupeKey: `member_joined:${String(membershipId)}:${activationSequence}`,
    nowMs: args.nowMs,
  });
  await deleteCommunityJoinRequestByPair({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  if (!args.skipAccessSync) {
    await syncCommunityAccessForUser(args.ctx, {
      communityId: args.communityId,
      userId: args.userId,
      nowMs: args.nowMs,
      reason: args.activationReason,
    });
  }
  return {
    membership,
    accessGranted: true,
    activationMarker: `${String(membershipId)}:${activationSequence}:${args.activationReason}`,
  };
}
