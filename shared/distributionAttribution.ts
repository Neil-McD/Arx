export const DISTRIBUTION_ATTRIBUTION_STORAGE_KEY = 'polynet:distribution-attribution:v1';
export const DISTRIBUTION_ATTRIBUTION_COMMUNITIES_STORAGE_KEY =
  'polynet:distribution-attribution:communities:v1';
export const DISTRIBUTION_ATTRIBUTION_MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1_000;
const MAX_STORED_COMMUNITY_ATTRIBUTIONS = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMUNITY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const COMMUNITY_PATH_RE = /^\/(?:v1\/)?c\/([a-z0-9][a-z0-9-]{0,62})(?:\/|$)/i;
const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const IGNORED_REFERRER_EXACT_HOSTS = new Set([
  'polynet.ai',
  'localhost',
  '127.0.0.1',
  'accounts.google.com',
  'appleid.apple.com',
  'checkout.stripe.com',
  'billing.stripe.com',
]);

const IGNORED_REFERRER_SUFFIXES = [
  '.polynet.ai',
  '.clerk.accounts.dev',
  '.accounts.dev',
  '.stripe.com',
];

export type DistributionAttributionContext = {
  anonymousId?: string;
  clickId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  referrerHost?: string;
  referralCode?: string;
};

export type DistributionEngineerIds = {
  anonymousId?: string;
  clickId?: string;
};

type PersistedAttributionRecord = DistributionAttributionContext & {
  capturedAt: number;
  communitySlug?: string;
};

function uuid(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return UUID_RE.test(normalized) ? normalized.toLowerCase() : undefined;
}

function normalizeCommunitySlug(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return COMMUNITY_SLUG_RE.test(normalized) ? normalized : undefined;
}

function normalizeTag(value: unknown, maxLen: number, lowercase = false): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;
  const clipped = cleaned.slice(0, maxLen).trim();
  if (!clipped) return undefined;
  return lowercase ? clipped.toLowerCase() : clipped;
}

export function normalizeReferrerHost(
  rawReferrer: unknown,
  currentOrigin?: string | null,
): string | undefined {
  if (typeof rawReferrer !== 'string') return undefined;
  const trimmed = rawReferrer.trim();
  if (!trimmed) return undefined;
  let host = '';
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (currentOrigin) {
        try {
          if (parsed.origin === new URL(currentOrigin).origin) return undefined;
        } catch {
          // Ignore malformed currentOrigin.
        }
      }
      host = parsed.hostname.toLowerCase();
    } catch {
      return undefined;
    }
  } else {
    host = trimmed.toLowerCase();
  }
  host = host.replace(/^www\./, '');
  if (!host || host.length > 120 || !HOSTNAME_RE.test(host)) return undefined;
  if (IGNORED_REFERRER_EXACT_HOSTS.has(host)) return undefined;
  if (IGNORED_REFERRER_SUFFIXES.some((suffix) => host.endsWith(suffix))) return undefined;
  return host;
}

export function normalizeDistributionAttributionContext(
  raw: Record<string, unknown> | DistributionAttributionContext | null | undefined,
): DistributionAttributionContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const anonymousId = uuid(input.anonymousId);
  const clickId = uuid(input.clickId);
  const utmSource = normalizeTag(input.utmSource, 64, true);
  const utmMedium = normalizeTag(input.utmMedium, 64, true);
  const utmCampaign = normalizeTag(input.utmCampaign, 80);
  const utmContent = normalizeTag(input.utmContent, 80);
  const referrerHost = normalizeReferrerHost(input.referrerHost);
  const referralCode = normalizeTag(input.referralCode, 64);
  if (
    !anonymousId &&
    !clickId &&
    !utmSource &&
    !utmMedium &&
    !utmCampaign &&
    !utmContent &&
    !referrerHost &&
    !referralCode
  ) {
    return null;
  }
  return {
    ...(anonymousId ? { anonymousId } : {}),
    ...(clickId ? { clickId } : {}),
    ...(utmSource ? { utmSource } : {}),
    ...(utmMedium ? { utmMedium } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
    ...(utmContent ? { utmContent } : {}),
    ...(referrerHost ? { referrerHost } : {}),
    ...(referralCode ? { referralCode } : {}),
  };
}

