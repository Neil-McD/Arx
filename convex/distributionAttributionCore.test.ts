import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS,
  DISTRIBUTION_ATTRIBUTION_SOURCE_EVENT_PREFIX,
  createCommunityJoinSourceEventId,
  createDistributionAttributionSourceEventId,
  distributionAttributionCommunityDeliveryKey,
  distributionAttributionDeliveryKey,
  distributionAttributionRetryDelayMs,
  distributionAttributionStripeMetadata,
  maskDistributionWebhookKeyHint,
  normalizeDistributionAttributionId,
  normalizeDistributionAttributionSourceEventId,
  parseDistributionAttributionReceipt,
  shouldRetryDistributionAttribution,
} from './distributionAttributionCore';
import {
  DISTRIBUTION_ATTRIBUTION_COMMUNITIES_STORAGE_KEY,
  DISTRIBUTION_ATTRIBUTION_STORAGE_KEY,
  captureDistributionAttributionFromLocation,
  extractCommunitySlugFromPathname,
  readPersistedDistributionAttribution,
  readPersistedDistributionAttributionForCommunity,
} from '../shared/distributionAttribution';

describe('distribution attribution delivery policy', () => {
  it('keeps one deterministic delivery identity per new Polynet user', () => {
    expect(distributionAttributionDeliveryKey('user-1')).toBe('polynet_user_created:user-1');
  });

  it('rejects arbitrary client values at the server boundary', () => {
    expect(normalizeDistributionAttributionId('883C5850-E04D-4C60-9869-024102985541')).toBe(
      '883c5850-e04d-4c60-9869-024102985541',
    );
    expect(normalizeDistributionAttributionId('lead@example.com')).toBeUndefined();
  });

  it('creates opaque source events and accepts only exact typed downstream receipts', () => {
    const sourceEventId = createDistributionAttributionSourceEventId();
    expect(sourceEventId).toMatch(
      /^polynet\.user_created\.v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(normalizeDistributionAttributionSourceEventId(sourceEventId)).toBe(sourceEventId);
    expect(normalizeDistributionAttributionSourceEventId(`${DISTRIBUTION_ATTRIBUTION_SOURCE_EVENT_PREFIX}bad`))
      .toBeUndefined();

    const receipt = {
      ok: true,
      source_event_id: sourceEventId,
      viewer_id: '70711105-1620-426d-938f-9ebf48eaef91',
      lead_event_id: '87be5160-6fb4-4bf8-8cc4-1426bb55cd76',
      lead_created: true,
      replayed: false,
    };
    expect(parseDistributionAttributionReceipt(receipt, sourceEventId)).toEqual({
      ok: true,
      receipt: {
        sourceEventId,
        viewerId: receipt.viewer_id,
        leadEventId: receipt.lead_event_id,
        leadCreated: true,
        replayed: false,
      },
    });
    expect(parseDistributionAttributionReceipt({}, sourceEventId)).toEqual({
      ok: false,
      errorCode: 'distribution_engineer_receipt_not_ok',
    });
    expect(
      parseDistributionAttributionReceipt(
        { ...receipt, source_event_id: createDistributionAttributionSourceEventId() },
        sourceEventId,
      ),
    ).toEqual({
      ok: false,
      errorCode: 'distribution_engineer_receipt_source_event_mismatch',
    });
    expect(parseDistributionAttributionReceipt({ ...receipt, replayed: true }, sourceEventId)).toEqual({
      ok: false,
      errorCode: 'distribution_engineer_receipt_replay_invalid',
    });
  });

  it('retries only transient failures with a bounded backoff', () => {
    expect(DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS).toBe(5);
    expect(shouldRetryDistributionAttribution(null)).toBe(true);
    expect(shouldRetryDistributionAttribution(429)).toBe(true);
    expect(shouldRetryDistributionAttribution(503)).toBe(true);
    expect(shouldRetryDistributionAttribution(400)).toBe(false);
    expect(shouldRetryDistributionAttribution(401)).toBe(false);
    expect(distributionAttributionRetryDelayMs(1)).toBe(60_000);
    expect(distributionAttributionRetryDelayMs(5)).toBe(2 * 60 * 60_000);
  });

  it('supports per-community join event ids, stripe metadata formatting, and safe key masking', () => {
    const communityEventId = createCommunityJoinSourceEventId();
    expect(communityEventId).toMatch(
      /^polynet\.community_join\.v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(normalizeDistributionAttributionSourceEventId(communityEventId)).toBe(communityEventId);
    expect(distributionAttributionCommunityDeliveryKey('comm-1', 'user-1')).toBe(
      'polynet_community_join:comm-1:user-1',
    );
    expect(maskDistributionWebhookKeyHint('de_live_secret_1234567890abcd')).toBe('••••abcd');
    expect(
      distributionAttributionStripeMetadata({
        anonymousId: '6df50193-e11a-49cf-91e7-18e09ede226f',
        clickId: 'not-a-uuid',
      }),
    ).toEqual({
      de_aid: '6df50193-e11a-49cf-91e7-18e09ede226f',
    });
  });
});

describe('community-scoped browser distribution attribution capture', () => {
  const AID_A = '6df50193-e11a-49cf-91e7-18e09ede226f';
  const CID_A = '883c5850-e04d-4c60-9869-024102985541';
  const AID_B = '11111111-2222-4333-8444-555555555555';
  const CID_B = '99999999-8888-4777-8666-555555555555';

  function mockBrowserLocation(pathname: string, search = '') {
    const storage = new Map<string, string>();
    const mockWindow = {
      location: { pathname, search },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    };
    (globalThis as any).window = mockWindow;
    return { mockWindow, storage };
  }

  beforeEach(() => {
    delete (globalThis as any).window;
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('extracts community slugs and prevents attribution on Community A from bleeding onto Community B', () => {
    expect(extractCommunitySlugFromPathname('/c/polynet')).toBe('polynet');
    expect(extractCommunitySlugFromPathname('/v1/c/founders-club/chat/general')).toBe(
      'founders-club',
    );
    expect(extractCommunitySlugFromPathname('/discover')).toBeUndefined();

    const { mockWindow, storage } = mockBrowserLocation(
      '/c/community-a',
      `?de_aid=${AID_A}&de_cid=${CID_A}`,
    );
    expect(captureDistributionAttributionFromLocation()).toEqual({
      anonymousId: AID_A,
      clickId: CID_A,
    });
    expect(storage.has(DISTRIBUTION_ATTRIBUTION_COMMUNITIES_STORAGE_KEY)).toBe(true);
    expect(storage.has(DISTRIBUTION_ATTRIBUTION_STORAGE_KEY)).toBe(true);

    // Organic return to Community A preserves attribution.
    mockWindow.location = { pathname: '/c/community-a', search: '' };
    expect(readPersistedDistributionAttributionForCommunity('community-a')).toEqual({
      anonymousId: AID_A,
      clickId: CID_A,
    });

    // Organic visit to Community B never inherits Community A's click.
    mockWindow.location = { pathname: '/c/community-b', search: '' };
    expect(readPersistedDistributionAttributionForCommunity('community-b')).toBeNull();
    expect(readPersistedDistributionAttribution()).toEqual({
      anonymousId: AID_A,
      clickId: CID_A,
    });

    // Separate link for Community B stores independently.
    mockWindow.location = {
      pathname: '/c/community-b',
      search: `?de_aid=${AID_B}&de_cid=${CID_B}`,
    };
    captureDistributionAttributionFromLocation();
    expect(readPersistedDistributionAttributionForCommunity('community-a')).toEqual({
      anonymousId: AID_A,
      clickId: CID_A,
    });
    expect(readPersistedDistributionAttributionForCommunity('community-b')).toEqual({
      anonymousId: AID_B,
      clickId: CID_B,
    });
  });

  it('allows root-level attribution (no community slug) to flow to the community visited next', () => {
    const { mockWindow } = mockBrowserLocation('/', `?de_aid=${AID_A}&de_cid=${CID_A}`);
    captureDistributionAttributionFromLocation();
    mockWindow.location = { pathname: '/c/community-a', search: '' };
    expect(readPersistedDistributionAttributionForCommunity('community-a')).toEqual({
      anonymousId: AID_A,
      clickId: CID_A,
    });
  });
});
