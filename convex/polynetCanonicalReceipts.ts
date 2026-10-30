import { RETIRED_PERSONAL_AGENT_ACTOR_TYPE } from "../shared/communityAgentIdentity";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const principalKindValidator = v.union(
  v.literal("community_agent_for_member"),
  v.literal("external_mcp"),
  v.literal("community_agent"),
  v.literal("community_app"),
);

const mutatingToolNameValidator = v.union(
  v.literal("polynet_write"),
  v.literal("polynet_call"),
);

export const CANONICAL_OPERATION_LEASE_MS = 60_000;

function newAttemptToken(): string {
  return `canonical_attempt:${crypto.randomUUID()}`;
}

async function findReceipt(ctx: any, args: {
  communityId: any;
  userId: any;
  principalKind: "community_agent_for_member" | "external_mcp" | "community_agent" | "community_app";
  toolName: "polynet_write" | "polynet_call";
  idempotencyKey: string;
}) {
  const lookup = (principalKind: string) => ctx.db
    .query("polynetCanonicalOperationReceipts" as any)
    .withIndex("by_scope_key", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("userId", args.userId)
        .eq("principalKind", principalKind)
        .eq("toolName", args.toolName)
        .eq("idempotencyKey", args.idempotencyKey),
    )
    .first();
  const receipt = await lookup(args.principalKind);
  // Receipts written before the rename carry the retired name; a retry across the
  // deploy must still find them instead of running the write again.
  if (receipt || args.principalKind !== "community_agent_for_member") return receipt;
  return await lookup(RETIRED_PERSONAL_AGENT_ACTOR_TYPE);
}

export const reserveCanonicalOperationReceiptInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    principalKind: principalKindValidator,
    toolName: mutatingToolNameValidator,
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await findReceipt(ctx, args);
    if (existing) {
      if (existing.requestFingerprint !== args.requestFingerprint) {
        return {
          ok: false,
          code: "idempotency_key_conflict",
          message:
            "This idempotency key was already reserved for a different request.",
        };
      }
      if (existing.status === "completed") {
        return {
          ok: true,
          status: "completed",
          result: existing.result ?? null,
        };
      }
      const nowMs = Date.now();
      const leaseExpiresAt =
        typeof existing.leaseExpiresAt === "number"
          ? existing.leaseExpiresAt
          : existing.updatedAt + CANONICAL_OPERATION_LEASE_MS;
      if (existing.status === "executing" && leaseExpiresAt > nowMs) {
        return {
          ok: false,
          code: "operation_in_progress",
          message:
            "This operation is already executing. Retry after its lease expires.",
          retryAfterMs: leaseExpiresAt - nowMs,
        };
      }
      const attemptToken = newAttemptToken();
      const nextLeaseExpiresAt = nowMs + CANONICAL_OPERATION_LEASE_MS;
      const attemptCount =
        (typeof existing.attemptCount === "number"
          ? existing.attemptCount
          : 1) + 1;
      await ctx.db.patch(existing._id, {
        status: "executing",
        attemptToken,
        attemptCount,
        leaseExpiresAt: nextLeaseExpiresAt,
        updatedAt: nowMs,
      });
      return {
        ok: true,
        status: "executing",
        attemptToken,
        attemptCount,
        leaseExpiresAt: nextLeaseExpiresAt,
        reclaimed: true,
      };
    }
    const nowMs = Date.now();
    const attemptToken = newAttemptToken();
    const leaseExpiresAt = nowMs + CANONICAL_OPERATION_LEASE_MS;
    await ctx.db.insert("polynetCanonicalOperationReceipts" as any, {
      ...args,
      status: "executing",
      attemptToken,
      attemptCount: 1,
      leaseExpiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      ok: true,
      status: "executing",
      attemptToken,
      attemptCount: 1,
      leaseExpiresAt,
      reclaimed: false,
    };
  },
});

const receiptScopeArgs = {
  communityId: v.id("communities"),
  userId: v.id("users"),
  principalKind: principalKindValidator,
  toolName: mutatingToolNameValidator,
  idempotencyKey: v.string(),
  requestFingerprint: v.string(),
  attemptToken: v.string(),
};

/** The reserved attempt a write completes in its own transaction, so the write and its receipt commit together. */
export const canonicalReceiptAttemptValidator = v.object(receiptScopeArgs);

export async function completeCanonicalOperationReceipt(ctx: any, args: {
  communityId: any; userId: any;
  principalKind: "community_agent_for_member" | "external_mcp" | "community_agent" | "community_app";
  toolName: "polynet_write" | "polynet_call";
  idempotencyKey: string; requestFingerprint: string; attemptToken: string; result: unknown;
}) {
  const existing = await findReceipt(ctx, args);
  if (!existing) {
    throw new Error("polynet_operation_receipt_reservation_missing");
  }
  if (existing.requestFingerprint !== args.requestFingerprint) {
    throw new Error("idempotency_key_conflict");
  }
  if (existing.attemptToken !== args.attemptToken) {
    throw new Error("polynet_operation_attempt_not_owner");
  }
  if (existing.status === "completed") {
    return {
      ok: true,
      deduped: true,
      result: existing.result ?? null,
    };
  }
  if (existing.status !== "executing") {
    throw new Error("polynet_operation_attempt_not_active");
  }
  await ctx.db.patch(existing._id, {
    status: "completed",
    result: args.result,
    leaseExpiresAt: undefined,
    updatedAt: Date.now(),
  });
  return { ok: true, deduped: false, result: args.result };
}

export const completeCanonicalOperationReceiptInternal = internalMutation({
  args: { ...receiptScopeArgs, result: v.any() },
  handler: (ctx, args) => completeCanonicalOperationReceipt(ctx, args),
});

export const failCanonicalOperationReceiptInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    principalKind: principalKindValidator,
    toolName: mutatingToolNameValidator,
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
    attemptToken: v.string(),
    errorCode: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await findReceipt(ctx, args);
    if (!existing) {
      throw new Error("polynet_operation_receipt_reservation_missing");
    }
    if (existing.requestFingerprint !== args.requestFingerprint) {
      throw new Error("idempotency_key_conflict");
    }
    if (existing.attemptToken !== args.attemptToken) {
      throw new Error("polynet_operation_attempt_not_owner");
    }
    if (existing.status === "completed") {
      return { ok: true, status: "completed" };
    }
    if (existing.status === "failed") {
      return { ok: true, status: "failed" };
    }
    const nowMs = Date.now();
    await ctx.db.patch(existing._id, {
      status: "failed",
      leaseExpiresAt: undefined,
      lastErrorCode: args.errorCode.trim().slice(0, 120),
      lastErrorMessage: args.errorMessage.trim().slice(0, 1_000),
      failedAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, status: "failed" };
  },
});
