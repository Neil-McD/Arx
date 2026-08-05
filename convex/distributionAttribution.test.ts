/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import { enqueueNewPolynetUserIdentify } from './distributionAttribution';
import schema from './schema';

const modules = import.meta.glob(['./distributionAttribution.ts', './_generated/**/*.*s']);
const internalRefs = internal as any;

const AID = '6df50193-e11a-49cf-91e7-18e09ede226f';
const CID = '883c5850-e04d-4c60-9869-024102985541';
const SOURCE_EVENT_ID = 'polynet.user_created.v1:e2893f54-5f63-4c20-966f-8f1fa684cf18';
const VIEWER_ID = '70711105-1620-426d-938f-9ebf48eaef91';
const LEAD_EVENT_ID = '87be5160-6fb4-4bf8-8cc4-1426bb55cd76';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function context(existing: unknown = null) {
  const insert = vi.fn().mockResolvedValue('delivery-1');
  const runAfter = vi.fn().mockResolvedValue(null);
  return {
    ctx: {
      db: {
        query: () => ({
          withIndex: () => ({ unique: vi.fn().mockResolvedValue(existing) }),
        }),
        insert,
      },
      scheduler: { runAfter },
    },
    insert,
    runAfter,
  };
}

describe('distribution attribution admission', () => {
  it('enqueues one server delivery without copying email into operational state', async () => {
    const harness = context();
    const result = await enqueueNewPolynetUserIdentify({
      ctx: harness.ctx,
      userId: 'user-1',
      tracking: { anonymousId: AID, clickId: CID },
      nowMs: 100,
    });

    expect(result).toEqual({ enqueued: true, reason: 'new_user_identify_enqueued' });
    expect(harness.insert).toHaveBeenCalledWith(
      'distributionAttributionDeliveries',
      expect.objectContaining({
        userId: 'user-1',
        deliveryKey: 'polynet_user_created:user-1',
        sourceEventId: expect.stringMatching(/^polynet\.user_created\.v1:/),
        anonymousId: AID,
        clickId: CID,
        status: 'pending',
      }),
    );
    expect(JSON.stringify(harness.insert.mock.calls[0])).not.toContain('@');
    expect(harness.runAfter).toHaveBeenCalledTimes(1);
  });

  it('rejects missing or malformed tracking and dedupes an existing user delivery', async () => {
    const malformed = context();
    await expect(
      enqueueNewPolynetUserIdentify({
        ctx: malformed.ctx,
        userId: 'user-1',
        tracking: { anonymousId: 'not-an-id' },
        nowMs: 100,
      }),
    ).resolves.toEqual({ enqueued: false, reason: 'tracking_missing' });
    expect(malformed.insert).not.toHaveBeenCalled();

    const duplicate = context({ _id: 'existing' });
    await expect(
      enqueueNewPolynetUserIdentify({
        ctx: duplicate.ctx,
        userId: 'user-1',
        tracking: { clickId: CID },
        nowMs: 100,
      }),
    ).resolves.toEqual({ enqueued: false, reason: 'already_enqueued' });
    expect(duplicate.insert).not.toHaveBeenCalled();
  });

  it('delivers verified canonical user identity server-to-server and completes the receipt', async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        authSubject: 'user_1',
        email: 'lead@example.com',
        normalizedEmail: 'lead@example.com',
        emailVerifiedAt: 1,
        emailVerificationSource: 'oauth_provider',
        createdAt: 1,
        updatedAt: 1,
      });
      const deliveryId = await ctx.db.insert('distributionAttributionDeliveries', {
        userId,
        deliveryKey: `polynet_user_created:${userId}`,
        sourceEventId: SOURCE_EVENT_ID,
        anonymousId: AID,
        clickId: CID,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      return { deliveryId };
    });
    vi.stubEnv(
      'DISTRIBUTION_ENGINEER_IDENTIFY_URL',
      'https://distribution.engineer/api/integrations/polynet/identify',
    );
    vi.stubEnv('DISTRIBUTION_ENGINEER_ACCOUNT_ID', 'account-1');
    vi.stubEnv('DISTRIBUTION_ENGINEER_FUNNEL_WEBHOOK_KEY', 'server-secret');
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        source_event_id: SOURCE_EVENT_ID,
        viewer_id: VIEWER_ID,
        lead_event_id: LEAD_EVENT_ID,
        lead_created: true,
        replayed: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await t.action(internalRefs.distributionAttribution.deliverIdentifyInternal, {
      deliveryId: fixture.deliveryId,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://distribution.engineer/api/integrations/polynet/identify'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer server-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          account_id: 'account-1',
          source_system: 'polynet',
          source_event_id: SOURCE_EVENT_ID,
          occurred_at: new Date(1).toISOString(),
          email: 'lead@example.com',
          de_aid: AID,
          de_cid: CID,
        }),
      }),
    );
    const receipt = await t.run((ctx) => ctx.db.get(fixture.deliveryId));
    expect(receipt).toMatchObject({
      status: 'delivered',
      attemptCount: 1,
      responseStatus: 200,
      downstreamViewerId: VIEWER_ID,
      downstreamLeadEventId: LEAD_EVENT_ID,
      downstreamLeadCreated: true,
      downstreamReplayed: false,
    });
  });

  it('moves malformed 2xx receipts to needs_attention instead of claiming delivery', async () => {
    const t = convexTest(schema, modules);
    const deliveryId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        authSubject: 'user_invalid_receipt',
        email: 'lead@example.com',
        normalizedEmail: 'lead@example.com',
        emailVerifiedAt: 1,
        emailVerificationSource: 'oauth_provider',
        createdAt: 1,
        updatedAt: 1,
      });
      return ctx.db.insert('distributionAttributionDeliveries', {
        userId,
        deliveryKey: `polynet_user_created:${userId}`,
        sourceEventId: SOURCE_EVENT_ID,
        clickId: CID,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    vi.stubEnv('DISTRIBUTION_ENGINEER_IDENTIFY_URL', 'https://distribution.engineer/api/identify');
    vi.stubEnv('DISTRIBUTION_ENGINEER_ACCOUNT_ID', 'account-1');
    vi.stubEnv('DISTRIBUTION_ENGINEER_FUNNEL_WEBHOOK_KEY', 'server-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({})));

    await t.action(internalRefs.distributionAttribution.deliverIdentifyInternal, { deliveryId });

    await expect(t.run((ctx) => ctx.db.get(deliveryId))).resolves.toMatchObject({
      status: 'needs_attention',
      attemptCount: 1,
      responseStatus: 200,
      lastErrorCode: 'distribution_engineer_receipt_not_ok',
    });
  });

  it('quarantines authentication failures for explicit recovery instead of losing the event', async () => {
    const t = convexTest(schema, modules);
    const deliveryId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        authSubject: 'user_auth_failure',
        email: 'lead@example.com',
        normalizedEmail: 'lead@example.com',
        emailVerifiedAt: 1,
        emailVerificationSource: 'oauth_provider',
        createdAt: 1,
        updatedAt: 1,
      });
      return ctx.db.insert('distributionAttributionDeliveries', {
        userId,
        deliveryKey: `polynet_user_created:${userId}`,
        sourceEventId: SOURCE_EVENT_ID,
        clickId: CID,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    vi.stubEnv('DISTRIBUTION_ENGINEER_IDENTIFY_URL', 'https://distribution.engineer/api/identify');
    vi.stubEnv('DISTRIBUTION_ENGINEER_ACCOUNT_ID', 'account-1');
    vi.stubEnv('DISTRIBUTION_ENGINEER_FUNNEL_WEBHOOK_KEY', 'stale-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 })));

    await t.action(internalRefs.distributionAttribution.deliverIdentifyInternal, { deliveryId });

    await expect(t.run((ctx) => ctx.db.get(deliveryId))).resolves.toMatchObject({
      status: 'needs_attention',
      attemptCount: 1,
      responseStatus: 401,
      sourceEventId: SOURCE_EVENT_ID,
      lastErrorCode: 'distribution_engineer_http_401',
    });
  });

  it('repairs due work and expired leases from the indexed operational outbox', async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        authSubject: 'user_repair',
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert('distributionAttributionDeliveries', {
        userId,
        deliveryKey: `polynet_user_created:${userId}:pending`,
        sourceEventId: 'polynet.user_created.v1:382ee9cb-7f2d-4368-931c-60466273cd07',
        clickId: CID,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: nowMs - 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert('distributionAttributionDeliveries', {
        userId,
        deliveryKey: `polynet_user_created:${userId}:expired`,
        sourceEventId: 'polynet.user_created.v1:006d233b-d89c-4616-9dd9-fc1dbccbedee',
        clickId: CID,
        status: 'delivering',
        attemptCount: 1,
        attemptToken: 'expired-token',
        leaseExpiresAt: nowMs - 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    });

    await expect(
      t.mutation(internalRefs.distributionAttribution.recoverDueDeliveriesInternal, { limit: 25 }),
    ).resolves.toEqual({ scheduled: 2, pending: 1, expiredLeases: 1 });
  });

  it('never claims a sixth attempt and can explicitly resume the same source event', async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const deliveryId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        authSubject: 'user_attempt_ceiling',
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return ctx.db.insert('distributionAttributionDeliveries', {
        userId,
        deliveryKey: `polynet_user_created:${userId}`,
        sourceEventId: SOURCE_EVENT_ID,
        clickId: CID,
        status: 'delivering',
        attemptCount: 5,
        attemptToken: 'expired-final-attempt',
        leaseExpiresAt: nowMs - 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    });

    await expect(
      t.mutation(internalRefs.distributionAttribution.claimDeliveryInternal, {
        deliveryId,
        nowMs,
      }),
    ).resolves.toEqual({ status: 'needs_attention' });
    await expect(t.run((ctx) => ctx.db.get(deliveryId))).resolves.toMatchObject({
      status: 'needs_attention',
      attemptCount: 5,
      sourceEventId: SOURCE_EVENT_ID,
      lastErrorCode: 'distribution_engineer_attempts_exhausted',
    });

    await expect(
      t.mutation(internalRefs.distributionAttribution.resumeDeliveryInternal, {
        deliveryId,
        nowMs: nowMs + 1,
      }),
    ).resolves.toEqual({ status: 'pending' });
    await expect(t.run((ctx) => ctx.db.get(deliveryId))).resolves.toMatchObject({
      status: 'pending',
      attemptCount: 0,
      resumeCount: 1,
      sourceEventId: SOURCE_EVENT_ID,
    });
  });
});
