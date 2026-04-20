import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  AUTH_SIGNED_OUT_INTENT_KEY,
  AUTH_SIGNED_OUT_TAB_INTENT_KEY,
  clearAuthAutomaticReauthAttempt,
  clearAuthContinuityHint,
  clearAuthFlowPending,
  clearAuthFlowReturned,
  clearAuthSignedOutIntentMarker,
  ensureAuthSessionForAuthenticatedSendResult,
  fetchWithAuthShared,
  fetchWithPublicShared,
  hasRecentAuthAutomaticReauthAttempt,
  hasRecentAuthContinuityHint,
  hasRecentAuthFlowReturned,
  hasRecentAuthFlowPending,
  markAuthAutomaticReauthAttempt,
  markAuthContinuityHint,
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
  updateAuthResumeStatePhase,
} from "../../../../shared/authResumeState";
import { clearOAuthCallbackParamsFromLocation } from "../../../../shared/cloudPkce";
import { buildLoginTrampolinePath } from "../auth/loginTrampoline";
import { isWorkOsLoginRequiredError, useWorkOsRuntime } from "../auth/workosRuntime";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";
import { useWebAuthSessionLifecycle } from "./useWebAuthSessionLifecycle";
import { readPublicRouteFromLocation } from "../../../../shared/webAppRouteState";

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
  authPresentationState: "signed_out" | "recovering_signed_in" | "signed_in";
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

