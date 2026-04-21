import { isStandaloneWebApp } from "../../../shared/browserRuntimeMode";

const AUTH_SIGNED_OUT_INTENT_KEY = "arx_cloud_signed_out_v1";
const AUTH_SIGNED_OUT_TAB_INTENT_KEY = "arx_cloud_signed_out_tab_v1";
const AUTH_FLOW_PENDING_KEY = "arx_cloud_auth_flow_pending_v1";
const AUTH_FLOW_PENDING_TTL_MS = 20 * 60 * 1000;

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

export function hasRecentAuthFlowPending(nowMs = Date.now()): boolean {
  const pending = loadAnyStorageItem([AUTH_FLOW_PENDING_KEY]);
  if (!pending) return false;
  const createdAtMs = Number(pending.trim());
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  return nowMs - createdAtMs <= AUTH_FLOW_PENDING_TTL_MS;
}

export function beginBrowserSignedOutState(): void {
  markCloudSignedOutIntent();
  clearAuthFlowPending();
}

export { AUTH_SIGNED_OUT_INTENT_KEY };