export function extractCommunitySlugFromPathname(pathname: string): string | undefined {
  const match = COMMUNITY_PATH_RE.exec(String(pathname ?? '').trim());
  return match ? normalizeCommunitySlug(match[1]) : undefined;
}

export function parseDistributionAttributionSearch(
  search: string,
  options?: { referrer?: string | null; currentOrigin?: string | null },
): DistributionAttributionContext | null {
  const params = new URLSearchParams(search);
  const anonymousId = uuid(params.get('de_aid'));
  const clickId = uuid(params.get('de_cid'));
  const utmSource = normalizeTag(params.get('utm_source'), 64, true);
  const utmMedium = normalizeTag(params.get('utm_medium'), 64, true);
  const utmCampaign = normalizeTag(params.get('utm_campaign'), 80);
  const utmContent = normalizeTag(params.get('utm_content'), 80);
  const referralCode = normalizeTag(params.get('ref') ?? params.get('via'), 64);
  const referrerHost = normalizeReferrerHost(options?.referrer ?? null, options?.currentOrigin ?? null);
  return normalizeDistributionAttributionContext({
    anonymousId,
    clickId,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    referrerHost,
    referralCode,
  });
}

function hasExplicitSourceParams(ctx: DistributionAttributionContext | null | undefined): boolean {
  if (!ctx) return false;
  return Boolean(
    ctx.anonymousId ||
      ctx.clickId ||
      ctx.utmSource ||
      ctx.utmMedium ||
      ctx.utmCampaign ||
      ctx.utmContent ||
      ctx.referralCode,
  );
}

function mergeAttributionRecords(
  existing: DistributionAttributionContext | null,
  incoming: DistributionAttributionContext,
): DistributionAttributionContext {
  if (!existing) return incoming;
  // Never let a bare referrer-only revisit overwrite explicit DE/campaign/referral attribution.
  if (!hasExplicitSourceParams(incoming) && hasExplicitSourceParams(existing)) {
    return existing;
  }
  const hasIncomingDe = Boolean(incoming.anonymousId || incoming.clickId);
  const hasIncomingCampaign = Boolean(
    incoming.utmSource || incoming.utmMedium || incoming.utmCampaign || incoming.utmContent || incoming.referralCode,
  );
  return {
    ...(hasIncomingDe
      ? {
          ...(incoming.anonymousId ? { anonymousId: incoming.anonymousId } : {}),
          ...(incoming.clickId ? { clickId: incoming.clickId } : {}),
        }
      : {
          ...(existing.anonymousId ? { anonymousId: existing.anonymousId } : {}),
          ...(existing.clickId ? { clickId: existing.clickId } : {}),
        }),
    ...(hasIncomingCampaign
      ? {
          ...(incoming.utmSource ? { utmSource: incoming.utmSource } : {}),
          ...(incoming.utmMedium ? { utmMedium: incoming.utmMedium } : {}),
          ...(incoming.utmCampaign ? { utmCampaign: incoming.utmCampaign } : {}),
          ...(incoming.utmContent ? { utmContent: incoming.utmContent } : {}),
          ...(incoming.referralCode ? { referralCode: incoming.referralCode } : {}),
        }
      : {
          ...(existing.utmSource ? { utmSource: existing.utmSource } : {}),
          ...(existing.utmMedium ? { utmMedium: existing.utmMedium } : {}),
          ...(existing.utmCampaign ? { utmCampaign: existing.utmCampaign } : {}),
          ...(existing.utmContent ? { utmContent: existing.utmContent } : {}),
          ...(existing.referralCode ? { referralCode: existing.referralCode } : {}),
        }),
    ...(incoming.referrerHost
      ? { referrerHost: incoming.referrerHost }
      : existing.referrerHost
        ? { referrerHost: existing.referrerHost }
        : {}),
  };
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
  const normalized = normalizeDistributionAttributionContext(parsed);
  if (!normalized) return null;
  const communitySlug = normalizeCommunitySlug(parsed.communitySlug);
  return {
    ...normalized,
    capturedAt,
    ...(communitySlug ? { communitySlug } : {}),
  };
}

