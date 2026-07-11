import { ConvexReactClient, type AuthTokenFetcher } from "convex/react";

import { resolveConvexRuntimeToken, type AuthSessionLike } from "./authSession";

export type ConvexRealtimeEnsureSession<SessionT> = (
  session: SessionT,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<SessionT | null>;

export type ConvexRealtimeAuthState<SessionT> = {
  sessionRef: { current: SessionT | null };
  ensureSessionRef: {
    current: ConvexRealtimeEnsureSession<SessionT> | undefined;
  };
};

export type AuthenticatedConvexRealtimeClient = {
  client: ConvexReactClient;
  reauthenticate: () => void;
  close: () => void;
};

const REAUTH_RETRY_DELAYS_MS = [1_000, 3_000, 10_000, 30_000] as const;

export function createConvexRealtimeTokenFetcher<SessionT>(params: {
  authState: ConvexRealtimeAuthState<SessionT>;
  source: string;
}): AuthTokenFetcher {
  return async ({ forceRefreshToken }) => {
    const currentSession = params.authState.sessionRef.current;
    if (!currentSession) return null;

    if (forceRefreshToken && params.authState.ensureSessionRef.current) {
      const refreshedSession = await params.authState.ensureSessionRef.current(
        currentSession,
        params.source,
        { forceRefresh: true },
      );
      if (!refreshedSession) return null;
      params.authState.sessionRef.current = refreshedSession;
    }

    return resolveConvexRuntimeToken(
      params.authState.sessionRef.current as AuthSessionLike,
    );
  };
}

export function createAuthenticatedConvexRealtimeClient<SessionT>(params: {
  convexUrl: string;
  authState: ConvexRealtimeAuthState<SessionT>;
  source: string;
}): AuthenticatedConvexRealtimeClient {
  const client = new ConvexReactClient(params.convexUrl, {
    initialAuthTokenReuse: true,
  });
  const fetchToken = createConvexRealtimeTokenFetcher({
    authState: params.authState,
    source: params.source,
  });
  let isClosed = false;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetry = () => {
    if (retryTimer === null) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  };

  const applyAuth = () => {
    if (isClosed) return;
    clearRetry();
    client.setAuth(fetchToken, (isAuthenticated) => {
      if (isClosed) return;
      if (isAuthenticated) {
        retryAttempt = 0;
        clearRetry();
        return;
      }
      if (!params.authState.sessionRef.current || retryTimer !== null) return;
      const delay = REAUTH_RETRY_DELAYS_MS[
        Math.min(retryAttempt, REAUTH_RETRY_DELAYS_MS.length - 1)
      ];
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        applyAuth();
      }, delay);
    });
  };

  applyAuth();

  return {
    client,
    reauthenticate: () => {
      retryAttempt = 0;
      applyAuth();
    },
    close: () => {
      if (isClosed) return;
      isClosed = true;
      clearRetry();
      void client.close();
    },
  };
}
