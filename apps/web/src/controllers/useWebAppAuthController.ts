import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  AUTH_SIGNED_OUT_INTENT_KEY,
  AUTH_SIGNED_OUT_TAB_INTENT_KEY,
  clearAuthFlowPending,
  clearAuthFlowReturned,
  clearAuthSignedOutIntentMarker,
  ensureAuthSessionForAuthenticatedSendResult,
  fetchWithAuthShared,
  fetchWithPublicShared,
  hasRecentAuthFlowReturned,
  hasRecentAuthFlowPending,
  markAuthFlowPending,
  refreshAuthSessionWithLockResult,
  type AuthSession,
  type AuthSessionRefreshResult,
} from "../auth";
import {
  clearAuthResumeState,
  parsePendingAuthIntentInput,
  readAuthResumeState,
  storeAuthResumeState,
} from "../../../../shared/authResumeState";
import { clearOAuthCallbackParamsFromLocation } from "../../../../shared/cloudPkce";
import { buildLoginTrampolinePath } from "../auth/loginTrampoline";
import { isWorkOsLoginRequiredError, useWorkOsRuntime } from "../auth/workosRuntime";
import { useWebAuthSessionLifecycle } from "./useWebAuthSessionLifecycle";

type AsyncVoid = void | Promise<void>;

type UseWebAppAuthControllerParams = {
  onSessionLost: () => AsyncVoid;
  onSessionMissingAfterBootstrap: () => AsyncVoid;
  onSessionReady: (session: AuthSession) => AsyncVoid;
  onSessionFocusReady: (session: AuthSession) => AsyncVoid;
  onDidJustSignIn: () => void;
  onApplyPostAuthPath: (nextPath: string | null) => void;
  onBeforeSignOut?: () => AsyncVoid;
};

type UseWebAppAuthControllerResult = {
  session: AuthSession | null;
  setAuthSession: (value: AuthSession | null) => void;
  setAuthError: Dispatch<SetStateAction<string | null>>;
  sessionRef: MutableRefObject<AuthSession | null>;
  isAuthBootstrapComplete: boolean;
  isAuthResolvingSignedInState: boolean;
  authError: string | null;
  requireSignIn: (intentInput?: unknown) => void;
  handleSignOut: () => Promise<void>;
  ensureUsableAuthSession: (session?: AuthSession | null) => Promise<AuthSession | null>;
  fetchWithAuth: (url: string, init: RequestInit, session: AuthSession) => Promise<Response>;
  fetchWithPublic: (url: string, init?: RequestInit) => Promise<Response>;
  sessionArg: { session: AuthSession | null };
  authenticatedSessionArg: {
    session: AuthSession | null;
    ensureSession: (session?: AuthSession | null) => Promise<AuthSession | null>;
  };
};

function useLatestRef<TValue>(value: TValue): MutableRefObject<TValue> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function readCurrentAuthReturnTo(): string {
  const currentUrl = new URL(window.location.href);
  const search = currentUrl.searchParams.toString();
  return `${currentUrl.pathname}${search ? `?${search}` : ""}${currentUrl.hash}`;
}

