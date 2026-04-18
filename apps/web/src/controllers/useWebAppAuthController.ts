import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  AUTH_SIGNED_OUT_INTENT_KEY,
  AUTH_SIGNED_OUT_TAB_INTENT_KEY,
  clearAuthFlowPending,
  clearAuthSignedOutIntentMarker,
  ensureAuthSessionForAuthenticatedSendResult,
  fetchWithAuthShared,
  fetchWithPublicShared,
  hasRecentAuthFlowPending,
  markAuthFlowPending,
  refreshAuthSessionWithLockResult,
  type AuthSession,
  type AuthSessionRefreshResult,
} from "../auth";
import type { ConvexAuthenticatedSessionProbeResult } from "../../../../shared/convexAuthSessionProbe";
import {
  clearAuthResumeState,
  parsePendingAuthIntentInput,
  readAuthResumeState,
  storeAuthResumeState,
} from "../../../../shared/authResumeState";
import { clearOAuthCallbackParamsFromLocation } from "../../../../shared/cloudPkce";
import { buildLoginTrampolinePath } from "../auth/loginTrampoline";
import {
  beginAuthPerfSpan,
  endAuthPerfSpan,
} from "../auth/authPerfProbe";
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
  authRuntimeAcceptance: ConvexAuthenticatedSessionProbeResult | null;
  authProbeEvents: { ts: number; stage: string; detail: Record<string, unknown> }[];
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

function readWorkOsBootstrapDebugState(workos: ReturnType<typeof useWorkOsRuntime>): string {
  const method = String(workos.authenticationMethod ?? "none").trim() || "none";
  const userId = String(workos.user?.id ?? "").trim();
  return `loading=${workos.isLoading ? "1" : "0"} user=${userId ? "1" : "0"} method=${method}`;
}

function buildWorkOsBootstrapDebugMessage(
  baseMessage: string,
  params: {
    workos: ReturnType<typeof useWorkOsRuntime>;
    phase: string;
    hasSession?: boolean;
    error?: unknown;
  },
): string {
  const detailParts = [
    `phase=${params.phase}`,
    readWorkOsBootstrapDebugState(params.workos),
    `session=${params.hasSession ? "1" : "0"}`,
  ];
  const reason = params.error ? errorToMessage(params.error, "unknown_error") : null;
  if (reason) {
    detailParts.push(`reason=${reason}`);
  }
  return `${baseMessage} Debug: ${detailParts.join(" ")}.`;
}

function logWorkOsBootstrap(stage: string, details: Record<string, unknown>): void {
  console.info("[auth][workos]", stage, details);
}

const AUTH_SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again.";

