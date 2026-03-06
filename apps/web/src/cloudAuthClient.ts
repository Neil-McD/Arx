import {
  decodeAuthJwtPayload as decodeJwtPayload,
  ensureAuthSessionForRequest as ensureCloudSessionForRequest,
  exchangeOAuthPkceCodeForSession as exchangeCloudPkceCodeForSession,
  fetchWithAuthShared as fetchWithCloudAuthShared,
  fetchWithPublicShared as fetchWithCloudPublicShared,
  fetchAuthUser as fetchCloudUser,
  getAuthRedirectUrl as getOAuthRedirectUrl,
  getAuthPublicKey as getCloudAnonKey,
  getAuthUid as getCloudAuthUid,
  getAuthUrl as getCloudUrl,
  isLikelyAuthJwt as isLikelyJwt,
  isAuthJwtExpired as isCloudJwtExpired,
  readAuthError as readCloudError,
  refreshAuthSessionWithLock as refreshCloudSessionWithLock,
  refreshAuthSession as refreshCloudSession,
  sendAuthMagicLinkOtp as sendCloudMagicLinkOtp,
  type AuthSession as CloudSession,
  type AuthUser as CloudUser,
} from "../../../shared/authSessionCore";
import { parseOAuthCallbackFromLocation as parseCloudOAuthCallbackFromLocation } from "../../../shared/authOAuthCallback";

const CLOUD_SESSION_STORAGE_KEY = "arx_cloud_session";

export const CLOUD_SIGNED_OUT_INTENT_KEY = "arx_cloud_signed_out_v1";
export const CLOUD_SIGNED_OUT_TAB_INTENT_KEY = "arx_cloud_signed_out_tab_v1";

const CLOUD_AUTH_FLOW_PENDING_KEY = "arx_cloud_auth_flow_pending_v1";
const AUTH_FLOW_PENDING_TTL_MS = 20 * 60 * 1000;

const CLOUD_SIGNED_OUT_WINDOW_NAME = "arx_signed_out_v1";

function resolveCloudProjectRef(): string | null {
  const url = (getCloudUrl() ?? "").trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = (parsed.hostname ?? "").trim().toLowerCase();
    if (!host) return null;
    const [projectRef] = host.split(".");
    return projectRef?.trim() || null;
  } catch {
    return null;
  }
}

function resolveCloudIssuerHost(): string | null {
  const issuer = String(import.meta.env.VITE_AUTH_JWT_ISSUER ?? "").trim();
  const url = issuer;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = (parsed.hostname ?? "").trim().toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function isWorkOsAuthKitHost(host: string | null): boolean {
  const normalized = String(host ?? "").trim().toLowerCase();
  return normalized.endsWith(".authkit.app") || normalized === "authkit.app";
}

function sessionIssuerMatchesConfiguredHost(iss: string, issuerHost: string | null): boolean {
  const normalizedIss = iss.trim().toLowerCase();
  const normalizedHost = String(issuerHost ?? "").trim().toLowerCase();
  if (!normalizedIss || !normalizedHost) return true;
  if (normalizedIss.includes(normalizedHost)) return true;
  if (isWorkOsAuthKitHost(normalizedHost) && normalizedIss.startsWith("https://api.workos.com/")) {
    return true;
  }
  return false;
}

function scopedStorageKey(baseKey: string): string {
  const projectRef = resolveCloudProjectRef();
  return projectRef ? `${baseKey}:${projectRef}` : baseKey;
}

function loadAnyStorageItem(keys: readonly string[]): string | null {
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return raw;
    } catch {
      // ignore
    }
  }
  return null;
}

