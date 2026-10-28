import {
  buildPathWithSearchParamsRemoved,
  buildTelemetryRouteLabel,
} from "../../../shared/routePrivacy";

export const COMMUNITY_RAIL_ORDER_STORAGE_KEY_PREFIX =
  "polynet-community-rail-order:web";
export const WEB_IMAGE_DATA_URL_CHAR_LIMIT = 600_000;

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

