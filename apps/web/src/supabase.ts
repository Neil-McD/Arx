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

const SESSION_STORAGE_KEY = "arx_supabase_session";

export function getSupabaseUrl(): string | null {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? null;
}

export function getSupabaseAnonKey(): string | null {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? null;
}

export function getOAuthRedirectUrl(): string {
  return (import.meta.env.VITE_SUPABASE_REDIRECT_URL as string | undefined) ?? window.location.origin;
}

export function loadPersistedSupabaseSession(): SupabaseSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupabaseSession;
    if (!parsed?.access_token || !parsed?.refresh_token || !parsed?.expires_at || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistSupabaseSession(session: SupabaseSession) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearPersistedSupabaseSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
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
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refreshToken })
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
    user: data.user
  };
}

export async function isSupabaseJwtExpired(response: Response): Promise<boolean> {
  if (response.ok) return false;
  if (response.status !== 401 && response.status !== 403) return false;
  try {
    const data = (await response.clone().json()) as { code?: unknown; message?: unknown };
    const code = typeof data?.code === "string" ? data.code : "";
    const message = typeof data?.message === "string" ? data.message : "";
    if (code === "PGRST303") return true;
    if (message.toLowerCase().includes("jwt expired")) return true;
  } catch {
    try {
      const text = await response.clone().text();
      if (text.toLowerCase().includes("jwt expired")) return true;
    } catch {
      // ignore
    }
  }
  return false;
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
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return null;
  return (await response.json()) as SupabaseUser;
}

export function parseOAuthHash():
  | { session: SupabaseSession; rawHash: string }
  | { error: string; rawHash: string }
  | null {
  const rawHash = window.location.hash;
  const hash = new URLSearchParams(rawHash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);

  const accessToken = hash.get("access_token") ?? query.get("access_token");
  const refreshToken = hash.get("refresh_token") ?? query.get("refresh_token");
  const expiresIn = hash.get("expires_in") ?? query.get("expires_in");
  if (accessToken && refreshToken && expiresIn) {
    const session: SupabaseSession = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + Number(expiresIn),
      user: { id: "" }
    };
    return { session, rawHash };
  }

  const errorCode = hash.get("error_code") ?? query.get("error_code");
  const errorDescription = hash.get("error_description") ?? query.get("error_description");
  const error = hash.get("error") ?? query.get("error");
  if (errorCode || errorDescription || error) {
    const message = errorDescription || errorCode || error || "Unknown OAuth error";
    return { error: message, rawHash };
  }

  if (query.get("code")) {
    return {
      error: "OAuth returned an auth code instead of session tokens. Check Supabase OAuth flow settings.",
      rawHash
    };
  }

  return null;
}
