import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { getStripeClient } from "./stripeCore";
import {
  compensateStaleStripeCheckout,
  normalizeStripeCheckoutSessionIdentity,
  stripeCheckoutCompensationIsTerminal,
  type StripeCheckoutCompensationClient,
} from "./stripeCheckoutEffectCore";
import {
  applyStripeSubscriptionEffect,
  stripeSubscriptionEffectIsTerminal,
  type StripeSubscriptionAccountScope,
  type StripeSubscriptionEffectClient,
} from "./stripeSubscriptionEffectCore";

const ARCHIVE_OPERATION_LEASE_MS = 2 * 60 * 1000;
const ARCHIVE_OPERATION_MAX_ATTEMPTS = 12;
const ARCHIVE_OPERATION_MAX_EFFECTS_PER_CLAIM = 10;
const ARCHIVE_RETRY_BASE_MS = 5_000;
const ARCHIVE_RETRY_MAX_MS = 60 * 60 * 1000;
const ACTIVE_SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "cancel_at_period_end",
] as const;
const ACTIVE_SUBSCRIPTION_STATUS_SET = new Set<string>(
  ACTIVE_SUBSCRIPTION_STATUSES,
);

type ArchiveOperationClaim = {
  operationId: any;
  communityId: any;
  lifecycleGeneration: number;
  leaseId: string;
  attemptCount: number;
};

type ArchiveEffect =
  | {
      kind: "founder_subscription";
      rowId: any;
      providerSubscriptionId: string;
      accountScope: { kind: "platform" };
    }
  | {
      kind: "community_subscription";
      rowId: any;
      providerSubscriptionId: string;
      accountScope: {
        kind: "connected";
        providerAccountId: string;
      };
    }
  | {
      kind: "checkout";
      rowId: any;
      providerCheckoutSessionId: string | null;
      accountScope: StripeSubscriptionAccountScope | null;
    }
  | { kind: "finalize" }
  | { kind: "blocked"; errorCode: string };

function assertTimestamp(nowMs: number) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("community_archive_timestamp_invalid");
  }
}

function assertLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
    throw new Error("community_archive_limit_invalid");
  }
}

export function communityArchiveRetryDelayMs(attemptCount: number): number {
  const boundedAttempt = Math.max(
    1,
    Math.min(ARCHIVE_OPERATION_MAX_ATTEMPTS, Math.floor(attemptCount)),
  );
  return Math.min(
    ARCHIVE_RETRY_MAX_MS,
    ARCHIVE_RETRY_BASE_MS * 2 ** (boundedAttempt - 1),
  );
}

async function requireClaimedOperation(args: {
  ctx: any;
  operationId: any;
  leaseId: string;
  nowMs: number;
}) {
  const operation = await args.ctx.db.get(args.operationId);
  if (!operation || operation.kind !== "archive") {
    throw new Error("community_archive_operation_missing");
  }
  if (
    operation.state !== "processing" ||
    operation.leaseId !== args.leaseId ||
    typeof operation.leaseExpiresAt !== "number" ||
    operation.leaseExpiresAt < args.nowMs
  ) {
    throw new Error("community_archive_operation_lease_lost");
  }
  const community = await args.ctx.db.get(operation.communityId);
  if (!community) throw new Error("community_not_found");
  if (
    community.lifecycleStatus !== "archiving" ||
    community.lifecycleGeneration !== operation.lifecycleGeneration
  ) {
    throw new Error("community_archive_lifecycle_mismatch");
  }
  return { operation, community };
}

async function firstSubscriptionByStatus(args: {
  ctx: any;
  table: "communitySubscriptions";
  communityId: any;
}) {
  for (const status of ACTIVE_SUBSCRIPTION_STATUSES) {
    const row = await args.ctx.db
      .query(args.table)
      .withIndex("by_community_status", (q: any) =>
        q.eq("communityId", args.communityId).eq("status", status),
      )
      .first();
    if (row) return row;
  }
  return null;
}

