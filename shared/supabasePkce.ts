import { bytesToBase64 } from "./voiceCapture";

export const SUPABASE_PKCE_STORAGE_KEY = "arx_supabase_pkce_v1";
export const SUPABASE_PKCE_TTL_MS = 10 * 60 * 1000;

type SupabasePkceState = {
  v: 1;
  code_verifier: string;
  created_at_ms: number;
};

export function storeSupabasePkceVerifier(codeVerifier: string): void {
  const trimmed = codeVerifier.trim();
  if (!trimmed) return;
  try {
    const record: SupabasePkceState = { v: 1, code_verifier: trimmed, created_at_ms: Date.now() };
    localStorage.setItem(SUPABASE_PKCE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore
  }
}

export function consumeSupabasePkceVerifier(): string | null {
  try {
    const raw = localStorage.getItem(SUPABASE_PKCE_STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(SUPABASE_PKCE_STORAGE_KEY);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1) return null;
    const createdAtMs = Number(record.created_at_ms);
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return null;
    if (Date.now() - createdAtMs > SUPABASE_PKCE_TTL_MS) return null;
    const verifier = typeof record.code_verifier === "string" ? record.code_verifier.trim() : "";
    return verifier || null;
  } catch {
    return null;
  }
}

function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return base64ToBase64Url(bytesToBase64(bytes));
}

export function createPkceVerifier(): string | null {
  try {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  } catch {
    return null;
  }
}

export async function createPkceChallenge(codeVerifier: string): Promise<string | null> {
  try {
    if (!crypto?.subtle) return null;
    const encoded = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return bytesToBase64Url(new Uint8Array(digest));
  } catch {
    return null;
  }
}

export function clearOAuthCallbackParamsFromLocation(): void {
  try {
    const url = new URL(window.location.href);
    const oauthKeys = [
      "code",
      "access_token",
      "refresh_token",
      "expires_in",
      "token_type",
      "provider_token",
      "provider_refresh_token",
      "error",
      "error_code",
      "error_description",
    ];
    for (const key of oauthKeys) url.searchParams.delete(key);
    const hash = url.hash.replace(/^#/, "");
    const looksLikeOAuthHash =
      hash.startsWith("access_token=") ||
      hash.includes("refresh_token=") ||
      hash.startsWith("error=") ||
      hash.includes("error_description=") ||
      hash.includes("expires_in=");
    if (looksLikeOAuthHash) url.hash = "";
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  } catch {
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  }
}
