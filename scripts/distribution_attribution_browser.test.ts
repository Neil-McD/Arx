import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DISTRIBUTION_ATTRIBUTION_STORAGE_KEY,
  DISTRIBUTION_ATTRIBUTION_MAX_AGE_MS,
  captureDistributionAttributionFromLocation,
  parseDistributionAttributionSearch,
  readPersistedDistributionAttribution,
} from '../shared/distributionAttribution';

const AID = '6df50193-e11a-49cf-91e7-18e09ede226f';
const CID = '883c5850-e04d-4c60-9869-024102985541';

afterEach(() => vi.unstubAllGlobals());

describe('Polynet distribution attribution context', () => {
  it('accepts only opaque UUID correlation identifiers', () => {
    expect(parseDistributionAttributionSearch(`?de_aid=${AID}&de_cid=${CID}`)).toEqual({
      anonymousId: AID,
      clickId: CID,
    });
    expect(parseDistributionAttributionSearch('?de_aid=email@example.com&de_cid=wrong')).toBeNull();
    expect(parseDistributionAttributionSearch('?utm_source=youtube')).toBeNull();
  });

  it('persists valid landing context without blocking the destination', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      location: { search: `?de_aid=${AID}&de_cid=${CID}` },
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    expect(captureDistributionAttributionFromLocation()).toEqual({ anonymousId: AID, clickId: CID });
    expect(values.has(DISTRIBUTION_ATTRIBUTION_STORAGE_KEY)).toBe(true);
    expect(readPersistedDistributionAttribution()).toEqual({ anonymousId: AID, clickId: CID });
  });

  it('does not attribute a new account to stale browser context', () => {
    const values = new Map<string, string>([
      [
        DISTRIBUTION_ATTRIBUTION_STORAGE_KEY,
        JSON.stringify({
          anonymousId: AID,
          clickId: CID,
          capturedAt: Date.now() - DISTRIBUTION_ATTRIBUTION_MAX_AGE_MS - 1,
        }),
      ],
    ]);
    vi.stubGlobal('window', {
      location: { search: '' },
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    expect(readPersistedDistributionAttribution()).toBeNull();
  });
});
