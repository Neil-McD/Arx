export type SupabaseUser = {
  id: string;
  email?: string;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  user: SupabaseUser;
};

export type SupabaseSessionRef = {
  current: SupabaseSession | null;
};

export type SupabaseSessionRefreshInFlightRef = {
  current: Promise<SupabaseSession | null> | null;
};

export function getSupabaseUrl(): string | null {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? null;
}

export function getSupabaseAnonKey(): string | null {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? null;
}

export function getOAuthRedirectUrl(): string {
  return (import.meta.env.VITE_SUPABASE_REDIRECT_URL as string | undefined) ?? window.location.origin;
}

export async function readSupabaseError(response: Response): Promise<string> {
  try {
    const json = (await response.clone().json()) as { message?: unknown; error?: unknown };
    if (typeof json?.message === "string" && json.message.trim()) return json.message;
    if (typeof json?.error === "string" && json.error.trim()) return json.error;
  } catch {
    // ignore
  }
  try {
    const text = await response.clone().text();
    if (text.trim()) return text;
  } catch {
    // ignore
  }
  return `Supabase error (${response.status})`;
}

export function decodeJwtPayload(token: string): unknown | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

export function getSupabaseAuthUid(session: SupabaseSession): string {
  const payload = decodeJwtPayload(session.access_token);
  const sub =
    payload && typeof payload === "object" && "sub" in payload && typeof (payload as any).sub === "string"
      ? String((payload as any).sub)
      : null;
  return sub ?? session.user.id;
}

export async function refreshSupabaseSession(refreshToken: string): Promise<SupabaseSession | null> {
  const url = getSupabaseUrl();
  const apiKey = getSupabaseAnonKey();
  if (!url || !apiKey) return null;
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: SupabaseUser;
  };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    user: data.user,
  };
}