function hasCloudSignedOutIntent(): boolean {
  try {
    if (sessionStorage.getItem(CLOUD_SIGNED_OUT_TAB_INTENT_KEY) === "1") return true;
  } catch {
    // ignore
  }

  try {
    if (window.name === CLOUD_SIGNED_OUT_WINDOW_NAME) return true;
  } catch {
    // ignore
  }

  try {
    return localStorage.getItem(CLOUD_SIGNED_OUT_INTENT_KEY) === "1";
  } catch {
    return false;
  }
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

function clearAllPersistedCloudSessionKeys(): void {
  const keysToRemove: string[] = [];
  const prefixes = [CLOUD_SESSION_STORAGE_KEY];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}:`))) {
        keysToRemove.push(key);
      }
    }
  } catch {
    // ignore
  }

  for (const key of keysToRemove) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

function sessionMatchesConfiguredProject(session: CloudSession): boolean {
  const projectRef = resolveCloudProjectRef();
  if (!projectRef) return true;

  const payload = decodeJwtPayload(session.access_token);
  if (!payload || typeof payload !== "object") return false;

  const ref = "ref" in payload && typeof (payload as Record<string, unknown>).ref === "string"
    ? String((payload as Record<string, unknown>).ref).trim().toLowerCase()
    : "";
  if (ref && ref !== projectRef) return false;

  const iss = "iss" in payload && typeof (payload as Record<string, unknown>).iss === "string"
    ? String((payload as Record<string, unknown>).iss).trim().toLowerCase()
    : "";
  const issuerHost = resolveCloudIssuerHost();
  if (!sessionIssuerMatchesConfiguredHost(iss, issuerHost)) return false;

  return true;
}

function parsePersistedSession(raw: string): CloudSession | null {
  try {
    const parsed = JSON.parse(raw) as CloudSession;
    if (!parsed?.access_token || !parsed?.refresh_token || !parsed?.expires_at || !parsed?.user?.id) {
      return null;
    }
    if (!sessionMatchesConfiguredProject(parsed)) return null;
    const payload = decodeJwtPayload(parsed.access_token);
    const tokenEmail =
      payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).email === "string"
        ? String((payload as Record<string, unknown>).email).trim()
        : "";
    const tokenDisplayName =
      payload && typeof payload === "object"
        ? (() => {
            const record = payload as Record<string, unknown>;
            const direct =
              typeof record.name === "string"
                ? record.name.trim()
                : typeof record.display_name === "string"
                  ? record.display_name.trim()
                  : "";
            if (direct) return direct;
            const first =
              typeof record.given_name === "string"
                ? record.given_name.trim()
                : typeof record.first_name === "string"
                  ? record.first_name.trim()
                  : "";
            const last =
              typeof record.family_name === "string"
                ? record.family_name.trim()
                : typeof record.last_name === "string"
                  ? record.last_name.trim()
                  : "";
            return [first, last].filter(Boolean).join(" ").trim();
          })()
        : "";
    const tokenAvatarUrl =
      payload && typeof payload === "object"
        ? (() => {
            const record = payload as Record<string, unknown>;
            if (typeof record.picture === "string" && record.picture.trim()) return record.picture.trim();
            if (typeof record.picture_url === "string" && record.picture_url.trim()) return record.picture_url.trim();
            if (typeof record.profile_picture_url === "string" && record.profile_picture_url.trim()) {
              return record.profile_picture_url.trim();
            }
            return "";
          })()
        : "";
    parsed.user = {
      ...parsed.user,
      ...(parsed.user.email || !tokenEmail ? null : { email: tokenEmail }),
      ...(parsed.user.displayName || !tokenDisplayName ? null : { displayName: tokenDisplayName }),
      ...(parsed.user.avatarUrl || !tokenAvatarUrl ? null : { avatarUrl: tokenAvatarUrl }),
    };
    return parsed;
  } catch {
    return null;
  }
}

export function clearCloudSignedOutIntentMarker(): void {
  clearCloudSignedOutIntent();
}

export function markCloudAuthFlowPending(): void {
  try {
    localStorage.setItem(CLOUD_AUTH_FLOW_PENDING_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function clearCloudAuthFlowPending(): void {
  try {
    localStorage.removeItem(CLOUD_AUTH_FLOW_PENDING_KEY);
  } catch {
    // ignore
  }
}

export function hasRecentCloudAuthFlowPending(nowMs = Date.now()): boolean {
  const raw = loadAnyStorageItem([CLOUD_AUTH_FLOW_PENDING_KEY]);
  if (!raw) return false;

  const createdAtMs = Number(raw.trim());
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  return nowMs - createdAtMs <= AUTH_FLOW_PENDING_TTL_MS;
}

export function loadPersistedCloudSession(): CloudSession | null {
  if (hasCloudSignedOutIntent()) return null;

  const cloudScopedKey = scopedStorageKey(CLOUD_SESSION_STORAGE_KEY);
  const raw = loadAnyStorageItem([
    cloudScopedKey,
    CLOUD_SESSION_STORAGE_KEY,
  ]);
  if (!raw) return null;

  const parsed = parsePersistedSession(raw);
  if (!parsed) {
    clearAllPersistedCloudSessionKeys();
    return null;
  }

  try {
    localStorage.setItem(cloudScopedKey, JSON.stringify(parsed));
    localStorage.removeItem(CLOUD_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }

  return parsed;
}

export function persistCloudSession(session: CloudSession): void {
  try {
    localStorage.setItem(scopedStorageKey(CLOUD_SESSION_STORAGE_KEY), JSON.stringify(session));
    localStorage.removeItem(CLOUD_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function clearPersistedCloudSession(): void {
  markCloudSignedOutIntent();
  clearCloudAuthFlowPending();
  clearAllPersistedCloudSessionKeys();
}

export type CloudAuthSession = CloudSession;
export type CloudAuthUser = CloudUser;

export const decodeCloudJwtPayload = decodeJwtPayload;
export const getCloudPublishableKey = getCloudAnonKey;
export const getCloudRuntimeBaseUrl = getCloudUrl;
export const CLOUD_SESSION_STORAGE_KEY_PREFIX = CLOUD_SESSION_STORAGE_KEY;

export type { CloudSession, CloudUser };
export {
  decodeJwtPayload,
  ensureCloudSessionForRequest,
  exchangeCloudPkceCodeForSession,
  fetchWithCloudAuthShared,
  fetchWithCloudPublicShared,
  fetchCloudUser,
  getOAuthRedirectUrl,
  getCloudAnonKey,
  getCloudAuthUid,
  getCloudUrl,
  isLikelyJwt,
  isCloudJwtExpired,
  readCloudError,
  refreshCloudSessionWithLock,
  refreshCloudSession,
  sendCloudMagicLinkOtp,
  parseCloudOAuthCallbackFromLocation,
};
