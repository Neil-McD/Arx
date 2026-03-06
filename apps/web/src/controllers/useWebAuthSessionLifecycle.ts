import { type MutableRefObject } from "react";
import {
  type CloudSessionLike,
  useCloudAuthSessionLifecycle,
} from "../../../../shared/useCloudSessionLifecycle";

export function useWebAuthSessionLifecycle<TSession extends CloudSessionLike>(params: {
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
  useCloudAuthSessionLifecycle({
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
