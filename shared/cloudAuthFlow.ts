import {
  createPkceChallenge,
  createPkceState,
  createPkceVerifier,
  storeCloudPkceState,
} from "./cloudPkce";
import {
  beginCloudOAuthSignInUrl,
  logoutCloudSessionRemote,
  getOAuthRedirectUrl,
} from "./cloudAuthCore";
import { readConvexUrl } from "./convexRuntime";

export type BeginGoogleCloudSignInResult =
  | { ok: true; authUrl: string }
  | { ok: false; error: string };

export const CLOUD_SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again.";

export async function beginGoogleCloudSignIn(): Promise<BeginGoogleCloudSignInResult> {
  const convexUrl = readConvexUrl();
  if (!convexUrl) {
    return { ok: false, error: "Missing Convex URL." };
  }

  const redirectTo = getOAuthRedirectUrl();
  const verifier = createPkceVerifier();
  if (!verifier) {
    return { ok: false, error: "Google sign-in failed: crypto is unavailable on this device." };
  }

  const challenge = await createPkceChallenge(verifier);
  if (!challenge) {
    return { ok: false, error: "Google sign-in failed: could not create PKCE challenge." };
  }
  const state = createPkceState();
  if (!state) {
    return { ok: false, error: "Google sign-in failed: could not create OAuth state." };
  }

  storeCloudPkceState({ codeVerifier: verifier, state });
  const authUrl = await beginCloudOAuthSignInUrl({
    provider: "GoogleOAuth",
    redirectTo,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    state,
  });
  if (!authUrl) {
    return { ok: false, error: "Google sign-in failed: could not create authorize URL." };
  }
  return { ok: true, authUrl };
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
