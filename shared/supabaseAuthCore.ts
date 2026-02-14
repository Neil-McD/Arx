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
    const json = (await response.clone().json()) as { message?: unknown };
    if (typeof json?.message === "string" && json.message.trim()) return json.message;
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

export async function isSupabaseJwtExpired(response: Response): Promise<boolean> {
  if (response.ok) return false;
  if (response.status !== 400 && response.status !== 401 && response.status !== 403) return false;
  try {
    const data = (await response.clone().json()) as { code?: unknown; message?: unknown };
    const code = typeof data?.code === "string" ? data.code : "";
    const message = typeof data?.message === "string" ? data.message : "";
    const lower = message.toLowerCase();
    if (code === "PGRST303" || code === "PGRST301") return true;
    if (lower.includes("jwt expired")) return true;
    if (lower.includes("invalid jwt")) return true;
    if (lower.includes("jwt malformed")) return true;
    if (lower.includes("failed to decode jwt")) return true;
    if (lower.includes("invalid bearer token")) return true;
    if (lower.includes("missing bearer token")) return true;
  } catch {
    try {
      const text = await response.clone().text();
      const lower = text.toLowerCase();
      if (lower.includes("jwt expired")) return true;
      if (lower.includes("invalid jwt")) return true;
      if (lower.includes("jwt malformed")) return true;
      if (lower.includes("failed to decode jwt")) return true;
      if (lower.includes("invalid bearer token")) return true;
      if (lower.includes("missing bearer token")) return true;
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

  const ensureOrFail = async (current: SupabaseSession): Promise<SupabaseSession> => {
    const fresh = await ensureSupabaseSessionForRequest(current, refreshLocked);
    if (fresh) return fresh;
    return await expireSession();
  };

  const doFetch = async (current: SupabaseSession): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("apikey", apiKey);
    headers.set("Authorization", `Bearer ${current.access_token}`);
    return await fetch(url, { ...init, headers });
  };

  const baseSession = sessionRef.current ?? session;
  const fresh = await ensureOrFail(baseSession);
  const first = await doFetch(fresh);
  if (!(await isSupabaseJwtExpired(first))) return first;

  const refreshed = await refreshLocked(fresh.refresh_token);
  if (!refreshed) return await expireSession();
  const second = await doFetch(refreshed);
  if (await isSupabaseJwtExpired(second)) return await expireSession();
  return second;
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