export const claimDueCommunityArchiveOperationsInternal = internalMutation({
  args: { nowMs: v.number(), limit: v.number() },
  handler: async (ctx, args): Promise<ArchiveOperationClaim[]> => {
    assertTimestamp(args.nowMs);
    assertLimit(args.limit);
    const expired = await ctx.db
      .query("communityLifecycleOperations")
      .withIndex("by_state_leaseExpiresAt", (q) =>
        q.eq("state", "processing").lte("leaseExpiresAt", args.nowMs),
      )
      .take(args.limit);
    const remaining = args.limit - expired.length;
    const requested = remaining > 0
      ? await ctx.db
          .query("communityLifecycleOperations")
          .withIndex("by_state_nextAttemptAt", (q) =>
            q.eq("state", "requested").lte("nextAttemptAt", args.nowMs),
          )
          .take(remaining)
      : [];
    const claims: ArchiveOperationClaim[] = [];
    for (const operation of [...expired, ...requested]) {
      const attemptCount = operation.attemptCount + 1;
      const leaseId = `${String(operation._id)}:${attemptCount}:${args.nowMs}`;
      await ctx.db.patch(operation._id, {
        state: "processing",
        attemptCount,
        lastAttemptAt: args.nowMs,
        leaseId,
        leaseExpiresAt: args.nowMs + ARCHIVE_OPERATION_LEASE_MS,
        errorCode: undefined,
        updatedAt: args.nowMs,
      });
      claims.push({
        operationId: operation._id,
        communityId: operation.communityId,
        lifecycleGeneration: operation.lifecycleGeneration,
        leaseId,
        attemptCount,
      });
    }
    return claims;
  },
});

export const readNextCommunityArchiveEffectInternal = internalQuery({
  args: {
    operationId: v.id("communityLifecycleOperations"),
    leaseId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args): Promise<ArchiveEffect> => {
    assertTimestamp(args.nowMs);
    const { operation } = await requireClaimedOperation({ ctx, ...args });
    const founderRows = await ctx.db
      .query("founderSubscriptions")
      .withIndex("by_community", (q) => q.eq("communityId", operation.communityId))
      .collect();
    const founder = founderRows.find((row) =>
      ACTIVE_SUBSCRIPTION_STATUS_SET.has(row.status),
    );
    if (founder) {
      const providerSubscriptionId = String(
        founder.providerSubscriptionId ?? "",
      ).trim();
      return providerSubscriptionId
        ? {
            kind: "founder_subscription",
            rowId: founder._id,
            providerSubscriptionId,
            accountScope: { kind: "platform" },
          }
        : {
            kind: "blocked",
            errorCode: "stripe_subscription_identity_incomplete",
          };
    }

    const member = await firstSubscriptionByStatus({
      ctx,
      table: "communitySubscriptions",
      communityId: operation.communityId,
    });
    if (member) {
      if (member.source !== "stripe") {
        return {
          kind: "blocked",
          errorCode: "external_subscription_cancellation_unsupported",
        };
      }
      const providerSubscriptionId = String(
        member.providerSubscriptionId ?? "",
      ).trim();
      const providerAccountId = String(member.providerAccountId ?? "").trim();
      if (!providerSubscriptionId || !providerAccountId) {
        return {
          kind: "blocked",
          errorCode: "stripe_subscription_identity_incomplete",
        };
      }
      return {
        kind: "community_subscription",
        rowId: member._id,
        providerSubscriptionId,
        accountScope: { kind: "connected", providerAccountId },
      };
    }

    const checkout = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", operation.communityId).eq("status", "pending"),
      )
      .first();
    if (checkout) {
      const providerCheckoutSessionId = String(
        checkout.providerCheckoutSessionId ?? "",
      ).trim() || null;
      if (!providerCheckoutSessionId) {
        return {
          kind: "checkout",
          rowId: checkout._id,
          providerCheckoutSessionId: null,
          accountScope: null,
        };
      }
      if (checkout.mode === "founder_subscription") {
        if (String(checkout.providerAccountId ?? "").trim()) {
          return {
            kind: "blocked",
            errorCode: "checkout_identity_incomplete",
          };
        }
        return {
          kind: "checkout",
          rowId: checkout._id,
          providerCheckoutSessionId,
          accountScope: { kind: "platform" },
        };
      }
      const providerAccountId = String(checkout.providerAccountId ?? "").trim();
      if (checkout.mode !== "community_join" || !providerAccountId) {
        return {
          kind: "blocked",
          errorCode: "checkout_identity_incomplete",
        };
      }
      return {
        kind: "checkout",
        rowId: checkout._id,
        providerCheckoutSessionId,
        accountScope: { kind: "connected", providerAccountId },
      };
    }
    return { kind: "finalize" };
  },
});

