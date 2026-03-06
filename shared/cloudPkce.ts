import { bytesToBase64 } from "./voiceCapture";

const CLOUD_PKCE_STORAGE_KEY = "arx_cloud_pkce_v1";
const CLOUD_PKCE_TTL_MS = 10 * 60 * 1000;

type CloudPkceStateV1 = {
  v: 1;
  code_verifier: string;
  created_at_ms: number;
};

type CloudPkceStateV2 = {
  v: 2;
  code_verifier: string;
  state: string;
  created_at_ms: number;
};

type CloudPkceStateRecord = CloudPkceStateV1 | CloudPkceStateV2;

export type CloudPkceState = {
  codeVerifier: string;
  state: string;
};

function consumeCloudPkceRecord(): CloudPkceStateRecord | null {
  try {
    const raw = localStorage.getItem(CLOUD_PKCE_STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(CLOUD_PKCE_STORAGE_KEY);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const version = Number(record.v);
    if (version !== 1 && version !== 2) return null;
    const createdAtMs = Number(record.created_at_ms);
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return null;
    if (Date.now() - createdAtMs > CLOUD_PKCE_TTL_MS) return null;
    const verifier = typeof record.code_verifier === "string" ? record.code_verifier.trim() : "";
    if (!verifier) return null;
    if (version === 1) {
      return { v: 1, code_verifier: verifier, created_at_ms: createdAtMs };
    }
    const state = typeof record.state === "string" ? record.state.trim() : "";
    if (!state) return null;
    return { v: 2, code_verifier: verifier, state, created_at_ms: createdAtMs };
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

function createRandomBase64Url(size: number): string | null {
  try {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  } catch {
    return null;
  }
}

export function createPkceState(): string | null {
  return createRandomBase64Url(32);
}

export function storeCloudPkceState(state: CloudPkceState): void {
  const codeVerifier = state.codeVerifier.trim();
  const oauthState = state.state.trim();
  if (!codeVerifier || !oauthState) return;
  try {
    const record: CloudPkceStateV2 = {
      v: 2,
      code_verifier: codeVerifier,
      state: oauthState,
      created_at_ms: Date.now(),
    };
    localStorage.setItem(CLOUD_PKCE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore
  }
}

export function consumeCloudPkceState(): CloudPkceState | null {
  const record = consumeCloudPkceRecord();
  if (!record || record.v !== 2) return null;
  return {
    codeVerifier: record.code_verifier,
    state: record.state,
  };
}

export function createPkceVerifier(): string | null {
  return createRandomBase64Url(32);
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
      "state",
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
