const SENSITIVE_ROUTE_SEARCH_PARAM_NAMES = new Set([
  "access_token",
  "app_oauth_finalize_token",
  "claim_token",
  "checkout_session_id",
  "code",
  "id_token",
  "refresh_token",
  "session_id",
  "session_uri",
  "state",
  "token",
]);

function normalizePathname(pathname: unknown): string {
  const value = String(pathname ?? "").trim();
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeSearch(search: unknown): string {
  const value = String(search ?? "").trim();
  if (!value || value === "?") return "";
  return value.startsWith("?") ? value.slice(1) : value;
}

function isSensitiveRouteSearchParam(name: string): boolean {
  return SENSITIVE_ROUTE_SEARCH_PARAM_NAMES.has(name.trim().toLowerCase());
}

export function buildTelemetryRouteLabel(input: {
  pathname?: unknown;
  search?: unknown;
}): string {
  const pathname = normalizePathname(input.pathname);
  const params = new URLSearchParams(normalizeSearch(input.search));
  for (const key of Array.from(params.keys())) {
    if (isSensitiveRouteSearchParam(key)) params.delete(key);
  }
  const nextSearch = params.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export function buildPathWithSearchParamsRemoved(input: {
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
  paramNames: readonly string[];
  dropHash?: boolean;
}): string {
  const pathname = normalizePathname(input.pathname);
  const params = new URLSearchParams(normalizeSearch(input.search));
  const removeNames = new Set(input.paramNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  for (const key of Array.from(params.keys())) {
    if (removeNames.has(key.trim().toLowerCase())) params.delete(key);
  }
  const nextSearch = params.toString();
  const hash = input.dropHash ? "" : String(input.hash ?? "");
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
}
