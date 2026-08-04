import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import {
  requireCommunityOwnerAnyLifecycle,
  resolveCommunityArchiveBeginPlan,
} from "./communityLifecycleCore";

async function getArchiveOperation(args: {
  ctx: any;
  communityId: any;
  lifecycleGeneration: number;
}) {
  return await args.ctx.db
    .query("communityLifecycleOperations")
    .withIndex("by_community_generation_kind", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("lifecycleGeneration", args.lifecycleGeneration)
        .eq("kind", "archive"),
    )
    .unique();
}

function mapArchiveOperationResult(args: {
  communityId: any;
  operation: any;
  idempotent: boolean;
}) {
  return {
    ok: true,
    idempotent: args.idempotent,
    community_id: String(args.communityId),
    operation_id: String(args.operation._id),
    operation_state: args.operation.state,
    lifecycle_status: "sunsetting" as const,
    lifecycle_generation: args.operation.lifecycleGeneration,
  };
}

export const beginCommunityArchiveOperationInternal = internalMutation({
  args: {
    actorUserId: v.id("users"),
    communityId: v.id("communities"),
    expectedGeneration: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.nowMs) || args.nowMs < 0) {
      throw new Error("community_archive_timestamp_invalid");
    }
    const { community } = await requireCommunityOwnerAnyLifecycle({
      ctx,
      communityId: args.communityId,
      userId: args.actorUserId,
    });
    const plan = resolveCommunityArchiveBeginPlan({
      community,
      expectedGeneration: args.expectedGeneration,
    });

    if (plan.mode === "reuse") {
      const existing = await getArchiveOperation({
        ctx,
        communityId: args.communityId,
        lifecycleGeneration: plan.lifecycleGeneration,
      });
      if (!existing) {
        throw new Error("community_archive_operation_missing");
      }
      if (String(existing.requestedByUserId) !== String(args.actorUserId)) {
        throw new Error("community_archive_operation_owner_mismatch");
      }
      return mapArchiveOperationResult({
        communityId: args.communityId,
        operation: existing,
        idempotent: true,
      });
    }

    const conflict = await getArchiveOperation({
      ctx,
      communityId: args.communityId,
      lifecycleGeneration: plan.lifecycleGeneration,
    });
    if (conflict) {
      throw new Error("community_archive_operation_conflict");
    }

    const operationId = await ctx.db.insert("communityLifecycleOperations", {
      communityId: args.communityId,
      lifecycleGeneration: plan.lifecycleGeneration,
      kind: "archive",
      state: "requested",
      requestedByUserId: args.actorUserId,
      attemptCount: 0,
      nextAttemptAt: args.nowMs,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await ctx.db.patch(args.communityId, {
      lifecycleStatus: "sunsetting",
      lifecycleGeneration: plan.lifecycleGeneration,
      archiveRequestedAt: args.nowMs,
      archiveEffectiveAt: undefined,
      archivedAt: undefined,
      archiveRequestedByUserId: args.actorUserId,
      restoredAt: undefined,
      updatedAt: args.nowMs,
    });
    const operation = await ctx.db.get(operationId);
    if (!operation) throw new Error("community_archive_operation_create_failed");
    return mapArchiveOperationResult({
      communityId: args.communityId,
      operation,
      idempotent: false,
    });
  },
});
