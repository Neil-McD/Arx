import { useEffect, useRef, type MutableRefObject } from "react";
import {
  bindCloudFocusRefresh,
  clearCloudRefreshTimer,
  scheduleCloudRefreshTimeout,
  scheduleCloudRefreshTimer,
} from "./cloudSessionRefreshTimer";

export type CloudSessionLike = {
  expires_at: number;
};

type SessionRef<TSession> = MutableRefObject<TSession | null>;
type TimeoutRef = MutableRefObject<number | null>;

function useLatestRef<TValue>(value: TValue): MutableRefObject<TValue> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function useCloudSessionRefSync<TSession>(params: {
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

function useCloudSessionAutoRefresh<TSession extends CloudSessionLike>(params: {
  session: TSession | null;
  sessionRef: SessionRef<TSession>;
  timeoutRef: TimeoutRef;
  refreshLocked: () => Promise<unknown>;
  retryDelayMs?: number;
  retryIfNotExpired?: boolean;
}) {
  const refreshLockedRef = useLatestRef(params.refreshLocked);

  useEffect(() => {
    clearCloudRefreshTimer(params.timeoutRef);
    if (!params.session) return;

    const attemptRefresh = async () => {
      const current = params.sessionRef.current;
      if (!current) return;
      const refreshed = await refreshLockedRef.current();
      if (refreshed) return;

      if (!params.retryIfNotExpired || !params.retryDelayMs) return;
      const now = Math.floor(Date.now() / 1000);
      if (current.expires_at > now) {
        scheduleCloudRefreshTimeout({
          timeoutRef: params.timeoutRef,
          delayMs: params.retryDelayMs,
          triggerRefresh: () => {
            void attemptRefresh();
          },
        });
      }
    };

    scheduleCloudRefreshTimer({
      timeoutRef: params.timeoutRef,
      expiresAtSec: params.session.expires_at,
      triggerRefresh: () => {
        void attemptRefresh();
      },
    });

    return () => {
      clearCloudRefreshTimer(params.timeoutRef);
    };
  }, [
    params.session,
    params.sessionRef,
    params.timeoutRef,
    params.retryDelayMs,
    params.retryIfNotExpired,
  ]);
}

function useCloudSessionFocusRefresh<TSession extends CloudSessionLike>(params: {
  sessionRef: SessionRef<TSession>;
  refreshLocked: () => Promise<unknown>;
  onFocusWithSession: (session: TSession) => void;
  thresholdSec?: number;
}) {
  const refreshLockedRef = useLatestRef(params.refreshLocked);
  const onFocusWithSessionRef = useLatestRef(params.onFocusWithSession);

  useEffect(() => {
    return bindCloudFocusRefresh({
      sessionRef: params.sessionRef,
      refreshLocked: () => refreshLockedRef.current(),
      thresholdSec: params.thresholdSec ?? 60,
      onFocusWithSession: (session) => {
        onFocusWithSessionRef.current(session);
      },
    });
  }, [params.sessionRef, params.thresholdSec]);
}

export function useCloudAuthSessionLifecycle<TSession extends CloudSessionLike>(params: {
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

  useCloudSessionRefSync({
    session: params.session,
    sessionRef: params.sessionRef,
    onSessionCleared: params.onSessionCleared,
  });

  useCloudSessionAutoRefresh({
    session: params.session,
    sessionRef: params.sessionRef,
    timeoutRef: params.refreshTimeoutRef,
    refreshLocked: params.refreshLocked,
    retryDelayMs: params.autoRefreshRetryDelayMs,
    retryIfNotExpired: params.autoRefreshRetryIfNotExpired,
  });

  useCloudSessionFocusRefresh({
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
