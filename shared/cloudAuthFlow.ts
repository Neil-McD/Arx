import {
  beginCloudBridgeOAuthSignIn,
  logoutCloudSessionRemote,
} from "./cloudAuthCore";

export type BeginGoogleCloudSignInResult =
  | { ok: true; authUrl: string }
  | { ok: false; error: string };

export const CLOUD_SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again.";

export async function beginGoogleCloudSignIn(): Promise<BeginGoogleCloudSignInResult> {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const authStart = await beginCloudBridgeOAuthSignIn({
    provider: "GoogleOAuth",
    returnTo,
  });
  if (!authStart.ok) {
    return { ok: false, error: authStart.error };
  }
  return { ok: true, authUrl: authStart.authUrl };
}

export async function revokeCloudSessionRemote(accessToken: string | null | undefined): Promise<void> {
  const trimmedAccessToken = (accessToken ?? "").trim();
  if (!trimmedAccessToken) return;

  try {
    // Local scope prevents one browser flow from revoking every active session.
    await logoutCloudSessionRemote({
      accessToken: trimmedAccessToken,
      scope: "local",
    });
  } catch {
    // Best-effort remote logout only.
  }
}

type MutableRef<T> = { current: T };

export async function expireCloudSessionFailClosed(params: {
  clearPersistedCloudSession: () => void | Promise<void>;
  setCloudSession: (value: null) => void;
  sessionRef?: MutableRef<unknown | null>;
  onExpired?: () => void | Promise<void>;
}): Promise<void> {
  await params.clearPersistedCloudSession();
  params.setCloudSession(null);
  if (params.sessionRef) params.sessionRef.current = null;
  if (params.onExpired) await params.onExpired();
}
