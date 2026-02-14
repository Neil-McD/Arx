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

const SESSION_STORAGE_KEY = "arx_supabase_session";

export function loadPersistedSupabaseSession(): SupabaseSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupabaseSession;
    if (!parsed?.access_token || !parsed?.refresh_token || !parsed?.expires_at || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistSupabaseSession(session: SupabaseSession) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearPersistedSupabaseSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
