export function hasOAuthCallbackParamsInLocation(): boolean {
  try {
    const url = new URL(window.location.href);
    const oauthKeys = ["code", "error", "error_code", "error_description", "state"];
    return oauthKeys.some((key) => url.searchParams.has(key));
  } catch {
    return false;
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
