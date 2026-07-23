import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
} from "./convexAuthenticatedClient";

const BUSINESS_VISITOR_KEY = "polynet-business-visitor-key";

type BusinessVisitPathKind = "home" | "community_funnel";
type BusinessVisitSource = "direct" | "search" | "social" | "referral" | "unknown";

const SEARCH_REFERRER_HOSTS = [
  "google.",
  "bing.",
  "duckduckgo.",
  "yahoo.",
  "brave.",
  "perplexity.",
];
const SOCIAL_REFERRER_HOSTS = [
  "x.com",
  "twitter.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "reddit.com",
];

export function getBusinessVisitorKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(BUSINESS_VISITOR_KEY);
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(BUSINESS_VISITOR_KEY, next);
    return next;
  } catch {
    return null;
  }
}

function resolveBusinessVisitSource(): BusinessVisitSource {
  if (typeof document === "undefined") return "unknown";
  const referrer = document.referrer.trim();
  if (!referrer) return "direct";
  try {
    const parsed = new URL(referrer);
    const currentHost = typeof window === "undefined" ? "" : window.location.hostname;
    const referrerHost = parsed.hostname.toLowerCase();
    if (currentHost && referrerHost === currentHost.toLowerCase()) return "direct";
    if (SEARCH_REFERRER_HOSTS.some((host) => referrerHost.includes(host))) return "search";
    if (SOCIAL_REFERRER_HOSTS.some((host) => referrerHost === host || referrerHost.endsWith(`.${host}`))) {
      return "social";
    }
    return "referral";
  } catch {
    return "unknown";
  }
}

export async function recordCloudBusinessPageVisit(params: {
  pathKind: BusinessVisitPathKind;
  communitySlug?: string | null;
}): Promise<void> {
  const client = createConvexClient();
  const visitorKey = getBusinessVisitorKey();
  await client.mutation("businessAnalytics:recordBusinessPageVisit" as any, {
    pathKind: params.pathKind,
    communitySlug: params.communitySlug ?? undefined,
    visitorKey: visitorKey ?? undefined,
    source: resolveBusinessVisitSource(),
  });
}

export async function identifyCloudBusinessVisitor<SessionT>(params: {
  session: SessionT;
}): Promise<void> {
  const visitorKey = getBusinessVisitorKey();
  if (!visitorKey) return;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("businessAnalytics:identifyBusinessVisitor" as any, {
    visitorKey,
    authSubject,
  });
}