function hasAuthSignedOutIntentMarker(): boolean {
  try {
    return (
      sessionStorage.getItem(AUTH_SIGNED_OUT_TAB_INTENT_KEY) === "1" ||
      localStorage.getItem(AUTH_SIGNED_OUT_INTENT_KEY) === "1"
    );
  } catch {
    return false;
  }
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

function errorToMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
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
  const [isAutomaticReauthPending, setIsAutomaticReauthPending] = useState(false);

  const sessionRef = useRef<AuthSession | null>(null);
  const refreshResultInFlightRef = useRef<Promise<AuthSessionRefreshResult> | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const didJustSignInRef = useRef(false);
  const authSessionEpochRef = useRef(0);
  const authBootstrapCompleteRef = useRef(false);
  const directBootstrapStateRef = useRef<string>("");
  const ensuredSessionCacheRef = useRef<{
    key: string;
    session: AuthSession;
    checkedAt: number;
  } | null>(null);
  const ensuredSessionInFlightRef = useRef<{
    key: string;
    promise: Promise<AuthSession | null>;
  } | null>(null);
  const workos = useWorkOsRuntime();
  const currentPublicRouteKind = readPublicRouteFromLocation().kind;

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
    markAuthContinuityHint();
    clearAuthAutomaticReauthAttempt();
    setIsAutomaticReauthPending(false);
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
        return sessionRef.current ?? cached.session;
      }
      if (ensuredSessionInFlightRef.current?.key === requestKey) {
        return await ensuredSessionInFlightRef.current.promise;
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
        await expireAuthSessionLocally();
        return null;
      }
      if (ensured.status !== "ready") {
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

  const recoverSessionFromWorkOs = useCallback(async (params: {
    phase: string;
    forceRefresh?: boolean;
  }): Promise<AuthSession | null> => {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "auth_recover_session",
      status: "start",
      detail: {
        phase: params.phase,
        forceRefresh: Boolean(params.forceRefresh),
        workosUserPresent: Boolean(workos.user),
      },
    });
    try {
      const candidateSession = await workos.readSession({ forceRefresh: params.forceRefresh });
      if (!candidateSession) {
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_recover_session",
          status: "skip",
          detail: {
            phase: params.phase,
            forceRefresh: Boolean(params.forceRefresh),
            reason: "workos_session_missing",
            workosUserPresent: Boolean(workos.user),
          },
        });
        return null;
      }

      const verifiedSession = await ensureUsableAuthSession(candidateSession);
      if (!verifiedSession) {
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_recover_session",
          status: "failure",
          detail: {
            phase: params.phase,
            forceRefresh: Boolean(params.forceRefresh),
            reason: "verified_session_missing",
            workosUserPresent: Boolean(workos.user),
          },
        });
        return null;
      }

      adoptAuthSession(verifiedSession);
      setAuthError(null);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_recover_session",
        status: "success",
        detail: {
          phase: params.phase,
          forceRefresh: Boolean(params.forceRefresh),
          workosUserPresent: Boolean(workos.user),
          userId: String(verifiedSession.user?.id ?? "").trim() || null,
        },
      });
      return verifiedSession;
    } catch (error) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_recover_session",
        status: "failure",
        detail: {
          phase: params.phase,
          forceRefresh: Boolean(params.forceRefresh),
          workosUserPresent: Boolean(workos.user),
        },
        error: formatWorkspaceInstrumentationError(error),
      });
      return null;
    }
  }, [adoptAuthSession, ensureUsableAuthSession, workos]);

  const beginSignInFlow = useCallback(async (): Promise<boolean> => {
    setAuthError(null);
    clearAuthSignedOutIntentMarker();
    clearAuthFlowReturned();
    const returnTo = readCurrentAuthReturnTo();
    const loginPath = buildLoginTrampolinePath(returnTo);
    markAuthFlowPending();
    storeAuthResumeState({ returnTo, phase: "awaiting_auth" });
    try {
      try {
        await workos.signIn({ state: { returnTo } });
        return true;
      } catch {
        window.location.assign(loginPath);
        return true;
      }
    } catch (error) {
      setAuthError(errorToMessage(error, "Sign-in failed."));
      return false;
    }
  }, [workos]);

  const attemptAutomaticReauth = useCallback(async (phase: string): Promise<boolean> => {
    const isProtectedAppRoute = readPublicRouteFromLocation().kind === "app";
    const hasContinuityHint = hasRecentAuthContinuityHint();
    const hasRecentAutomaticAttempt = hasRecentAuthAutomaticReauthAttempt();
    const hasSignedOutIntent = hasAuthSignedOutIntentMarker();
    const hasPendingFlow = hasRecentAuthFlowPending();
    if (
      !workos.isEnabled ||
      isAuthSigningOut ||
      !isProtectedAppRoute ||
      !hasContinuityHint ||
      hasRecentAutomaticAttempt ||
      hasPendingFlow ||
      hasSignedOutIntent
    ) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_automatic_reauth",
        status: "skip",
        detail: {
          phase,
          isProtectedAppRoute,
          hasContinuityHint,
          hasRecentAutomaticAttempt,
          hasPendingFlow,
          hasSignedOutIntent,
          isAuthSigningOut,
        },
      });
      return false;
    }

    markAuthAutomaticReauthAttempt();
    setIsAutomaticReauthPending(true);
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "auth_automatic_reauth",
      status: "start",
      detail: {
        phase,
        isProtectedAppRoute,
        hasContinuityHint,
      },
    });
    const started = await beginSignInFlow();
    if (started) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_automatic_reauth",
        status: "success",
        detail: {
          phase,
          result: "redirect_started",
        },
      });
      return true;
    }

    clearAuthAutomaticReauthAttempt();
    setIsAutomaticReauthPending(false);
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "auth_automatic_reauth",
      status: "failure",
      detail: {
        phase,
        reason: "sign_in_start_failed",
      },
    });
    return false;
  }, [beginSignInFlow, isAuthSigningOut, workos.isEnabled]);

  const requireSignIn = useCallback((intentInput?: unknown) => {
    setAuthError(null);
    const intent = parsePendingAuthIntentInput(intentInput);
    if (intent && !session) {
      storeAuthResumeState({
        returnTo: readCurrentPathReturnTo(),
        intent,
        phase: "awaiting_auth",
      });
    }
    if (session) return;
    void (async () => {
      if (workos.user) {
        const existingResumeIntent = readAuthResumeState()?.intent;
        const recoveredSession = await recoverSessionFromWorkOs({
          phase: "require_sign_in",
          forceRefresh: true,
        });
        if (recoveredSession) {
          clearAuthSignedOutIntentMarker();
          clearAuthFlowPending();
          if (intent || existingResumeIntent) {
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
    clearAuthAutomaticReauthAttempt();
    clearAuthContinuityHint();
    authSessionEpochRef.current += 1;
    setAuthError(null);
    setIsAutomaticReauthPending(false);
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
      const hasWorkOsUser = Boolean(workos.user);
      if (!isAuthSigningOut && hasWorkOsUser) {
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_missing_after_bootstrap",
          status: "skip",
          detail: {
            reason: "recovering_signed_in",
            workosUserPresent: true,
            isAuthSigningOut: false,
          },
        });
        return;
      }
      void (async () => {
        const startedAutomaticReauth = await attemptAutomaticReauth("session_missing_after_bootstrap");
        if (startedAutomaticReauth) {
          emitWorkspaceEvent({
            scope: "lifecycle",
            name: "auth_session_missing_after_bootstrap",
            status: "skip",
            detail: {
              reason: "automatic_reauth_started",
              workosUserPresent: hasWorkOsUser,
              isAuthSigningOut,
            },
          });
          return;
        }
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_missing_after_bootstrap",
          status: "start",
          detail: {
            reason: isAuthSigningOut ? "signing_out" : "signed_out",
            workosUserPresent: hasWorkOsUser,
            isAuthSigningOut,
          },
        });
        setIsAutomaticReauthPending(false);
        sessionRef.current = null;
        setAuthSession(null);
        await onSessionMissingAfterBootstrapRef.current();
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_missing_after_bootstrap",
          status: "success",
          detail: {
            reason: isAuthSigningOut ? "signing_out" : "signed_out",
            workosUserPresent: hasWorkOsUser,
            isAuthSigningOut,
          },
        });
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
    const stateKey = `ready:${userId}:${currentPublicRouteKind}`;
    if (directBootstrapStateRef.current === stateKey) return;
    directBootstrapStateRef.current = stateKey;

    let cancelled = false;

    void (async () => {
      const hasSignedOutIntent = hasAuthSignedOutIntentMarker();

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

      const startedAutomaticReauth = await attemptAutomaticReauth("bootstrap");
      if (cancelled) return;
      if (startedAutomaticReauth) {
        return;
      }

      setIsAutomaticReauthPending(false);
      markAuthBootstrapComplete();
      if (hadPendingAuthFlow) {
        clearAuthFlowPending();
        clearAuthFlowReturned();
        if (hadRecentAuthReturn) {
          clearAuthContinuityHint();
          clearAuthAutomaticReauthAttempt();
          setAuthError("Sign-in completed, but PolyNet could not establish your account session. Please try again.");
          updateAuthResumeStatePhase("awaiting_session");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    adoptAuthSession,
    clearSessionLocally,
    currentPublicRouteKind,
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
      const authResumeState = readAuthResumeState();
      const shouldResumeAfterSessionRecovery =
        authResumeState?.phase === "awaiting_session";
      const recoveredSession = await recoverSessionFromWorkOs({
        phase: "post_bootstrap",
        forceRefresh: true,
      });
      if (cancelled || !recoveredSession) {
        setIsAutomaticReauthPending(false);
        return;
      }
      clearAuthSignedOutIntentMarker();
      clearAuthFlowPending();
      clearAuthFlowReturned();
      if (shouldResumeAfterSessionRecovery && authResumeState?.intent) {
        didJustSignInRef.current = true;
      } else if (shouldResumeAfterSessionRecovery && !authResumeState?.intent) {
        clearAuthResumeState();
      }
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
    if (isAutomaticReauthPending) return true;
    if (workos.isLoading) return true;
    if (!isAuthBootstrapComplete) return true;
    return !session && Boolean(workos.user);
  }, [isAuthBootstrapComplete, isAuthSigningOut, isAutomaticReauthPending, session, workos.isEnabled, workos.isLoading, workos.user]);

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
      clearAuthAutomaticReauthAttempt();
      clearAuthContinuityHint();
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
