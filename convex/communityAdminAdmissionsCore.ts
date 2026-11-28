import { internal } from "./_generated/api";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  getActiveCommunityBlock,
  getUniqueCommunityMembershipByPair,
  requireCommunityUserNotBlocked,
  syncCommunityActiveMemberCount,
} from "./communityCore";
import {
  type CommunityJoinRequestLike,
  assertCanonicalCommunityJoinRequest,
  deleteCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { extractCommunityAcquisitionAttributionFromRow } from "./distributionAttributionCore";

export function resolveCommunityJoinRequestDecision(
  request: CommunityJoinRequestLike,
  targetStatus: "denied",
): "apply" | "already_applied" {
  const currentStatus = assertCanonicalCommunityJoinRequest(request);
  if (currentStatus === targetStatus) return "already_applied";
  if (currentStatus !== "pending") {
    throw new Error("join_request_already_decided");
  }
  return "apply";
}

export async function approveCommunityJoinRequestForFreeAccess(args: {
  ctx: any;
  community: CommunityLike;
  request: CommunityJoinRequestLike;
  nowMs: number;
  grantReason: string;
  skipMemberCountSync?: boolean;
}): Promise<{ grantedMembership: boolean; membership: CommunityMembershipLike }> {
  if (String(args.community.ownerId) === String(args.request.userId)) {
    throw new Error("community_owner_join_request_forbidden");
  }
  await requireCommunityUserNotBlocked({
    ctx: args.ctx,
    communityId: args.request.communityId,
    userId: args.request.userId,
  });
  const existingMembership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: args.request.communityId,
    userId: args.request.userId,
  });
  if (assertCanonicalCommunityJoinRequest(args.request) !== "pending") {
    throw new Error("join_request_already_decided");
  }
  const restoredAccessSource =
    existingMembership?.accessSource === "paid_subscription" ||
    existingMembership?.accessSource === "free_grant" ||
    existingMembership?.accessSource === "manual_grant"
      ? existingMembership.accessSource
      : "free_grant";
  const requestAttribution = extractCommunityAcquisitionAttributionFromRow(args.request);
  const activation = await activateCommunityMembershipCore({
    ctx: args.ctx,
    communityId: args.request.communityId,
    userId: args.request.userId,
    accessSource: restoredAccessSource,
    activationReason: args.grantReason,
    nowMs: args.nowMs,
    skipMemberCountSync: args.skipMemberCountSync,
    ...(requestAttribution ? { distributionAttribution: requestAttribution } : {}),
  });
  const grantedMembershipMarker = activation.activationMarker;
  if (grantedMembershipMarker) {
    await enqueueCommunityAccessGrantedEmailInternal({
      ctx: args.ctx,
      userId: args.request.userId,
      communityId: args.request.communityId,
      grantMarker: grantedMembershipMarker,
      nowMs: args.nowMs,
    });
  }
  return { grantedMembership: Boolean(grantedMembershipMarker), membership: activation.membership };
}

export async function approvePendingJoinRequestsForOpenAccessBatch(args: {
  ctx: any;
  community: CommunityLike;
  nowMs: number;
  limit: number;
}): Promise<{ approvedCount: number; hasMore: boolean }> {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(args.limit)));
  const rows = (await args.ctx.db
    .query("communityJoinRequests")
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", args.community._id).eq("status", "pending"),
    )
    .order("asc")
    .take(safeLimit + 1)) as CommunityJoinRequestLike[];
  const batch = rows.slice(0, safeLimit);
  let approvedCount = 0;
  let newlyActiveCount = 0;
  for (const request of batch) {
    const impossibleApplicant =
      String(args.community.ownerId) === String(request.userId) ||
      Boolean(await getActiveCommunityBlock({
        ctx: args.ctx,
        communityId: args.community._id,
        userId: request.userId,
      }));
    if (impossibleApplicant) {
      await deleteCommunityJoinRequestByPair({
        ctx: args.ctx,
        communityId: args.community._id,
        userId: request.userId,
      });
      continue;
    }
    const result = await approveCommunityJoinRequestForFreeAccess({
      ctx: args.ctx,
      community: args.community,
      request,
      nowMs: args.nowMs,
      grantReason: "free_access_mode_opened",
      skipMemberCountSync: true,
    });
    approvedCount += 1;
    if (result.grantedMembership && String(request.userId) !== String(args.community.ownerId)) {
      newlyActiveCount += 1;
    }
  }
  if (newlyActiveCount > 0) {
    const freshCommunity = (await args.ctx.db.get(args.community._id as any)) as CommunityLike | null;
    if (freshCommunity) {
      const currentCount = typeof freshCommunity.activeMemberCount === "number" && Number.isFinite(freshCommunity.activeMemberCount)
        ? Math.max(1, Math.floor(freshCommunity.activeMemberCount))
        : null;
      if (currentCount === null) {
        await syncCommunityActiveMemberCount({
          ctx: args.ctx,
          communityId: args.community._id,
          community: freshCommunity,
        });
      } else {
        await args.ctx.db.patch(freshCommunity._id as any, {
          activeMemberCount: currentCount + newlyActiveCount,
        });
      }
    }
  }
  return {
    approvedCount,
    hasMore: rows.length > safeLimit,
  };
}

export async function scheduleOpenAccessPendingApprovalContinuation(args: {
  ctx: any;
  communityId: any;
  actorUserId: any;
  startedAt: number;
}): Promise<void> {
  await args.ctx.scheduler.runAfter(
    0,
    internal.communityAdmin.approvePendingJoinRequestsForOpenAccessInternal,
    {
      communityId: args.communityId,
      startedAt: args.startedAt,
      ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
    },
  );
}