export function useWebAppAuthController(
  params: UseWebAppAuthControllerParams,
): UseWebAppAuthControllerResult {
  const [session, setAuthSession] = useState<AuthSession | null>(null);
  const [isAuthBootstrapComplete, setIsAuthBootstrapComplete] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRuntimeAcceptance, setAuthRuntimeAcceptance] = useState<ConvexAuthenticatedSessionProbeResult | null>(null);
  const [isAuthSigningOut, setIsAuthSigningOut] = useState(false);
  const [authProbeEvents, setAuthProbeEvents] = useState<
    { ts: number; stage: string; detail: Record<string, unknown> }[]
  >([]);

  const sessionRef = useRef<AuthSession | null>(null);
  const refreshResultInFlightRef = useRef<Promise<AuthSessionRefreshResult> | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const prefetchedSignInRef = useRef<{ returnTo: string; url: string } | null>(null);
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

  const pushAuthProbeEvent = useCallback((stage: string, detail: Record<string, unknown> = {}) => {
    const event = { ts: Date.now(), stage, detail };
    setAuthProbeEvents((current) => [...current.slice(-39), event]);
    console.info("[auth][probe]", stage, detail);
  }, []);

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

  useEffect(() => {
    if (workos.isEnabled) return;
    markAuthBootstrapComplete();
  }, [markAuthBootstrapComplete, workos.isEnabled]);

  const clearSessionLocally = useCallback(async (): Promise<void> => {
    sessionRef.current = null;
    setAuthSession(null);
    setAuthRuntimeAcceptance(null);
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
            logWorkOsBootstrap("refresh_session_missing", {
              phase: "refresh",
              workos: readWorkOsBootstrapDebugState(workos),
            });
            return { status: "terminal_failure", reason: "auth_session_missing" };
          }
          return { status: "refreshed", session: refreshed };
        } catch (error) {
          console.warn("[auth][workos] refresh_session_failed", {
            phase: "refresh",
            workos: readWorkOsBootstrapDebugState(workos),
            error: errorToMessage(error, "workos_refresh_failed"),
          });
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
    setAuthRuntimeAcceptance(ensured.runtimeAcceptance ?? null);
    if (!sessionsEqual(ensured.session, requestSession)) {
      adoptAuthSession(ensured.session);
    }
    return sessionRef.current ?? ensured.session;
  }, [adoptAuthSession, expireAuthSessionLocally, refreshAuthSessionLockedResult, session]);

  const recoverSessionFromWorkOs = useCallback(async (params: {
    phase: string;
    forceRefresh?: boolean;
  }): Promise<AuthSession | null> => {
    pushAuthProbeEvent(`${params.phase}:recover_begin`, {
      forceRefresh: Boolean(params.forceRefresh),
      workos: readWorkOsBootstrapDebugState(workos),
      sessionPresent: Boolean(sessionRef.current ?? session),
    });
    try {
      beginAuthPerfSpan("workos_read_session", {
        phase: params.phase,
        forceRefresh: Boolean(params.forceRefresh),
      });
      const candidateSession = await workos.readSession({ forceRefresh: params.forceRefresh });
      endAuthPerfSpan("workos_read_session", {
        phase: params.phase,
        hasSession: Boolean(candidateSession),
      });
      pushAuthProbeEvent(`${params.phase}:recover_read_session`, {
        hasSession: Boolean(candidateSession),
        workos: readWorkOsBootstrapDebugState(workos),
      });
      if (!candidateSession) return null;

      beginAuthPerfSpan("convex_verify", {
        phase: params.phase,
      });
      const verifiedSession = await ensureUsableAuthSession(candidateSession);
      endAuthPerfSpan("convex_verify", {
        phase: params.phase,
        accepted: Boolean(verifiedSession),
      });
      pushAuthProbeEvent(`${params.phase}:recover_verify`, {
        accepted: Boolean(verifiedSession),
        workos: readWorkOsBootstrapDebugState(workos),
      });
      if (!verifiedSession) return null;

      adoptAuthSession(verifiedSession);
      setAuthError(null);
      return verifiedSession;
    } catch (error) {
      endAuthPerfSpan("workos_read_session", {
        phase: params.phase,
        status: "error",
      });
      endAuthPerfSpan("convex_verify", {
        phase: params.phase,
        status: "error",
      });
      pushAuthProbeEvent(`${params.phase}:recover_failed`, {
        reason: errorToMessage(error, "workos_session_recovery_failed"),
        workos: readWorkOsBootstrapDebugState(workos),
      });
      return null;
    }
  }, [adoptAuthSession, ensureUsableAuthSession, pushAuthProbeEvent, session, workos]);

  const currentReturnTo = readCurrentAuthReturnTo();

  useEffect(() => {
    if (!workos.isEnabled || workos.isLoading || session) {
      prefetchedSignInRef.current = null;
      return;
    }
    let cancelled = false;
    void workos
      .getSignInUrl({ state: { returnTo: currentReturnTo } })
      .then((url) => {
        if (cancelled) return;
        const normalized = String(url ?? "").trim();
        if (!normalized) return;
        prefetchedSignInRef.current = {
          returnTo: currentReturnTo,
          url: normalized,
        };
        pushAuthProbeEvent("sign_in_url_prefetched", {
          returnTo: currentReturnTo,
          workos: readWorkOsBootstrapDebugState(workos),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        prefetchedSignInRef.current = null;
        pushAuthProbeEvent("sign_in_url_prefetch_failed", {
          reason: errorToMessage(error, "sign_in_prefetch_failed"),
          returnTo: currentReturnTo,
          workos: readWorkOsBootstrapDebugState(workos),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [currentReturnTo, pushAuthProbeEvent, session, workos]);

  const beginGoogleSignInFlow = useCallback(async () => {
    setAuthError(null);
    clearAuthSignedOutIntentMarker();
    const returnTo = readCurrentAuthReturnTo();
    const loginPath = buildLoginTrampolinePath(returnTo);
    const prefetchedSignIn = prefetchedSignInRef.current;
    pushAuthProbeEvent("sign_in_redirect_begin", {
      returnTo,
      loginPath,
      hasPrefetchedUrl: Boolean(prefetchedSignIn?.url && prefetchedSignIn.returnTo === returnTo),
      workos: readWorkOsBootstrapDebugState(workos),
    });
    markAuthFlowPending();
    storeAuthResumeState({ returnTo });
    try {
      if (prefetchedSignIn?.url && prefetchedSignIn.returnTo === returnTo) {
        pushAuthProbeEvent("sign_in_redirect_dispatched", {
          mode: "prefetched_url",
          workos: readWorkOsBootstrapDebugState(workos),
        });
        prefetchedSignInRef.current = null;
        window.location.assign(prefetchedSignIn.url);
        return;
      }
      let liveSignInUrl = "";
      try {
        liveSignInUrl = String(
          await workos.getSignInUrl({ state: { returnTo } }),
        ).trim();
      } catch (error) {
        pushAuthProbeEvent("sign_in_redirect_live_url_failed", {
          reason: errorToMessage(error, "sign_in_live_url_failed"),
          loginPath,
          workos: readWorkOsBootstrapDebugState(workos),
        });
      }
      if (liveSignInUrl) {
        pushAuthProbeEvent("sign_in_redirect_dispatched", {
          mode: "live_url",
          workos: readWorkOsBootstrapDebugState(workos),
        });
        const currentHref = window.location.href;
        const fallbackTimer = window.setTimeout(() => {
          if (window.location.href !== currentHref) return;
          pushAuthProbeEvent("sign_in_redirect_stalled", {
            mode: "live_url",
            loginPath,
            workos: readWorkOsBootstrapDebugState(workos),
          });
          window.location.assign(loginPath);
        }, 600);
        window.location.assign(liveSignInUrl);
        window.setTimeout(() => window.clearTimeout(fallbackTimer), 650);
        return;
      }
      pushAuthProbeEvent("sign_in_redirect_dispatched", {
        mode: "login_trampoline",
        loginPath,
        workos: readWorkOsBootstrapDebugState(workos),
      });
      window.location.assign(loginPath);
    } catch (error) {
      pushAuthProbeEvent("sign_in_redirect_failed", {
        reason: errorToMessage(error, "sign_in_failed"),
        workos: readWorkOsBootstrapDebugState(workos),
      });
      setAuthError(errorToMessage(error, "Sign-in failed."));
    }
  }, [pushAuthProbeEvent, workos]);

  const requireSignIn = useCallback((intentInput?: unknown) => {
    setAuthError(null);
    const intent = parsePendingAuthIntentInput(intentInput);
    pushAuthProbeEvent("require_sign_in_invoked", {
      hasSession: Boolean(session),
      hasIntent: Boolean(intent),
      workos: readWorkOsBootstrapDebugState(workos),
    });
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
          await onSessionReadyRef.current(recoveredSession);
          pushAuthProbeEvent("require_sign_in_recovered_session", {
            userId: recoveredSession.user.id,
            email: recoveredSession.user.email ?? null,
          });
          return;
        }
      }
      await beginGoogleSignInFlow();
    })();
  }, [beginGoogleSignInFlow, onSessionReadyRef, pushAuthProbeEvent, recoverSessionFromWorkOs, session, workos]);

  const handleSignOut = useCallback(async (): Promise<void> => {
    clearAuthFlowPending();
    authSessionEpochRef.current += 1;
    setAuthError(null);
    setIsAuthSigningOut(true);
    pushAuthProbeEvent("sign_out_begin", {
      workos: readWorkOsBootstrapDebugState(workos),
      hasSession: Boolean(sessionRef.current ?? session),
    });
    try {
      await onBeforeSignOutRef.current?.();
      await clearSessionLocally();
      pushAuthProbeEvent("sign_out_local_clear", {
        workos: readWorkOsBootstrapDebugState(workos),
      });
    } catch (error) {
      setIsAuthSigningOut(false);
      throw error;
    }
    void workos
      .signOut({ returnTo: window.location.origin })
      .then(() => {
        pushAuthProbeEvent("sign_out_remote_complete", {
          workos: readWorkOsBootstrapDebugState(workos),
        });
      })
      .catch((error) => {
        pushAuthProbeEvent("sign_out_remote_failed", {
          workos: readWorkOsBootstrapDebugState(workos),
          reason: errorToMessage(error, "workos_sign_out_failed"),
        });
        if (!isWorkOsLoginRequiredError(error)) {
          console.warn("WorkOS sign-out failed", error);
        }
      });
  }, [clearSessionLocally, onBeforeSignOutRef, pushAuthProbeEvent, session, workos]);

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
      pushAuthProbeEvent("session_missing_after_bootstrap", {
        workos: readWorkOsBootstrapDebugState(workos),
      });
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
      pushAuthProbeEvent("bootstrap_begin", {
        hadPendingAuthFlow,
        workos: readWorkOsBootstrapDebugState(workos),
      });
      logWorkOsBootstrap("bootstrap_begin", {
        phase: "bootstrap",
        hadPendingAuthFlow,
        workos: readWorkOsBootstrapDebugState(workos),
      });
      beginAuthPerfSpan("auth_bootstrap", {
        hadPendingAuthFlow,
        workos: readWorkOsBootstrapDebugState(workos),
      });
      if (hasSignedOutIntent) {
        if (workos.user) {
          pushAuthProbeEvent("bootstrap_stale_signed_out_intent_ignored", {
            workos: readWorkOsBootstrapDebugState(workos),
          });
          clearAuthSignedOutIntentMarker();
        } else {
          pushAuthProbeEvent("bootstrap_signed_out_intent", {
            workos: readWorkOsBootstrapDebugState(workos),
          });
          if (cancelled) return;
          endAuthPerfSpan("auth_bootstrap", {
            result: "signed_out_intent",
          });
          markAuthBootstrapComplete();
          clearAuthFlowPending();
          return;
        }
      }

      const verifiedSession = await recoverSessionFromWorkOs({
        phase: "bootstrap",
      });
      if (cancelled) return;

      if (verifiedSession) {
        endAuthPerfSpan("auth_bootstrap", {
          result: "verified_session",
        });
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
        }
        return;
      }

      if (sessionRef.current) {
        await clearSessionLocally();
        if (cancelled) return;
      }

      markAuthBootstrapComplete();
      endAuthPerfSpan("auth_bootstrap", {
        result: hadPendingAuthFlow ? "missing_session" : "no_session",
      });
      if (hadPendingAuthFlow) {
        console.warn("[auth][workos] bootstrap_missing_session", {
          phase: "read_session",
          workos: readWorkOsBootstrapDebugState(workos),
          hasSession: false,
        });
        pushAuthProbeEvent("bootstrap_missing_session", {
          workos: readWorkOsBootstrapDebugState(workos),
          hadPendingAuthFlow,
        });
        setAuthError(
          buildWorkOsBootstrapDebugMessage(
            "Sign-in completed, but PolyNet could not establish your account session. Please try again.",
            { workos, phase: "read_session", hasSession: false },
          ),
        );
        clearAuthFlowPending();
        clearAuthResumeState();
      }
    })();

    return () => {
      cancelled = true;
      endAuthPerfSpan("auth_bootstrap", {
        result: "cancelled",
      });
    };
  }, [
    adoptAuthSession,
    clearSessionLocally,
    markAuthBootstrapComplete,
    onApplyPostAuthPathRef,
    pushAuthProbeEvent,
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
      pushAuthProbeEvent("post_bootstrap_session_gap_detected", {
        workos: readWorkOsBootstrapDebugState(workos),
      });
      const recoveredSession = await recoverSessionFromWorkOs({
        phase: "post_bootstrap",
        forceRefresh: true,
      });
      if (cancelled || !recoveredSession) return;
      clearAuthSignedOutIntentMarker();
      clearAuthFlowPending();
      await onSessionReadyRef.current(recoveredSession);
      pushAuthProbeEvent("post_bootstrap_recovered_session", {
        userId: recoveredSession.user.id,
        email: recoveredSession.user.email ?? null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    clearAuthFlowPending,
    isAuthSigningOut,
    isAuthBootstrapComplete,
    onSessionReadyRef,
    pushAuthProbeEvent,
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
    authRuntimeAcceptance,
    authProbeEvents,
    requireSignIn,
    handleSignOut,
    ensureUsableAuthSession,
    fetchWithAuth,
    fetchWithPublic,
    sessionArg,
    authenticatedSessionArg,
  };
}