export const completeCommunityArchiveEffectInternal = internalMutation({
  args: {
    operationId: v.id("communityLifecycleOperations"),
    leaseId: v.string(),
    nowMs: v.number(),
    effectKind: v.union(
      v.literal("founder_subscription"),
      v.literal("community_subscription"),
      v.literal("checkout"),
    ),
    rowId: v.string(),
    providerObjectId: v.optional(v.string()),
    providerAccountId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertTimestamp(args.nowMs);
    const { operation } = await requireClaimedOperation({ ctx, ...args });
    const row = (await ctx.db.get(args.rowId as any)) as any;
    if (!row || String(row.communityId ?? "") !== String(operation.communityId)) {
      throw new Error("community_archive_effect_row_mismatch");
    }
    if (args.effectKind === "founder_subscription") {
      if (
        row.provider !== "stripe" ||
        String(row.providerSubscriptionId ?? "") !== args.providerObjectId ||
        args.providerAccountId !== undefined
      ) {
        throw new Error("community_archive_effect_row_mismatch");
      }
      await ctx.db.patch(row._id, {
        status: "ended",
        cancelAtPeriodEnd: false,
        endedAt: args.nowMs,
        revokedReason: "community_archived",
        updatedAt: args.nowMs,
      });
    } else if (args.effectKind === "community_subscription") {
      if (
        row.source !== "stripe" ||
        String(row.providerSubscriptionId ?? "") !== args.providerObjectId ||
        String(row.providerAccountId ?? "") !== args.providerAccountId
      ) {
        throw new Error("community_archive_effect_row_mismatch");
      }
      await ctx.db.patch(row._id, {
        status: "ended",
        cancelAtPeriodEnd: false,
        endedAt: args.nowMs,
        updatedAt: args.nowMs,
      });
    } else {
      if (
        row.status !== "pending" ||
        (String(row.providerCheckoutSessionId ?? "").trim() || undefined) !==
          args.providerObjectId ||
        (String(row.providerAccountId ?? "").trim() || undefined) !==
          args.providerAccountId
      ) {
        throw new Error("community_archive_effect_row_mismatch");
      }
      await ctx.db.patch(row._id, {
        status: "expired",
        updatedAt: args.nowMs,
      });
    }
    return { ok: true };
  },
});

export const releaseCommunityArchiveOperationInternal = internalMutation({
  args: {
    operationId: v.id("communityLifecycleOperations"),
    leaseId: v.string(),
    nowMs: v.number(),
    errorCode: v.optional(v.string()),
    terminal: v.boolean(),
  },
  handler: async (ctx, args) => {
    assertTimestamp(args.nowMs);
    const { operation } = await requireClaimedOperation({ ctx, ...args });
    const terminal = args.terminal ||
      operation.attemptCount >= ARCHIVE_OPERATION_MAX_ATTEMPTS;
    await ctx.db.patch(operation._id, terminal
      ? {
          state: "failed",
          nextAttemptAt: args.nowMs,
          leaseId: undefined,
          leaseExpiresAt: undefined,
          errorCode: args.errorCode ?? "community_archive_attempts_exhausted",
          completedAt: args.nowMs,
          updatedAt: args.nowMs,
        }
      : {
          state: "requested",
          nextAttemptAt:
            args.nowMs + communityArchiveRetryDelayMs(operation.attemptCount),
          leaseId: undefined,
          leaseExpiresAt: undefined,
          errorCode: args.errorCode,
          updatedAt: args.nowMs,
        });
    return { ok: true, terminal };
  },
});

