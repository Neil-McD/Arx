import {
  MOBILE_SHELL_PATH_PREFIX,
  parseAppRouteFromPathname,
  stripShellVariantFromPathname,
} from "./webAppRouteState";

const POLYNET_CANONICAL_HOSTS = new Set(["polynet.ai", "www.polynet.ai"]);

const NON_SPA_PATH_PREFIXES = [
  "/api",
  "/runtime",
  "/billing",
  "/login",
  "/logout",
  "/privacy",
  "/terms",
  "/ai",
  "/design-lab",
];

function isNonSpaPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return NON_SPA_PATH_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(`${prefix}/`),
  );
}

function isCommunityJoinPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 2 && segments[0] === "c" && Boolean(segments[1]);
}

function isInAppPolynetPath(strippedPathname: string): boolean {
  if (!strippedPathname || strippedPathname === "/") return false;
  if (isNonSpaPath(strippedPathname)) return false;
  if (isCommunityJoinPath(strippedPathname)) return true;
  const parsed = parseAppRouteFromPathname(strippedPathname);
  if (!parsed) return false;
  return (
    parsed.page === "community" ||
    parsed.page === "discover" ||
    parsed.page === "docs" ||
    parsed.page === "settings" ||
    parsed.page === "onboarding"
  );
}

/**
 * Resolves a link href to an in-app Polynet path if it targets an internal
 * SPA destination (same origin, canonical polynet.ai/www.polynet.ai, or a
 * relative in-app path). Returns null for external URLs and non-SPA routes.
 */
export function resolveInternalPolynetPath(
  rawHref: string | null | undefined,
  options?: {
    currentOrigin?: string | null;
    currentPathname?: string | null;
  },
): string | null {
  const trimmed = String(rawHref ?? "").trim();
  if (!trimmed) return null;

  const currentOrigin =
    options?.currentOrigin !== undefined
      ? options.currentOrigin
      : typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://www.polynet.ai";
  const currentPathname =
    options?.currentPathname !== undefined
      ? options.currentPathname
      : typeof window !== "undefined" && window.location?.pathname
        ? window.location.pathname
        : "/";

  let parsed: URL;
  if (trimmed.startsWith("/")) {
    // Reject protocol-relative URLs like "//evil.com/c/foo".
    if (trimmed.startsWith("//")) return null;
    try {
      parsed = new URL(trimmed, currentOrigin || "https://www.polynet.ai");
    } catch {
      return null;
    }
  } else {
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    const isHttp = parsed.protocol === "https:" || parsed.protocol === "http:";
    if (!isHttp) return null;
    const isSameOrigin = Boolean(currentOrigin && parsed.origin === currentOrigin);
    const isCanonicalHost =
      parsed.protocol === "https:" &&
      POLYNET_CANONICAL_HOSTS.has(parsed.hostname.toLowerCase());
    if (!isSameOrigin && !isCanonicalHost) return null;
  }

  const strippedPathname = stripShellVariantFromPathname(parsed.pathname || "/");
  if (!isInAppPolynetPath(strippedPathname)) return null;

  const isMobileShell = Boolean(
    currentPathname &&
      (currentPathname === MOBILE_SHELL_PATH_PREFIX ||
        currentPathname.startsWith(`${MOBILE_SHELL_PATH_PREFIX}/`)),
  );
  const nextPathname = isMobileShell
    ? `${MOBILE_SHELL_PATH_PREFIX}${strippedPathname}`
    : strippedPathname;

  return `${nextPathname}${parsed.search}${parsed.hash}`;
}

export function isPlainLeftClick(event: {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
}): boolean {
  return (
    !event.defaultPrevented &&
    (event.button ?? 0) === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Navigates inside the Polynet SPA via history.pushState + popstate so
 * shell navigation, detail routes (courses/lessons/threads/members), and
 * the browser Back button stay in sync without opening a new tab.
 */
export function navigateInternalPolynetPath(inAppPath: string): void {
  if (typeof window === "undefined") return;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === inAppPath) return;
  window.history.pushState({}, "", inAppPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
