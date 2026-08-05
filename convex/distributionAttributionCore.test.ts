import { describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS,
  DISTRIBUTION_ATTRIBUTION_SOURCE_EVENT_PREFIX,
  createDistributionAttributionSourceEventId,
  distributionAttributionDeliveryKey,
  distributionAttributionRetryDelayMs,
  normalizeDistributionAttributionId,
  normalizeDistributionAttributionSourceEventId,
  parseDistributionAttributionReceipt,
  shouldRetryDistributionAttribution,
} from './distributionAttributionCore';

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
});
