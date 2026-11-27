import { internal } from './_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { v } from 'convex/values';
import { resolveUserIdForAuthenticatedRequest } from './authActor';
import { requireCommunityOwner } from './communityCore';
import { recordCriticalAuditEventBestEffort } from './criticalAudit';
import { decryptStoredSecret, encryptSecret } from './secretCrypto';
import {
  DEFAULT_DISTRIBUTION_ENGINEER_IDENTIFY_URL,
  DISTRIBUTION_ATTRIBUTION_LEASE_MS,
  DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS,
  DISTRIBUTION_ATTRIBUTION_SOURCE_SYSTEM,
  createCommunityJoinSourceEventId,
  createDistributionAttributionSourceEventId,
  distributionAttributionCommunityDeliveryKey,
  distributionAttributionDeliveryKey,
  distributionAttributionRetryDelayMs,
  maskDistributionWebhookKeyHint,
  normalizeDistributionAttributionId,
  normalizeDistributionAttributionTracking,
  parseDistributionAttributionReceipt,
  shouldRetryDistributionAttribution,
} from './distributionAttributionCore';

type TrackingContext = { anonymousId?: string; clickId?: string };

const DELIVERY_RECOVERY_LIMIT = 25;
const COMMUNITY_CONNECTION_STATS_SCAN_LIMIT = 50;
const MIN_WEBHOOK_KEY_LENGTH = 16;
const MAX_WEBHOOK_KEY_LENGTH = 256;

function readEnv(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).trim().slice(0, 500);
}

function normalizeWebhookKeyInput(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (
    value.length < MIN_WEBHOOK_KEY_LENGTH ||
    value.length > MAX_WEBHOOK_KEY_LENGTH ||
    /\s/.test(value)
  ) {
    throw new Error('distribution_webhook_key_invalid');
  }
  return value;
}