export async function exchangeSupabasePkceCodeForSession(
  authCode: string,
  codeVerifier: string,
): Promise<SupabaseSession | null> {
  const url = getSupabaseUrl();
  const apiKey = getSupabaseAnonKey();
  if (!url || !apiKey) return null;
  const response = await fetch(`${url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ auth_code: authCode, code_verifier: codeVerifier }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user?: SupabaseUser;
  };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    user: data.user ?? { id: "" },
  };
}

type SupabaseSurface = "auth_or_rest" | "functions" | "unknown" | "other";

function classifySupabaseSurface(responseUrl: string): SupabaseSurface {
  const lower = (responseUrl ?? "").trim().toLowerCase();
  if (!lower) return "unknown"; // Fail closed when the surface cannot be determined.
  if (lower.includes("/auth/v1/") || lower.includes("/rest/v1/")) return "auth_or_rest";
  if (lower.includes("/functions/v1/")) return "functions";
  return "other";
}

function includesJwtFailureText(value: string): boolean {
  const lower = (value ?? "").toLowerCase();
  if (!lower) return false;
  if (lower.includes("jwt expired")) return true;
  if (lower.includes("invalid jwt")) return true;
  if (lower.includes("jwt malformed")) return true;
  if (lower.includes("failed to decode jwt")) return true;
  return false;
}

function isBearerTokenFailureText(value: string): boolean {
  const lower = (value ?? "").trim().toLowerCase();
  if (!lower) return false;
  return lower === "invalid bearer token" || lower === "missing bearer token";
}

export async function isSupabaseJwtExpired(response: Response, requestUrl?: string): Promise<boolean> {
  if (response.ok) return false;
  if (response.status !== 400 && response.status !== 401 && response.status !== 403) return false;
  const surface = classifySupabaseSurface(requestUrl ?? response.url);
  const isAuthOrRestSurface = surface === "auth_or_rest" || surface === "unknown";
  const isFunctionsSurface = surface === "functions";
  // Never force-expire a session purely from Functions responses. Functions can
  // fail with auth-like codes for non-session reasons (misconfig, verifier drift).
  if (isFunctionsSurface) return false;
  try {
    const data = (await response.clone().json()) as { code?: unknown; message?: unknown; error?: unknown };
    const code = typeof data?.code === "string" ? data.code : typeof data?.code === "number" ? String(data.code) : "";
    if (code === "PGRST303" || code === "PGRST301") return true;
    const message = typeof data?.message === "string" ? data.message : "";
    const error = typeof data?.error === "string" ? data.error : "";
    if (
      isAuthOrRestSurface &&
      (includesJwtFailureText(message) || includesJwtFailureText(error))
    ) {
      return true;
    }
    if (
      isAuthOrRestSurface &&
      (isBearerTokenFailureText(message) || isBearerTokenFailureText(error))
    ) {
      return true;
    }
  } catch {
    try {
      const text = await response.clone().text();
      if (isAuthOrRestSurface && includesJwtFailureText(text)) return true;
      if (isAuthOrRestSurface && isBearerTokenFailureText(text)) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function isLikelyJwt(value: string): boolean {
  const token = value.trim();
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export async function ensureSupabaseSessionForRequest(
  session: SupabaseSession,
  refreshLocked: (refreshToken: string) => Promise<SupabaseSession | null>,
): Promise<SupabaseSession | null> {
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at > now + 60) return session;
  return await refreshLocked(session.refresh_token);
}

export async function ensureSupabaseSessionForAuthenticatedSend(params: {
  session: SupabaseSession;
  sessionRef?: SupabaseSessionRef;
  refreshLocked: (refreshToken: string) => Promise<SupabaseSession | null>;
}): Promise<SupabaseSession | null> {
  const { session, sessionRef, refreshLocked } = params;
  const sameSession = (a: SupabaseSession | null | undefined, b: SupabaseSession | null | undefined): boolean => {
    if (!a || !b) return false;
    return a.access_token === b.access_token && a.refresh_token === b.refresh_token;
  };

  // Step 1: ensure not expiring imminently.
  const base = sessionRef?.current ?? session;
  let current = await ensureSupabaseSessionForRequest(base, refreshLocked);
  if (!current) return null;

  // Step 2: verify the bearer is accepted by Auth.
  const firstUser = await fetchSupabaseUser(current.access_token);
  if (firstUser?.id) return current;

  // Step 3: if another concurrent path already rotated session, try it.
  const latest = sessionRef?.current ?? null;
  if (latest && !sameSession(latest, current)) {
    const latestUser = await fetchSupabaseUser(latest.access_token);
    if (latestUser?.id) return latest;
    current = latest;
  }

  // Step 4: one locked refresh + one verification retry.
  const refreshToken = (sessionRef?.current?.refresh_token ?? current.refresh_token ?? "").trim();
  if (!refreshToken) return null;
  const refreshed = await refreshLocked(refreshToken);
  if (!refreshed) return null;
  const refreshedUser = await fetchSupabaseUser(refreshed.access_token);
  if (!refreshedUser?.id) return null;
  return refreshed;
}

export async function fetchSupabaseUser(accessToken: string): Promise<SupabaseUser | null> {
  const url = getSupabaseUrl();
  const apiKey = getSupabaseAnonKey();
  if (!url || !apiKey) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as SupabaseUser;
}

export async function refreshSupabaseSessionWithLock(params: {
  refreshToken: string;
  inFlightRef: SupabaseSessionRefreshInFlightRef;
  refreshSession: (refreshToken: string) => Promise<SupabaseSession | null>;
  onRefreshed: (session: SupabaseSession) => void | Promise<void>;
}): Promise<SupabaseSession | null> {
  const { refreshToken, inFlightRef, refreshSession, onRefreshed } = params;
  if (!refreshToken) return null;
  if (inFlightRef.current) {
    return await inFlightRef.current;
  }
  const promise = (async () => {
    const refreshed = await refreshSession(refreshToken);
    if (!refreshed) return null;
    await onRefreshed(refreshed);
    return refreshed;
  })();
  inFlightRef.current = promise;
  try {
    return await promise;
  } finally {
    inFlightRef.current = null;
  }
}

export async function fetchWithSupabaseAuthShared(params: {
  url: string;
  init: RequestInit;
  session: SupabaseSession;
  sessionRef: SupabaseSessionRef;
  refreshLocked: (refreshToken: string) => Promise<SupabaseSession | null>;
  onSessionExpired: () => void | Promise<void>;
  sessionExpiredMessage?: string;
}): Promise<Response> {
  const apiKey = getSupabaseAnonKey();
  if (!apiKey) {
    throw new Error("Missing Supabase anon key.");
  }

  const {
    url,
    init,
    session,
    sessionRef,
    refreshLocked,
    onSessionExpired,
    sessionExpiredMessage = "Session expired. Please sign in again.",
  } = params;

  const expireSession = async (): Promise<never> => {
    await onSessionExpired();
    throw new Error(sessionExpiredMessage);
  };

  const doFetch = async (current: SupabaseSession): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("apikey", apiKey);
    headers.set("Authorization", `Bearer ${current.access_token}`);
    return await fetch(url, { ...init, headers });
  };

  const isSameSession = (a: SupabaseSession | null | undefined, b: SupabaseSession | null | undefined): boolean => {
    if (!a || !b) return false;
    return a.access_token === b.access_token && a.refresh_token === b.refresh_token;
  };

  const tryFetchWithLatestSession = async (): Promise<Response | null> => {
    const latest = sessionRef.current;
    if (!latest || isSameSession(latest, requestSession)) return null;
    requestSession = latest;
    return await doFetch(latest);
  };

  const tryRefreshAndFetch = async (): Promise<Response | null> => {
    const refreshToken = (sessionRef.current?.refresh_token ?? requestSession.refresh_token ?? "").trim();
    if (!refreshToken) return null;
    const refreshed = await refreshLocked(refreshToken);
    if (!refreshed) return null;
    requestSession = refreshed;
    return await doFetch(refreshed);
  };

  const isFunctionsRequest = classifySupabaseSurface(url) === "functions";
  const isAuthSurfaceRequest = (url ?? "").toLowerCase().includes("/auth/v1/");
  const isFunctionsAuthFailure = (response: Response): boolean =>
    isFunctionsRequest && (response.status === 401 || response.status === 403);

  const baseSession = sessionRef.current ?? session;
  let requestSession = baseSession;
  const opportunisticRefresh = await ensureSupabaseSessionForRequest(baseSession, refreshLocked);
  if (opportunisticRefresh) {
    requestSession = opportunisticRefresh;
  }

  const first = await doFetch(requestSession);
  if (isFunctionsAuthFailure(first)) {
    const latestAttempt = await tryFetchWithLatestSession();
    if (latestAttempt && !isFunctionsAuthFailure(latestAttempt)) return latestAttempt;

    const refreshedAttempt = await tryRefreshAndFetch();
    if (refreshedAttempt) {
      return refreshedAttempt;
    }

    const finalFailure = latestAttempt ?? first;
    return finalFailure;
  }
  if (!(await isSupabaseJwtExpired(first, url))) return first;

  const latestAttempt = await tryFetchWithLatestSession();
  if (latestAttempt && !(await isSupabaseJwtExpired(latestAttempt, url))) return latestAttempt;

  const refreshedAttempt = await tryRefreshAndFetch();
  if (!refreshedAttempt) {
    const finalFailure = latestAttempt ?? first;
    if (isAuthSurfaceRequest && (await isSupabaseJwtExpired(finalFailure, url))) return await expireSession();
    return finalFailure;
  }
  if (isAuthSurfaceRequest && (await isSupabaseJwtExpired(refreshedAttempt, url))) return await expireSession();
  return refreshedAttempt;
}

export async function fetchWithSupabasePublicShared(url: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = getSupabaseAnonKey();
  if (!apiKey) throw new Error("Missing Supabase anon key.");
  const headers = new Headers(init.headers);
  headers.set("apikey", apiKey);
  if (!headers.has("Authorization") && isLikelyJwt(apiKey)) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return await fetch(url, { ...init, headers });
}
