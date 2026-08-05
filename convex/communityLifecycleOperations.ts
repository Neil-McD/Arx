import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { recordCriticalAuditEvent } from "./criticalAudit";
import {
  normalizeCommunityLifecycleGeneration,
  normalizeCommunityLifecycleStatus,
  requireCommunityOwnerAnyLifecycle,
  resolveCommunityArchiveBeginPlan,
  resolveCommunityRestorePlan,
} from "./communityLifecycleCore";
import {
  readCommunityOwnerFundingFacts,
  resolveCommunityImmediateRestoreFundingAuthority,
} from "./communityOwnerFundingCore";
import { requireOperatorRole } from "./operatorAccess";

const ACTIVE_SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "cancel_at_period_end",
] as const;

const COMMUNITY_ARCHIVE_REQUEUE_IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const COMMUNITY_RESTORE_IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

function requireSafeNonnegativeInteger(value: number, errorCode: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(errorCode);
  }
}

function normalizeArchiveRequeueIdempotencyKey(value: string): string {
  const normalized = String(value).trim();
  if (!COMMUNITY_ARCHIVE_REQUEUE_IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new Error("community_archive_requeue_idempotency_key_invalid");
  }
  return normalized;
}

function normalizeCommunityRestoreIdempotencyKey(value: string): string {
  const normalized = String(value).trim();
  if (!COMMUNITY_RESTORE_IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new Error("community_restore_idempotency_key_invalid");
  }
  return normalized;
}

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

function mapArchiveOperationReceipt(operation: any) {
  return operation
    ? {
        operation_id: String(operation._id),
        kind: operation.kind,
        state: operation.state,
        lifecycle_generation: operation.lifecycleGeneration,
        attempt_count: operation.attemptCount,
        next_attempt_at: operation.nextAttemptAt,
        last_attempt_at: operation.lastAttemptAt ?? null,
        completed_at: operation.completedAt ?? null,
        error_code: operation.errorCode
          ? String(operation.errorCode).slice(0, 160)
          : null,
        created_at: operation.createdAt,
        updated_at: operation.updatedAt,
      }
    : null;
}

function mapOperatorArchiveOperation(args: {
  community: any | null;
  operation: any;
  idempotent: boolean;
}) {
  return {
    ok: true,
    idempotent: args.idempotent,
    community: args.community
      ? mapCommunityLifecycleIdentity(args.community)
      : null,
    operation: mapArchiveOperationReceipt(args.operation),
  };
}

function mapCommunityLifecycleIdentity(community: any) {
  return {
    community_id: String(community._id),
    slug: String(community.slug),
    name: String(community.name),
    lifecycle_status: normalizeCommunityLifecycleStatus(
      community.lifecycleStatus,
    ),
    lifecycle_generation: normalizeCommunityLifecycleGeneration(
      community.lifecycleGeneration,
    ),
    archive_requested_at: community.archiveRequestedAt ?? null,
    archive_effective_at:
      community.archiveEffectiveAt ?? community.archivedAt ?? null,
    updated_at: Number.isFinite(community.updatedAt)
      ? community.updatedAt
      : community._creationTime,
  };
}

async function mapCommunityLifecycleManagement(args: {
  ctx: any;
  community: any;
}) {
  const identity = mapCommunityLifecycleIdentity(args.community);
  const operation = await getArchiveOperation({
    ctx: args.ctx,
    communityId: args.community._id,
    lifecycleGeneration: identity.lifecycle_generation,
  });
  return {
    ...identity,
    operation: mapArchiveOperationReceipt(operation),
  };
}

export const getMyCommunityArchiveOperationStatus = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const { community } = await requireCommunityOwnerAnyLifecycle({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return await mapCommunityLifecycleManagement({ ctx, community });
  },
});

export const getMyCommunityLifecycleManagementBySlug = query({
  args: {
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const slug = String(args.communitySlug).trim().toLowerCase();
    if (!slug) return null;
    const community = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!community) return null;
    const owned = await requireCommunityOwnerAnyLifecycle({
      ctx,
      communityId: community._id,
      userId,
    });
    return await mapCommunityLifecycleManagement({
      ctx,
      community: owned.community,
    });
  },
});

