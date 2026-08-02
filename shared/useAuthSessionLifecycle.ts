import { useEffect, useRef, type MutableRefObject } from "react";
import {
  clearRefreshTimer,
  refreshSessionIfNearExpiry,
  scheduleRefreshTimeout,
  scheduleRefreshTimer,
} from "./authSessionRefreshTimer";
import { useResumeEpochEffect } from "./useResumeEpochEffect";

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

function useSessionResumeRefresh<TSession extends ExpiringSessionLike>(params: {
  resumeEpoch: number;
  sessionRef: SessionRef<TSession>;
  refreshLocked: () => Promise<unknown>;
  onResumeWithSession: (session: TSession) => void;
  thresholdSec?: number;
}) {
  const refreshLockedRef = useLatestRef(params.refreshLocked);
  const onResumeWithSessionRef = useLatestRef(params.onResumeWithSession);

  useResumeEpochEffect(params.resumeEpoch, () => {
    const current = params.sessionRef.current;
    if (!current) return;
    void refreshSessionIfNearExpiry({
      session: current,
      refreshLocked: () => refreshLockedRef.current(),
      thresholdSec: params.thresholdSec ?? 60,
    });
    onResumeWithSessionRef.current(current);
  });
}

export function useAuthSessionLifecycle<TSession extends ExpiringSessionLike>(params: {
  resumeEpoch: number;
  session: TSession | null;
  sessionRef: SessionRef<TSession>;
  refreshTimeoutRef: TimeoutRef;
  refreshLocked: () => Promise<unknown>;
  onMount: () => void | Promise<void>;
  onSessionAvailable: (session: TSession) => void;
  onResumeWithSession: (session: TSession) => void;
  onSessionMissing?: () => void;
  onSessionCleared?: () => void;
  didJustSignInRef?: MutableRefObject<boolean>;
  onDidJustSignIn?: () => void;
  autoRefreshRetryDelayMs?: number;
  autoRefreshRetryIfNotExpired?: boolean;
  resumeThresholdSec?: number;
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

  useSessionResumeRefresh({
    resumeEpoch: params.resumeEpoch,
    sessionRef: params.sessionRef,
    refreshLocked: params.refreshLocked,
    onResumeWithSession: params.onResumeWithSession,
    thresholdSec: params.resumeThresholdSec ?? 60,
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
