import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type Stripe from "stripe";

import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import { getStripeClient } from "./stripeCore";
import { syncCommunitySubscriptionEventFromCurrentProvider } from "./httpBilling";
import {
  COMMUNITY_SUBSCRIPTION_RECOVERY_EVENT_TYPES,
  COMMUNITY_SUBSCRIPTION_RECOVERY_LEASE_MS,
  COMMUNITY_SUBSCRIPTION_RECOVERY_MAX_ATTEMPTS,
  COMMUNITY_SUBSCRIPTION_RECOVERY_RETENTION_MS,
  assertCommunitySubscriptionRecoveryIdentityMatches,
  communitySubscriptionRecoveryCanBeClaimed,
  communitySubscriptionRecoveryErrorCode,
  normalizeCommunitySubscriptionRecoveryIdentity,
  resolveCommunitySubscriptionRecoveryFailure,
  validateRecoveredCommunitySubscriptionEvent,
  type CommunitySubscriptionRecoveryEventType,
  type CommunitySubscriptionRecoveryIdentity,
} from "./communitySubscriptionRecoveryCore";

const recoveryEventTypeValidator = v.union(
  ...COMMUNITY_SUBSCRIPTION_RECOVERY_EVENT_TYPES.map((eventType) =>
    v.literal(eventType)
  ),
);

const recoveryOutcomeValidator = v.union(
  v.literal("succeeded"),
  v.literal("ignored"),
);

function requireLeaseToken(value: unknown): string {
  const token = String(value ?? "").trim();
  if (!token || token.length > 300) {
    throw new Error("community_subscription_recovery_lease_token_invalid");
  }
  return token;
}

function recoveryIdentityFromArgs(args: {
  providerAccountId: string;
  providerEventId: string;
  providerEventType: CommunitySubscriptionRecoveryEventType;
  providerSubscriptionId: string;
  livemode: boolean;
  providerCreatedAt: number;
}): CommunitySubscriptionRecoveryIdentity {
  return normalizeCommunitySubscriptionRecoveryIdentity(args);
}

async function getUniqueRecoveryByEvent(
  ctx: any,
  identity: CommunitySubscriptionRecoveryIdentity,
) {
  const rows = await ctx.db
    .query("communitySubscriptionEventRecoveries" as any)
    .withIndex("by_provider_account_event", (q: any) =>
      q
        .eq("provider", "stripe")
        .eq("providerAccountId", identity.providerAccountId)
        .eq("providerEventId", identity.providerEventId),
    )
    .take(2);
  if (rows.length > 1) {
    throw new Error("community_subscription_recovery_duplicate_rows");
  }
  return rows[0] ?? null;
}

async function recordRecoveryTerminalAudit(
  ctx: any,
  row: any,
  errorCode: string,
  nowMs: number,
) {
  await recordCriticalAuditEventBestEffort(ctx, {
    eventKey: `stripe_webhook_failed:${row.providerEventId}:recovery_terminal`,
    eventType: "stripe_webhook_failed",
    severity: "error",
    status: "failed",
    provider: "stripe",
    providerObjectId: row.providerEventId,
    metadata: {
      stripeEventType: row.providerEventType,
      stripeEventId: row.providerEventId,
      requestPath: "community_subscription_recovery",
      errorMessage: errorCode,
    },
    createdAt: nowMs,
  });
}

export const beginCommunitySubscriptionEventRecoveryInternal = internalMutation({
  args: {
    providerAccountId: v.string(),
    providerEventId: v.string(),
    providerEventType: recoveryEventTypeValidator,
    providerSubscriptionId: v.string(),
    livemode: v.boolean(),
    providerCreatedAt: v.number(),
    leaseToken: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const identity = recoveryIdentityFromArgs(args);
    const leaseToken = requireLeaseToken(args.leaseToken);
    const existing = await getUniqueRecoveryByEvent(ctx, identity);
    if (existing) {
      assertCommunitySubscriptionRecoveryIdentityMatches(existing, identity);
      if (!communitySubscriptionRecoveryCanBeClaimed(existing, nowMs)) {
        return {
          recoveryId: existing._id,
          claimed: false,
          status: existing.status,
          attemptCount: existing.attemptCount,
        };
      }
      const attemptCount = Number(existing.attemptCount ?? 0) + 1;
      if (attemptCount > COMMUNITY_SUBSCRIPTION_RECOVERY_MAX_ATTEMPTS) {
        throw new Error("community_subscription_recovery_attempt_limit_invalid");
      }
      await ctx.db.patch(existing._id, {
        status: "leased",
        attemptCount,
        nextAttemptAt: nowMs,
        leaseToken,
        leaseExpiresAt: nowMs + COMMUNITY_SUBSCRIPTION_RECOVERY_LEASE_MS,
        lastAttemptAt: nowMs,
        updatedAt: nowMs,
      });
      return {
        recoveryId: existing._id,
        claimed: true,
        status: "leased" as const,
        attemptCount,
      };
    }

    const recoveryId = await ctx.db.insert(
      "communitySubscriptionEventRecoveries" as any,
      {
        provider: "stripe",
        ...identity,
        status: "leased",
        attemptCount: 1,
        nextAttemptAt: nowMs,
        leaseToken,
        leaseExpiresAt: nowMs + COMMUNITY_SUBSCRIPTION_RECOVERY_LEASE_MS,
        lastAttemptAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      },
    );
    return {
      recoveryId,
      claimed: true,
      status: "leased" as const,
      attemptCount: 1,
    };
  },
});

