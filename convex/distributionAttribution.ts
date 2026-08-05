import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import {
  DISTRIBUTION_ATTRIBUTION_LEASE_MS,
  DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS,
  DISTRIBUTION_ATTRIBUTION_SOURCE_SYSTEM,
  createDistributionAttributionSourceEventId,
  distributionAttributionDeliveryKey,
  distributionAttributionRetryDelayMs,
  normalizeDistributionAttributionId,
  parseDistributionAttributionReceipt,
  shouldRetryDistributionAttribution,
} from './distributionAttributionCore';

type TrackingContext = { anonymousId?: string; clickId?: string };

const DELIVERY_RECOVERY_LIMIT = 25;

function readEnv(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).trim().slice(0, 500);
}

export async function enqueueNewPolynetUserIdentify(args: {
  ctx: any;
  userId: any;
  tracking: TrackingContext | null | undefined;
  nowMs: number;
}): Promise<{ enqueued: boolean; reason: string }> {
  const anonymousId = normalizeDistributionAttributionId(args.tracking?.anonymousId);
  const clickId = normalizeDistributionAttributionId(args.tracking?.clickId);
  if (!anonymousId && !clickId) return { enqueued: false, reason: 'tracking_missing' };

  const deliveryKey = distributionAttributionDeliveryKey(String(args.userId));
  const existing = await args.ctx.db
    .query('distributionAttributionDeliveries')
    .withIndex('by_delivery_key', (q: any) => q.eq('deliveryKey', deliveryKey))
    .unique();
  if (existing) return { enqueued: false, reason: 'already_enqueued' };

  const deliveryId = await args.ctx.db.insert('distributionAttributionDeliveries', {
    userId: args.userId,
    deliveryKey,
    sourceEventId: createDistributionAttributionSourceEventId(),
    anonymousId,
    clickId,
    status: 'pending',
    attemptCount: 0,
    nextAttemptAt: args.nowMs,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await args.ctx.scheduler.runAfter(
    0,
    (internal as any).distributionAttribution.deliverIdentifyInternal,
    { deliveryId },
  );
  return { enqueued: true, reason: 'new_user_identify_enqueued' };
}

export const claimDeliveryInternal = internalMutation({
  args: { deliveryId: v.id('distributionAttributionDeliveries'), nowMs: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (!row) return { status: 'missing' as const };
    if (row.status === 'delivered' || row.status === 'needs_attention') return { status: row.status };
    if (
      row.status === 'delivering' &&
      typeof row.leaseExpiresAt === 'number' &&
      row.leaseExpiresAt > args.nowMs
    ) {
      return { status: 'busy' as const };
    }
    if (row.attemptCount >= DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS) {
      await ctx.db.patch(row._id, {
        status: 'needs_attention',
        attemptToken: undefined,
        leaseExpiresAt: undefined,
        nextAttemptAt: undefined,
        lastErrorCode: 'distribution_engineer_attempts_exhausted',
        updatedAt: args.nowMs,
      });
      return { status: 'needs_attention' as const };
    }
    const attemptCount = row.attemptCount + 1;
    const attemptToken = crypto.randomUUID();
    await ctx.db.patch(row._id, {
      status: 'delivering',
      attemptCount,
      attemptToken,
      leaseExpiresAt: args.nowMs + DISTRIBUTION_ATTRIBUTION_LEASE_MS,
      nextAttemptAt: undefined,
      updatedAt: args.nowMs,
    });
    return { status: 'claimed' as const, attemptToken, attemptCount };
  },
});

export const readDeliveryInputInternal = internalQuery({
  args: { deliveryId: v.id('distributionAttributionDeliveries'), attemptToken: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (!row || row.status !== 'delivering' || row.attemptToken !== args.attemptToken) return null;
    const user = await ctx.db.get(row.userId);
    return user?.email
      ? {
          email: user.email,
          emailVerified: typeof user.emailVerifiedAt === 'number',
          sourceEventId: row.sourceEventId,
          anonymousId: row.anonymousId,
          clickId: row.clickId,
        }
      : null;
  },
});

export const completeDeliveryInternal = internalMutation({
  args: {
    deliveryId: v.id('distributionAttributionDeliveries'),
    attemptToken: v.string(),
    responseStatus: v.number(),
    sourceEventId: v.string(),
    downstreamViewerId: v.string(),
    downstreamLeadEventId: v.string(),
    downstreamLeadCreated: v.boolean(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (
      !row ||
      row.status !== 'delivering' ||
      row.attemptToken !== args.attemptToken ||
      row.sourceEventId !== args.sourceEventId
    ) {
      return { ok: false };
    }
    await ctx.db.patch(row._id, {
      status: 'delivered',
      responseStatus: args.responseStatus,
      downstreamViewerId: args.downstreamViewerId,
      downstreamLeadEventId: args.downstreamLeadEventId,
      downstreamLeadCreated: args.downstreamLeadCreated,
      deliveredAt: args.nowMs,
      attemptToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      updatedAt: args.nowMs,
    });
    return { ok: true };
  },
});

export const recordDeliveryFailureInternal = internalMutation({
  args: {
    deliveryId: v.id('distributionAttributionDeliveries'),
    attemptToken: v.string(),
    responseStatus: v.optional(v.number()),
    errorCode: v.string(),
    retryable: v.boolean(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (!row || row.attemptToken !== args.attemptToken) return { ok: false };
    const retry = args.retryable && row.attemptCount < DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS;
    const nextAttemptAt = retry
      ? args.nowMs + distributionAttributionRetryDelayMs(row.attemptCount)
      : undefined;
    await ctx.db.patch(row._id, {
      status: retry ? 'pending' : 'needs_attention',
      responseStatus: args.responseStatus,
      lastErrorCode: args.errorCode.slice(0, 120),
      nextAttemptAt,
      attemptToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: args.nowMs,
    });
    if (retry && nextAttemptAt) {
      await ctx.scheduler.runAfter(
        Math.max(0, nextAttemptAt - args.nowMs),
        (internal as any).distributionAttribution.deliverIdentifyInternal,
        { deliveryId: row._id },
      );
    }
    return { ok: true, retry, nextAttemptAt: nextAttemptAt ?? null };
  },
});

export const resumeDeliveryInternal = internalMutation({
  args: { deliveryId: v.id('distributionAttributionDeliveries'), nowMs: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (!row) return { status: 'missing' as const };
    if (row.status !== 'needs_attention') return { status: row.status };
    await ctx.db.patch(row._id, {
      status: 'pending',
      attemptCount: 0,
      resumeCount: (row.resumeCount ?? 0) + 1,
      attemptToken: undefined,
      leaseExpiresAt: undefined,
      nextAttemptAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await ctx.scheduler.runAfter(
      0,
      (internal as any).distributionAttribution.deliverIdentifyInternal,
      { deliveryId: row._id },
    );
    return { status: 'pending' as const };
  },
});

export const recoverDueDeliveriesInternal = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const limit = Math.min(DELIVERY_RECOVERY_LIMIT, Math.max(1, Math.floor(args.limit ?? 10)));
    const [pending, expiredLeases] = await Promise.all([
      ctx.db
        .query('distributionAttributionDeliveries')
        .withIndex('by_status_next_attempt_at', (q) =>
          q.eq('status', 'pending').lte('nextAttemptAt', nowMs),
        )
        .take(limit),
      ctx.db
        .query('distributionAttributionDeliveries')
        .withIndex('by_status_lease_expires_at', (q) =>
          q.eq('status', 'delivering').lte('leaseExpiresAt', nowMs),
        )
        .take(limit),
    ]);
    const rows = [...pending, ...expiredLeases].slice(0, limit);
    for (const row of rows) {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).distributionAttribution.deliverIdentifyInternal,
        { deliveryId: row._id },
      );
    }
    return {
      scheduled: rows.length,
      pending: pending.length,
      expiredLeases: expiredLeases.length,
    };
  },
});

export const deliverIdentifyInternal: any = internalAction({
  args: { deliveryId: v.id('distributionAttributionDeliveries') },
  handler: async (ctx, args): Promise<any> => {
    const claim: any = await ctx.runMutation(
      (internal as any).distributionAttribution.claimDeliveryInternal,
      { deliveryId: args.deliveryId, nowMs: Date.now() },
    );
    if (claim.status !== 'claimed') return claim;
    const input: any = await ctx.runQuery(
      (internal as any).distributionAttribution.readDeliveryInputInternal,
      { deliveryId: args.deliveryId, attemptToken: claim.attemptToken },
    );
    if (!input || !input.emailVerified) {
      return ctx.runMutation((internal as any).distributionAttribution.recordDeliveryFailureInternal, {
        deliveryId: args.deliveryId,
        attemptToken: claim.attemptToken,
        errorCode: input ? 'verified_email_pending' : 'user_email_missing',
        retryable: true,
        nowMs: Date.now(),
      });
    }

    const endpoint = readEnv('DISTRIBUTION_ENGINEER_IDENTIFY_URL');
    const accountId = readEnv('DISTRIBUTION_ENGINEER_ACCOUNT_ID');
    const credential = readEnv('DISTRIBUTION_ENGINEER_FUNNEL_WEBHOOK_KEY');
    if (!endpoint || !accountId || !credential) {
      return ctx.runMutation((internal as any).distributionAttribution.recordDeliveryFailureInternal, {
        deliveryId: args.deliveryId,
        attemptToken: claim.attemptToken,
        errorCode: 'distribution_engineer_unconfigured',
        retryable: false,
        nowMs: Date.now(),
      });
    }

    let responseStatus: number | null = null;
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
        throw new Error('distribution_engineer_endpoint_unsafe');
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          account_id: accountId,
          source_system: DISTRIBUTION_ATTRIBUTION_SOURCE_SYSTEM,
          source_event_id: input.sourceEventId,
          email: input.email,
          ...(input.anonymousId ? { de_aid: input.anonymousId } : null),
          ...(input.clickId ? { de_cid: input.clickId } : null),
        }),
      });
      responseStatus = response.status;
      if (response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return ctx.runMutation(
            (internal as any).distributionAttribution.recordDeliveryFailureInternal,
            {
              deliveryId: args.deliveryId,
              attemptToken: claim.attemptToken,
              responseStatus: response.status,
              errorCode: 'distribution_engineer_receipt_invalid_json',
              retryable: false,
              nowMs: Date.now(),
            },
          );
        }
        const parsed = parseDistributionAttributionReceipt(payload, input.sourceEventId);
        if (!parsed.ok) {
          return ctx.runMutation(
            (internal as any).distributionAttribution.recordDeliveryFailureInternal,
            {
              deliveryId: args.deliveryId,
              attemptToken: claim.attemptToken,
              responseStatus: response.status,
              errorCode: parsed.errorCode,
              retryable: false,
              nowMs: Date.now(),
            },
          );
        }
        return ctx.runMutation((internal as any).distributionAttribution.completeDeliveryInternal, {
          deliveryId: args.deliveryId,
          attemptToken: claim.attemptToken,
          responseStatus: response.status,
          sourceEventId: parsed.receipt.sourceEventId,
          downstreamViewerId: parsed.receipt.viewerId,
          downstreamLeadEventId: parsed.receipt.leadEventId,
          downstreamLeadCreated: parsed.receipt.leadCreated,
          nowMs: Date.now(),
        });
      }
      return ctx.runMutation((internal as any).distributionAttribution.recordDeliveryFailureInternal, {
        deliveryId: args.deliveryId,
        attemptToken: claim.attemptToken,
        responseStatus: response.status,
        errorCode: `distribution_engineer_http_${response.status}`,
        retryable: shouldRetryDistributionAttribution(response.status),
        nowMs: Date.now(),
      });
    } catch (error) {
      console.error('distribution_attribution_delivery_failed', {
        deliveryId: String(args.deliveryId),
        error: safeError(error),
      });
      const errorCode = safeError(error) || 'distribution_engineer_request_failed';
      return ctx.runMutation((internal as any).distributionAttribution.recordDeliveryFailureInternal, {
        deliveryId: args.deliveryId,
        attemptToken: claim.attemptToken,
        ...(responseStatus === null ? null : { responseStatus }),
        errorCode,
        retryable:
          errorCode !== 'distribution_engineer_endpoint_unsafe' &&
          shouldRetryDistributionAttribution(responseStatus),
        nowMs: Date.now(),
      });
    }
  },
});
