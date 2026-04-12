import {
  beginOAuthSignIn,
  logoutAuthSessionRemote,
} from "./authCore";

export type BeginGoogleSignInResult =
  | { ok: true; authUrl: string }
  | { ok: false; error: string };

export const AUTH_SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again.";

export async function beginGoogleSignIn(): Promise<BeginGoogleSignInResult> {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const authStart = await beginOAuthSignIn({
    provider: "GoogleOAuth",
    returnTo,
  });
  if (!authStart.ok) {
    return { ok: false, error: authStart.error };
  }
  return { ok: true, authUrl: authStart.authUrl };
}

export async function revokeAuthSessionRemote(accessToken: string | null | undefined): Promise<void> {
  const trimmedAccessToken = (accessToken ?? "").trim();

  try {
    // Local scope prevents one browser flow from revoking every active session.
    await logoutAuthSessionRemote({
      accessToken: trimmedAccessToken || null,
      scope: "local",
    });
  } catch {
    // Best-effort remote logout only.
  }
}

type MutableRef<T> = { current: T };

export async function expireAuthSessionFailClosed(params: {
  beginBrowserSignedOutState: () => void | Promise<void>;
  setAuthSession: (value: null) => void;
  sessionRef?: MutableRef<unknown | null>;
  onExpired?: () => void | Promise<void>;
}): Promise<void> {
  await params.beginBrowserSignedOutState();
  params.setAuthSession(null);
  if (params.sessionRef) params.sessionRef.current = null;
  if (params.onExpired) await params.onExpired();
}