export const claimDueCommunitySubscriptionEventRecoveriesInternal = internalMutation({
  args: {
    leaseTokenPrefix: v.string(),
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 10)));
    const leaseTokenPrefix = requireLeaseToken(args.leaseTokenPrefix);
    const pending = await ctx.db
      .query("communitySubscriptionEventRecoveries" as any)
      .withIndex("by_status_nextAttemptAt", (q: any) =>
        q.eq("status", "pending").lte("nextAttemptAt", nowMs),
      )
      .take(limit);
    const expiredLeases = await ctx.db
      .query("communitySubscriptionEventRecoveries" as any)
      .withIndex("by_status_leaseExpiresAt", (q: any) =>
        q.eq("status", "leased").lte("leaseExpiresAt", nowMs),
      )
      .take(limit);
    const rows = [];
    for (let index = 0; rows.length < limit; index += 1) {
      const pendingRow = pending[index];
      const expiredLease = expiredLeases[index];
      if (!pendingRow && !expiredLease) break;
      if (pendingRow) rows.push(pendingRow);
      if (expiredLease && rows.length < limit) rows.push(expiredLease);
    }
    const claimed = [];
    for (const row of rows) {
      const attemptCount = Number(row.attemptCount ?? 0) + 1;
      if (attemptCount > COMMUNITY_SUBSCRIPTION_RECOVERY_MAX_ATTEMPTS) {
        const errorCode = "community_subscription_recovery_attempt_limit_invalid";
        await ctx.db.patch(row._id, {
          status: "terminal",
          nextAttemptAt: nowMs,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          lastErrorCode: errorCode,
          deleteAfter: nowMs + COMMUNITY_SUBSCRIPTION_RECOVERY_RETENTION_MS,
          completedAt: nowMs,
          updatedAt: nowMs,
        });
        await recordRecoveryTerminalAudit(ctx, row, errorCode, nowMs);
        continue;
      }
      const leaseToken = requireLeaseToken(
        `${leaseTokenPrefix}:${String(row._id)}`,
      );
      await ctx.db.patch(row._id, {
        status: "leased",
        attemptCount,
        nextAttemptAt: nowMs,
        leaseToken,
        leaseExpiresAt: nowMs + COMMUNITY_SUBSCRIPTION_RECOVERY_LEASE_MS,
        lastAttemptAt: nowMs,
        updatedAt: nowMs,
      });
      claimed.push({
        recoveryId: row._id,
        providerAccountId: row.providerAccountId,
        providerEventId: row.providerEventId,
        providerEventType: row.providerEventType,
        providerSubscriptionId: row.providerSubscriptionId,
        livemode: row.livemode,
        providerCreatedAt: row.providerCreatedAt,
        leaseToken,
        attemptCount,
      });
    }
    return claimed;
  },
});

export const completeCommunitySubscriptionEventRecoveryInternal = internalMutation({
  args: {
    recoveryId: v.id("communitySubscriptionEventRecoveries"),
    leaseToken: v.string(),
    outcome: recoveryOutcomeValidator,
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const leaseToken = requireLeaseToken(args.leaseToken);
    const row = await ctx.db.get(args.recoveryId);
    if (!row) return { ok: false, reason: "recovery_not_found" };
    if (row.status !== "leased" || row.leaseToken !== leaseToken) {
      return { ok: false, reason: "stale_lease" };
    }
    await ctx.db.patch(row._id, {
      status: args.outcome,
      nextAttemptAt: nowMs,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      deleteAfter: nowMs + COMMUNITY_SUBSCRIPTION_RECOVERY_RETENTION_MS,
      completedAt: nowMs,
      updatedAt: nowMs,
    });
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `stripe_webhook_processed:${row.providerEventId}:recovery:${args.outcome}`,
      eventType: "stripe_webhook_processed",
      status: args.outcome,
      provider: "stripe",
      providerObjectId: row.providerEventId,
      metadata: {
        stripeEventType: row.providerEventType,
        stripeEventId: row.providerEventId,
      },
      createdAt: nowMs,
    });
    return { ok: true, status: args.outcome };
  },
});

