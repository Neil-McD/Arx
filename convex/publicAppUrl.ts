const PUBLIC_APP_URL_ENV_KEYS = [
  "ARX_PUBLIC_APP_URL",
  "PUBLIC_APP_URL",
  "VITE_PUBLIC_APP_URL",
  "VITE_APP_URL",
] as const;

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

export function readCanonicalPublicAppOrigin(): string {
  for (const key of PUBLIC_APP_URL_ENV_KEYS) {
    const value = readEnv(key).replace(/\/+$/, "");
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed fallback envs; fail below if none are usable.
    }
  }
  throw new Error("public_app_url_missing");
}
