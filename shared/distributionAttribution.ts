export const DISTRIBUTION_ATTRIBUTION_STORAGE_KEY = 'polynet:distribution-attribution:v1';
export const DISTRIBUTION_ATTRIBUTION_COMMUNITIES_STORAGE_KEY =
  'polynet:distribution-attribution:communities:v1';
export const DISTRIBUTION_ATTRIBUTION_MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1_000;
const MAX_STORED_COMMUNITY_ATTRIBUTIONS = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMUNITY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const COMMUNITY_PATH_RE = /^\/(?:v1\/)?c\/([a-z0-9][a-z0-9-]{0,62})(?:\/|$)/i;

export type DistributionAttributionContext = {
  anonymousId?: string;
  clickId?: string;
};

type PersistedAttributionRecord = DistributionAttributionContext & {
  capturedAt: number;
  communitySlug?: string;
};

function uuid(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return UUID_RE.test(normalized) ? normalized.toLowerCase() : undefined;
}

function normalizeCommunitySlug(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  return COMMUNITY_SLUG_RE.test(normalized) ? normalized : undefined;
}

export function extractCommunitySlugFromPathname(pathname: string): string | undefined {
  const match = COMMUNITY_PATH_RE.exec(String(pathname ?? '').trim());
  return match ? normalizeCommunitySlug(match[1]) : undefined;
}

export function parseDistributionAttributionSearch(
  search: string,
): DistributionAttributionContext | null {
  const params = new URLSearchParams(search);
  const anonymousId = uuid(params.get('de_aid'));
  const clickId = uuid(params.get('de_cid'));
  return anonymousId || clickId ? { anonymousId, clickId } : null;
}

function parsePersistedRecord(raw: unknown, nowMs: number): PersistedAttributionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Record<string, unknown>;
  const capturedAt = Number(parsed.capturedAt);
  if (
    !Number.isFinite(capturedAt) ||
    capturedAt <= 0 ||
    nowMs - capturedAt > DISTRIBUTION_ATTRIBUTION_MAX_AGE_MS
  ) {
    return null;
  }
  const anonymousId = uuid(parsed.anonymousId);
  const clickId = uuid(parsed.clickId);
  if (!anonymousId && !clickId) return null;
  const communitySlug = normalizeCommunitySlug(parsed.communitySlug);
  return {
    ...(anonymousId ? { anonymousId } : {}),
    ...(clickId ? { clickId } : {}),
    capturedAt,
    ...(communitySlug ? { communitySlug } : {}),
  };
}

function toPublicContext(record: PersistedAttributionRecord | null): DistributionAttributionContext | null {
  if (!record) return null;
  const { anonymousId, clickId } = record;
  return anonymousId || clickId ? { anonymousId, clickId } : null;
}

function readPersistedCommunityMap(nowMs: number): Record<string, PersistedAttributionRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(DISTRIBUTION_ATTRIBUTION_COMMUNITIES_STORAGE_KEY) ?? '{}',
    );
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, PersistedAttributionRecord> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const slug = normalizeCommunitySlug(key);
      if (!slug) continue;
      const record = parsePersistedRecord(value, nowMs);
      if (record) out[slug] = record;
    }
    return out;
  } catch {
    return {};
  }
}

function writePersistedCommunityAttribution(
  slug: string,
  incoming: DistributionAttributionContext,
  nowMs: number,
): void {
  if (typeof window === 'undefined') return;
  const map = readPersistedCommunityMap(nowMs);
  map[slug] = { ...incoming, capturedAt: nowMs, communitySlug: slug };
  const entries = Object.entries(map)
    .sort(([, a], [, b]) => b.capturedAt - a.capturedAt)
    .slice(0, MAX_STORED_COMMUNITY_ATTRIBUTIONS);
  window.localStorage.setItem(
    DISTRIBUTION_ATTRIBUTION_COMMUNITIES_STORAGE_KEY,
    JSON.stringify(Object.fromEntries(entries)),
  );
}

function readGlobalRecord(nowMs: number): PersistedAttributionRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = JSON.parse(window.localStorage.getItem(DISTRIBUTION_ATTRIBUTION_STORAGE_KEY) ?? 'null');
    return parsePersistedRecord(raw, nowMs);
  } catch {
    return null;
  }
}

export function readPersistedDistributionAttribution(): DistributionAttributionContext | null {
  return toPublicContext(readGlobalRecord(Date.now()));
}

export function readPersistedDistributionAttributionForCommunity(
  communitySlug: string,
): DistributionAttributionContext | null {
  if (typeof window === 'undefined') return null;
  const slug = normalizeCommunitySlug(communitySlug);
  if (!slug) return null;
  const nowMs = Date.now();
  const currentPathSlug = extractCommunitySlugFromPathname(window.location.pathname);
  if (currentPathSlug === slug) {
    const live = parseDistributionAttributionSearch(window.location.search);
    if (live) return live;
  }
  const byCommunity = readPersistedCommunityMap(nowMs);
  if (byCommunity[slug]) {
    return toPublicContext(byCommunity[slug]!);
  }
  const globalRecord = readGlobalRecord(nowMs);
  if (!globalRecord) return null;
  // Never bleed attribution captured on Community A onto Community B.
  if (globalRecord.communitySlug && globalRecord.communitySlug !== slug) {
    return null;
  }
  return toPublicContext(globalRecord);
}

export function captureDistributionAttributionFromLocation(
  explicitCommunitySlug?: string,
): DistributionAttributionContext | null {
  if (typeof window === 'undefined') return null;
  const nowMs = Date.now();
  const slug =
    normalizeCommunitySlug(explicitCommunitySlug) ??
    extractCommunitySlugFromPathname(window.location.pathname);
  const incoming = parseDistributionAttributionSearch(window.location.search);
  if (!incoming) {
    return slug
      ? readPersistedDistributionAttributionForCommunity(slug)
      : readPersistedDistributionAttribution();
  }
  try {
    if (slug) {
      writePersistedCommunityAttribution(slug, incoming, nowMs);
    }
    window.localStorage.setItem(
      DISTRIBUTION_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        ...incoming,
        capturedAt: nowMs,
        ...(slug ? { communitySlug: slug } : {}),
      }),
    );
  } catch {
    // Attribution must never block the destination experience.
  }
  return incoming;
}