export const failCommunitySubscriptionEventRecoveryInternal = internalMutation({
  args: {
    recoveryId: v.id("communitySubscriptionEventRecoveries"),
    leaseToken: v.string(),
    errorCode: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const leaseToken = requireLeaseToken(args.leaseToken);
    const row = await ctx.db.get(args.recoveryId);
    if (!row) return { ok: false, reason: "recovery_not_found" };
    if (row.status !== "leased" || row.leaseToken !== leaseToken) {
      return { ok: false, reason: "stale_lease" };
    }
    const errorCode = communitySubscriptionRecoveryErrorCode({
      code: args.errorCode,
    });
    const transition = resolveCommunitySubscriptionRecoveryFailure({
      attemptCount: row.attemptCount,
      nowMs,
    });
    await ctx.db.patch(row._id, {
      status: transition.status,
      nextAttemptAt: transition.nextAttemptAt,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: errorCode,
      deleteAfter: transition.status === "terminal"
        ? transition.deleteAfter
        : undefined,
      completedAt: transition.status === "terminal" ? nowMs : undefined,
      updatedAt: nowMs,
    });
    if (transition.status === "terminal") {
      await recordRecoveryTerminalAudit(ctx, row, errorCode, nowMs);
    }
    return {
      ok: true,
      status: transition.status,
      terminal: transition.status === "terminal",
      nextAttemptAt: transition.nextAttemptAt,
    };
  },
});

export const pruneCommunitySubscriptionEventRecoveriesInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));
    const statuses = ["succeeded", "ignored", "terminal"] as const;
    const rows = [];
    for (const status of statuses) {
      if (rows.length >= limit) break;
      const terminalRows = await ctx.db
        .query("communitySubscriptionEventRecoveries" as any)
        .withIndex("by_status_deleteAfter", (q: any) =>
          q.eq("status", status).lte("deleteAfter", nowMs),
        )
        .take(limit - rows.length);
      rows.push(...terminalRows);
    }
    for (const row of rows) await ctx.db.delete(row._id);
    return { ok: true, deleted: rows.length, hasMore: rows.length === limit };
  },
});

async function retrieveRecoveryEvent(job: {
  providerAccountId: string;
  providerEventId: string;
}): Promise<Stripe.Event> {
  const stripe = getStripeClient();
  if (job.providerAccountId === "platform") {
    return await stripe.events.retrieve(job.providerEventId);
  }
  return await stripe.events.retrieve(job.providerEventId, {}, {
    stripeAccount: job.providerAccountId,
  });
}

export const processDueCommunitySubscriptionEventRecoveriesInternal = internalAction({
  args: {
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 10)));
    const jobs = await ctx.runMutation(
      (internal as any).communitySubscriptionRecovery
        .claimDueCommunitySubscriptionEventRecoveriesInternal,
      {
        leaseTokenPrefix: `subscription_recovery_${crypto.randomUUID()}`,
        limit,
        nowMs,
      },
    ) as Array<any>;
    let succeeded = 0;
    let ignored = 0;
    let requeued = 0;
    let terminal = 0;
    for (const job of jobs) {
      try {
        const event = await retrieveRecoveryEvent(job);
        validateRecoveredCommunitySubscriptionEvent(job, event);
        const result = await syncCommunitySubscriptionEventFromCurrentProvider(
          ctx,
          event,
          event.data.object as Stripe.Subscription,
        );
        const completion = await ctx.runMutation(
          (internal as any).communitySubscriptionRecovery
            .completeCommunitySubscriptionEventRecoveryInternal,
          {
            recoveryId: job.recoveryId,
            leaseToken: job.leaseToken,
            outcome: result.status,
            nowMs: Date.now(),
          },
        );
        if (!completion?.ok) throw new Error("community_subscription_recovery_stale_lease");
        if (result.status === "ignored") ignored += 1;
        else succeeded += 1;
      } catch (error) {
        const failure = await ctx.runMutation(
          (internal as any).communitySubscriptionRecovery
            .failCommunitySubscriptionEventRecoveryInternal,
          {
            recoveryId: job.recoveryId,
            leaseToken: job.leaseToken,
            errorCode: communitySubscriptionRecoveryErrorCode(error),
            nowMs: Date.now(),
          },
        );
        if (!failure?.ok) continue;
        if (failure.terminal) terminal += 1;
        else requeued += 1;
      }
    }
    await ctx.runMutation(
      (internal as any).communitySubscriptionRecovery
        .pruneCommunitySubscriptionEventRecoveriesInternal,
      { limit: 100, nowMs: Date.now() },
    );
    return {
      ok: true,
      claimed: jobs.length,
      succeeded,
      ignored,
      requeued,
      terminal,
    };
  },
});
