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

export function resolveAuthSubject(session: AuthSessionLike): string | null {
  const userId = String(session?.user?.id ?? "").trim();
  if (userId) return userId;
  return decodeJwtSub(resolveAuthIdentityToken(session) ?? "");
}

export function resolveAuthSessionEmail(session: AuthSessionLike): string | undefined {
  const email = String(session?.user?.email ?? "").trim();
  if (email) return email;
  const payload = decodeJwtPayload(resolveAuthIdentityToken(session) ?? "");
  const tokenEmail = typeof payload?.email === "string" ? payload.email.trim() : "";
  return tokenEmail || undefined;
}

export function resolveAuthSessionDisplayName(session: AuthSessionLike): string | undefined {
  const displayName = String(session?.user?.displayName ?? "").trim();
  if (displayName) return displayName;
  const payload = decodeJwtPayload(resolveAuthIdentityToken(session) ?? "");
  const direct =
    typeof payload?.name === "string"
      ? payload.name.trim()
      : typeof payload?.display_name === "string"
        ? payload.display_name.trim()
        : "";
  if (direct) return direct;
  const first =
    typeof payload?.given_name === "string"
      ? payload.given_name.trim()
      : typeof payload?.first_name === "string"
        ? payload.first_name.trim()
        : "";
  const last =
    typeof payload?.family_name === "string"
      ? payload.family_name.trim()
      : typeof payload?.last_name === "string"
        ? payload.last_name.trim()
        : "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || undefined;
}

export function resolveAuthSessionAvatarUrl(session: AuthSessionLike): string | undefined {
  const avatarUrl = String(session?.user?.avatarUrl ?? "").trim();
  if (avatarUrl) return avatarUrl;
  const payload = decodeJwtPayload(resolveAuthIdentityToken(session) ?? "");
  const tokenAvatar =
    typeof payload?.picture === "string"
      ? payload.picture.trim()
      : typeof payload?.picture_url === "string"
        ? payload.picture_url.trim()
        : typeof payload?.profile_picture_url === "string"
          ? payload.profile_picture_url.trim()
          : "";
  return tokenAvatar || undefined;
}
