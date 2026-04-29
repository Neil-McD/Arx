import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  AUTH_SIGNED_OUT_INTENT_KEY,
  beginOAuthSignIn,
  bootstrapSessionDetailed,
  clearAuthFlowPending,
  clearAuthSignedOutIntentMarker,
  ensureAuthSessionForAuthenticatedSendResult,
  fetchWithAuthShared,
  fetchWithPublicShared,
  hasRecentAuthFlowPending,
  markAuthFlowPending,
  logoutAuthSessionRemote,
  refreshAuthSessionResult,
  refreshAuthSessionWithLockResult,
  type AuthSession,
  type AuthSessionRefreshResult,
} from "../auth";
import {
  parsePendingAuthIntentInput,
  storeAuthResumeState,
} from "../../../../shared/authResumeState";
import { clearOAuthCallbackParamsFromLocation } from "../../../../shared/cloudPkce";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";
import { useWebAuthSessionLifecycle } from "./useWebAuthSessionLifecycle";

type AsyncVoid = void | Promise<void>;

type UseWebAppAuthControllerParams = {
  onSessionLost: () => AsyncVoid;
  onSessionMissingAfterBootstrap: () => AsyncVoid;
  onSessionReady: (session: AuthSession) => AsyncVoid;
  onSessionFocusReady: (session: AuthSession) => AsyncVoid;
  onDidJustSignIn: () => void;
  onBeforeSignOut?: () => AsyncVoid;
  onAfterSignOut?: () => AsyncVoid;
};

