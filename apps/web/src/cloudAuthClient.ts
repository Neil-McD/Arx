import {
  beginOAuthSignIn as beginCloudOAuthSignIn,
  bootstrapSession as bootstrapCloudSession,
  completeOAuthCallback as completeCloudOAuthCallback,
  decodeAuthJwtPayload as decodeJwtPayload,
  ensureAuthSessionForAuthenticatedSendResult as ensureCloudSessionForAuthenticatedSendResult,
  ensureAuthSessionForRequestResult as ensureCloudSessionForRequestResult,
  ensureAuthSessionForRequest as ensureCloudSessionForRequest,
  fetchWithAuthShared as fetchWithCloudAuthShared,
  fetchWithPublicShared as fetchWithCloudPublicShared,
  getAuthRedirectUrl as getOAuthRedirectUrl,
  getAuthPublicKey as getCloudAnonKey,
  getAuthUid as getCloudAuthUid,
  getAuthUrl as getCloudUrl,
  isAuthJwtExpired as isCloudJwtExpired,
  isLikelyAuthJwt as isLikelyJwt,
  readAuthError as readCloudError,
  refreshAuthSessionResult as refreshCloudSessionResult,
  refreshAuthSessionWithLockResult as refreshCloudSessionWithLockResult,
  refreshAuthSessionWithLock as refreshCloudSessionWithLock,
  refreshAuthSession as refreshCloudSession,
  sendAuthMagicLinkOtp as sendCloudMagicLinkOtp,
  type AuthSessionEnsureResult as CloudSessionEnsureResult,
  type AuthSession as CloudSession,
  type AuthSessionRefreshResult as CloudSessionRefreshResult,
  type AuthUser as CloudUser,
  type AuthSessionRefreshResultInFlightRef as CloudSessionRefreshResultInFlightRef,
} from "../../../shared/authSessionCore";
import { parseOAuthCallbackFromLocation as parseCloudOAuthCallbackFromLocation } from "../../../shared/authOAuthCallback";

export const CLOUD_SIGNED_OUT_INTENT_KEY = "arx_cloud_signed_out_v1";
export const CLOUD_SIGNED_OUT_TAB_INTENT_KEY = "arx_cloud_signed_out_tab_v1";

const CLOUD_AUTH_FLOW_PENDING_KEY = "arx_cloud_auth_flow_pending_v1";
const AUTH_FLOW_PENDING_TTL_MS = 20 * 60 * 1000;
const CLOUD_SIGNED_OUT_WINDOW_NAME = "arx_signed_out_v1";
const CLOUD_SESSION_STORAGE_KEY_PREFIX = "arx_cloud_session";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">;

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
    return null;
  }
}

function clearAllPersistedCloudSessionKeys(): void {
  const storages = [getSessionStorageOrNull(), getLocalStorageOrNull()].filter((value): value is BrowserStorage =>
    Boolean(value),
  );
  for (const storage of storages) {
    const keysToRemove: string[] = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        if (key === CLOUD_SESSION_STORAGE_KEY_PREFIX || key.startsWith(`${CLOUD_SESSION_STORAGE_KEY_PREFIX}:`)) {
          keysToRemove.push(key);
        }
      }
    } catch {
      // ignore
    }
    for (const key of keysToRemove) {
      try {
        storage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }
}

function loadAnyStorageItem(keys: readonly string[]): string | null {
  const storages = [getSessionStorageOrNull(), getLocalStorageOrNull()].filter((value): value is BrowserStorage =>
    Boolean(value),
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
    sessionStorage.removeItem(CLOUD_SIGNED_OUT_TAB_INTENT_KEY);
  } catch {
    // ignore
  }
  try {
    if (window.name === CLOUD_SIGNED_OUT_WINDOW_NAME) {
      window.name = "";
    }
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(CLOUD_SIGNED_OUT_INTENT_KEY);
  } catch {
    // ignore
  }
}

function markCloudSignedOutIntent(): void {
  try {
    sessionStorage.setItem(CLOUD_SIGNED_OUT_TAB_INTENT_KEY, "1");
  } catch {
    // ignore
  }
  try {
    window.name = CLOUD_SIGNED_OUT_WINDOW_NAME;
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(CLOUD_SIGNED_OUT_INTENT_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearCloudSignedOutIntentMarker(): void {
  clearCloudSignedOutIntent();
}

export function markCloudAuthFlowPending(): void {
  try {
    sessionStorage.setItem(CLOUD_AUTH_FLOW_PENDING_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function clearCloudAuthFlowPending(): void {
  try {
    sessionStorage.removeItem(CLOUD_AUTH_FLOW_PENDING_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(CLOUD_AUTH_FLOW_PENDING_KEY);
  } catch {
    // ignore
  }
}

export function hasRecentCloudAuthFlowPending(nowMs = Date.now()): boolean {
  const pending = loadAnyStorageItem([CLOUD_AUTH_FLOW_PENDING_KEY]);
  if (!pending) return false;
  const createdAtMs = Number(pending.trim());
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  return nowMs - createdAtMs <= AUTH_FLOW_PENDING_TTL_MS;
}

export function clearPersistedCloudSession(): void {
  markCloudSignedOutIntent();
  clearCloudAuthFlowPending();
  clearAllPersistedCloudSessionKeys();
}

export type CloudAuthSession = CloudSession;
export type CloudAuthUser = CloudUser;
export type CloudAuthSessionRefreshResult = CloudSessionRefreshResult;
export type CloudAuthSessionEnsureResult = CloudSessionEnsureResult;

export const decodeCloudJwtPayload = decodeJwtPayload;
export const getCloudPublishableKey = getCloudAnonKey;
export const getCloudRuntimeBaseUrl = getCloudUrl;

export type { CloudSession, CloudUser };
export {
  beginCloudOAuthSignIn,
  bootstrapCloudSession,
  completeCloudOAuthCallback,
  decodeJwtPayload,
  ensureCloudSessionForAuthenticatedSendResult,
  ensureCloudSessionForRequestResult,
  ensureCloudSessionForRequest,
  fetchWithCloudAuthShared,
  fetchWithCloudPublicShared,
  getOAuthRedirectUrl,
  getCloudAnonKey,
  getCloudAuthUid,
  getCloudUrl,
  isLikelyJwt,
  isCloudJwtExpired,
  readCloudError,
  refreshCloudSessionResult,
  refreshCloudSessionWithLockResult,
  refreshCloudSessionWithLock,
  refreshCloudSession,
  sendCloudMagicLinkOtp,
  parseCloudOAuthCallbackFromLocation,
};