export const finalizeCommunityArchiveOperationInternal = internalMutation({
  args: {
    operationId: v.id("communityLifecycleOperations"),
    leaseId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertTimestamp(args.nowMs);
    const { operation, community } = await requireClaimedOperation({
      ctx,
      ...args,
    });
    const founderRows = await ctx.db
      .query("founderSubscriptions")
      .withIndex("by_community", (q) => q.eq("communityId", operation.communityId))
      .collect();
    if (
      founderRows.some((row) => ACTIVE_SUBSCRIPTION_STATUS_SET.has(row.status))
    ) {
      throw new Error("community_archive_effects_remaining");
    }
    for (const status of ACTIVE_SUBSCRIPTION_STATUSES) {
      const member = await ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) =>
          q.eq("communityId", operation.communityId).eq("status", status),
        )
        .first();
      if (member) throw new Error("community_archive_effects_remaining");
    }
    const checkout = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", operation.communityId).eq("status", "pending"),
      )
      .first();
    if (checkout) throw new Error("community_archive_effects_remaining");

    await ctx.db.patch(community._id, {
      lifecycleStatus: "archived",
      archiveEffectiveAt: args.nowMs,
      archivedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await ctx.db.patch(operation._id, {
      state: "succeeded",
      nextAttemptAt: args.nowMs,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      errorCode: undefined,
      completedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true, lifecycleStatus: "archived" as const };
  },
});

