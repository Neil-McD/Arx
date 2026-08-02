export type AuthSessionLike = {
  access_token?: string | null;
  id_token?: string | null;
  user?: {
    id?: string | null;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
} | null;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const raw = String(token ?? "").trim();
  if (!raw) return null;
  try {
    const parts = raw.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return payload;
  } catch {
    return null;
  }
}

function decodeJwtSub(token: string): string | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  return sub || null;
}

export function resolveAuthIdentityToken(session: AuthSessionLike): string | null {
  const idToken = String(session?.id_token ?? "").trim();
  if (idToken) return idToken;
  const accessToken = String(session?.access_token ?? "").trim();
  return accessToken || null;
}

// Convex accepts the WorkOS access token configured in convex/auth.config.ts.
// Prefer the rotating runtime credential here; an ID token can outlive an
// access-token refresh and is only a compatibility fallback.
export function resolveConvexRuntimeToken(session: AuthSessionLike): string | null {
  const accessToken = String(session?.access_token ?? "").trim();
  if (accessToken) return accessToken;
  const idToken = String(session?.id_token ?? "").trim();
  return idToken || null;
}

export function resolveAuthSubject(session: AuthSessionLike): string | null {
  const userId = String(session?.user?.id ?? "").trim();
  if (userId) return userId;
  return decodeJwtSub(resolveAuthIdentityToken(session) ?? "");
}

/**
 * Stable presentation identity for UI lifecycles. Runtime credentials rotate;
 * the signed-in actor is the lifecycle boundary.
 */
export function resolveAuthPresentationIdentity(session: AuthSessionLike): string | null {
  if (!session) return null;
  return resolveAuthSubject(session) ?? "authenticated";
}

export function resolveAuthSessionEmail(session: AuthSessionLike): string | undefined {
  const email = String(session?.user?.email ?? "").trim();
  if (email) return email;
  const payload = decodeJwtPayload(resolveAuthIdentityToken(session) ?? "");
  const tokenEmail = typeof payload?.email === "string" ? payload.email.trim() : "";
  return tokenEmail || undefined;
}
