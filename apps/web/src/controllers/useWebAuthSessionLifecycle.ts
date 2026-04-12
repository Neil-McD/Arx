import { type MutableRefObject } from "react";
import {
  type ExpiringSessionLike,
  useAuthSessionLifecycle,
} from "../../../../shared/useAuthSessionLifecycle";

export function useWebAuthSessionLifecycle<TSession extends ExpiringSessionLike>(params: {
  session: TSession | null;
  sessionRef: MutableRefObject<TSession | null>;
  refreshTimeoutRef: MutableRefObject<number | null>;
  refreshLocked: () => Promise<TSession | null>;
  didJustSignInRef: MutableRefObject<boolean>;
  onMountOAuthBootstrap: () => void | Promise<void>;
  onDidJustSignIn: () => void;
  onSessionAvailable: (session: TSession) => void;
  onSessionMissing: () => void;
  onFocusWithSession: (session: TSession) => void;
}) {
  useAuthSessionLifecycle({
    session: params.session,
    sessionRef: params.sessionRef,
    refreshTimeoutRef: params.refreshTimeoutRef,
    refreshLocked: params.refreshLocked,
    onMount: params.onMountOAuthBootstrap,
    onSessionAvailable: params.onSessionAvailable,
    onSessionMissing: params.onSessionMissing,
    onFocusWithSession: params.onFocusWithSession,
    didJustSignInRef: params.didJustSignInRef,
    onDidJustSignIn: params.onDidJustSignIn,
  });
}
