import { STANDALONE_APP_LAUNCH_SEARCH_PARAM, STANDALONE_APP_LAUNCH_SEARCH_VALUE } from "./webAppRouteState";

export type PublicEntryRoute =
  | { kind: "landing" }
  | { kind: "discover" }
  | { kind: "community_landing"; slug: string };

const BYPASS_QUERY_KEYS = [
  "code",
  "state",
  "error",
  "checkout",
  "intent",
  "billing",
  "billing_checkout",
  "founder_checkout",
  "setup_intent",
  "stripe_connect",
  "connect",
] as const;

function splitNormalizedSegments(pathname: string): string[] {
  return String(pathname ?? "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * Classifies clean public visitor URLs that can paint directly inside the
 * lightweight PublicVisitorShell without downloading the full signed-in Studio
 * app bundle or Studio stylesheet first.
 *
 * Returns null for authenticated app routes, OAuth/Stripe/checkout return URLs,
 * standalone PWA launches, or pending auth flows so those mount App directly.
 */
export function resolvePublicEntryRoute(params: {
  pathname: string;
  search?: string;
  hasRecentAuthFlowPending?: boolean;
}): PublicEntryRoute | null {
  if (params.hasRecentAuthFlowPending) return null;

  const search = String(params.search ?? "").trim();
  if (search) {
    const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    if (query.get(STANDALONE_APP_LAUNCH_SEARCH_PARAM) === STANDALONE_APP_LAUNCH_SEARCH_VALUE) {
      return null;
    }
    for (const key of BYPASS_QUERY_KEYS) {
      if (query.has(key)) return null;
    }
  }

  const segments = splitNormalizedSegments(params.pathname);
  if (segments.length === 0) {
    return { kind: "landing" };
  }
  if (segments.length === 1 && segments[0].toLowerCase() === "discover") {
    return { kind: "discover" };
  }
  if (segments.length === 2 && segments[0].toLowerCase() === "c") {
    let slug = "";
    try {
      slug = decodeURIComponent(segments[1]).trim();
    } catch {
      return null;
    }
    if (slug && slug !== "preview") {
      return { kind: "community_landing", slug };
    }
  }

  return null;
}
