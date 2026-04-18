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
  sendAuthMagicLinkOtp,
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
import { formatAuthSessionErrorMessage } from "../../../../shared/appErrorMappings";
import { clearOAuthCallbackParamsFromLocation } from "../../../../shared/cloudPkce";
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
  authError: string | null;
  authRuntimeAcceptance: ConvexAuthenticatedSessionProbeResult | null;
  magicLinkEmail: string;
  setMagicLinkEmail: (value: string) => void;
  magicLinkStatus: "idle" | "sending" | "sent";
  magicLinkError: string | null;
  isAuthGateOpen: boolean;
  setIsAuthGateOpen: (value: boolean) => void;
  handleSignIn: () => Promise<void>;
  handleSendMagicLink: (email: string) => Promise<void>;
  openAuthGate: (intentInput?: unknown) => void;
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
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkStatus, setMagicLinkStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);
  const [isAuthGateOpen, setIsAuthGateOpen] = useState(false);

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
    setIsAuthGateOpen(true);
    clearAuthFlowPending();
    clearOAuthCallbackParamsFromLocation();
  }, []);

  const markAuthBootstrapComplete = useCallback(() => {
    authBootstrapCompleteRef.current = true;
    setIsAuthBootstrapComplete(true);
  }, []);

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

  const beginGoogleSignInFlow = useCallback(async () => {
    setAuthError(null);
    clearAuthSignedOutIntentMarker();
    markAuthFlowPending();
    storeAuthResumeState({ returnTo: readCurrentAuthReturnTo() });
    try {
      await workos.signIn();
    } catch (error) {
      setAuthError(errorToMessage(error, "Sign-in failed."));
      setIsAuthGateOpen(true);
    }
  }, [workos]);

  const openAuthGate = useCallback((intentInput?: unknown) => {
    setAuthError(null);
    const intent = parsePendingAuthIntentInput(intentInput);
    if (intent && !session) {
      storeAuthResumeState({
        returnTo: readCurrentPathReturnTo(),
        intent,
      });
    }
    if (!session) {
      setIsAuthGateOpen(false);
      void beginGoogleSignInFlow();
      return;
    }
    setIsAuthGateOpen(true);
  }, [beginGoogleSignInFlow, session]);

  const handleSendMagicLink = useCallback(async (email: string): Promise<void> => {
    const trimmed = email.trim();
    if (!trimmed) {
      setMagicLinkError("Email is required.");
      setMagicLinkStatus("idle");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setMagicLinkError("Enter a valid email.");
      setMagicLinkStatus("idle");
      return;
    }

    clearAuthSignedOutIntentMarker();
    markAuthFlowPending();
    storeAuthResumeState({ returnTo: readCurrentPathReturnTo() });
    setMagicLinkStatus("sending");
    setMagicLinkError(null);
    try {
      await sendAuthMagicLinkOtp({
        email: trimmed,
        createUser: true,
        redirectTo: window.location.origin,
      });
      setMagicLinkStatus("sent");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to send magic link.";
      setMagicLinkError(message);
      setMagicLinkStatus("idle");
    }
  }, []);

  const handleSignOut = useCallback(async (): Promise<void> => {
    clearAuthFlowPending();
    authSessionEpochRef.current += 1;
    setAuthError(null);
    await onBeforeSignOutRef.current?.();
    await clearSessionLocally();
    try {
      await workos.signOut({ returnTo: window.location.origin });
    } catch (error) {
      if (!isWorkOsLoginRequiredError(error)) {
        console.warn("WorkOS sign-out failed", error);
      }
    }
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
    onMountOAuthBootstrap: async () => {
      markAuthBootstrapComplete();
    },
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
      logWorkOsBootstrap("bootstrap_begin", {
        phase: "bootstrap",
        hadPendingAuthFlow,
        workos: readWorkOsBootstrapDebugState(workos),
      });
      if (hasSignedOutIntent) {
        if (cancelled) return;
        markAuthBootstrapComplete();
        clearAuthFlowPending();
        return;
      }

      let bootstrappedSession: AuthSession | null = null;
      try {
        bootstrappedSession = await workos.readSession();
        logWorkOsBootstrap("bootstrap_read_session", {
          phase: "read_session",
          workos: readWorkOsBootstrapDebugState(workos),
          hasSession: Boolean(bootstrappedSession),
        });
      } catch (error) {
        if (cancelled) return;
        console.warn("[auth][workos] bootstrap_read_session_failed", {
          phase: "read_session",
          workos: readWorkOsBootstrapDebugState(workos),
          error: errorToMessage(error, "workos_bootstrap_failed"),
        });
        if (hadPendingAuthFlow) {
          setAuthError(
            buildWorkOsBootstrapDebugMessage(
              formatAuthSessionErrorMessage(error, "Failed to bootstrap WorkOS auth session."),
              { workos, phase: "read_session", error, hasSession: false },
            ),
          );
          setIsAuthGateOpen(true);
          clearAuthFlowPending();
        }
        markAuthBootstrapComplete();
        return;
      }

      if (bootstrappedSession) {
        const verifiedSession = await ensureUsableAuthSession(bootstrappedSession);
        if (cancelled) return;
        if (!verifiedSession) {
          console.warn("[auth][workos] bootstrap_verify_failed", {
            phase: "convex_probe",
            workos: readWorkOsBootstrapDebugState(workos),
            hasSession: true,
          });
          markAuthBootstrapComplete();
          setAuthError(
            buildWorkOsBootstrapDebugMessage(
              "Sign-in completed, but PolyNet could not verify your authenticated app session. Please try again.",
              { workos, phase: "convex_probe", hasSession: true },
            ),
          );
          setIsAuthGateOpen(true);
          clearAuthFlowPending();
          clearAuthResumeState();
          return;
        }

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
      if (hadPendingAuthFlow) {
        console.warn("[auth][workos] bootstrap_missing_session", {
          phase: "read_session",
          workos: readWorkOsBootstrapDebugState(workos),
          hasSession: false,
        });
        setAuthError(
          buildWorkOsBootstrapDebugMessage(
            "Sign-in completed, but PolyNet could not establish your account session. Please try again.",
            { workos, phase: "read_session", hasSession: false },
          ),
        );
        setIsAuthGateOpen(true);
        clearAuthFlowPending();
        clearAuthResumeState();
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
    onApplyPostAuthPathRef,
    workos,
  ]);

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
    authError,
    authRuntimeAcceptance,
    magicLinkEmail,
    setMagicLinkEmail,
    magicLinkStatus,
    magicLinkError,
    isAuthGateOpen,
    setIsAuthGateOpen,
    handleSignIn: beginGoogleSignInFlow,
    handleSendMagicLink,
    openAuthGate,
    handleSignOut,
    ensureUsableAuthSession,
    fetchWithAuth,
    fetchWithPublic,
    sessionArg,
    authenticatedSessionArg,
  };
}