async function processClaim(args: {
  ctx: any;
  claim: ArchiveOperationClaim;
}) {
  let stripe:
    | (StripeSubscriptionEffectClient & StripeCheckoutCompensationClient)
    | null = null;
  const requireStripe = () => {
    stripe ??= getStripeClient() as unknown as
      & StripeSubscriptionEffectClient
      & StripeCheckoutCompensationClient;
    return stripe;
  };
  for (let index = 0; index < ARCHIVE_OPERATION_MAX_EFFECTS_PER_CLAIM; index += 1) {
    const nowMs = Date.now();
    const effect = (await args.ctx.runQuery(
      (internal as any).communityLifecycleArchiveWorker
        .readNextCommunityArchiveEffectInternal,
      {
        operationId: args.claim.operationId,
        leaseId: args.claim.leaseId,
        nowMs,
      },
    )) as ArchiveEffect;
    if (effect.kind === "blocked") {
      await args.ctx.runMutation(
        (internal as any).communityLifecycleArchiveWorker
          .releaseCommunityArchiveOperationInternal,
        {
          operationId: args.claim.operationId,
          leaseId: args.claim.leaseId,
          nowMs,
          errorCode: effect.errorCode,
          terminal: true,
        },
      );
      return { state: "failed" as const };
    }
    if (effect.kind === "finalize") {
      await args.ctx.runMutation(
        (internal as any).communityLifecycleArchiveWorker
          .finalizeCommunityArchiveOperationInternal,
        {
          operationId: args.claim.operationId,
          leaseId: args.claim.leaseId,
          nowMs,
        },
      );
      return { state: "succeeded" as const };
    }

    let terminal = true;
    let providerState = "local";
    let errorCode: string | null = null;
    if (effect.kind === "checkout" && effect.providerCheckoutSessionId) {
      const result = await compensateStaleStripeCheckout({
        stripe: requireStripe(),
        identity: normalizeStripeCheckoutSessionIdentity({
          accountScope: effect.accountScope?.kind ?? "platform",
          providerAccountId:
            effect.accountScope?.kind === "connected"
              ? effect.accountScope.providerAccountId
              : undefined,
          providerCheckoutSessionId: effect.providerCheckoutSessionId,
        }),
      });
      terminal = stripeCheckoutCompensationIsTerminal(result);
      providerState = result.state;
      errorCode = result.errorCode;
    } else if (effect.kind !== "checkout") {
      const result = await applyStripeSubscriptionEffect({
        stripe: requireStripe(),
        identity: {
          accountScope: effect.accountScope,
          providerSubscriptionId: effect.providerSubscriptionId,
        },
        intent: "cancel_now",
      });
      terminal = stripeSubscriptionEffectIsTerminal(result);
      providerState = result.state;
      errorCode = result.errorCode;
    }
    if (!terminal) {
      const permanentlyBlocked = providerState === "blocked";
      await args.ctx.runMutation(
        (internal as any).communityLifecycleArchiveWorker
          .releaseCommunityArchiveOperationInternal,
        {
          operationId: args.claim.operationId,
          leaseId: args.claim.leaseId,
          nowMs: Date.now(),
          errorCode: `community_archive_provider_${providerState}:${errorCode ?? "unknown"}`,
          terminal: permanentlyBlocked,
        },
      );
      return { state: permanentlyBlocked ? "failed" as const : "retry" as const };
    }
    await args.ctx.runMutation(
      (internal as any).communityLifecycleArchiveWorker
        .completeCommunityArchiveEffectInternal,
      {
        operationId: args.claim.operationId,
        leaseId: args.claim.leaseId,
        nowMs: Date.now(),
        effectKind: effect.kind,
        rowId: String(effect.rowId),
        providerObjectId:
          effect.kind === "checkout"
            ? effect.providerCheckoutSessionId ?? undefined
            : effect.providerSubscriptionId,
        providerAccountId:
          effect.accountScope?.kind === "connected"
            ? effect.accountScope.providerAccountId
            : undefined,
      },
    );
  }
  await args.ctx.runMutation(
    (internal as any).communityLifecycleArchiveWorker
      .releaseCommunityArchiveOperationInternal,
    {
      operationId: args.claim.operationId,
      leaseId: args.claim.leaseId,
      nowMs: Date.now(),
      terminal: false,
    },
  );
  return { state: "bounded" as const };
}

export const processCommunityArchiveOperationsInternal = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{
    claimed: number;
    succeeded: number;
    retried: number;
    failed: number;
  }> => {
    const limit = args.limit ?? 3;
    assertLimit(limit);
    const claims = (await ctx.runMutation(
      (internal as any).communityLifecycleArchiveWorker
        .claimDueCommunityArchiveOperationsInternal,
      { nowMs: Date.now(), limit },
    )) as ArchiveOperationClaim[];
    const results: Array<{
      state: "succeeded" | "retry" | "bounded" | "failed";
    }> = [];
    for (const claim of claims) {
      try {
        results.push(await processClaim({ ctx, claim }));
      } catch (error) {
        const errorCode = String(
          error instanceof Error ? error.message : error,
        )
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_:-]+/g, "_")
          .slice(0, 160) || "community_archive_worker_failed";
        try {
          const released = (await ctx.runMutation(
            (internal as any).communityLifecycleArchiveWorker
              .releaseCommunityArchiveOperationInternal,
            {
              operationId: claim.operationId,
              leaseId: claim.leaseId,
              nowMs: Date.now(),
              errorCode,
              terminal: false,
            },
          )) as { terminal: boolean };
          results.push({
            state: released.terminal ? "failed" as const : "retry" as const,
          });
        } catch {
          results.push({ state: "failed" as const });
        }
      }
    }
    return {
      claimed: claims.length,
      succeeded: results.filter((result) => result.state === "succeeded").length,
      retried: results.filter(
        (result) => result.state === "retry" || result.state === "bounded",
      ).length,
      failed: results.filter((result) => result.state === "failed").length,
    };
  },
});
