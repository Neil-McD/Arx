import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const MAX_COMMUNITIES = 1_000;

type OwnerMembershipCandidate = {
  membershipId: any;
  communityId: any;
  accessSource: unknown;
  role: unknown;
  active: unknown;
  revokedAt?: unknown;
  pricePointId?: unknown;
  onboardingReferenceCount: number;
  subscriptionReferenceCount: number;
};

async function inspectOwnerMembershipCandidates(ctx: any): Promise<{
  communityCount: number;
  candidates: OwnerMembershipCandidate[];
}> {
  const communities = await ctx.db.query("communities").take(MAX_COMMUNITIES + 1);
  if (communities.length > MAX_COMMUNITIES) {
    throw new Error("community_owner_membership_scan_limit_exceeded");
  }

  const candidates: OwnerMembershipCandidate[] = [];
  for (const community of communities) {
    const memberships = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", community._id).eq("userId", community.ownerId),
      )
      .collect();
    if (memberships.length > 1) {
      throw new Error("community_owner_membership_pair_not_unique");
    }
    const membership = memberships[0];
    if (!membership) continue;

    const onboardingReferences = await ctx.db
      .query("communityOnboardingSessions")
      .withIndex("by_membership_activation", (q: any) =>
        q.eq("membershipId", membership._id),
      )
      .take(1);
    const subscriptionReferences = await ctx.db
      .query("communitySubscriptions")
      .withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id))
      .take(1);
    candidates.push({
      membershipId: membership._id,
      communityId: community._id,
      accessSource: membership.accessSource,
      role: membership.role,
      active: membership.active,
      revokedAt: membership.revokedAt,
      pricePointId: membership.pricePointId,
      onboardingReferenceCount: onboardingReferences.length,
      subscriptionReferenceCount: subscriptionReferences.length,
    });
  }
  return { communityCount: communities.length, candidates };
}

function summarizeInspection(inspection: Awaited<ReturnType<typeof inspectOwnerMembershipCandidates>>) {
  const blockers = inspection.candidates.filter(
    (candidate) =>
      candidate.accessSource !== "free_grant" ||
      candidate.role !== "member" ||
      candidate.active !== true ||
      typeof candidate.revokedAt === "number" ||
      candidate.pricePointId != null ||
      candidate.onboardingReferenceCount !== 0 ||
      candidate.subscriptionReferenceCount !== 0,
  );
  return {
    communityCount: inspection.communityCount,
    candidateCount: inspection.candidates.length,
    blockerCount: blockers.length,
    onboardingReferenceCount: inspection.candidates.reduce(
      (sum, candidate) => sum + candidate.onboardingReferenceCount,
      0,
    ),
    subscriptionReferenceCount: inspection.candidates.reduce(
      (sum, candidate) => sum + candidate.subscriptionReferenceCount,
      0,
    ),
  };
}

export const auditOwnerMembershipResiduesInternal = internalQuery({
  args: {},
  handler: async (ctx) => summarizeInspection(await inspectOwnerMembershipCandidates(ctx)),
});

export const removeOwnerMembershipResiduesInternal = internalMutation({
  args: {
    expectedCandidateCount: v.number(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    const inspection = await inspectOwnerMembershipCandidates(ctx);
    const summary = summarizeInspection(inspection);
    if (summary.candidateCount !== args.expectedCandidateCount) {
      throw new Error("community_owner_membership_candidate_count_changed");
    }
    if (summary.blockerCount !== 0) {
      throw new Error("community_owner_membership_dependency_blocked");
    }
    if (args.dryRun) {
      return { ...summary, deletedCount: 0, dryRun: true };
    }
    for (const candidate of inspection.candidates) {
      await ctx.db.delete(candidate.membershipId);
    }
    return {
      ...summary,
      deletedCount: inspection.candidates.length,
      dryRun: false,
    };
  },
});
