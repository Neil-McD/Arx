/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import {
  enqueueCommunityMemberIdentify,
  enqueueNewPolynetUserIdentify,
} from './distributionAttribution';
import schema from './schema';

const modules = import.meta.glob(['./distributionAttribution.ts', './_generated/**/*.*s']);
const apiRefs = api as any;
const internalRefs = internal as any;

const AID = '6df50193-e11a-49cf-91e7-18e09ede226f';
const CID = '883c5850-e04d-4c60-9869-024102985541';
const ACCOUNT_ID_A = '2d6f6736-3df3-49b7-b84c-c82db2d5f412';
const ACCOUNT_ID_B = '7c3e45b1-9f2a-4c31-91f0-2177d40a8a91';
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

describe('per-community Distribution Engineer connections & deliveries', () => {
  async function seedCommunityFixture(t: ReturnType<typeof convexTest>) {
    const nowMs = Date.now();
    return await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', {
        authSubject: 'owner_subject',
        email: 'owner@example.com',
        normalizedEmail: 'owner@example.com',
        emailVerifiedAt: nowMs,
        emailVerificationSource: 'oauth_provider',
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const memberId = await ctx.db.insert('users', {
        authSubject: 'member_subject',
        email: 'member@example.com',
        normalizedEmail: 'member@example.com',
        emailVerifiedAt: nowMs,
        emailVerificationSource: 'oauth_provider',
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const communityId = await ctx.db.insert('communities', {
        ownerId,
        slug: 'founders-alpha',
        name: 'Founders Alpha',
        visibility: 'published',
        entryPolicy: 'open',
        inferenceFundingPolicy: 'managed_required',
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert('communityMemberships', {
        communityId,
        userId: memberId,
        role: 'admin',
        accessSource: 'free_grant',
        state: 'active',
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return { ownerId, memberId, communityId };
    });
  }

  it('enforces owner-only access, encrypts keys at rest, masks hints, and supports rotation + disconnect', async () => {
    vi.stubEnv('ARX_DB_KEY', 'test-db-encryption-key-for-slice-3');
    const t = convexTest(schema, modules);
    const { communityId } = await seedCommunityFixture(t);
    const asOwner = t.withIdentity({ subject: 'owner_subject' });
    const asAdmin = t.withIdentity({ subject: 'member_subject' });

    // Non-owners (even admins) cannot read or mutate DE connection settings.
    await expect(
      asAdmin.query(apiRefs.distributionAttribution.getCommunityDistributionConnection, {
        authSubject: 'member_subject',
        communityId,
      }),
    ).rejects.toThrow(/owner|forbidden/i);

    await expect(
      asAdmin.mutation(apiRefs.distributionAttribution.saveCommunityDistributionConnection, {
        authSubject: 'member_subject',
        communityId,
        accountId: ACCOUNT_ID_A,
        webhookKey: 'de_live_secret_key_1234567890abcd',
      }),
    ).rejects.toThrow(/owner|forbidden/i);

    // Owner saves connection.
    const rawKey = 'de_live_secret_key_1234567890abcd';
    const saved = await asOwner.mutation(
      apiRefs.distributionAttribution.saveCommunityDistributionConnection,
      {
        authSubject: 'owner_subject',
        communityId,
        accountId: ACCOUNT_ID_A,
        webhookKey: rawKey,
      },
    );
    expect(saved).toMatchObject({
      connected: true,
      account_id: ACCOUNT_ID_A,
      webhook_key_hint: '••••abcd',
    });

    // Stored row must never contain the plaintext secret.
    const storedRow = await t.run(async (ctx) =>
      ctx.db
        .query('communityDistributionConnections')
        .withIndex('by_community', (q) => q.eq('communityId', communityId))
        .unique(),
    );
    expect(storedRow).not.toBeNull();
    expect(JSON.stringify(storedRow)).not.toContain(rawKey);
    expect(storedRow?.webhookKeyHint).toBe('••••abcd');

    // Public read returns masked hint only, never ciphertext or plaintext.
    const status = await asOwner.query(
      apiRefs.distributionAttribution.getCommunityDistributionConnection,
      { authSubject: 'owner_subject', communityId },
    );
    expect(status.connected).toBe(true);
    expect(status.account_id).toBe(ACCOUNT_ID_A);
    expect(status.webhook_key_hint).toBe('••••abcd');
    expect(JSON.stringify(status)).not.toContain(rawKey);
    expect(JSON.stringify(status)).not.toContain(storedRow!.encryptedWebhookKeyHex);

    // Updating accountId without webhookKey preserves encrypted key.
    await asOwner.mutation(apiRefs.distributionAttribution.saveCommunityDistributionConnection, {
      authSubject: 'owner_subject',
      communityId,
      accountId: ACCOUNT_ID_B,
    });
    const afterAccountUpdate = await t.run(async (ctx) =>
      ctx.db
        .query('communityDistributionConnections')
        .withIndex('by_community', (q) => q.eq('communityId', communityId))
        .unique(),
    );
    expect(afterAccountUpdate?.accountId).toBe(ACCOUNT_ID_B);
    expect(afterAccountUpdate?.encryptedWebhookKeyHex).toBe(storedRow?.encryptedWebhookKeyHex);

    // Disconnecting removes the row cleanly.
    await expect(
      asOwner.mutation(apiRefs.distributionAttribution.disconnectCommunityDistributionConnection, {
        authSubject: 'owner_subject',
        communityId,
      }),
    ).resolves.toEqual({ disconnected: true });

    const afterDisconnect = await asOwner.query(
      apiRefs.distributionAttribution.getCommunityDistributionConnection,
      { authSubject: 'owner_subject', communityId },
    );
    expect(afterDisconnect.connected).toBe(false);
    expect(afterDisconnect.account_id).toBeNull();
  });

  it('delivers per-community member joins using encrypted community credentials and recovers after key rotation', async () => {
    vi.stubEnv('ARX_DB_KEY', 'test-db-encryption-key-for-slice-3');
    const t = convexTest(schema, modules);
    const { communityId, memberId } = await seedCommunityFixture(t);
    const asOwner = t.withIdentity({ subject: 'owner_subject' });

    // Before connecting DE, enqueueCommunityMemberIdentify skips silently.
    const skipped = await t.run(async (ctx) =>
      enqueueCommunityMemberIdentify({
        ctx,
        communityId,
        userId: memberId,
        tracking: { anonymousId: AID, clickId: CID },
        nowMs: 1000,
      }),
    );
    expect(skipped).toEqual({ enqueued: false, reason: 'community_not_connected' });

    // Connect with an initially stale key.
    await asOwner.mutation(apiRefs.distributionAttribution.saveCommunityDistributionConnection, {
      authSubject: 'owner_subject',
      communityId,
      accountId: ACCOUNT_ID_A,
      webhookKey: 'stale_webhook_key_1234567890old1',
    });

    const enqueued = await t.run(async (ctx) => {
      const noScheduleCtx = { db: ctx.db };
      return await enqueueCommunityMemberIdentify({
        ctx: noScheduleCtx,
        communityId,
        userId: memberId,
        tracking: { anonymousId: AID, clickId: CID },
        nowMs: 2000,
      });
    });
    expect(enqueued).toEqual({ enqueued: true, reason: 'community_member_identify_enqueued' });

    const delivery = await t.run(async (ctx) =>
      ctx.db
        .query('distributionAttributionDeliveries')
        .withIndex('by_community_user', (q) => q.eq('communityId', communityId).eq('userId', memberId))
        .unique(),
    );
    expect(delivery?.sourceEventId).toMatch(/^polynet\.community_join\.v1:/);

    // First attempt fails with 401 -> quarantined as needs_attention.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 })),
    );
    await t.action(internalRefs.distributionAttribution.deliverIdentifyInternal, {
      deliveryId: delivery!._id,
    });

    const statsAfterFail = await asOwner.query(
      apiRefs.distributionAttribution.getCommunityDistributionConnection,
      { authSubject: 'owner_subject', communityId },
    );
    expect(statsAfterFail.stats.needs_attention_count).toBe(1);
    expect(statsAfterFail.stats.last_error_code).toBe('distribution_engineer_http_401');

    // Owner rotates to the valid key and retries.
    const rotatedKey = 'valid_webhook_key_1234567890new2';
    await asOwner.mutation(apiRefs.distributionAttribution.saveCommunityDistributionConnection, {
      authSubject: 'owner_subject',
      communityId,
      accountId: ACCOUNT_ID_A,
      webhookKey: rotatedKey,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        source_event_id: delivery!.sourceEventId,
        viewer_id: VIEWER_ID,
        lead_event_id: LEAD_EVENT_ID,
        lead_created: true,
        replayed: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // Reset failed deliveries and execute delivery.
    await t.run(async (ctx) => {
      await ctx.db.patch(delivery!._id, {
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: Date.now(),
      });
    });
    await t.action(internalRefs.distributionAttribution.deliverIdentifyInternal, {
      deliveryId: delivery!._id,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toBe('https://www.distribution.engineer/api/identify');
    expect(calledInit.redirect).toBe('error');
    expect(calledInit.headers.authorization).toBe(`Bearer ${rotatedKey}`);
    const sentBody = JSON.parse(calledInit.body);
    expect(sentBody).toEqual({
      account_id: ACCOUNT_ID_A,
      source_event_id: delivery!.sourceEventId,
      occurred_at: new Date(2000).toISOString(),
      email: 'member@example.com',
      de_aid: AID,
      de_cid: CID,
    });
    // Must not trigger DE's legacy Polynet adapter path.
    expect(sentBody.source_system).toBeUndefined();

    const statsAfterSuccess = await asOwner.query(
      apiRefs.distributionAttribution.getCommunityDistributionConnection,
      { authSubject: 'owner_subject', communityId },
    );
    expect(statsAfterSuccess.stats.delivered_count).toBe(1);
    expect(statsAfterSuccess.stats.needs_attention_count).toBe(0);
  });
});
