import {
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  normalizeCommunityRoleForOutput,
  syncCommunityActiveMemberCount,
} from "./communityCore";
import { createCommunityOnboardingSessionForActivation } from "./communityOnboardingCore";
import { ensureCommunityPresenceBaseline } from "./communityPresenceCore";
import { deleteCommunityJoinRequestByPair } from "./communityJoinRequestCore";

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
    return {
      membership: refreshed,
      accessGranted: false,
      activationMarker: null,
    };
  }

  const activationSequence = Math.max(0, Math.floor(Number(existing?.activationSequence ?? 0))) + 1;
  const role = args.role ?? (
    existing ? (normalizeCommunityRoleForOutput(existing.role) || "member") : "member"
  );
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
  await ensureCommunityPresenceBaseline({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
    baselineAt: args.nowMs,
  });
  await syncCommunityActiveMemberCount({ ctx: args.ctx, communityId: args.communityId });
  try {
    await createCommunityOnboardingSessionForActivation({
      ctx: args.ctx,
      communityId: args.communityId,
      membershipId,
      userId: args.userId,
      activationSequence,
      activatedAt: args.nowMs,
    });
  } catch {
    // Community access is authoritative. Optional onboarding state must never
    // turn an otherwise-valid membership activation into a failed join.
  }
  await deleteCommunityJoinRequestByPair({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  return {
    membership,
    accessGranted: true,
    activationMarker: `${String(membershipId)}:${activationSequence}:${args.activationReason}`,
  };
}