export const listMyInactiveCommunityLifecycleRows = query({
  args: {
    lifecycleStatus: v.union(
      v.literal("archiving"),
      v.literal("archived"),
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx });
    const pageSize = Math.max(
      1,
      Math.min(50, Math.floor(args.paginationOpts.numItems ?? 25)),
    );
    const page = await ctx.db
      .query("communities")
      .withIndex("by_owner_lifecycle_createdAt", (q) =>
        q
          .eq("ownerId", userId)
          .eq("lifecycleStatus", args.lifecycleStatus),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: pageSize,
        maximumRowsRead: pageSize,
      });
    return {
      items: page.page.map(mapCommunityLifecycleIdentity),
      continue_cursor: page.continueCursor,
      is_done: page.isDone,
    };
  },
});

export const getCommunityArchiveOperationForOperator = query({
  args: {
    operationId: v.id("communityLifecycleOperations"),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOperatorRole(ctx, args.authSubject, "operator");
    const operation = await ctx.db.get(args.operationId);
    if (!operation || operation.kind !== "archive") {
      throw new Error("community_archive_operation_missing");
    }
    const community = await ctx.db.get(operation.communityId);
    return mapOperatorArchiveOperation({
      community,
      operation,
      idempotent: false,
    });
  },
});

export const requeueFailedCommunityArchiveOperationForOperator = mutation({
  args: {
    operationId: v.id("communityLifecycleOperations"),
    expectedGeneration: v.number(),
    expectedFailureCompletedAt: v.number(),
    idempotencyKey: v.string(),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(
      ctx,
      args.authSubject,
      "operator",
    );
    requireSafeNonnegativeInteger(
      args.expectedGeneration,
      "community_archive_requeue_generation_invalid",
    );
    requireSafeNonnegativeInteger(
      args.expectedFailureCompletedAt,
      "community_archive_requeue_failure_timestamp_invalid",
    );
    const idempotencyKey = normalizeArchiveRequeueIdempotencyKey(
      args.idempotencyKey,
    );
    const operation = await ctx.db.get(args.operationId);
    if (!operation || operation.kind !== "archive") {
      throw new Error("community_archive_operation_missing");
    }
    if (operation.lifecycleGeneration !== args.expectedGeneration) {
      throw new Error("community_archive_requeue_generation_stale");
    }

    const operationId = String(operation._id);
    const auditEventKey =
      `community_archive_requeued:${operationId}:${idempotencyKey}`;
    const existingAudit = await ctx.db
      .query("criticalAuditEvents")
      .withIndex("by_eventKey", (q) => q.eq("eventKey", auditEventKey))
      .first();
    if (existingAudit) {
      const metadata = existingAudit.metadata as Record<string, unknown> | undefined;
      if (
        existingAudit.eventType !== "community_archive_requeued" ||
        String(existingAudit.actorUserId ?? "") !== String(operator.dbUserId) ||
        String(existingAudit.communityId ?? "") !== String(operation.communityId) ||
        existingAudit.providerObjectId !== operationId ||
        metadata?.lifecycleGeneration !== args.expectedGeneration ||
        metadata?.previousFailureCompletedAt !==
          args.expectedFailureCompletedAt
      ) {
        throw new Error("community_archive_requeue_idempotency_conflict");
      }
      const community = await ctx.db.get(operation.communityId);
      const currentOperation = await ctx.db.get(args.operationId);
      if (!currentOperation) {
        throw new Error("community_archive_operation_missing");
      }
      return mapOperatorArchiveOperation({
        community,
        operation: currentOperation,
        idempotent: true,
      });
    }

    if (operation.state !== "failed") {
      throw new Error("community_archive_operation_not_failed");
    }
    if (operation.completedAt !== args.expectedFailureCompletedAt) {
      throw new Error("community_archive_requeue_failure_stale");
    }
    if (operation.leaseId !== undefined || operation.leaseExpiresAt !== undefined) {
      throw new Error("community_archive_requeue_lease_present");
    }
    const community = await ctx.db.get(operation.communityId);
    if (!community) throw new Error("community_not_found");
    if (
      community.lifecycleStatus !== "archiving" ||
      community.lifecycleGeneration !== operation.lifecycleGeneration
    ) {
      throw new Error("community_archive_lifecycle_mismatch");
    }

    const nowMs = Date.now();
    await recordCriticalAuditEvent(ctx, {
      eventKey: auditEventKey,
      eventType: "community_archive_requeued",
      severity: "warning",
      status: "succeeded",
      actorUserId: operator.dbUserId,
      communityId: operation.communityId,
      provider: "polynet",
      providerObjectId: operationId,
      metadata: {
        lifecycleGeneration: operation.lifecycleGeneration,
        previousAttemptCount: operation.attemptCount,
        previousLastAttemptAt: operation.lastAttemptAt,
        previousFailureCompletedAt: operation.completedAt,
        previousErrorCode: operation.errorCode,
      },
      createdAt: nowMs,
    });
    await ctx.db.patch(operation._id, {
      state: "requested",
      attemptCount: 0,
      nextAttemptAt: nowMs,
      lastAttemptAt: undefined,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      errorCode: undefined,
      completedAt: undefined,
      updatedAt: nowMs,
    });
    const requeuedOperation = await ctx.db.get(operation._id);
    if (!requeuedOperation) {
      throw new Error("community_archive_operation_missing");
    }
    return mapOperatorArchiveOperation({
      community,
      operation: requeuedOperation,
      idempotent: false,
    });
  },
});