export async function enqueueNewPolynetUserIdentify(args: {
  ctx: any;
  userId: any;
  tracking: TrackingContext | null | undefined;
  nowMs: number;
}): Promise<{ enqueued: boolean; reason: string }> {
  const normalized = normalizeDistributionAttributionTracking(args.tracking);
  if (!normalized) return { enqueued: false, reason: 'tracking_missing' };

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
    ...(normalized.anonymousId ? { anonymousId: normalized.anonymousId } : {}),
    ...(normalized.clickId ? { clickId: normalized.clickId } : {}),
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

export async function enqueueCommunityMemberIdentify(args: {
  ctx: any;
  communityId: any;
  userId: any;
  tracking: TrackingContext | null | undefined;
  nowMs: number;
}): Promise<{ enqueued: boolean; reason: string }> {
  const normalized = normalizeDistributionAttributionTracking(args.tracking);
  if (!normalized) return { enqueued: false, reason: 'tracking_missing' };

  const connection = await args.ctx.db
    .query('communityDistributionConnections')
    .withIndex('by_community', (q: any) => q.eq('communityId', args.communityId))
    .unique();
  if (!connection) return { enqueued: false, reason: 'community_not_connected' };

  const deliveryKey = distributionAttributionCommunityDeliveryKey(
    String(args.communityId),
    String(args.userId),
  );
  const existing = await args.ctx.db
    .query('distributionAttributionDeliveries')
    .withIndex('by_delivery_key', (q: any) => q.eq('deliveryKey', deliveryKey))
    .unique();
  if (existing) return { enqueued: false, reason: 'already_enqueued' };

  const deliveryId = await args.ctx.db.insert('distributionAttributionDeliveries', {
    userId: args.userId,
    communityId: args.communityId,
    deliveryKey,
    sourceEventId: createCommunityJoinSourceEventId(),
    ...(normalized.anonymousId ? { anonymousId: normalized.anonymousId } : {}),
    ...(normalized.clickId ? { clickId: normalized.clickId } : {}),
    status: 'pending',
    attemptCount: 0,
    nextAttemptAt: args.nowMs,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  if (args.ctx.scheduler) {
    await args.ctx.scheduler.runAfter(
      0,
      (internal as any).distributionAttribution.deliverIdentifyInternal,
      { deliveryId },
    );
  }
  return { enqueued: true, reason: 'community_member_identify_enqueued' };
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
    if (!user?.email) return null;
    const connection = row.communityId
      ? await ctx.db
          .query('communityDistributionConnections')
          .withIndex('by_community', (q) => q.eq('communityId', row.communityId!))
          .unique()
      : null;
    return {
      email: user.email,
      emailVerified: typeof user.emailVerifiedAt === 'number',
      sourceEventId: row.sourceEventId,
      occurredAt: row.createdAt,
      anonymousId: row.anonymousId,
      clickId: row.clickId,
      communityId: row.communityId ?? null,
      communityConnection: connection
        ? {
            accountId: connection.accountId,
            encryptedWebhookKeyHex: connection.encryptedWebhookKeyHex,
            webhookKeyIvHex: connection.webhookKeyIvHex,
          }
        : null,
    };
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
    downstreamReplayed: v.boolean(),
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
      downstreamReplayed: args.downstreamReplayed,
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

    const isCommunityDelivery = Boolean(input.communityId);
    let endpoint = '';
    let accountId = '';
    let credential = '';
    if (isCommunityDelivery) {
      const conn = input.communityConnection;
      if (!conn) {
        return ctx.runMutation((internal as any).distributionAttribution.recordDeliveryFailureInternal, {
          deliveryId: args.deliveryId,
          attemptToken: claim.attemptToken,
          errorCode: 'distribution_engineer_unconfigured',
          retryable: false,
          nowMs: Date.now(),
        });
      }
      endpoint =
        readEnv('DISTRIBUTION_ENGINEER_COMMUNITY_IDENTIFY_URL') ||
        DEFAULT_DISTRIBUTION_ENGINEER_IDENTIFY_URL;
      accountId = conn.accountId;
      try {
        credential = await decryptStoredSecret({
          encryptedSecretHex: conn.encryptedWebhookKeyHex,
          secretIvHex: conn.webhookKeyIvHex,
        });
      } catch {
        return ctx.runMutation((internal as any).distributionAttribution.recordDeliveryFailureInternal, {
          deliveryId: args.deliveryId,
          attemptToken: claim.attemptToken,
          errorCode: 'distribution_engineer_credential_decrypt_failed',
          retryable: false,
          nowMs: Date.now(),
        });
      }
    } else {
      endpoint = readEnv('DISTRIBUTION_ENGINEER_IDENTIFY_URL');
      accountId = readEnv('DISTRIBUTION_ENGINEER_ACCOUNT_ID');
      credential = readEnv('DISTRIBUTION_ENGINEER_FUNNEL_WEBHOOK_KEY');
    }
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
      const requestBody = isCommunityDelivery
        ? {
            account_id: accountId,
            source_event_id: input.sourceEventId,
            occurred_at: new Date(input.occurredAt).toISOString(),
            email: input.email,
            ...(input.anonymousId ? { de_aid: input.anonymousId } : null),
            ...(input.clickId ? { de_cid: input.clickId } : null),
          }
        : {
            account_id: accountId,
            source_system: DISTRIBUTION_ATTRIBUTION_SOURCE_SYSTEM,
            source_event_id: input.sourceEventId,
            occurred_at: new Date(input.occurredAt).toISOString(),
            email: input.email,
            ...(input.anonymousId ? { de_aid: input.anonymousId } : null),
            ...(input.clickId ? { de_cid: input.clickId } : null),
          };
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${credential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
          downstreamReplayed: parsed.receipt.replayed,
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

export const getCommunityDistributionConnection = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id('communities'),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityOwner({ ctx, communityId: args.communityId, userId });

    const [connection, delivered, pending, delivering, needsAttention] = await Promise.all([
      ctx.db
        .query('communityDistributionConnections')
        .withIndex('by_community', (q) => q.eq('communityId', args.communityId))
        .unique(),
      ctx.db
        .query('distributionAttributionDeliveries')
        .withIndex('by_community_status_updatedAt', (q) =>
          q.eq('communityId', args.communityId).eq('status', 'delivered'),
        )
        .order('desc')
        .take(COMMUNITY_CONNECTION_STATS_SCAN_LIMIT),
      ctx.db
        .query('distributionAttributionDeliveries')
        .withIndex('by_community_status_updatedAt', (q) =>
          q.eq('communityId', args.communityId).eq('status', 'pending'),
        )
        .order('desc')
        .take(COMMUNITY_CONNECTION_STATS_SCAN_LIMIT),
      ctx.db
        .query('distributionAttributionDeliveries')
        .withIndex('by_community_status_updatedAt', (q) =>
          q.eq('communityId', args.communityId).eq('status', 'delivering'),
        )
        .order('desc')
        .take(COMMUNITY_CONNECTION_STATS_SCAN_LIMIT),
      ctx.db
        .query('distributionAttributionDeliveries')
        .withIndex('by_community_status_updatedAt', (q) =>
          q.eq('communityId', args.communityId).eq('status', 'needs_attention'),
        )
        .order('desc')
        .take(COMMUNITY_CONNECTION_STATS_SCAN_LIMIT),
    ]);

    const latestDelivered = delivered[0] ?? null;
    const latestAttention = needsAttention[0] ?? null;
    return {
      connected: Boolean(connection),
      account_id: connection?.accountId ?? null,
      webhook_key_hint: connection?.webhookKeyHint ?? null,
      updated_at: connection ? new Date(connection.updatedAt).toISOString() : null,
      stats: {
        delivered_count: delivered.length,
        pending_count: pending.length + delivering.length,
        needs_attention_count: needsAttention.length,
        last_delivered_at:
          typeof latestDelivered?.deliveredAt === 'number'
            ? new Date(latestDelivered.deliveredAt).toISOString()
            : null,
        last_error_code: latestAttention?.lastErrorCode ?? null,
      },
    };
  },
});

export const saveCommunityDistributionConnection = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id('communities'),
    accountId: v.string(),
    webhookKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityOwner({ ctx, communityId: args.communityId, userId });

    const accountId = normalizeDistributionAttributionId(args.accountId);
    if (!accountId) throw new Error('distribution_account_id_invalid');

    const existing = await ctx.db
      .query('communityDistributionConnections')
      .withIndex('by_community', (q) => q.eq('communityId', args.communityId))
      .unique();
    const trimmedKey = typeof args.webhookKey === 'string' ? args.webhookKey.trim() : '';
    if (!existing && !trimmedKey) {
      throw new Error('distribution_webhook_key_invalid');
    }

    const nowMs = Date.now();
    let keyRotated = false;
    let webhookKeyHint = existing?.webhookKeyHint ?? '';
    if (trimmedKey) {
      const normalizedKey = normalizeWebhookKeyInput(trimmedKey);
      const encrypted = await encryptSecret(normalizedKey);
      webhookKeyHint = maskDistributionWebhookKeyHint(normalizedKey);
      keyRotated = true;
      if (existing) {
        await ctx.db.patch(existing._id, {
          accountId,
          encryptedWebhookKeyHex: encrypted.encryptedSecretHex,
          webhookKeyIvHex: encrypted.secretIvHex,
          webhookKeyVersion: encrypted.secretVersion,
          webhookKeyHint,
          connectedByUserId: userId,
          updatedAt: nowMs,
        });
      } else {
        await ctx.db.insert('communityDistributionConnections', {
          communityId: args.communityId,
          accountId,
          encryptedWebhookKeyHex: encrypted.encryptedSecretHex,
          webhookKeyIvHex: encrypted.secretIvHex,
          webhookKeyVersion: encrypted.secretVersion,
          webhookKeyHint,
          connectedByUserId: userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    } else if (existing) {
      await ctx.db.patch(existing._id, {
        accountId,
        connectedByUserId: userId,
        updatedAt: nowMs,
      });
    }

    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `community_distribution_connection_saved:${String(args.communityId)}:${nowMs}`,
      eventType: 'community_distribution_connection_saved',
      status: 'succeeded',
      actorUserId: userId,
      communityId: args.communityId,
      provider: 'polynet',
      providerObjectId: accountId,
      metadata: { accountId, keyRotated },
      createdAt: nowMs,
    });

    return {
      connected: true,
      account_id: accountId,
      webhook_key_hint: webhookKeyHint,
      updated_at: new Date(nowMs).toISOString(),
    };
  },
});

