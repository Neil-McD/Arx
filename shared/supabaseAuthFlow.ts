import {
  createPkceChallenge,
  createPkceVerifier,
  storeSupabasePkceVerifier,
} from "./supabasePkce";
import {
  getOAuthRedirectUrl,
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "./supabaseAuthCore";

export type BeginGoogleSupabaseSignInResult =
  | { ok: true; authUrl: string }
  | { ok: false; error: string };

export const SUPABASE_SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again.";

export async function beginGoogleSupabaseSignIn(): Promise<BeginGoogleSupabaseSignInResult> {
  const url = getSupabaseUrl();
  const apiKey = getSupabaseAnonKey();
  if (!url || !apiKey) {
    return { ok: false, error: "Missing Supabase URL or anon key." };
  }

  const redirectTo = encodeURIComponent(getOAuthRedirectUrl());
  const verifier = createPkceVerifier();
  if (!verifier) {
    return { ok: false, error: "Google sign-in failed: crypto is unavailable on this device." };
  }

  const challenge = await createPkceChallenge(verifier);
  if (!challenge) {
    return { ok: false, error: "Google sign-in failed: could not create PKCE challenge." };
  }

  storeSupabasePkceVerifier(verifier);
  const authUrl = `${url}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}&code_challenge=${encodeURIComponent(
    challenge,
  )}&code_challenge_method=S256`;
  return { ok: true, authUrl };
}

export async function revokeSupabaseSessionRemote(accessToken: string | null | undefined): Promise<void> {
  const trimmedAccessToken = (accessToken ?? "").trim();
  if (!trimmedAccessToken) return;

  const url = getSupabaseUrl();
  const apiKey = getSupabaseAnonKey();
  if (!url || !apiKey) return;

  try {
    // Local scope prevents one surface (web/desktop) from revoking all sessions.
    await fetch(`${url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${trimmedAccessToken}`,
      },
    });
  } catch {
    // Best-effort remote logout only.
  }
}

type MutableRef<T> = { current: T };

export async function expireSupabaseSessionFailClosed(params: {
  clearPersistedSupabaseSession: () => void | Promise<void>;
  setSupabaseSession: (value: null) => void;
  sessionRef?: MutableRef<unknown | null>;
  onExpired?: () => void | Promise<void>;
}): Promise<void> {
  await params.clearPersistedSupabaseSession();
  params.setSupabaseSession(null);
  if (params.sessionRef) params.sessionRef.current = null;
  if (params.onExpired) await params.onExpired();
}