function toPublicContext(record: PersistedAttributionRecord | null): DistributionAttributionContext | null {
  if (!record) return null;
  return normalizeDistributionAttributionContext(record);
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
): DistributionAttributionContext {
  if (typeof window === 'undefined') return incoming;
  const map = readPersistedCommunityMap(nowMs);
  const merged = mergeAttributionRecords(toPublicContext(map[slug] ?? null), incoming);
  map[slug] = { ...merged, capturedAt: nowMs, communitySlug: slug };
  const entries = Object.entries(map)
    .sort(([, a], [, b]) => b.capturedAt - a.capturedAt)
    .slice(0, MAX_STORED_COMMUNITY_ATTRIBUTIONS);
  window.localStorage.setItem(
    DISTRIBUTION_ATTRIBUTION_COMMUNITIES_STORAGE_KEY,
    JSON.stringify(Object.fromEntries(entries)),
  );
  return merged;
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

// Platform signup (convex/auth.ts) only accepts DE UUIDs; keep its shape narrow
// so cached-client compatibility and DE identify remain untouched.
export function readPersistedDistributionAttribution(): DistributionEngineerIds | null {
  const record = readGlobalRecord(Date.now());
  if (!record) return null;
  const { anonymousId, clickId } = record;
  return anonymousId || clickId ? { anonymousId, clickId } : null;
}

export function readPersistedDistributionAttributionForCommunity(
  communitySlug: string,
): DistributionAttributionContext | null {
  if (typeof window === 'undefined') return null;
  const slug = normalizeCommunitySlug(communitySlug);
  if (!slug) return null;
  const nowMs = Date.now();
  const byCommunity = readPersistedCommunityMap(nowMs);
  const storedForCommunity = toPublicContext(byCommunity[slug] ?? null);
  const currentPathSlug = extractCommunitySlugFromPathname(window.location.pathname);
  if (currentPathSlug === slug) {
    const live = parseDistributionAttributionSearch(window.location.search, {
      referrer: typeof document !== 'undefined' ? document.referrer : null,
      currentOrigin: window.location.origin,
    });
    if (live) {
      return mergeAttributionRecords(storedForCommunity, live);
    }
  }
  if (storedForCommunity) {
    return storedForCommunity;
  }
  const globalRecord = readGlobalRecord(nowMs);
  if (!globalRecord) return null;
  // Never bleed attribution captured on Community A onto Community B.
  if (globalRecord.communitySlug && globalRecord.communitySlug !== slug) {
    return null;
  }
  return toPublicContext(globalRecord);
}

// Promote any unscoped global attribution (e.g. captured on /oauth/authorize
// before login/onboarding) into a specific community's storage slot so it
// survives redirects onto /c/<slug>.
export function bindGlobalAttributionToCommunity(
  communitySlug: string,
): DistributionAttributionContext | null {
  if (typeof window === 'undefined') return null;
  const slug = normalizeCommunitySlug(communitySlug);
  if (!slug) return null;
  const nowMs = Date.now();
  const live = parseDistributionAttributionSearch(window.location.search, {
    referrer: typeof document !== 'undefined' ? document.referrer : null,
    currentOrigin: window.location.origin,
  });
  const globalRecord = readGlobalRecord(nowMs);
  const reusableGlobal =
    globalRecord && (!globalRecord.communitySlug || globalRecord.communitySlug === slug)
      ? toPublicContext(globalRecord)
      : null;
  const candidate =
    live && reusableGlobal
      ? mergeAttributionRecords(reusableGlobal, live)
      : live ?? reusableGlobal;
  if (!candidate) {
    return readPersistedDistributionAttributionForCommunity(slug);
  }
  try {
    const bound = writePersistedCommunityAttribution(slug, candidate, nowMs);
    if (reusableGlobal) {
      window.localStorage.setItem(
        DISTRIBUTION_ATTRIBUTION_STORAGE_KEY,
        JSON.stringify({
          ...bound,
          capturedAt: nowMs,
          communitySlug: slug,
        }),
      );
    }
    return bound;
  } catch {
    return candidate;
  }
}

export function captureDistributionAttributionFromLocation(
  explicitCommunitySlug?: string,
): DistributionAttributionContext | null {
  if (typeof window === 'undefined') return null;
  const nowMs = Date.now();
  const slug =
    normalizeCommunitySlug(explicitCommunitySlug) ??
    extractCommunitySlugFromPathname(window.location.pathname);
  const incoming = parseDistributionAttributionSearch(window.location.search, {
    referrer: typeof document !== 'undefined' ? document.referrer : null,
    currentOrigin: window.location.origin,
  });
  if (!incoming) {
    return slug
      ? readPersistedDistributionAttributionForCommunity(slug)
      : toPublicContext(readGlobalRecord(nowMs));
  }
  try {
    let saved = incoming;
    if (slug) {
      saved = writePersistedCommunityAttribution(slug, incoming, nowMs);
    }
    const existingGlobal = readGlobalRecord(nowMs);
    // Never merge a record already scoped to another community into an unscoped
    // arrival (e.g. /oauth/authorize for a different community's app).
    const shouldMergeGlobal = Boolean(
      existingGlobal && (!existingGlobal.communitySlug || existingGlobal.communitySlug === slug),
    );
    const globalNext = shouldMergeGlobal
      ? mergeAttributionRecords(toPublicContext(existingGlobal), incoming)
      : incoming;
    window.localStorage.setItem(
      DISTRIBUTION_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        ...globalNext,
        capturedAt: nowMs,
        ...(slug ? { communitySlug: slug } : {}),
      }),
    );
    return saved;
  } catch {
    // Attribution must never block the destination experience.
  }
  return incoming;
}

