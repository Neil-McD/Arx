import {
  buildPathWithSearchParamsRemoved,
  buildTelemetryRouteLabel,
} from "../../../shared/routePrivacy";

export const COMMUNITY_RAIL_ORDER_STORAGE_KEY_PREFIX =
  "polynet-community-rail-order:web";
export const WEB_IMAGE_DATA_URL_CHAR_LIMIT = 600_000;

export function isTransportRefreshError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "failed to fetch"
    || normalized.includes("failed to fetch")
    || normalized.includes("networkerror")
    || normalized.includes("network error")
    || normalized.includes("load failed")
    || normalized.includes("fetch failed")
  );
}

export function readFirstLocalStorageValue(
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value !== null) return value;
  }
  return null;
}

export function buildCurrentTelemetryPathname(): string | null {
  if (typeof window === "undefined") return null;
  return buildTelemetryRouteLabel({
    pathname: window.location.pathname,
    search: window.location.search,
  });
}

export function scrubCurrentRouteSearchParams(
  paramNames: readonly string[],
): void {
  if (typeof window === "undefined") return;
  const currentPath =
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const nextPath = buildPathWithSearchParamsRemoved({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    paramNames,
    dropHash: true,
  });
  if (nextPath === currentPath) return;
  window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
}

const SOURCE_INTEGRATION_OAUTH_FINALIZE_SESSION_GUARD_PREFIX =
  "source_integration_oauth_finalize:";
const SOURCE_INTEGRATION_OAUTH_FINALIZE_SESSION_GUARD_TTL_MS = 2 * 60_000;

export function buildSourceIntegrationOAuthFinalizeSessionGuardKey(
  state: string,
  finalizeToken: string,
): string {
  return `${SOURCE_INTEGRATION_OAUTH_FINALIZE_SESSION_GUARD_PREFIX}${state}:${finalizeToken}`;
}

export function claimSourceIntegrationOAuthFinalizeSessionGuard(
  key: string,
): boolean {
  try {
    const existing = Number(window.sessionStorage.getItem(key) ?? "");
    const now = Date.now();
    if (
      Number.isFinite(existing)
      && existing > now - SOURCE_INTEGRATION_OAUTH_FINALIZE_SESSION_GUARD_TTL_MS
    ) {
      return false;
    }
    window.sessionStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}

export function clearSourceIntegrationOAuthFinalizeSessionGuard(
  key: string,
): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // The backend finalizer is idempotent even when storage is unavailable.
  }
}
