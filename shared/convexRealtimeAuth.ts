import { ConvexReactClient, type AuthTokenFetcher } from "convex/react";

import {
  resolveAuthSubject,
  resolveConvexRuntimeToken,
  type AuthSessionLike,
} from "./authSession";

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

export type AuthenticatedConvexRealtimeLease = {
  client: ConvexReactClient;
  authSubject: string;
  close: () => void;
};

type SharedRealtimeEntry = {
  authSubject: string;
  realtimeClient: AuthenticatedConvexRealtimeClient;
  authState: ConvexRealtimeAuthState<any>;
  refCount: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
};

type RealtimeClientFactory = (params: {
  convexUrl: string;
  authState: ConvexRealtimeAuthState<any>;
  source: string;
}) => AuthenticatedConvexRealtimeClient;

const SHARED_REALTIME_CLOSE_LINGER_MS = 1_500;
const SHARED_REALTIME_AUTH_SOURCE = "convex_realtime_shared";

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

/**
 * One authenticated transport per Convex deployment and actor. Gateways own
 * query leases; this pool alone owns connection, refresh, and close lifecycle.
 */
export class AuthenticatedConvexRealtimePool {
  private readonly entries = new Map<string, SharedRealtimeEntry>();
  private readonly createClient: RealtimeClientFactory;
  private readonly closeLingerMs: number;
  private readonly scheduleClose: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly cancelClose: (timer: ReturnType<typeof setTimeout>) => void;

  constructor(options?: {
    createClient?: RealtimeClientFactory;
    closeLingerMs?: number;
    scheduleClose?: (
      callback: () => void,
      delayMs: number,
    ) => ReturnType<typeof setTimeout>;
    cancelClose?: (timer: ReturnType<typeof setTimeout>) => void;
  }) {
    this.createClient = options?.createClient ?? createAuthenticatedConvexRealtimeClient;
    this.closeLingerMs = Math.max(0, options?.closeLingerMs ?? SHARED_REALTIME_CLOSE_LINGER_MS);
    this.scheduleClose = options?.scheduleClose ?? setTimeout;
    this.cancelClose = options?.cancelClose ?? clearTimeout;
  }

  acquire<SessionT>(params: {
    convexUrl: string;
    session: SessionT;
    ensureSession?: ConvexRealtimeEnsureSession<SessionT>;
  }): AuthenticatedConvexRealtimeLease {
    const convexUrl = String(params.convexUrl ?? "").trim();
    if (!convexUrl) throw new Error("convex_url_required");
    const authSubject = resolveAuthSubject(params.session as AuthSessionLike);
    if (!authSubject) throw new Error("convex_auth_subject_required");
    const runtimeToken = resolveConvexRuntimeToken(params.session as AuthSessionLike);
    if (!runtimeToken) throw new Error("convex_identity_token_required");

    const key = `${convexUrl}::${authSubject}`;
    let entry = this.entries.get(key) ?? null;
    if (entry) {
      const previousRuntimeToken = resolveConvexRuntimeToken(
        entry.authState.sessionRef.current as AuthSessionLike,
      );
      entry.refCount += 1;
      entry.authState.sessionRef.current = params.session;
      if (params.ensureSession) {
        entry.authState.ensureSessionRef.current = params.ensureSession;
      }
      if (entry.closeTimer !== null) {
        this.cancelClose(entry.closeTimer);
        entry.closeTimer = null;
      }
      if (previousRuntimeToken !== runtimeToken) {
        entry.realtimeClient.reauthenticate();
      }
    } else {
      const authState: ConvexRealtimeAuthState<SessionT> = {
        sessionRef: { current: params.session },
        ensureSessionRef: { current: params.ensureSession },
      };
      const realtimeClient = this.createClient({
        convexUrl,
        authState,
        source: SHARED_REALTIME_AUTH_SOURCE,
      });
      entry = {
        authSubject,
        realtimeClient,
        authState,
        refCount: 1,
        closeTimer: null,
      };
      this.entries.set(key, entry);
    }

    const acquired = entry;
    let released = false;
    return {
      client: acquired.realtimeClient.client,
      authSubject,
      close: () => {
        if (released) return;
        released = true;
        if (this.entries.get(key) !== acquired) return;
        acquired.refCount = Math.max(0, acquired.refCount - 1);
        if (acquired.refCount > 0 || acquired.closeTimer !== null) return;
        acquired.closeTimer = this.scheduleClose(() => {
          acquired.closeTimer = null;
          if (acquired.refCount > 0 || this.entries.get(key) !== acquired) return;
          this.entries.delete(key);
          acquired.realtimeClient.close();
        }, this.closeLingerMs);
      },
    };
  }

  closeForSubject(authSubjectInput: string): void {
    const authSubject = String(authSubjectInput ?? "").trim();
    if (!authSubject) return;
    for (const [key, entry] of this.entries) {
      if (entry.authSubject !== authSubject) continue;
      this.closeEntry(key, entry);
    }
  }

  private closeEntry(key: string, entry: SharedRealtimeEntry): void {
    if (this.entries.get(key) !== entry) return;
    this.entries.delete(key);
    if (entry.closeTimer !== null) {
      this.cancelClose(entry.closeTimer);
      entry.closeTimer = null;
    }
    entry.refCount = 0;
    entry.realtimeClient.close();
  }
}

const authenticatedRealtimePool = new AuthenticatedConvexRealtimePool();

export function acquireAuthenticatedConvexRealtimeClient<SessionT>(params: {
  convexUrl: string;
  session: SessionT;
  ensureSession?: ConvexRealtimeEnsureSession<SessionT>;
}): AuthenticatedConvexRealtimeLease {
  return authenticatedRealtimePool.acquire(params);
}

export function closeAuthenticatedConvexRealtimeClientsForSubject(authSubject: string): void {
  authenticatedRealtimePool.closeForSubject(authSubject);
}
