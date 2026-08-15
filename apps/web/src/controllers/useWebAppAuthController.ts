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
  type AuthSessionRefreshResultInFlightRef,
} from "../auth";
import {
  parsePendingAuthIntentInput,
  storeAuthResumeState,
} from "../../../../shared/authResumeState";
import { commitIfAsyncEpochCurrent } from "../../../../shared/asyncEpoch";
import { clearOAuthCallbackParamsFromLocation } from "../../../../shared/cloudPkce";
import { resolveAuthSubject } from "../../../../shared/authSession";
import { closeAuthenticatedConvexRealtimeClientsForSubject } from "../../../../shared/convexRealtimeAuth";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";
import { captureAppException } from "../instrument";
import { captureProductAnalyticsEvent } from "../posthogAnalytics";
import { useWebAuthSessionLifecycle } from "./useWebAuthSessionLifecycle";

type AsyncVoid = void | Promise<void>;

type UsableAuthSessionResult =
  | { status: "ready"; session: AuthSession }
  | { status: "missing" }
  | { status: "transient_failure"; reason: string }
  | { status: "terminal_failure"; reason: string };

type UseWebAppAuthControllerParams = {
  resumeEpoch: number;
  onSessionLost: () => AsyncVoid;
  onSessionMissingAfterBootstrap: () => AsyncVoid;
  onSessionReady: (session: AuthSession) => AsyncVoid;
  onSessionResumeReady: (session: AuthSession) => AsyncVoid;
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
  authPresentationState:
    | "signed_out"
    | "recovering_signed_in"
    | "verification_failed"
    | "signed_in";
  authError: string | null;
  retryAuthBootstrap: () => void;
  requireSignIn: (intentInput?: unknown) => void;
  handleSignOut: () => Promise<void>;
  ensureUsableAuthSession: (
    session?: AuthSession | null,
    source?: string,
    options?: { forceRefresh?: boolean },
  ) => Promise<AuthSession | null>;
  fetchWithAuth: (url: string, init: RequestInit, session: AuthSession) => Promise<Response>;
  fetchWithPublic: (url: string, init?: RequestInit) => Promise<Response>;
  sessionArg: { session: AuthSession | null };
  authenticatedSessionArg: {
    session: AuthSession | null;
    ensureSession: (
      session?: AuthSession | null,
      source?: string,
      options?: { forceRefresh?: boolean },
    ) => Promise<AuthSession | null>;
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

function closeRealtimeTransportForReplacedIdentity(
  currentSession: AuthSession | null | undefined,
  nextSession: AuthSession | null | undefined,
): void {
  const currentSubject = resolveAuthSubject(currentSession ?? null);
  const nextSubject = resolveAuthSubject(nextSession ?? null);
  if (currentSubject && currentSubject !== nextSubject) {
    closeAuthenticatedConvexRealtimeClientsForSubject(currentSubject);
  }
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
  const [authBootstrapStatus, setAuthBootstrapStatus] = useState<
    "resolving" | "ready" | "failed"
  >("resolving");
  const isAuthBootstrapComplete = authBootstrapStatus === "ready";
  const [authBootstrapAttempt, setAuthBootstrapAttempt] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSigningOut, setIsAuthSigningOut] = useState(false);

  const sessionRef = useRef<AuthSession | null>(null);
  const refreshResultInFlightRef = useRef<
    AuthSessionRefreshResultInFlightRef["current"]
  >(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const didJustSignInRef = useRef(false);
  const authSessionEpochRef = useRef(0);
  const authBootstrapCompleteRef = useRef(false);
  const authBootstrapAttemptIdRef = useRef(0);
  const sessionReadyIdentityRef = useRef<string | null>(null);
  const ensuredSessionCacheRef = useRef<{
    key: string;
    session: AuthSession;
    checkedAt: number;
  } | null>(null);
  const ensuredSessionInFlightRef = useRef<{
    key: string;
    promise: Promise<UsableAuthSessionResult>;
  } | null>(null);

  const onSessionLostRef = useLatestRef(params.onSessionLost);
  const onSessionMissingAfterBootstrapRef = useLatestRef(params.onSessionMissingAfterBootstrap);
  const onSessionReadyRef = useLatestRef(params.onSessionReady);
  const onSessionResumeReadyRef = useLatestRef(params.onSessionResumeReady);
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
    setAuthBootstrapStatus("ready");
  }, []);

  const retryAuthBootstrap = useCallback(() => {
    authBootstrapCompleteRef.current = false;
    setAuthBootstrapStatus("resolving");
    setAuthError(null);
    setAuthBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  const clearSessionLocally = useCallback(async (): Promise<void> => {
    const authSubject = resolveAuthSubject(sessionRef.current);
    if (authSubject) closeAuthenticatedConvexRealtimeClientsForSubject(authSubject);
    sessionRef.current = null;
    sessionReadyIdentityRef.current = null;
    ensuredSessionCacheRef.current = null;
    ensuredSessionInFlightRef.current = null;
    setAuthSession(null);
    await onSessionLostRef.current();
  }, [onSessionLostRef]);

  const expireAuthSessionLocally = useCallback(async (): Promise<void> => {
    authSessionEpochRef.current += 1;
    await clearSessionLocally();
  }, [clearSessionLocally]);

  const adoptAuthSession = useCallback((
    nextSession: AuthSession,
    expectedEpoch: number,
  ): boolean => {
    return commitIfAsyncEpochCurrent(
      authSessionEpochRef,
      expectedEpoch,
      () => {
        closeRealtimeTransportForReplacedIdentity(sessionRef.current, nextSession);
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
      },
    );
  }, []);

  const refreshAuthSessionLockedResult = useCallback(async (): Promise<AuthSessionRefreshResult> => {
    const epochAtRefreshStart = authSessionEpochRef.current;
    return await refreshAuthSessionWithLockResult({
      inFlightRef: refreshResultInFlightRef,
      lockKey: epochAtRefreshStart,
      isLockKeyCurrent: (lockKey) => authSessionEpochRef.current === lockKey,
      refreshSession: refreshAuthSessionResult,
      onRefreshed: (refreshed) => {
        if (!adoptAuthSession(refreshed, epochAtRefreshStart)) return;
        setAuthError(null);
      },
    });
  }, [adoptAuthSession]);

  const refreshAuthSessionLocked = useCallback(async (): Promise<AuthSession | null> => {
    const refreshed = await refreshAuthSessionLockedResult();
    return refreshed.status === "refreshed" ? refreshed.session : null;
  }, [refreshAuthSessionLockedResult]);

  const ensureUsableAuthSessionResult = useCallback(async (
    currentSession: AuthSession | null | undefined = sessionRef.current,
    sourceInput?: string,
    options?: { forceRefresh?: boolean },
  ): Promise<UsableAuthSessionResult> => {
    const epochAtRequestStart = authSessionEpochRef.current;
    const requestSession = currentSession ?? null;
    if (!requestSession) return { status: "missing" };
    const source = String(sourceInput ?? "").trim() || "unknown";
    const startedAt = Date.now();

    if (options?.forceRefresh) {
      const refreshed = await refreshAuthSessionLockedResult();
      if (authSessionEpochRef.current !== epochAtRequestStart) {
        return { status: "transient_failure", reason: "session_changed" };
      }
      if (refreshed.status === "terminal_failure") {
        ensuredSessionCacheRef.current = null;
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_ensure",
          status: "failure",
          detail: {
            source,
            forcedRefresh: true,
            durationMs: Date.now() - startedAt,
            reason: refreshed.reason,
          },
        });
        await expireAuthSessionLocally();
        return { status: "terminal_failure", reason: refreshed.reason };
      }
      if (refreshed.status !== "refreshed") {
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_ensure",
          status: "failure",
          detail: {
            source,
            forcedRefresh: true,
            durationMs: Date.now() - startedAt,
            reason: refreshed.reason,
          },
        });
        return { status: "transient_failure", reason: refreshed.reason };
      }
      if (!adoptAuthSession(refreshed.session, epochAtRequestStart)) {
        return { status: "transient_failure", reason: "session_changed" };
      }
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_session_ensure",
        status: "success",
        detail: {
          source,
          forcedRefresh: true,
          durationMs: Date.now() - startedAt,
          sessionChanged: !sessionsEqual(refreshed.session, requestSession),
        },
      });
      return {
        status: "ready",
        session: sessionRef.current ?? refreshed.session,
      };
    }

    const requestKey = buildAuthSessionCacheKey(requestSession);
    if (requestKey) {
      const cached = ensuredSessionCacheRef.current;
      if (
        cached &&
        cached.key === requestKey &&
        Date.now() - cached.checkedAt <= ENSURED_SESSION_CACHE_TTL_MS
      ) {
        if (!sessionsEqual(cached.session, requestSession)) {
          if (!adoptAuthSession(cached.session, epochAtRequestStart)) {
            return { status: "transient_failure", reason: "session_changed" };
          }
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
        return {
          status: "ready",
          session: sessionRef.current ?? cached.session,
        };
      }
      if (ensuredSessionInFlightRef.current?.key === requestKey) {
        const ensuredResult = await ensuredSessionInFlightRef.current.promise;
        if (authSessionEpochRef.current !== epochAtRequestStart) {
          return { status: "transient_failure", reason: "session_changed" };
        }
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_session_ensure",
          status: ensuredResult.status === "ready" ? "success" : "failure",
          detail: {
            source,
            sharedInFlight: true,
            durationMs: Date.now() - startedAt,
          },
        });
        return ensuredResult;
      }
    }

    const promise = (async (): Promise<UsableAuthSessionResult> => {
      const ensured = await ensureAuthSessionForAuthenticatedSendResult({
        session: requestSession,
        sessionRef,
        refreshLockedResult: refreshAuthSessionLockedResult,
      });
      if (authSessionEpochRef.current !== epochAtRequestStart) {
        return { status: "transient_failure", reason: "session_changed" };
      }
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
        return { status: "terminal_failure", reason: ensured.reason };
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
            runtimeProbeAccepted: ensured.runtimeAcceptance?.accepted ?? null,
            runtimeProbeFailureStage: ensured.runtimeAcceptance?.failureStage ?? null,
            runtimeProbeError: ensured.runtimeAcceptance?.error ?? null,
          },
        });
        return { status: "transient_failure", reason: ensured.reason };
      }
      if (!sessionsEqual(ensured.session, requestSession)) {
        if (!adoptAuthSession(ensured.session, epochAtRequestStart)) {
          return { status: "transient_failure", reason: "session_changed" };
        }
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
      return {
        status: "ready",
        session: sessionRef.current ?? ensured.session,
      };
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
  }, [adoptAuthSession, expireAuthSessionLocally, refreshAuthSessionLockedResult]);

  const ensureUsableAuthSession = useCallback(async (
    currentSession: AuthSession | null | undefined = sessionRef.current,
    sourceInput?: string,
    options?: { forceRefresh?: boolean },
  ): Promise<AuthSession | null> => {
    const result = await ensureUsableAuthSessionResult(
      currentSession,
      sourceInput,
      options,
    );
    return result.status === "ready" ? result.session : null;
  }, [ensureUsableAuthSessionResult]);

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
    authBootstrapAttemptIdRef.current += 1;
    markAuthBootstrapComplete();
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
  }, [clearSessionLocally, markAuthBootstrapComplete, onAfterSignOutRef, onBeforeSignOutRef]);

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
        authBootstrapAttemptIdRef.current += 1;
        markAuthBootstrapComplete();
        return clearSessionLocally();
      },
      sessionExpiredMessage: AUTH_SESSION_EXPIRED_MESSAGE,
    });
  }, [clearSessionLocally, markAuthBootstrapComplete, refreshAuthSessionLocked, refreshAuthSessionLockedResult]);

  useWebAuthSessionLifecycle<AuthSession>({
    resumeEpoch: params.resumeEpoch,
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
      const sessionIdentity = String(currentSession.user?.id ?? "").trim();
      if (!sessionIdentity || sessionReadyIdentityRef.current === sessionIdentity) return;
      const epochAtSessionAvailable = authSessionEpochRef.current;
      sessionReadyIdentityRef.current = sessionIdentity;
      void (async () => {
        try {
          const usableSession = await ensureUsableAuthSession(currentSession, "session_available");
          if (
            !usableSession ||
            authSessionEpochRef.current !== epochAtSessionAvailable
          ) {
            if (sessionReadyIdentityRef.current === sessionIdentity) {
              sessionReadyIdentityRef.current = null;
            }
            return;
          }
          await onSessionReadyRef.current(usableSession);
          if (authSessionEpochRef.current !== epochAtSessionAvailable) {
            await onSessionLostRef.current();
          }
        } catch (error) {
          if (sessionReadyIdentityRef.current === sessionIdentity) {
            sessionReadyIdentityRef.current = null;
          }
          console.warn("auth_session_ready_failed", error);
        }
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
        sessionReadyIdentityRef.current = null;
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
    onResumeWithSession: (currentSession) => {
      const epochAtResumeStart = authSessionEpochRef.current;
      void (async () => {
        const usableSession = await ensureUsableAuthSession(currentSession, "session_resume");
        if (
          !usableSession ||
          authSessionEpochRef.current !== epochAtResumeStart
        ) return;
        await onSessionResumeReadyRef.current(usableSession);
        if (authSessionEpochRef.current !== epochAtResumeStart) {
          await onSessionLostRef.current();
        }
      })();
    },
  });

  useEffect(() => {
    if (authBootstrapCompleteRef.current) return;
    let cancelled = false;
    const attemptId = ++authBootstrapAttemptIdRef.current;
    const epochAtBootstrapStart = authSessionEpochRef.current;
    const isCurrentAttempt = () =>
      !cancelled &&
      authBootstrapAttemptIdRef.current === attemptId;

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
        if (!isCurrentAttempt()) return;
        if (currentSession) {
          const usableSessionResult = await ensureUsableAuthSessionResult(
            currentSession,
            "bootstrap",
          );
          if (!isCurrentAttempt()) return;
          if (usableSessionResult.status === "ready") {
            markAuthBootstrapComplete();
            clearAuthSignedOutIntentMarker();
            if (!adoptAuthSession(
              usableSessionResult.session,
              epochAtBootstrapStart,
            )) return;
            if (hadPendingAuthFlow) {
              didJustSignInRef.current = true;
            }
            clearAuthFlowPending();
            setAuthError(null);
            return;
          }
          if (usableSessionResult.status === "transient_failure") {
            throw new Error(
              `auth_bootstrap_temporarily_unavailable:${usableSessionResult.reason}`,
            );
          }
        }

        if (sessionRef.current) {
          await clearSessionLocally();
          if (!isCurrentAttempt()) return;
        }
        markAuthBootstrapComplete();
        if (hadPendingAuthFlow) {
          clearAuthFlowPending();
        }
      } catch (error) {
        if (!isCurrentAttempt()) return;
        const bootstrapDurationMs = Date.now() - bootstrapStartedAt;
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "auth_bridge_bootstrap",
          status: "failure",
          detail: {
            hadPendingAuthFlow,
            durationMs: bootstrapDurationMs,
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
        captureAppException(error, {
          tags: {
            surface: "web_auth_bootstrap",
            phase: "session_admission",
          },
          extras: {
            durationMs: bootstrapDurationMs,
            attempt: authBootstrapAttempt + 1,
          },
        });
        captureProductAnalyticsEvent("auth_bootstrap_failed", {
          duration_ms: bootstrapDurationMs,
          attempt: authBootstrapAttempt + 1,
        });
        setAuthBootstrapStatus("failed");
        setAuthError(
          "We could not verify your session yet. Try again.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    adoptAuthSession,
    clearSessionLocally,
    ensureUsableAuthSessionResult,
    markAuthBootstrapComplete,
    authBootstrapAttempt,
  ]);

  const isAuthResolvingSignedInState = useMemo(() => {
    if (isAuthSigningOut) return false;
    return authBootstrapStatus !== "ready";
  }, [authBootstrapStatus, isAuthSigningOut]);

  const authPresentationState = useMemo<
    "signed_out" | "recovering_signed_in" | "verification_failed" | "signed_in"
  >(() => {
    if (session) return "signed_in";
    if (authBootstrapStatus === "failed") return "verification_failed";
    if (authBootstrapStatus === "resolving") return "recovering_signed_in";
    return "signed_out";
  }, [authBootstrapStatus, session]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const key = String(event.key ?? "").trim();
      if (key !== AUTH_SIGNED_OUT_INTENT_KEY || event.newValue !== "1") return;
      authSessionEpochRef.current += 1;
      authBootstrapAttemptIdRef.current += 1;
      markAuthBootstrapComplete();
      void clearSessionLocally();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [clearSessionLocally, markAuthBootstrapComplete]);

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
    retryAuthBootstrap,
    requireSignIn,
    handleSignOut,
    ensureUsableAuthSession,
    fetchWithAuth,
    fetchWithPublic,
    sessionArg,
    authenticatedSessionArg,
  };
}
