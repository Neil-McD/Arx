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
    vi.stubEnv('DISTRIBUTION_ENGINEER_IDENTIFY_URL', 'https://distribution.engineer/api/identify');
    vi.stubEnv('DISTRIBUTION_ENGINEER_ACCOUNT_ID', 'account-1');
    vi.stubEnv('DISTRIBUTION_ENGINEER_FUNNEL_WEBHOOK_KEY', 'server-secret');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await t.action(internalRefs.distributionAttribution.deliverIdentifyInternal, {
      deliveryId: fixture.deliveryId,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://distribution.engineer/api/identify'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer server-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          account_id: 'account-1',
          email: 'lead@example.com',
          de_aid: AID,
          de_cid: CID,
        }),
      }),
    );
    const receipt = await t.run((ctx) => ctx.db.get(fixture.deliveryId));
    expect(receipt).toMatchObject({ status: 'delivered', attemptCount: 1, responseStatus: 200 });
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
});