export const disconnectCommunityDistributionConnection = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id('communities'),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityOwner({ ctx, communityId: args.communityId, userId });

    const existing = await ctx.db
      .query('communityDistributionConnections')
      .withIndex('by_community', (q) => q.eq('communityId', args.communityId))
      .unique();
    if (!existing) return { disconnected: false };

    const nowMs = Date.now();
    await ctx.db.delete(existing._id);
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `community_distribution_connection_disconnected:${String(args.communityId)}:${nowMs}`,
      eventType: 'community_distribution_connection_disconnected',
      status: 'succeeded',
      actorUserId: userId,
      communityId: args.communityId,
      provider: 'polynet',
      providerObjectId: existing.accountId,
      metadata: { accountId: existing.accountId },
      createdAt: nowMs,
    });
    return { disconnected: true };
  },
});

export const retryCommunityDistributionDeliveries = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id('communities'),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityOwner({ ctx, communityId: args.communityId, userId });

    const connection = await ctx.db
      .query('communityDistributionConnections')
      .withIndex('by_community', (q) => q.eq('communityId', args.communityId))
      .unique();
    if (!connection) throw new Error('distribution_connection_required');

    const nowMs = Date.now();
    const failedRows = await ctx.db
      .query('distributionAttributionDeliveries')
      .withIndex('by_community_status_updatedAt', (q) =>
        q.eq('communityId', args.communityId).eq('status', 'needs_attention'),
      )
      .order('desc')
      .take(DELIVERY_RECOVERY_LIMIT);

    for (const row of failedRows) {
      await ctx.db.patch(row._id, {
        status: 'pending',
        attemptCount: 0,
        resumeCount: (row.resumeCount ?? 0) + 1,
        attemptToken: undefined,
        leaseExpiresAt: undefined,
        nextAttemptAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.scheduler.runAfter(
        0,
        (internal as any).distributionAttribution.deliverIdentifyInternal,
        { deliveryId: row._id },
      );
    }

    return { resumed_count: failedRows.length };
  },
});
