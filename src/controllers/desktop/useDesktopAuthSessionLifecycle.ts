import { useEffect, useRef, type MutableRefObject } from "react";
import {
  useSupabaseSessionAutoRefresh,
  useSupabaseSessionFocusRefresh,
  useSupabaseSessionRefSync,
} from "../../../shared/useSupabaseSessionLifecycle";

type SessionLike = {
  expires_at: number;
  refresh_token: string;
};

export function useDesktopAuthSessionLifecycle<TSession extends SessionLike>(params: {
  session: TSession | null;
  sessionRef: MutableRefObject<TSession | null>;
  threadsHydratedRef: MutableRefObject<boolean>;
  refreshTimeoutRef: MutableRefObject<number | null>;
  refreshLocked: (refreshToken: string) => Promise<TSession | null>;
  onMountBootstrap: () => void | Promise<void>;
  onSessionAvailable: (session: TSession) => void;
  onFocusWithSession: (session: TSession) => void;
}) {
  const onMountBootstrapRef = useRef(params.onMountBootstrap);
  const onSessionAvailableRef = useRef(params.onSessionAvailable);

  useEffect(() => {
    onMountBootstrapRef.current = params.onMountBootstrap;
  }, [params.onMountBootstrap]);

  useEffect(() => {
    onSessionAvailableRef.current = params.onSessionAvailable;
  }, [params.onSessionAvailable]);

  useEffect(() => {
    void onMountBootstrapRef.current();
  }, []);

  useSupabaseSessionRefSync({
    session: params.session,
    sessionRef: params.sessionRef,
    onSessionCleared: () => {
      params.threadsHydratedRef.current = false;
    },
  });

  useSupabaseSessionAutoRefresh({
    session: params.session,
    sessionRef: params.sessionRef,
    timeoutRef: params.refreshTimeoutRef,
    refreshLocked: params.refreshLocked,
    retryDelayMs: 30_000,
    retryIfNotExpired: true,
  });

  useSupabaseSessionFocusRefresh({
    sessionRef: params.sessionRef,
    refreshLocked: params.refreshLocked,
    onFocusWithSession: params.onFocusWithSession,
    thresholdSec: 60,
  });

  useEffect(() => {
    if (!params.session) return;
    onSessionAvailableRef.current(params.session);
  }, [params.session]);
}