function readCurrentPathReturnTo(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function sessionsEqual(
  a: AuthSession | null | undefined,
  b: AuthSession | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.access_token === b.access_token && (a.id_token ?? null) === (b.id_token ?? null);
}

function readAuthCallbackErrorFromLocation(): string | null {
  try {
    const url = new URL(window.location.href);
    const description = String(url.searchParams.get("error_description") ?? "").trim();
    if (description) return description;
    const error = String(url.searchParams.get("error") ?? "").trim();
    return error ? error.replace(/_/g, " ") : null;
  } catch {
    return null;
  }
}

function errorToMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

const AUTH_SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again.";

function shouldPreserveAuthResumeStateOnBootstrapFailure(): boolean {
  return readAuthResumeState()?.intent?.reason === "open_workspace_draft";
}

export function useWebAppAuthController(
  params: UseWebAppAuthControllerParams,
): UseWebAppAuthControllerResult {
  const [session, setAuthSession] = useState<AuthSession | null>(null);
  const [isAuthBootstrapComplete, setIsAuthBootstrapComplete] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSigningOut, setIsAuthSigningOut] = useState(false);

  const sessionRef = useRef<AuthSession | null>(null);
  const refreshResultInFlightRef = useRef<Promise<AuthSessionRefreshResult> | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const didJustSignInRef = useRef(false);
  const authSessionEpochRef = useRef(0);
  const authBootstrapCompleteRef = useRef(false);
  const directBootstrapStateRef = useRef<string>("");
  const workos = useWorkOsRuntime();

  const onSessionLostRef = useLatestRef(params.onSessionLost);
  const onSessionMissingAfterBootstrapRef = useLatestRef(params.onSessionMissingAfterBootstrap);
  const onSessionReadyRef = useLatestRef(params.onSessionReady);
  const onSessionFocusReadyRef = useLatestRef(params.onSessionFocusReady);
  const onDidJustSignInRef = useLatestRef(params.onDidJustSignIn);
  const onApplyPostAuthPathRef = useLatestRef(params.onApplyPostAuthPath);
  const onBeforeSignOutRef = useLatestRef(params.onBeforeSignOut);

  useEffect(() => {
    const callbackError = readAuthCallbackErrorFromLocation();
    if (!callbackError) return;
    setAuthError(callbackError);
    clearAuthFlowPending();
    clearAuthFlowReturned();
    clearOAuthCallbackParamsFromLocation();
  }, []);

  const markAuthBootstrapComplete = useCallback(() => {
    authBootstrapCompleteRef.current = true;
    setIsAuthBootstrapComplete(true);
  }, []);

  useEffect(() => {
    if (workos.isEnabled) return;
    markAuthBootstrapComplete();
  }, [markAuthBootstrapComplete, workos.isEnabled]);

  const clearSessionLocally = useCallback(async (): Promise<void> => {
    sessionRef.current = null;
    setAuthSession(null);
    await onSessionLostRef.current();
  }, [onSessionLostRef]);

  const expireAuthSessionLocally = useCallback(async (): Promise<void> => {
    authSessionEpochRef.current += 1;
    await clearSessionLocally();
  }, [clearSessionLocally]);

  const adoptAuthSession = useCallback((nextSession: AuthSession): void => {
    sessionRef.current = nextSession;
    setAuthSession(nextSession);
  }, []);

  const refreshAuthSessionLockedResult = useCallback(async (): Promise<AuthSessionRefreshResult> => {
    const epochAtRefreshStart = authSessionEpochRef.current;
    return await refreshAuthSessionWithLockResult({
      inFlightRef: refreshResultInFlightRef,
      refreshSession: async () => {
        try {
          const refreshed = await workos.readSession({ forceRefresh: true });
          if (!refreshed) {
            return { status: "terminal_failure", reason: "auth_session_missing" };
          }
          return { status: "refreshed", session: refreshed };
        } catch (error) {
          console.warn("WorkOS session refresh failed", error);
          if (isWorkOsLoginRequiredError(error)) {
            return { status: "terminal_failure", reason: "auth_session_invalid" };
          }
          return {
            status: "transient_failure",
            reason: errorToMessage(error, "workos_refresh_failed"),
          };
        }
      },
      onRefreshed: (refreshed) => {
        if (authSessionEpochRef.current !== epochAtRefreshStart) return;
        setAuthError(null);
        setAuthSession(refreshed);
        sessionRef.current = refreshed;
      },
    });
  }, [workos]);

  const refreshAuthSessionLocked = useCallback(async (): Promise<AuthSession | null> => {
    const refreshed = await refreshAuthSessionLockedResult();
    return refreshed.status === "refreshed" ? refreshed.session : null;
  }, [refreshAuthSessionLockedResult]);

  const ensureUsableAuthSession = useCallback(async (
    currentSession: AuthSession | null | undefined = sessionRef.current ?? session,
  ): Promise<AuthSession | null> => {
    const requestSession = currentSession ?? null;
    if (!requestSession) return null;

    const ensured = await ensureAuthSessionForAuthenticatedSendResult({
      session: requestSession,
      sessionRef,
      refreshLockedResult: refreshAuthSessionLockedResult,
    });
    if (ensured.status === "terminal_failure") {
      await expireAuthSessionLocally();
      return null;
    }
    if (ensured.status !== "ready") {
      return null;
    }
    if (!sessionsEqual(ensured.session, requestSession)) {
      adoptAuthSession(ensured.session);
    }
    return sessionRef.current ?? ensured.session;
  }, [adoptAuthSession, expireAuthSessionLocally, refreshAuthSessionLockedResult, session]);

  const recoverSessionFromWorkOs = useCallback(async (params: {
    phase: string;
    forceRefresh?: boolean;
  }): Promise<AuthSession | null> => {
    try {
      const candidateSession = await workos.readSession({ forceRefresh: params.forceRefresh });
      if (!candidateSession) return null;

      const verifiedSession = await ensureUsableAuthSession(candidateSession);
      if (!verifiedSession) return null;

      adoptAuthSession(verifiedSession);
      setAuthError(null);
      return verifiedSession;
    } catch (error) {
      return null;
    }
  }, [adoptAuthSession, ensureUsableAuthSession, workos]);

  const beginSignInFlow = useCallback(async () => {
    setAuthError(null);
    clearAuthSignedOutIntentMarker();
    clearAuthFlowReturned();
    const returnTo = readCurrentAuthReturnTo();
    const loginPath = buildLoginTrampolinePath(returnTo);
    markAuthFlowPending();
    storeAuthResumeState({ returnTo });
    try {
      let didNavigate = false;
      const fallbackTimer = window.setTimeout(() => {
        if (didNavigate) return;
        didNavigate = true;
        window.location.assign(loginPath);
      }, 1200);
      try {
        const liveSignInUrl = String(
          await workos.getSignInUrl({ state: { returnTo } }),
        ).trim();
        if (!liveSignInUrl) {
          window.clearTimeout(fallbackTimer);
          if (!didNavigate) {
            didNavigate = true;
            window.location.assign(loginPath);
          }
          return;
        }
        window.clearTimeout(fallbackTimer);
        if (!didNavigate) {
          didNavigate = true;
          window.location.assign(liveSignInUrl);
        }
      } catch {
        window.clearTimeout(fallbackTimer);
        if (!didNavigate) {
          didNavigate = true;
          window.location.assign(loginPath);
        }
      }
    } catch (error) {
      setAuthError(errorToMessage(error, "Sign-in failed."));
    }
  }, [workos]);

  const requireSignIn = useCallback((intentInput?: unknown) => {
    setAuthError(null);
    const intent = parsePendingAuthIntentInput(intentInput);
    if (intent && !session) {
      storeAuthResumeState({
        returnTo: readCurrentPathReturnTo(),
        intent,
      });
    }
    if (session) return;
    void (async () => {
      if (workos.user) {
        const recoveredSession = await recoverSessionFromWorkOs({
          phase: "require_sign_in",
          forceRefresh: true,
        });
        if (recoveredSession) {
          clearAuthSignedOutIntentMarker();
          clearAuthFlowPending();
          if (intent) {
            didJustSignInRef.current = true;
          }
          return;
        }
      }
      await beginSignInFlow();
    })();
  }, [beginSignInFlow, recoverSessionFromWorkOs, session, workos]);

  const handleSignOut = useCallback(async (): Promise<void> => {
    clearAuthFlowPending();
    authSessionEpochRef.current += 1;
    setAuthError(null);
    setIsAuthSigningOut(true);
    try {
      await onBeforeSignOutRef.current?.();
      await clearSessionLocally();
    } catch (error) {
      setIsAuthSigningOut(false);
      throw error;
    }
    void workos
      .signOut({ returnTo: window.location.origin })
      .then(() => {})
      .catch((error) => {
        if (!isWorkOsLoginRequiredError(error)) {
          console.warn("WorkOS sign-out failed", error);
        }
      });
  }, [clearSessionLocally, onBeforeSignOutRef, workos]);

  const fetchWithPublic = useCallback(async (url: string, init: RequestInit = {}): Promise<Response> => {
    return await fetchWithPublicShared(url, init);
  }, []);

  const fetchWithAuth = useCallback(async (
    url: string,
    init: RequestInit,
    currentSession: AuthSession,
  ): Promise<Response> => {
    return await fetchWithAuthShared({
      url,
      init,
      session: sessionRef.current ?? currentSession,
      sessionRef,
      refreshLocked: refreshAuthSessionLocked,
      refreshLockedResult: refreshAuthSessionLockedResult,
      onSessionExpired: () => {
        authSessionEpochRef.current += 1;
        return clearSessionLocally();
      },
      sessionExpiredMessage: AUTH_SESSION_EXPIRED_MESSAGE,
    });
  }, [clearSessionLocally, refreshAuthSessionLocked, refreshAuthSessionLockedResult]);

  useWebAuthSessionLifecycle<AuthSession>({
    session,
    sessionRef,
    refreshTimeoutRef,
    refreshLocked: refreshAuthSessionLocked,
    didJustSignInRef,
    onMountOAuthBootstrap: async () => {},
    onDidJustSignIn: () => {
      onDidJustSignInRef.current();
    },
    onSessionAvailable: (currentSession) => {
      markAuthBootstrapComplete();
      void (async () => {
        const usableSession = await ensureUsableAuthSession(currentSession);
        if (!usableSession) return;
        await onSessionReadyRef.current(usableSession);
      })();
    },
    onSessionMissing: () => {
      if (!authBootstrapCompleteRef.current) return;
      markAuthBootstrapComplete();
      void (async () => {
        sessionRef.current = null;
        setAuthSession(null);
        await onSessionMissingAfterBootstrapRef.current();
      })();
    },
    onFocusWithSession: (currentSession) => {
      void (async () => {
        const usableSession = await ensureUsableAuthSession(currentSession);
        if (!usableSession) return;
        await onSessionFocusReadyRef.current(usableSession);
      })();
    },
  });

  useEffect(() => {
    if (!workos.isEnabled) return;
    if (workos.isLoading) return;

    const userId = String(workos.user?.id ?? "").trim() || "signed_out";
    const stateKey = `ready:${userId}`;
    if (directBootstrapStateRef.current === stateKey) return;
    directBootstrapStateRef.current = stateKey;

    let cancelled = false;

    void (async () => {
      let hasSignedOutIntent = false;
      try {
        hasSignedOutIntent =
          sessionStorage.getItem(AUTH_SIGNED_OUT_TAB_INTENT_KEY) === "1" ||
          localStorage.getItem(AUTH_SIGNED_OUT_INTENT_KEY) === "1";
      } catch {
        // ignore
      }

      const hadPendingAuthFlow = hasRecentAuthFlowPending();
      const hadRecentAuthReturn = hasRecentAuthFlowReturned();
      if (hasSignedOutIntent) {
        if (workos.user) {
          clearAuthSignedOutIntentMarker();
        } else {
          if (cancelled) return;
          markAuthBootstrapComplete();
          clearAuthFlowPending();
          clearAuthFlowReturned();
          return;
        }
      }

      const verifiedSession = await recoverSessionFromWorkOs({
        phase: "bootstrap",
      });
      if (cancelled) return;

      if (verifiedSession) {
        markAuthBootstrapComplete();
        clearAuthSignedOutIntentMarker();
        if (hadPendingAuthFlow) {
          didJustSignInRef.current = true;
        }
        adoptAuthSession(verifiedSession);

        if (hadPendingAuthFlow) {
          const authResumeState = readAuthResumeState();
          const pendingReturnTo = String(authResumeState?.return_to ?? "").trim();
          if (!authResumeState?.intent) {
            clearAuthResumeState();
          }
          const nextPath = pendingReturnTo
            ? pendingReturnTo.startsWith("/") || pendingReturnTo.startsWith("#")
              ? pendingReturnTo
              : "/workspace"
            : null;
          onApplyPostAuthPathRef.current(nextPath);
          clearAuthFlowPending();
          clearAuthFlowReturned();
        }
        return;
      }

      if (sessionRef.current) {
        await clearSessionLocally();
        if (cancelled) return;
      }

      markAuthBootstrapComplete();
      if (hadPendingAuthFlow) {
        clearAuthFlowPending();
        clearAuthFlowReturned();
        if (hadRecentAuthReturn) {
          setAuthError("Sign-in completed, but PolyNet could not establish your account session. Please try again.");
          if (!shouldPreserveAuthResumeStateOnBootstrapFailure()) {
            clearAuthResumeState();
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    adoptAuthSession,
    clearSessionLocally,
    markAuthBootstrapComplete,
    onApplyPostAuthPathRef,
    recoverSessionFromWorkOs,
    workos,
  ]);

  useEffect(() => {
    if (!isAuthSigningOut) return;
    if (workos.user) return;
    setIsAuthSigningOut(false);
  }, [isAuthSigningOut, workos.user]);

  useEffect(() => {
    if (!workos.isEnabled || workos.isLoading) return;
    if (!isAuthBootstrapComplete) return;
    if (isAuthSigningOut) return;
    if (session || !workos.user) return;

    let cancelled = false;

    void (async () => {
      const recoveredSession = await recoverSessionFromWorkOs({
        phase: "post_bootstrap",
        forceRefresh: true,
      });
      if (cancelled || !recoveredSession) return;
      clearAuthSignedOutIntentMarker();
      clearAuthFlowPending();
      clearAuthFlowReturned();
      await onSessionReadyRef.current(recoveredSession);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    clearAuthFlowPending,
    isAuthSigningOut,
    isAuthBootstrapComplete,
    onSessionReadyRef,
    recoverSessionFromWorkOs,
    session,
    workos,
  ]);

  const isAuthResolvingSignedInState = useMemo(() => {
    if (!workos.isEnabled) return !isAuthBootstrapComplete;
    if (isAuthSigningOut) return false;
    if (workos.isLoading) return true;
    if (!isAuthBootstrapComplete) return true;
    return !session && Boolean(workos.user);
  }, [isAuthBootstrapComplete, isAuthSigningOut, session, workos.isEnabled, workos.isLoading, workos.user]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const key = String(event.key ?? "").trim();
      if (key !== AUTH_SIGNED_OUT_INTENT_KEY || event.newValue !== "1") return;
      authSessionEpochRef.current += 1;
      void clearSessionLocally();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [clearSessionLocally]);

  const sessionArg = useMemo(() => ({ session }), [session]);
  const authenticatedSessionArg = useMemo(() => ({
    session,
    ensureSession: ensureUsableAuthSession,
  }), [ensureUsableAuthSession, session]);

  return {
    session,
    setAuthSession,
    setAuthError,
    sessionRef,
    isAuthBootstrapComplete,
    isAuthResolvingSignedInState,
    authError,
    requireSignIn,
    handleSignOut,
    ensureUsableAuthSession,
    fetchWithAuth,
    fetchWithPublic,
    sessionArg,
    authenticatedSessionArg,
  };
}
