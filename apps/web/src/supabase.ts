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
  localStorage.removeItem(resolveSessionStorageKey());
  localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
}
