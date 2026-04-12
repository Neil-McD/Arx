import { useEffect, useRef, type MutableRefObject } from "react";
import {
  bindFocusRefresh,
  clearRefreshTimer,
  scheduleRefreshTimeout,
  scheduleRefreshTimer,
} from "./authSessionRefreshTimer";

type SessionRef<TSession> = MutableRefObject<TSession | null>;
type TimeoutRef = MutableRefObject<number | null>;

function useLatestRef<TValue>(value: TValue): MutableRefObject<TValue> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export type ExpiringSessionLike = {
  expires_at: number;
};

function useSessionRefSync<TSession>(params: {
  session: TSession | null;
  sessionRef: SessionRef<TSession>;
  onSessionCleared?: () => void;
}) {
  const onSessionClearedRef = useLatestRef(params.onSessionCleared);

  useEffect(() => {
    params.sessionRef.current = params.session;
    if (!params.session) {
      onSessionClearedRef.current?.();
    }
  }, [params.session, params.sessionRef]);
}

function useSessionAutoRefresh<TSession extends ExpiringSessionLike>(params: {
  session: TSession | null;
  sessionRef: SessionRef<TSession>;
  timeoutRef: TimeoutRef;
  refreshLocked: () => Promise<unknown>;
  retryDelayMs?: number;
  retryIfNotExpired?: boolean;
}) {
  const refreshLockedRef = useLatestRef(params.refreshLocked);

  useEffect(() => {
    clearRefreshTimer(params.timeoutRef);
    if (!params.session) return;

    const attemptRefresh = async () => {
      const current = params.sessionRef.current;
      if (!current) return;
      const refreshed = await refreshLockedRef.current();
      if (refreshed) return;

      if (!params.retryIfNotExpired || !params.retryDelayMs) return;
      const now = Math.floor(Date.now() / 1000);
      if (current.expires_at > now) {
        scheduleRefreshTimeout({
          timeoutRef: params.timeoutRef,
          delayMs: params.retryDelayMs,
          triggerRefresh: () => {
            void attemptRefresh();
          },
        });
      }
    };

    scheduleRefreshTimer({
      timeoutRef: params.timeoutRef,
      expiresAtSec: params.session.expires_at,
      triggerRefresh: () => {
        void attemptRefresh();
      },
    });

    return () => {
      clearRefreshTimer(params.timeoutRef);
    };
  }, [
    params.session,
    params.sessionRef,
    params.timeoutRef,
    params.retryDelayMs,
    params.retryIfNotExpired,
  ]);
}

function useSessionFocusRefresh<TSession extends ExpiringSessionLike>(params: {
  sessionRef: SessionRef<TSession>;
  refreshLocked: () => Promise<unknown>;
  onFocusWithSession: (session: TSession) => void;
  thresholdSec?: number;
}) {
  const refreshLockedRef = useLatestRef(params.refreshLocked);
  const onFocusWithSessionRef = useLatestRef(params.onFocusWithSession);

  useEffect(() => {
    return bindFocusRefresh({
      sessionRef: params.sessionRef,
      refreshLocked: () => refreshLockedRef.current(),
      thresholdSec: params.thresholdSec ?? 60,
      onFocusWithSession: (session) => {
        onFocusWithSessionRef.current(session);
      },
    });
  }, [params.sessionRef, params.thresholdSec]);
}

export function useAuthSessionLifecycle<TSession extends ExpiringSessionLike>(params: {
  session: TSession | null;
  sessionRef: SessionRef<TSession>;
  refreshTimeoutRef: TimeoutRef;
  refreshLocked: () => Promise<unknown>;
  onMount: () => void | Promise<void>;
  onSessionAvailable: (session: TSession) => void;
  onFocusWithSession: (session: TSession) => void;
  onSessionMissing?: () => void;
  onSessionCleared?: () => void;
  didJustSignInRef?: MutableRefObject<boolean>;
  onDidJustSignIn?: () => void;
  autoRefreshRetryDelayMs?: number;
  autoRefreshRetryIfNotExpired?: boolean;
  focusThresholdSec?: number;
}) {
  const onMountRef = useLatestRef(params.onMount);
  const onSessionAvailableRef = useLatestRef(params.onSessionAvailable);
  const onSessionMissingRef = useLatestRef(params.onSessionMissing);
  const onDidJustSignInRef = useLatestRef(params.onDidJustSignIn);

  useEffect(() => {
    void onMountRef.current();
  }, []);

  useSessionRefSync({
    session: params.session,
    sessionRef: params.sessionRef,
    onSessionCleared: params.onSessionCleared,
  });

  useSessionAutoRefresh({
    session: params.session,
    sessionRef: params.sessionRef,
    timeoutRef: params.refreshTimeoutRef,
    refreshLocked: params.refreshLocked,
    retryDelayMs: params.autoRefreshRetryDelayMs,
    retryIfNotExpired: params.autoRefreshRetryIfNotExpired,
  });

  useSessionFocusRefresh({
    sessionRef: params.sessionRef,
    refreshLocked: params.refreshLocked,
    onFocusWithSession: params.onFocusWithSession,
    thresholdSec: params.focusThresholdSec ?? 60,
  });

  useEffect(() => {
    if (!params.session) {
      onSessionMissingRef.current?.();
      return;
    }
    onSessionAvailableRef.current(params.session);
  }, [params.session]);

  useEffect(() => {
    if (!params.session) return;
    if (!params.didJustSignInRef || !params.onDidJustSignIn) return;
    if (!params.didJustSignInRef.current) return;
    params.didJustSignInRef.current = false;
    onDidJustSignInRef.current?.();
  }, [params.session, params.didJustSignInRef, params.onDidJustSignIn]);
}
