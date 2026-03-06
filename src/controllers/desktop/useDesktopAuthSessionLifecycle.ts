import { type MutableRefObject } from "react";
import {
  type CloudSessionLike,
  useCloudAuthSessionLifecycle,
} from "../../../shared/useCloudSessionLifecycle";

export function useDesktopAuthSessionLifecycle<TSession extends CloudSessionLike>(params: {
  session: TSession | null;
  sessionRef: MutableRefObject<TSession | null>;
  threadsHydratedRef: MutableRefObject<boolean>;
  refreshTimeoutRef: MutableRefObject<number | null>;
  refreshLocked: (refreshToken: string) => Promise<TSession | null>;
  onMountBootstrap: () => void | Promise<void>;
  onSessionAvailable: (session: TSession) => void;
  onFocusWithSession: (session: TSession) => void;
}) {
  useCloudAuthSessionLifecycle({
    session: params.session,
    sessionRef: params.sessionRef,
    refreshTimeoutRef: params.refreshTimeoutRef,
    refreshLocked: params.refreshLocked,
    onMount: params.onMountBootstrap,
    onSessionAvailable: params.onSessionAvailable,
    onFocusWithSession: params.onFocusWithSession,
    onSessionCleared: () => {
      params.threadsHydratedRef.current = false;
    },
    autoRefreshRetryDelayMs: 30_000,
    autoRefreshRetryIfNotExpired: true,
  });
}