export type ResolvedAcquisitionSource = {
  source: string;
  label: string;
  detail: string | null;
  memberRecordLabel: string | null;
};

const KNOWN_UTM_SOURCES: Record<string, { source: string; label: string }> = {
  youtube: { source: 'youtube', label: 'YouTube' },
  yt: { source: 'youtube', label: 'YouTube' },
  'youtu.be': { source: 'youtube', label: 'YouTube' },
  x: { source: 'x', label: 'X' },
  twitter: { source: 'x', label: 'X' },
  't.co': { source: 'x', label: 'X' },
  instagram: { source: 'instagram', label: 'Instagram' },
  ig: { source: 'instagram', label: 'Instagram' },
  linkedin: { source: 'linkedin', label: 'LinkedIn' },
  tiktok: { source: 'tiktok', label: 'TikTok' },
  newsletter: { source: 'newsletter', label: 'Newsletter' },
  email: { source: 'newsletter', label: 'Newsletter' },
  substack: { source: 'substack', label: 'Substack' },
  beehiiv: { source: 'beehiiv', label: 'Beehiiv' },
  podcast: { source: 'podcast', label: 'Podcast' },
  google: { source: 'google', label: 'Google' },
  reddit: { source: 'reddit', label: 'Reddit' },
  github: { source: 'github', label: 'GitHub' },
  hackernews: { source: 'hacker_news', label: 'Hacker News' },
  hn: { source: 'hacker_news', label: 'Hacker News' },
  polynet: { source: 'polynet', label: 'Polynet' },
};

