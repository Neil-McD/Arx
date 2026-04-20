import { isStandaloneWebApp } from "../../../shared/browserRuntimeMode";

const AUTH_SIGNED_OUT_INTENT_KEY = "arx_cloud_signed_out_v1";
const AUTH_SIGNED_OUT_TAB_INTENT_KEY = "arx_cloud_signed_out_tab_v1";
const AUTH_FLOW_PENDING_KEY = "arx_cloud_auth_flow_pending_v1";
const AUTH_FLOW_RETURNED_KEY = "arx_cloud_auth_flow_returned_v1";
const AUTH_CONTINUITY_HINT_KEY = "arx_cloud_auth_continuity_hint_v1";
const AUTH_AUTO_REAUTH_ATTEMPT_KEY = "arx_cloud_auto_reauth_attempt_v1";
const AUTH_FLOW_PENDING_TTL_MS = 20 * 60 * 1000;
const AUTH_CONTINUITY_HINT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_AUTO_REAUTH_ATTEMPT_TTL_MS = 20 * 60 * 1000;

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getSessionStorageOrNull(): BrowserStorage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

function getLocalStorageOrNull(): BrowserStorage | null {
  try {
    return localStorage;
  } catch {
    // ignore
  }
  return null;
}

function loadAnyStorageItem(keys: readonly string[]): string | null {
  const storages = [getSessionStorageOrNull(), getLocalStorageOrNull()].filter(
    (value): value is BrowserStorage => Boolean(value),
  );
  for (const storage of storages) {
    for (const key of keys) {
      try {
        const raw = storage.getItem(key);
        if (raw) return raw;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function clearCloudSignedOutIntent(): void {
  try {
    sessionStorage.removeItem(AUTH_SIGNED_OUT_TAB_INTENT_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(AUTH_SIGNED_OUT_INTENT_KEY);
  } catch {
    // ignore
  }
}

export function clearAuthSignedOutIntentMarker(): void {
  clearCloudSignedOutIntent();
}

export function markAuthContinuityHint(nowMs = Date.now()): void {
  const createdAt = String(nowMs);
  try {
    sessionStorage.setItem(AUTH_CONTINUITY_HINT_KEY, createdAt);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(AUTH_CONTINUITY_HINT_KEY, createdAt);
  } catch {
    // ignore
  }
}

export function clearAuthContinuityHint(): void {
  try {
    sessionStorage.removeItem(AUTH_CONTINUITY_HINT_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(AUTH_CONTINUITY_HINT_KEY);
  } catch {
    // ignore
  }
}

export function hasRecentAuthContinuityHint(nowMs = Date.now()): boolean {
  const hintedAt = loadAnyStorageItem([AUTH_CONTINUITY_HINT_KEY]);
  if (!hintedAt) return false;
  const createdAtMs = Number(hintedAt.trim());
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  return nowMs - createdAtMs <= AUTH_CONTINUITY_HINT_TTL_MS;
}

function markCloudSignedOutIntent(): void {
  try {
    sessionStorage.setItem(AUTH_SIGNED_OUT_TAB_INTENT_KEY, "1");
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(AUTH_SIGNED_OUT_INTENT_KEY, "1");
  } catch {
    // ignore
  }
}

export function markAuthFlowPending(): void {
  const createdAt = String(Date.now());
  try {
    sessionStorage.setItem(AUTH_FLOW_PENDING_KEY, createdAt);
  } catch {
    // ignore
  }
  if (!isStandaloneWebApp()) return;
  try {
    localStorage.setItem(AUTH_FLOW_PENDING_KEY, createdAt);
  } catch {
    // ignore
  }
}

export function markAuthFlowReturned(): void {
  const createdAt = String(Date.now());
  try {
    sessionStorage.setItem(AUTH_FLOW_RETURNED_KEY, createdAt);
  } catch {
    // ignore
  }
  if (!isStandaloneWebApp()) return;
  try {
    localStorage.setItem(AUTH_FLOW_RETURNED_KEY, createdAt);
  } catch {
    // ignore
  }
}

export function clearAuthFlowPending(): void {
  try {
    sessionStorage.removeItem(AUTH_FLOW_PENDING_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(AUTH_FLOW_PENDING_KEY);
  } catch {
    // ignore
  }
}

export function clearAuthFlowReturned(): void {
  try {
    sessionStorage.removeItem(AUTH_FLOW_RETURNED_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(AUTH_FLOW_RETURNED_KEY);
  } catch {
    // ignore
  }
}

export function markAuthAutomaticReauthAttempt(nowMs = Date.now()): void {
  const createdAt = String(nowMs);
  try {
    sessionStorage.setItem(AUTH_AUTO_REAUTH_ATTEMPT_KEY, createdAt);
  } catch {
    // ignore
  }
}

export function clearAuthAutomaticReauthAttempt(): void {
  try {
    sessionStorage.removeItem(AUTH_AUTO_REAUTH_ATTEMPT_KEY);
  } catch {
    // ignore
  }
}

export function hasRecentAuthAutomaticReauthAttempt(nowMs = Date.now()): boolean {
  const attemptedAt = loadAnyStorageItem([AUTH_AUTO_REAUTH_ATTEMPT_KEY]);
  if (!attemptedAt) return false;
  const createdAtMs = Number(attemptedAt.trim());
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  return nowMs - createdAtMs <= AUTH_AUTO_REAUTH_ATTEMPT_TTL_MS;
}

export function hasRecentAuthFlowPending(nowMs = Date.now()): boolean {
  const pending = loadAnyStorageItem([AUTH_FLOW_PENDING_KEY]);
  if (!pending) return false;
  const createdAtMs = Number(pending.trim());
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  return nowMs - createdAtMs <= AUTH_FLOW_PENDING_TTL_MS;
}

export function hasRecentAuthFlowReturned(nowMs = Date.now()): boolean {
  const returned = loadAnyStorageItem([AUTH_FLOW_RETURNED_KEY]);
  if (!returned) return false;
  const createdAtMs = Number(returned.trim());
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  return nowMs - createdAtMs <= AUTH_FLOW_PENDING_TTL_MS;
}

export function beginBrowserSignedOutState(): void {
  markCloudSignedOutIntent();
  clearAuthFlowPending();
  clearAuthFlowReturned();
}

export { AUTH_SIGNED_OUT_INTENT_KEY, AUTH_SIGNED_OUT_TAB_INTENT_KEY };
