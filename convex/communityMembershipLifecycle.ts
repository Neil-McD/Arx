import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  type CommunityMembershipLike,
  type CommunityMembershipState,
  COMMUNITY_MEMBERSHIP_PAYMENT_HOLD_REASONS,
  communityMembershipRowIsActive,
  communityMembershipState,
  getUniqueCommunityMembershipByPair,
  normalizeCommunityRoleForOutput,
  syncCommunityActiveMemberCount,
} from "./communityCore";
import { recordCommunityActivityEventBestEffort } from "./communityActivity";
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
      state: "active",
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
      state: "active",
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
      state: "active",
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
  return {
    membership,
    accessGranted: true,
    activationMarker: `${String(membershipId)}:${activationSequence}:${args.activationReason}`,
  };
}

export const COMMUNITY_MEMBER_LEFT_REASON = "left_by_member";

// Every move out of `active`. Granting (above) is the only way back in.
const ENDING_MOVES: Record<CommunityMembershipState, readonly CommunityMembershipState[]> = {
  active: ["left", "removed", "lapsed", "payment_hold"],
  left: [],
  removed: [],
  lapsed: ["payment_hold"],
  // Only once an event that lifts holds has arrived (see below).
  payment_hold: ["lapsed"],
};

export function canEndCommunityMembership(from: CommunityMembershipState, to: CommunityMembershipState): boolean {
  return ENDING_MOVES[from].includes(to);
}

// The fields a membership ending writes.
export function endedCommunityMembershipFields(args: {
  membership: CommunityMembershipLike;
  to: CommunityMembershipState;
  reason: string;
  nowMs: number;
}) {
  const from = communityMembershipState(args.membership);
  if (!from || !canEndCommunityMembership(from, args.to)) {
    throw new Error(`community_membership_transition_invalid:${from}->${args.to}`);
  }
  return {
    state: args.to,
    revokedAt: args.nowMs,
    revokedReason: args.reason,
    updatedAt: args.nowMs,
  };
}

// What a subscription update from the payment provider does to a membership.
// It never brings back someone who left or was removed, and only an event that
// lifts holds (a new paid invoice, a won dispute) clears a payment hold.
export function communityMembershipStateAfterSubscriptionUpdate(args: {
  current: CommunityMembershipState;
  grantsAccess: boolean;
  liftsHold: boolean;
  reason: string;
}): CommunityMembershipState {
  if (args.current === "left" || args.current === "removed") return args.current;
  if (args.current === "payment_hold" && !args.liftsHold) return "payment_hold";
  if (args.grantsAccess) return "active";
  return COMMUNITY_MEMBERSHIP_PAYMENT_HOLD_REASONS.has(args.reason) ? "payment_hold" : "lapsed";
}

// One-off, run by hand until it reports done: clears the retired `active`
// field so the schema can drop it.
export const stripCommunityMembershipActiveInternal = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("communityMemberships").paginate({ numItems: 200, cursor: args.cursor ?? null });
    let stripped = 0;
    for (const row of page.page) {
      if ((row as any).active === undefined) continue;
      await ctx.db.patch(row._id, { active: undefined });
      stripped += 1;
    }
    return { done: page.isDone, cursor: page.continueCursor, stripped };
  },
});