function resolveKnownReferrer(host: string): { source: string; label: string } | null {
  const clean = host.toLowerCase().replace(/^www\./, '');
  if (clean === 'youtube.com' || clean === 'm.youtube.com' || clean === 'youtu.be') {
    return { source: 'youtube', label: 'YouTube' };
  }
  if (clean === 'x.com' || clean === 'twitter.com' || clean === 't.co') {
    return { source: 'x', label: 'X' };
  }
  if (clean === 'instagram.com' || clean === 'l.instagram.com') {
    return { source: 'instagram', label: 'Instagram' };
  }
  if (clean === 'linkedin.com' || clean === 'lnkd.in') {
    return { source: 'linkedin', label: 'LinkedIn' };
  }
  if (clean === 'tiktok.com' || clean === 'm.tiktok.com') {
    return { source: 'tiktok', label: 'TikTok' };
  }
  if (clean === 'google.com' || /^google\.[a-z.]{2,6}$/.test(clean)) {
    return { source: 'google', label: 'Google' };
  }
  if (clean === 'reddit.com' || clean === 'old.reddit.com') {
    return { source: 'reddit', label: 'Reddit' };
  }
  if (clean === 'github.com') {
    return { source: 'github', label: 'GitHub' };
  }
  if (clean === 'news.ycombinator.com') {
    return { source: 'hacker_news', label: 'Hacker News' };
  }
  if (clean === 'substack.com' || clean.endsWith('.substack.com')) {
    return { source: 'substack', label: 'Substack' };
  }
  return null;
}

function titleCaseSource(raw: string): string {
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugifySourceKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function resolveAcquisitionSource(
  input: {
    anonymousId?: string | null;
    clickId?: string | null;
    hasDeDelivery?: boolean;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    referrerHost?: string | null;
    referralCode?: string | null;
  } | null | undefined,
): ResolvedAcquisitionSource {
  const campaign = normalizeTag(input?.utmCampaign, 80) ?? null;
  const referralCode = normalizeTag(input?.referralCode, 64) ?? null;
  if (input?.hasDeDelivery || uuid(input?.anonymousId) || uuid(input?.clickId)) {
    const label = 'Distribution Engineer';
    return {
      source: 'distribution_engineer',
      label,
      detail: campaign,
      memberRecordLabel: campaign ? `${label} · ${campaign}` : label,
    };
  }
  const utmSource = normalizeTag(input?.utmSource, 64, true);
  if (utmSource) {
    const known = KNOWN_UTM_SOURCES[utmSource];
    if (known) {
      return {
        source: known.source,
        label: known.label,
        detail: campaign,
        memberRecordLabel: campaign ? `${known.label} · ${campaign}` : known.label,
      };
    }
    const key = slugifySourceKey(utmSource) || 'campaign';
    const label = titleCaseSource(utmSource);
    return {
      source: `utm:${key}`,
      label,
      detail: campaign,
      memberRecordLabel: campaign ? `${label} · ${campaign}` : label,
    };
  }
  if (referralCode) {
    return {
      source: 'referral',
      label: 'Referral',
      detail: referralCode,
      memberRecordLabel: `Referral · ${referralCode}`,
    };
  }
  const referrerHost = normalizeReferrerHost(input?.referrerHost ?? null);
  if (referrerHost) {
    const known = resolveKnownReferrer(referrerHost);
    if (known) {
      return {
        source: known.source,
        label: known.label,
        detail: null,
        memberRecordLabel: known.label,
      };
    }
    return {
      source: `site:${referrerHost}`,
      label: referrerHost,
      detail: null,
      memberRecordLabel: referrerHost,
    };
  }
  return {
    source: 'direct',
    label: 'Direct & organic',
    detail: null,
    memberRecordLabel: null,
  };
}

// Tag outbound links from Polynet into a community's connected app so the app
// and its analytics can identify Polynet-originated visits without overwriting
// any tracking parameters the founder already configured on the app URL.
export function buildPolynetOutboundAppUrl(
  rawUrl: string,
  communitySlug: string | null | undefined,
): string {
  const slug = normalizeCommunitySlug(communitySlug);
  if (!slug || !rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return rawUrl;
    if (!parsed.searchParams.has('utm_source')) {
      parsed.searchParams.set('utm_source', 'polynet');
    }
    if (!parsed.searchParams.has('utm_medium')) {
      parsed.searchParams.set('utm_medium', 'community');
    }
    if (!parsed.searchParams.has('utm_campaign')) {
      parsed.searchParams.set('utm_campaign', slug);
    }
    if (!parsed.searchParams.has('polynet_community')) {
      parsed.searchParams.set('polynet_community', slug);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}
