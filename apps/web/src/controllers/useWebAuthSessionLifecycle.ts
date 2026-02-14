import { useEffect, useRef, type MutableRefObject } from "react";
import {
  useSupabaseSessionAutoRefresh,
  useSupabaseSessionFocusRefresh,
  useSupabaseSessionRefSync,
} from "../../../../shared/useSupabaseSessionLifecycle";

type SessionLike = {
  expires_at: number;
  refresh_token: string;
};

export function useWebAuthSessionLifecycle<TSession extends SessionLike>(params: {
  session: TSession | null;
  sessionRef: MutableRefObject<TSession | null>;
  refreshTimeoutRef: MutableRefObject<number | null>;
  refreshLocked: (refreshToken: string) => Promise<TSession | null>;
  didJustSignInRef: MutableRefObject<boolean>;
  onMountOAuthBootstrap: () => void | Promise<void>;
  onDidJustSignIn: () => void;
  onSessionAvailable: (session: TSession) => void;
  onSessionMissing: () => void;
  onFocusWithSession: (session: TSession) => void;
}) {
  const onMountOAuthBootstrapRef = useRef(params.onMountOAuthBootstrap);
  const onDidJustSignInRef = useRef(params.onDidJustSignIn);
  const onSessionAvailableRef = useRef(params.onSessionAvailable);
  const onSessionMissingRef = useRef(params.onSessionMissing);

  useEffect(() => {
    onMountOAuthBootstrapRef.current = params.onMountOAuthBootstrap;
  }, [params.onMountOAuthBootstrap]);

  useEffect(() => {
    onDidJustSignInRef.current = params.onDidJustSignIn;
  }, [params.onDidJustSignIn]);

  useEffect(() => {
    onSessionAvailableRef.current = params.onSessionAvailable;
  }, [params.onSessionAvailable]);

  useEffect(() => {
    onSessionMissingRef.current = params.onSessionMissing;
  }, [params.onSessionMissing]);

  useEffect(() => {
    void onMountOAuthBootstrapRef.current();
  }, []);

  useSupabaseSessionRefSync({
    session: params.session,
    sessionRef: params.sessionRef,
  });

  useSupabaseSessionAutoRefresh({
    session: params.session,
    sessionRef: params.sessionRef,
    timeoutRef: params.refreshTimeoutRef,
    refreshLocked: params.refreshLocked,
  });

  useSupabaseSessionFocusRefresh({
    sessionRef: params.sessionRef,
    refreshLocked: params.refreshLocked,
    onFocusWithSession: params.onFocusWithSession,
    thresholdSec: 60,
  });

  useEffect(() => {
    if (!params.session) {
      onSessionMissingRef.current();
      return;
    }
    onSessionAvailableRef.current(params.session);
  }, [params.session]);

  useEffect(() => {
    if (!params.session) return;
    if (!params.didJustSignInRef.current) return;
    params.didJustSignInRef.current = false;
    onDidJustSignInRef.current();
  }, [params.session, params.didJustSignInRef]);
}
