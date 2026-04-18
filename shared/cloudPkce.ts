import { readShellVariantFromPathname, type AppShellVariant } from "./webAppRouteState";

function readOAuthCallbackStateParam(): Record<string, unknown> | null {
  try {
    const url = new URL(window.location.href);
    const rawState = url.searchParams.get("state");
    if (!rawState) return null;
    const parsed = JSON.parse(rawState) as Record<string, unknown> | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function hasOAuthCallbackParamsInLocation(): boolean {
  try {
    const url = new URL(window.location.href);
    const oauthKeys = ["code", "error", "error_code", "error_description", "state"];
    return oauthKeys.some((key) => url.searchParams.has(key));
  } catch {
    return false;
  }
}

export function readOAuthCallbackReturnToFromLocation(): string | null {
  const state = readOAuthCallbackStateParam();
  const returnTo = typeof state?.returnTo === "string" ? state.returnTo.trim() : "";
  if (!returnTo.startsWith("/")) return null;
  try {
    const parsed = new URL(returnTo, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}` || null;
  } catch {
    return null;
  }
}

export function readOAuthCallbackShellVariantFromLocation(): AppShellVariant | null {
  const returnTo = readOAuthCallbackReturnToFromLocation();
  if (!returnTo) return null;
  try {
    const parsed = new URL(returnTo, window.location.origin);
    return readShellVariantFromPathname(parsed.pathname || "/");
  } catch {
    return null;
  }
}

export function clearOAuthCallbackParamsFromLocation(): void {
  try {
    const url = new URL(window.location.href);
    const oauthKeys = ["code", "error", "error_code", "error_description", "state"];
    for (const key of oauthKeys) url.searchParams.delete(key);
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  } catch {
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  }
}
