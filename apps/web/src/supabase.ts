import {
  decodeJwtPayload,
  ensureSupabaseSessionForRequest,
  exchangeSupabasePkceCodeForSession,
  fetchWithSupabaseAuthShared,
  fetchWithSupabasePublicShared,
  fetchSupabaseUser,
  getOAuthRedirectUrl,
  getSupabaseAnonKey,
  getSupabaseAuthUid,
  getSupabaseUrl,
  isLikelyJwt,
  isSupabaseJwtExpired,
  readSupabaseError,
  refreshSupabaseSessionWithLock,
  refreshSupabaseSession,
  type SupabaseSession,
  type SupabaseUser,
} from "../../../shared/supabaseAuthCore";
import { parseSupabaseOAuthCallbackFromLocation } from "../../../shared/supabaseOAuthCallback";

export type { SupabaseSession, SupabaseUser };
export {
  decodeJwtPayload,
  ensureSupabaseSessionForRequest,
  exchangeSupabasePkceCodeForSession,
  fetchWithSupabaseAuthShared,
  fetchWithSupabasePublicShared,
  fetchSupabaseUser,
  getOAuthRedirectUrl,
  getSupabaseAnonKey,
  getSupabaseAuthUid,
  getSupabaseUrl,
  isLikelyJwt,
  isSupabaseJwtExpired,
  readSupabaseError,
  refreshSupabaseSessionWithLock,
  refreshSupabaseSession,
  parseSupabaseOAuthCallbackFromLocation,
};

const LEGACY_SESSION_STORAGE_KEY = "arx_supabase_session";
export const SUPABASE_SIGNED_OUT_INTENT_KEY = "arx_supabase_signed_out_v1";
export const SUPABASE_SIGNED_OUT_TAB_INTENT_KEY = "arx_supabase_signed_out_tab_v1";
const SUPABASE_AUTH_FLOW_PENDING_KEY = "arx_supabase_auth_flow_pending_v1";
const SUPABASE_AUTH_FLOW_PENDING_TTL_MS = 20 * 60 * 1000;
const SUPABASE_SIGNED_OUT_WINDOW_NAME = "arx_signed_out_v1";

function hasSupabaseSignedOutIntent(): boolean {
  try {
    if (sessionStorage.getItem(SUPABASE_SIGNED_OUT_TAB_INTENT_KEY) === "1") return true;
  } catch {
    // ignore
  }
  try {
    if (window.name === SUPABASE_SIGNED_OUT_WINDOW_NAME) return true;
  } catch {
    // ignore
  }
  try {
    return localStorage.getItem(SUPABASE_SIGNED_OUT_INTENT_KEY) === "1";
  } catch {
    return false;
  }
}

function clearSupabaseSignedOutIntent(): void {
  try {
    sessionStorage.removeItem(SUPABASE_SIGNED_OUT_TAB_INTENT_KEY);
  } catch {
    // ignore
  }
  try {
    if (window.name === SUPABASE_SIGNED_OUT_WINDOW_NAME) {
      window.name = "";
    }
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(SUPABASE_SIGNED_OUT_INTENT_KEY);
  } catch {
    // ignore
  }
}

export function clearSupabaseSignedOutIntentMarker(): void {
  clearSupabaseSignedOutIntent();
}

function markSupabaseSignedOutIntent(): void {
  try {
    sessionStorage.setItem(SUPABASE_SIGNED_OUT_TAB_INTENT_KEY, "1");
  } catch {
    // ignore
  }
  try {
    window.name = SUPABASE_SIGNED_OUT_WINDOW_NAME;
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(SUPABASE_SIGNED_OUT_INTENT_KEY, "1");
  } catch {
    // ignore
  }
}

export function markSupabaseAuthFlowPending(): void {
  try {
    localStorage.setItem(SUPABASE_AUTH_FLOW_PENDING_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function clearSupabaseAuthFlowPending(): void {
  try {
    localStorage.removeItem(SUPABASE_AUTH_FLOW_PENDING_KEY);
  } catch {
    // ignore
  }
}

export function hasRecentSupabaseAuthFlowPending(nowMs = Date.now()): boolean {
  try {
    const raw = (localStorage.getItem(SUPABASE_AUTH_FLOW_PENDING_KEY) ?? "").trim();
    if (!raw) return false;
    const createdAtMs = Number(raw);
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
    return nowMs - createdAtMs <= SUPABASE_AUTH_FLOW_PENDING_TTL_MS;
  } catch {
    return false;
  }
}

function resolveSupabaseProjectRef(): string | null {
  const url = (getSupabaseUrl() ?? "").trim();
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

function resolveSessionStorageKey(): string {
  const projectRef = resolveSupabaseProjectRef();
  return projectRef ? `${LEGACY_SESSION_STORAGE_KEY}:${projectRef}` : LEGACY_SESSION_STORAGE_KEY;
}

function clearAllPersistedSupabaseSessionKeys(): void {
  const keysToRemove: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (key === LEGACY_SESSION_STORAGE_KEY || key.startsWith(`${LEGACY_SESSION_STORAGE_KEY}:`)) {
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

function sessionMatchesConfiguredProject(session: SupabaseSession): boolean {
  const projectRef = resolveSupabaseProjectRef();
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
  if (iss && !iss.includes(`${projectRef}.supabase.co`)) return false;
  return true;
}

export function loadPersistedSupabaseSession(): SupabaseSession | null {
  if (hasSupabaseSignedOutIntent()) return null;
  const scopedKey = resolveSessionStorageKey();
  try {
    let raw = localStorage.getItem(scopedKey);
    let loadedFromLegacy = false;
    if (!raw) {
      raw = localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
      loadedFromLegacy = Boolean(raw);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupabaseSession;
    if (!parsed?.access_token || !parsed?.refresh_token || !parsed?.expires_at || !parsed?.user?.id) {
      localStorage.removeItem(scopedKey);
      localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      return null;
    }
    if (!sessionMatchesConfiguredProject(parsed)) {
      localStorage.removeItem(scopedKey);
      localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      return null;
    }
    if (loadedFromLegacy && scopedKey !== LEGACY_SESSION_STORAGE_KEY) {
      localStorage.setItem(scopedKey, JSON.stringify(parsed));
      localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    }
    return parsed;
  } catch {
    localStorage.removeItem(scopedKey);
    localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    return null;
  }
}

export function persistSupabaseSession(session: SupabaseSession) {
  localStorage.setItem(resolveSessionStorageKey(), JSON.stringify(session));
  localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
}

export function clearPersistedSupabaseSession() {
  markSupabaseSignedOutIntent();
  clearSupabaseAuthFlowPending();
  clearAllPersistedSupabaseSessionKeys();
  try {
    localStorage.removeItem(resolveSessionStorageKey());
    localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}