type UseWebAppAuthControllerResult = {
  session: AuthSession | null;
  setAuthSession: (value: AuthSession | null) => void;
  setAuthError: Dispatch<SetStateAction<string | null>>;
  sessionRef: MutableRefObject<AuthSession | null>;
  isAuthBootstrapComplete: boolean;
  isAuthResolvingSignedInState: boolean;
  authPresentationState: "signed_out" | "recovering_signed_in" | "signed_in";
  authError: string | null;
  requireSignIn: (intentInput?: unknown) => void;
  handleSignOut: () => Promise<void>;
  ensureUsableAuthSession: (session?: AuthSession | null, source?: string) => Promise<AuthSession | null>;
  fetchWithAuth: (url: string, init: RequestInit, session: AuthSession) => Promise<Response>;
  fetchWithPublic: (url: string, init?: RequestInit) => Promise<Response>;
  sessionArg: { session: AuthSession | null };
  authenticatedSessionArg: {
    session: AuthSession | null;
    ensureSession: (session?: AuthSession | null, source?: string) => Promise<AuthSession | null>;
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

function sessionsEqual(
  a: AuthSession | null | undefined,
  b: AuthSession | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.access_token === b.access_token && (a.id_token ?? null) === (b.id_token ?? null);
}

function buildAuthSessionCacheKey(session: AuthSession | null | undefined): string | null {
  if (!session) return null;
  const accessToken = String(session.access_token ?? "").trim();
  if (accessToken) return `${accessToken}:${session.expires_at}`;
  const idToken = String(session.id_token ?? "").trim();
  if (idToken) return `${idToken}:${session.expires_at}`;
  return null;
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

const AUTH_SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again.";
const ENSURED_SESSION_CACHE_TTL_MS = 15_000;

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
  const ensuredSessionCacheRef = useRef<{
    key: string;
    session: AuthSession;
    checkedAt: number;
  } | null>(null);
  const ensuredSessionInFlightRef = useRef<{
    key: string;
    promise: Promise<AuthSession | null>;
  } | null>(null);

  const onSessionLostRef = useLatestRef(params.onSessionLost);
  const onSessionMissingAfterBootstrapRef = useLatestRef(params.onSessionMissingAfterBootstrap);
  const onSessionReadyRef = useLatestRef(params.onSessionReady);
  const onSessionFocusReadyRef = useLatestRef(params.onSessionFocusReady);
  const onDidJustSignInRef = useLatestRef(params.onDidJustSignIn);
  const onBeforeSignOutRef = useLatestRef(params.onBeforeSignOut);
  const onAfterSignOutRef = useLatestRef(params.onAfterSignOut);

  useEffect(() => {
    const callbackError = readAuthCallbackErrorFromLocation();
    if (!callbackError) return;
    setAuthError(callbackError);
    clearAuthFlowPending();
    clearOAuthCallbackParamsFromLocation();
  }, []);

  const markAuthBootstrapComplete = useCallback(() => {
    authBootstrapCompleteRef.current = true;
    setIsAuthBootstrapComplete(true);
  }, []);

  const clearSessionLocally = useCallback(async (): Promise<void> => {
    sessionRef.current = null;
    ensuredSessionCacheRef.current = null;
    ensuredSessionInFlightRef.current = null;
    setAuthSession(null);
    await onSessionLostRef.current();
  }, [onSessionLostRef]);

  const expireAuthSessionLocally = useCallback(async (): Promise<void> => {
    authSessionEpochRef.current += 1;
    await clearSessionLocally();
  }, [clearSessionLocally]);

  const adoptAuthSession = useCallback((nextSession: AuthSession): void => {
    sessionRef.current = nextSession;
    const cacheKey = buildAuthSessionCacheKey(nextSession);
    ensuredSessionCacheRef.current = cacheKey
      ? {
          key: cacheKey,
          session: nextSession,
          checkedAt: Date.now(),
        }
      : null;
    setAuthSession(nextSession);
  }, []);

  const refreshAuthSessionLockedResult = useCallback(async (): Promise<AuthSessionRefreshResult> => {
    const epochAtRefreshStart = authSessionEpochRef.current;
    return await refreshAuthSessionWithLockResult({
      inFlightRef: refreshResultInFlightRef,
      refreshSession: refreshAuthSessionResult,
      onRefreshed: (refreshed) => {
        if (authSessionEpochRef.current !== epochAtRefreshStart) return;
        setAuthError(null);
        setAuthSession(refreshed);
        sessionRef.current = refreshed;
      },
    });
  }, []);

  const refreshAuthSessionLocked = useCallback(async (): Promise<AuthSession | null> => {
    const refreshed = await refreshAuthSessionLockedResult();
    return refreshed.status === "refreshed" ? refreshed.session : null;
  }, [refreshAuthSessionLockedResult]);

  const ensureUsableAuthSession = useCallback(async (
    currentSession: AuthSession | null | undefined = sessionRef.current ?? session,
    sourceInput?: string,
  ): Promise<AuthSession | null> => {
    const requestSession = currentSession ?? null;
    if (!requestSession) return null;
    const source = String(sourceInput ?? "").trim() || "unknown";
    const startedAt = Date.now();

    const requestKey = buildAuthSessionCacheKey(requestSession);
    if (requestKey) {
      const cached = ensuredSessionCacheRef.current;
      if (
        cached &&
        cached.key === requestKey &&
        Date.now() - cached.checkedAt <= ENSURED_SESSION_CACHE_TTL_MS
      ) {
        if (!sessionsEqual(cached.session, requestSession)) {
          adoptAuthSession(cached.session);
        }
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_ensure",
          status: "success",
          detail: {
            source,
            cacheHit: true,
            durationMs: Date.now() - startedAt,
          },
        });
        return sessionRef.current ?? cached.session;
      }
      if (ensuredSessionInFlightRef.current?.key === requestKey) {
        const ensured = await ensuredSessionInFlightRef.current.promise;
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_ensure",
          status: ensured ? "success" : "failure",
          detail: {
            source,
            sharedInFlight: true,
            durationMs: Date.now() - startedAt,
          },
        });
        return ensured;
      }
    }

    const promise = (async (): Promise<AuthSession | null> => {
      const ensured = await ensureAuthSessionForAuthenticatedSendResult({
        session: requestSession,
        sessionRef,
        refreshLockedResult: refreshAuthSessionLockedResult,
      });
      if (ensured.status === "terminal_failure") {
        ensuredSessionCacheRef.current = null;
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_ensure",
          status: "failure",
          detail: {
            source,
            cacheHit: false,
            durationMs: Date.now() - startedAt,
            reason: ensured.reason,
          },
        });
        await expireAuthSessionLocally();
        return null;
      }
      if (ensured.status !== "ready") {
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_ensure",
          status: "failure",
          detail: {
            source,
            cacheHit: false,
            durationMs: Date.now() - startedAt,
            reason: ensured.reason,
          },
        });
        return null;
      }
      if (!sessionsEqual(ensured.session, requestSession)) {
        adoptAuthSession(ensured.session);
      } else {
        const readyKey = buildAuthSessionCacheKey(ensured.session);
        ensuredSessionCacheRef.current = readyKey
          ? {
              key: readyKey,
              session: ensured.session,
              checkedAt: Date.now(),
            }
          : null;
      }
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_session_ensure",
        status: "success",
        detail: {
          source,
          cacheHit: false,
          durationMs: Date.now() - startedAt,
          sessionChanged: !sessionsEqual(ensured.session, requestSession),
          runtimeProbeAccepted: ensured.runtimeAcceptance?.accepted ?? null,
          runtimeProbeTotalMs: ensured.runtimeAcceptance?.totalMs ?? null,
          runtimeProbeBootstrapActorMs: ensured.runtimeAcceptance?.bootstrapActorMs ?? null,
          runtimeProbeGetActorMs: ensured.runtimeAcceptance?.getActorMs ?? null,
          runtimeProbeFailureStage: ensured.runtimeAcceptance?.failureStage ?? null,
        },
      });
      return sessionRef.current ?? ensured.session;
    })();

    if (requestKey) {
      ensuredSessionInFlightRef.current = {
        key: requestKey,
        promise,
      };
    }

    try {
      return await promise;
    } finally {
      if (ensuredSessionInFlightRef.current?.promise === promise) {
        ensuredSessionInFlightRef.current = null;
      }
    }
  }, [adoptAuthSession, expireAuthSessionLocally, refreshAuthSessionLockedResult, session]);

  const beginSignInFlow = useCallback(async (): Promise<boolean> => {
    setAuthError(null);
    clearAuthSignedOutIntentMarker();
    const returnTo = readCurrentAuthReturnTo();
    markAuthFlowPending();
    try {
      const signIn = await beginOAuthSignIn({ returnTo });
      if (!signIn.ok) {
        setAuthError(signIn.error || "Sign-in URL could not be prepared.");
        clearAuthFlowPending();
        return false;
      }
      const authUrl = String(signIn.authUrl ?? "").trim();
      if (!authUrl) {
        setAuthError("Sign-in URL could not be prepared.");
        clearAuthFlowPending();
        return false;
      }
      window.location.assign(authUrl);
      return true;
    } catch (error) {
      setAuthError(error instanceof Error && error.message.trim() ? error.message.trim() : "Sign-in failed.");
      clearAuthFlowPending();
      return false;
    }
  }, []);

  const requireSignIn = useCallback((intentInput?: unknown) => {
    setAuthError(null);
    const intent = parsePendingAuthIntentInput(intentInput);
    if (intent && !session) {
      storeAuthResumeState({ intent });
    }
    if (session) return;
    void beginSignInFlow();
  }, [beginSignInFlow, session]);

  const handleSignOut = useCallback(async (): Promise<void> => {
    clearAuthFlowPending();
    authSessionEpochRef.current += 1;
    setAuthError(null);
    setIsAuthSigningOut(true);
    try {
      await onBeforeSignOutRef.current?.();
      await clearSessionLocally();
      await logoutAuthSessionRemote({ scope: "local" });
      await onAfterSignOutRef.current?.();
    } finally {
      setIsAuthSigningOut(false);
    }
  }, [clearSessionLocally, onAfterSignOutRef, onBeforeSignOutRef]);

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
        const usableSession = await ensureUsableAuthSession(currentSession, "session_available");
        if (!usableSession) return;
        await onSessionReadyRef.current(usableSession);
      })();
    },
    onSessionMissing: () => {
      if (!authBootstrapCompleteRef.current) return;
      void (async () => {
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_missing_after_bootstrap",
          status: "start",
          detail: {
            reason: isAuthSigningOut ? "signing_out" : "signed_out",
            isAuthSigningOut,
          },
        });
        sessionRef.current = null;
        setAuthSession(null);
        await onSessionMissingAfterBootstrapRef.current();
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_missing_after_bootstrap",
          status: "success",
          detail: {
            reason: isAuthSigningOut ? "signing_out" : "signed_out",
            isAuthSigningOut,
          },
        });
      })();
    },
    onFocusWithSession: (currentSession) => {
      void (async () => {
        const usableSession = await ensureUsableAuthSession(currentSession, "session_focus");
        if (!usableSession) return;
        await onSessionFocusReadyRef.current(usableSession);
      })();
    },
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const hadPendingAuthFlow = hasRecentAuthFlowPending();
      const bootstrapStartedAt = Date.now();
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_bridge_bootstrap",
        status: "start",
        detail: {
          hadPendingAuthFlow,
        },
      });
      try {
        const bootstrapResult = await bootstrapSessionDetailed();
        const bootstrapDurationMs = Date.now() - bootstrapStartedAt;
        const currentSession = bootstrapResult.session;
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_bridge_bootstrap",
          status: "success",
          detail: {
            hadPendingAuthFlow,
            durationMs: bootstrapDurationMs,
            hasSession: Boolean(currentSession),
            bootstrapPath: bootstrapResult.trace?.bootstrapPath ?? null,
            upstreamRefreshMs: bootstrapResult.trace?.upstreamRefreshMs ?? null,
            rotatedSessionFollowed: bootstrapResult.trace?.rotatedSessionFollowed ?? false,
          },
        });
        if (cancelled) return;
        if (currentSession) {
          const usableSession = await ensureUsableAuthSession(currentSession, "bootstrap");
          if (cancelled) return;
          if (usableSession) {
            markAuthBootstrapComplete();
            clearAuthSignedOutIntentMarker();
            adoptAuthSession(usableSession);
            if (hadPendingAuthFlow) {
              didJustSignInRef.current = true;
            }
            clearAuthFlowPending();
            setAuthError(null);
            return;
          }
        }

        if (sessionRef.current) {
          await clearSessionLocally();
          if (cancelled) return;
        }
        markAuthBootstrapComplete();
        if (hadPendingAuthFlow) {
          clearAuthFlowPending();
        }
      } catch (error) {
        if (cancelled) return;
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_bridge_bootstrap",
          status: "failure",
          detail: {
            hadPendingAuthFlow,
            durationMs: Date.now() - bootstrapStartedAt,
          },
          error: formatWorkspaceInstrumentationError(error),
        });
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_recover_session",
          status: "failure",
          detail: {
            phase: "bootstrap",
          },
          error: formatWorkspaceInstrumentationError(error),
        });
        markAuthBootstrapComplete();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    adoptAuthSession,
    clearSessionLocally,
    ensureUsableAuthSession,
    markAuthBootstrapComplete,
  ]);

  const isAuthResolvingSignedInState = useMemo(() => {
    if (isAuthSigningOut) return false;
    return !isAuthBootstrapComplete;
  }, [isAuthBootstrapComplete, isAuthSigningOut]);

  const authPresentationState = useMemo<"signed_out" | "recovering_signed_in" | "signed_in">(() => {
    if (session) return "signed_in";
    if (isAuthResolvingSignedInState) return "recovering_signed_in";
    return "signed_out";
  }, [isAuthResolvingSignedInState, session]);

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
    authPresentationState,
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
