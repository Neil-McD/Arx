import { useEffect, useRef, type MutableRefObject } from "react";
import {
  bindSupabaseFocusRefresh,
  clearSupabaseRefreshTimer,
  scheduleSupabaseRefreshTimeout,
  scheduleSupabaseRefreshTimer,
} from "./supabaseSessionRefreshTimer";

type SessionLike = {
  expires_at: number;
  refresh_token: string;
};

type SessionRef<TSession> = MutableRefObject<TSession | null>;
type TimeoutRef = MutableRefObject<number | null>;

export function useSupabaseSessionRefSync<TSession>(params: {
  session: TSession | null;
  sessionRef: SessionRef<TSession>;
  onSessionCleared?: () => void;
}) {
  const onSessionClearedRef = useRef(params.onSessionCleared);

  useEffect(() => {
    onSessionClearedRef.current = params.onSessionCleared;
  }, [params.onSessionCleared]);

  useEffect(() => {
    params.sessionRef.current = params.session;
    if (!params.session) {
      onSessionClearedRef.current?.();
    }
  }, [params.session, params.sessionRef]);
}

export function useSupabaseSessionAutoRefresh<TSession extends SessionLike>(params: {
  session: TSession | null;
  sessionRef: SessionRef<TSession>;
  timeoutRef: TimeoutRef;
  refreshLocked: (refreshToken: string) => Promise<unknown>;
  retryDelayMs?: number;
  retryIfNotExpired?: boolean;
}) {
  const refreshLockedRef = useRef(params.refreshLocked);

  useEffect(() => {
    refreshLockedRef.current = params.refreshLocked;
  }, [params.refreshLocked]);

  useEffect(() => {
    clearSupabaseRefreshTimer(params.timeoutRef);
    if (!params.session) return;

    const attemptRefresh = async () => {
      const current = params.sessionRef.current;
      if (!current) return;
      const refreshed = await refreshLockedRef.current(current.refresh_token);
      if (refreshed) return;

      if (!params.retryIfNotExpired || !params.retryDelayMs) return;
      const now = Math.floor(Date.now() / 1000);
      if (current.expires_at > now) {
        scheduleSupabaseRefreshTimeout({
          timeoutRef: params.timeoutRef,
          delayMs: params.retryDelayMs,
          triggerRefresh: () => {
            void attemptRefresh();
          },
        });
      }
    };

    scheduleSupabaseRefreshTimer({
      timeoutRef: params.timeoutRef,
      expiresAtSec: params.session.expires_at,
      triggerRefresh: () => {
        void attemptRefresh();
      },
    });

    return () => {
      clearSupabaseRefreshTimer(params.timeoutRef);
    };
  }, [
    params.session,
    params.sessionRef,
    params.timeoutRef,
    params.retryDelayMs,
    params.retryIfNotExpired,
  ]);
}

export function useSupabaseSessionFocusRefresh<TSession extends SessionLike>(params: {
  sessionRef: SessionRef<TSession>;
  refreshLocked: (refreshToken: string) => Promise<unknown>;
  onFocusWithSession: (session: TSession) => void;
  thresholdSec?: number;
}) {
  const refreshLockedRef = useRef(params.refreshLocked);
  const onFocusWithSessionRef = useRef(params.onFocusWithSession);

  useEffect(() => {
    refreshLockedRef.current = params.refreshLocked;
  }, [params.refreshLocked]);

  useEffect(() => {
    onFocusWithSessionRef.current = params.onFocusWithSession;
  }, [params.onFocusWithSession]);

  useEffect(() => {
    return bindSupabaseFocusRefresh({
      sessionRef: params.sessionRef,
      refreshLocked: (refreshToken) => refreshLockedRef.current(refreshToken),
      thresholdSec: params.thresholdSec ?? 60,
      onFocusWithSession: (session) => {
        onFocusWithSessionRef.current(session);
      },
    });
  }, [params.sessionRef, params.thresholdSec]);
}