export async function beginCommunityArchiveOperationCore(args: {
  ctx: any;
  actorUserId: any;
  communityId: any;
  expectedGeneration: number;
  nowMs: number;
}) {
  if (!Number.isSafeInteger(args.nowMs) || args.nowMs < 0) {
    throw new Error("community_archive_timestamp_invalid");
  }
  const { community } = await requireCommunityOwnerAnyLifecycle({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
  const plan = resolveCommunityArchiveBeginPlan({
    community,
    expectedGeneration: args.expectedGeneration,
  });

  if (plan.mode === "reuse") {
    const existing = await getArchiveOperation({
      ctx: args.ctx,
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
    ctx: args.ctx,
    communityId: args.communityId,
  });

  const conflict = await getArchiveOperation({
    ctx: args.ctx,
    communityId: args.communityId,
    lifecycleGeneration: plan.lifecycleGeneration,
  });
  if (conflict) {
    throw new Error("community_archive_operation_conflict");
  }

  const operationId = await args.ctx.db.insert(
    "communityLifecycleOperations",
    {
      communityId: args.communityId,
      lifecycleGeneration: plan.lifecycleGeneration,
      kind: "archive",
      state: "requested",
      requestedByUserId: args.actorUserId,
      attemptCount: 0,
      nextAttemptAt: args.nowMs,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    },
  );
  await args.ctx.db.patch(args.communityId, {
    lifecycleStatus: "archiving",
    lifecycleGeneration: plan.lifecycleGeneration,
    archiveRequestedAt: args.nowMs,
    archiveEffectiveAt: undefined,
    archivedAt: undefined,
    archiveRequestedByUserId: args.actorUserId,
    restoredAt: undefined,
    updatedAt: args.nowMs,
  });
  const operation = await args.ctx.db.get(operationId);
  if (!operation) throw new Error("community_archive_operation_create_failed");
  return mapArchiveOperationResult({
    communityId: args.communityId,
    operation,
    idempotent: false,
  });
}

export const requestMyCommunityArchive = mutation({
  args: {
    communityId: v.id("communities"),
    expectedGeneration: v.number(),
  },
  handler: async (ctx, args) => {
    const actorUserId = await resolveUserIdForAuthenticatedRequest({ ctx });
    return await beginCommunityArchiveOperationCore({
      ctx,
      actorUserId,
      communityId: args.communityId,
      expectedGeneration: args.expectedGeneration,
      nowMs: Date.now(),
    });
  },
});

function mapCommunityRestoreResult(args: {
  communityId: any;
  lifecycleGeneration: number;
  restoredAt: number;
  fundingMode: "platform_operator_grant" | "owner_api_key";
  idempotent: boolean;
}) {
  return {
    ok: true,
    idempotent: args.idempotent,
    community_id: String(args.communityId),
    lifecycle_status: "active" as const,
    lifecycle_generation: args.lifecycleGeneration,
    restored_at: args.restoredAt,
    funding_mode: args.fundingMode,
  };
}

type CommunityRestoreRow = {
  _id: any;
  ownerId: any;
  slug: string;
  lifecycleStatus?: "active" | "archiving" | "archived";
  lifecycleGeneration?: number;
  inferenceFundingPolicy: "legacy_byok_allowed" | "managed_required";
  archivedAt?: number;
  restoredAt?: number;
};

export async function restoreCommunityImmediatelyCore(args: {
  ctx: any;
  actorUserId: any;
  communityId: any;
  expectedGeneration: number;
  idempotencyKey: string;
  nowMs: number;
}) {
  requireSafeNonnegativeInteger(
    args.nowMs,
    "community_restore_timestamp_invalid",
  );
  const idempotencyKey = normalizeCommunityRestoreIdempotencyKey(
    args.idempotencyKey,
  );
  const { community } = await requireCommunityOwnerAnyLifecycle<CommunityRestoreRow>({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
  const communityId = String(args.communityId);
  const auditEventKey = `community_restored:${communityId}:${idempotencyKey}`;
  const existingAudit = await args.ctx.db
    .query("criticalAuditEvents")
    .withIndex("by_eventKey", (q: any) => q.eq("eventKey", auditEventKey))
    .first();
  if (existingAudit) {
    const metadata = existingAudit.metadata as
      | Record<string, unknown>
      | undefined;
    const lifecycleGeneration = Number(metadata?.lifecycleGeneration);
    const restoredAt = Number(existingAudit.createdAt);
    const fundingMode = metadata?.fundingMode;
    if (
      existingAudit.eventType !== "community_restored" ||
      existingAudit.status !== "succeeded" ||
      String(existingAudit.actorUserId ?? "") !== String(args.actorUserId) ||
      String(existingAudit.communityId ?? "") !== communityId ||
      existingAudit.providerObjectId !== communityId ||
      metadata?.previousGeneration !== args.expectedGeneration ||
      !Number.isSafeInteger(lifecycleGeneration) ||
      !Number.isSafeInteger(restoredAt) ||
      (fundingMode !== "platform_operator_grant" &&
        fundingMode !== "owner_api_key") ||
      normalizeCommunityLifecycleStatus(community.lifecycleStatus) !== "active" ||
      normalizeCommunityLifecycleGeneration(community.lifecycleGeneration) !==
        lifecycleGeneration ||
      community.restoredAt !== restoredAt
    ) {
      throw new Error("community_restore_idempotency_conflict");
    }
    return mapCommunityRestoreResult({
      communityId: args.communityId,
      lifecycleGeneration,
      restoredAt,
      fundingMode,
      idempotent: true,
    });
  }

  const plan = resolveCommunityRestorePlan({
    community,
    expectedGeneration: args.expectedGeneration,
  });
  const fundingFacts = await readCommunityOwnerFundingFacts({
    ctx: args.ctx,
    community,
    nowMs: args.nowMs,
    purpose: "immediate_restore",
  });
  const funding = resolveCommunityImmediateRestoreFundingAuthority(
    fundingFacts,
  );
  if (!funding.ok) throw new Error(funding.code);

  await recordCriticalAuditEvent(args.ctx, {
    eventKey: auditEventKey,
    eventType: "community_restored",
    severity: "info",
    status: "succeeded",
    actorUserId: args.actorUserId,
    communityId: args.communityId,
    provider: "polynet",
    providerObjectId: communityId,
    metadata: {
      previousGeneration: plan.previousGeneration,
      lifecycleGeneration: plan.lifecycleGeneration,
      fundingMode: funding.mode,
      archivedAt: community.archivedAt,
    },
    createdAt: args.nowMs,
  });
  await args.ctx.db.patch(args.communityId, {
    lifecycleStatus: "active",
    lifecycleGeneration: plan.lifecycleGeneration,
    archiveRequestedAt: undefined,
    archiveEffectiveAt: undefined,
    archivedAt: undefined,
    archiveRequestedByUserId: undefined,
    restoredAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return mapCommunityRestoreResult({
    communityId: args.communityId,
    lifecycleGeneration: plan.lifecycleGeneration,
    restoredAt: args.nowMs,
    fundingMode: funding.mode,
    idempotent: false,
  });
}

export const restoreMyArchivedCommunity = mutation({
  args: {
    communityId: v.id("communities"),
    expectedGeneration: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actorUserId = await resolveUserIdForAuthenticatedRequest({ ctx });
    return await restoreCommunityImmediatelyCore({
      ctx,
      actorUserId,
      communityId: args.communityId,
      expectedGeneration: args.expectedGeneration,
      idempotencyKey: args.idempotencyKey,
      nowMs: Date.now(),
    });
  },
});
