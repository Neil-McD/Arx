export const DISTRIBUTION_ATTRIBUTION_STORAGE_KEY = 'polynet:distribution-attribution:v1';
export const DISTRIBUTION_ATTRIBUTION_MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DistributionAttributionContext = {
  anonymousId?: string;
  clickId?: string;
};

function uuid(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return UUID_RE.test(normalized) ? normalized.toLowerCase() : undefined;
}

export function parseDistributionAttributionSearch(
  search: string,
): DistributionAttributionContext | null {
  const params = new URLSearchParams(search);
  const anonymousId = uuid(params.get('de_aid'));
  const clickId = uuid(params.get('de_cid'));
  return anonymousId || clickId ? { anonymousId, clickId } : null;
}

export function readPersistedDistributionAttribution(): DistributionAttributionContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISTRIBUTION_ATTRIBUTION_STORAGE_KEY) ?? 'null');
    const capturedAt = Number(parsed?.capturedAt);
    if (
      !Number.isFinite(capturedAt) ||
      capturedAt <= 0 ||
      Date.now() - capturedAt > DISTRIBUTION_ATTRIBUTION_MAX_AGE_MS
    ) {
      return null;
    }
    const anonymousId = uuid(parsed?.anonymousId);
    const clickId = uuid(parsed?.clickId);
    return anonymousId || clickId ? { anonymousId, clickId } : null;
  } catch {
    return null;
  }
}

export function captureDistributionAttributionFromLocation(): DistributionAttributionContext | null {
  if (typeof window === 'undefined') return null;
  const incoming = parseDistributionAttributionSearch(window.location.search);
  if (!incoming) return readPersistedDistributionAttribution();
  try {
    window.localStorage.setItem(
      DISTRIBUTION_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ ...incoming, capturedAt: Date.now() }),
    );
  } catch {
    // Attribution must never block the destination experience.
  }
  return incoming;
}
