import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  AUTH_SIGNED_OUT_INTENT_KEY,
  AUTH_SIGNED_OUT_TAB_INTENT_KEY,
  clearAuthFlowPending,
  clearAuthSignedOutIntentMarker,
  ensureAuthSessionForRequestResult,
  fetchWithAuthShared,
  fetchWithPublicShared,
  hasRecentAuthFlowPending,
  markAuthFlowPending,
  refreshAuthSessionResult,
  refreshAuthSessionWithLockResult,
  sendAuthMagicLinkOtp,
  bootstrapSession,
  type AuthSession,
  type AuthSessionRefreshResult,
} from "../auth";
import {
  AUTH_SESSION_EXPIRED_MESSAGE,
  beginGoogleSignIn,
  revokeAuthSessionRemote,
} from "../../../../shared/authFlow";
import {
  clearAuthResumeState,
  parsePendingAuthIntentInput,
  readAuthResumeState,
  storeAuthResumeState,
} from "../../../../shared/authResumeState";
import { formatAuthSessionErrorMessage } from "../../../../shared/appErrorMappings";
import { clearOAuthCallbackParamsFromLocation } from "../../../../shared/cloudPkce";
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

export function useWebAppAuthController(
  params: UseWebAppAuthControllerParams,
): UseWebAppAuthControllerResult {
  const [session, setAuthSession] = useState<AuthSession | null>(null);
  const [isAuthBootstrapComplete, setIsAuthBootstrapComplete] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
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
      refreshSession: () => refreshAuthSessionResult(),
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
  ): Promise<AuthSession | null> => {
    const requestSession = currentSession ?? null;
    if (!requestSession) return null;

    const ensured = await ensureAuthSessionForRequestResult(requestSession, refreshAuthSessionLockedResult);
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

  const beginGoogleSignInFlow = useCallback(async () => {
    setAuthError(null);
    clearAuthSignedOutIntentMarker();
    markAuthFlowPending();
    storeAuthResumeState({ returnTo: readCurrentAuthReturnTo() });
    const result = await beginGoogleSignIn();
    if (!result.ok) {
      setAuthError(result.error);
      return;
    }
    window.location.assign(result.authUrl);
  }, []);

  const openAuthGate = useCallback((intentInput?: unknown) => {
    setAuthError(null);
    const intent = parsePendingAuthIntentInput(intentInput);
    if (intent && !session) {
      storeAuthResumeState({
        returnTo: readCurrentPathReturnTo(),
        intent,
      });
    }
    setIsAuthGateOpen(true);
  }, [session]);

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
    const accessToken = sessionRef.current?.access_token ?? session?.access_token ?? null;
    authSessionEpochRef.current += 1;
    setAuthError(null);
    await onBeforeSignOutRef.current?.();
    await clearSessionLocally();
    await revokeAuthSessionRemote(accessToken);
  }, [clearSessionLocally, onBeforeSignOutRef, session]);

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
      let hasSignedOutIntent = false;
      try {
        hasSignedOutIntent =
          sessionStorage.getItem(AUTH_SIGNED_OUT_TAB_INTENT_KEY) === "1" ||
          localStorage.getItem(AUTH_SIGNED_OUT_INTENT_KEY) === "1";
      } catch {
        // ignore
      }

      const hadPendingAuthFlow = hasRecentAuthFlowPending();
      let bootstrappedSession: AuthSession | null = null;
      try {
        bootstrappedSession = await bootstrapSession();
      } catch (error) {
        if (hadPendingAuthFlow) {
          const message = formatAuthSessionErrorMessage(error, "Failed to bootstrap auth session.");
          setAuthError(message);
          setIsAuthGateOpen(true);
          clearAuthFlowPending();
        }
      }

      if (hasSignedOutIntent) {
        markAuthBootstrapComplete();
        clearAuthFlowPending();
        return;
      }

      if (bootstrappedSession) {
        markAuthBootstrapComplete();
        clearAuthSignedOutIntentMarker();
        if (hadPendingAuthFlow) {
          didJustSignInRef.current = true;
        }
        adoptAuthSession(bootstrappedSession);

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

      markAuthBootstrapComplete();
      if (hadPendingAuthFlow) {
        setAuthError("Sign-in completed, but PolyNet could not establish your account session. Please try again.");
        setIsAuthGateOpen(true);
        clearAuthFlowPending();
        clearAuthResumeState();
      }
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
