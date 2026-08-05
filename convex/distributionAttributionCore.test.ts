import { describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS,
  distributionAttributionDeliveryKey,
  distributionAttributionRetryDelayMs,
  normalizeDistributionAttributionId,
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
