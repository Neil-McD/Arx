import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import {
  requireCommunityOwnerAnyLifecycle,
  resolveCommunityArchiveBeginPlan,
} from "./communityLifecycleCore";

const ACTIVE_SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "cancel_at_period_end",
] as const;

async function assertCommunityArchiveBillingPreflight(args: {
  ctx: any;
  communityId: any;
}) {
  for (const status of ACTIVE_SUBSCRIPTION_STATUSES) {
    const external = await args.ctx.db
      .query("communitySubscriptions")
      .withIndex("by_community_status_source_providerAccountId", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("status", status)
          .eq("source", "external_sync"),
      )
      .first();
    if (external) {
      throw new Error(
        "community_archive_billing_preflight_blocked:external_subscription_cancellation_unsupported",
      );
    }
    for (const missingValue of [undefined, ""] as const) {
      const missingAccount = await args.ctx.db
        .query("communitySubscriptions")
        .withIndex(
          "by_community_status_source_providerAccountId",
          (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("status", status)
              .eq("source", "stripe")
              .eq("providerAccountId", missingValue),
        )
        .first();
      const missingSubscription = await args.ctx.db
        .query("communitySubscriptions")
        .withIndex(
          "by_community_status_source_providerSubscriptionId",
          (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("status", status)
              .eq("source", "stripe")
              .eq("providerSubscriptionId", missingValue),
        )
        .first();
      if (missingAccount || missingSubscription) {
        throw new Error(
          "community_archive_billing_preflight_blocked:stripe_subscription_identity_incomplete",
        );
      }
    }
    const founderMissingSubscription = await args.ctx.db
      .query("founderSubscriptions")
      .withIndex("by_community_status_providerSubscriptionId", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("status", status)
          .eq("providerSubscriptionId", ""),
      )
      .first();
    if (founderMissingSubscription) {
      throw new Error(
        "community_archive_billing_preflight_blocked:stripe_subscription_identity_incomplete",
      );
    }
  }

  const malformedJoinCheckout = await Promise.all(
    ([undefined, ""] as const).map((providerAccountId) =>
      args.ctx.db
        .query("checkoutSessions")
        .withIndex(
          "by_community_status_mode_providerAccount_checkout",
          (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("status", "pending")
              .eq("mode", "community_join")
              .eq("providerAccountId", providerAccountId)
              .gt("providerCheckoutSessionId", ""),
        )
        .first(),
    ),
  );
  const malformedFounderCheckout = await args.ctx.db
    .query("checkoutSessions")
    .withIndex(
      "by_community_status_mode_providerAccount_checkout",
      (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("status", "pending")
          .eq("mode", "founder_subscription")
          .gt("providerAccountId", ""),
    )
    .first();
  const unsupportedCheckout = await Promise.all(
    (["premium_subscription", "workspace_credit_topup"] as const).map((mode) =>
      args.ctx.db
        .query("checkoutSessions")
        .withIndex(
          "by_community_status_mode_providerAccount_checkout",
          (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("status", "pending")
              .eq("mode", mode),
        )
        .first(),
    ),
  );
  if (
    malformedJoinCheckout.some(Boolean) ||
    malformedFounderCheckout ||
    unsupportedCheckout.some(Boolean)
  ) {
    throw new Error(
      "community_archive_billing_preflight_blocked:checkout_identity_incomplete",
    );
  }
}

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
    lifecycle_status: "archiving" as const,
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

    await assertCommunityArchiveBillingPreflight({
      ctx,
      communityId: args.communityId,
    });

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
      lifecycleStatus: "archiving",
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
