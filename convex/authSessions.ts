import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { decryptStoredSecret, encryptSecret } from "./providerConnections";

type StoredAuthSessionV1 = {
  accessToken: string;
  idToken: string | null;
  refreshToken: string;
  accessTokenExpiresAt: number | null;
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

type AuthSessionRow = {
  _id?: unknown;
  sessionId: string;
  authSubject: string;
  userId: unknown;
  replacedBySessionId?: string | null;
  encryptedSecretHex: string;
  secretIvHex: string;
  secretVersion: number;
  accessTokenExpiresAt?: number | null;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  lastRefreshAt?: number | null;
  revokedAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

const DEFAULT_OAUTH_SCOPE = "openid profile email offline_access";
const WORKOS_AUTHENTICATE_UPSTREAM_URL = "https://api.workos.com/user_management/authenticate";
const MAX_SESSION_CHAIN_DEPTH = 8;

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeDiagnosticErrorCode(value: unknown, fallback: string): string {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return fallback;
  if (normalized.includes("auth_session_missing")) return "auth_session_missing";
  if (normalized.includes("auth_session_invalid")) return "auth_session_invalid";
  if (normalized.includes("auth_session_resolution_loop")) return "auth_session_resolution_loop";
  if (normalized.includes("auth_session_resolution_depth")) return "auth_session_resolution_depth";
  if (normalized.includes("invalid_grant")) return "invalid_grant";
  if (normalized.includes("invalid_token")) return "invalid_token";
  if (normalized.includes("unauthorized")) return "unauthorized";
  if (normalized.includes("timeout")) return "timeout";
  return normalized.replace(/[^a-z0-9_.:-]+/g, "_").slice(0, 96) || fallback;
}

function buildDiagnosticEventKey(eventType: string, status: string, userId: unknown): string {
  return [
    eventType,
    status,
    String(userId ?? "unknown"),
    Date.now(),
    Math.random().toString(36).slice(2, 8),
  ].join(":");
}

async function recordAuthSessionDiagnostic(
  ctx: any,
  input: {
    eventType: string;
    status: "succeeded" | "failed";
    severity?: "info" | "warning" | "error";
    userId?: unknown;
    surface: string;
    latencyMs?: number;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await ctx.runMutation((internal as any).platformDiagnostics.recordPlatformDiagnosticEventInternal, {
      eventKey: buildDiagnosticEventKey(input.eventType, input.status, input.userId),
      eventType: input.eventType,
      subsystem: "auth",
      severity: input.severity ?? (input.status === "failed" ? "warning" : "info"),
      status: input.status,
      surface: input.surface,
      ...(input.userId ? { userId: input.userId } : null),
      ...(typeof input.latencyMs === "number" && Number.isFinite(input.latencyMs)
        ? { latencyMs: input.latencyMs }
        : null),
      ...(input.errorCode ? { errorCode: input.errorCode } : null),
      ...(input.metadata ? { metadata: input.metadata } : null),
      createdAt: Date.now(),
    });
  } catch (error) {
    console.warn("auth_session_diagnostic_record_failed", {
      eventType: input.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function readObjectString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return null;
}

function readEpochSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
    const parsedMs = Date.parse(trimmed);
    if (Number.isFinite(parsedMs) && parsedMs > 0) return Math.floor(parsedMs / 1000);
  }
  return null;
}

function decodeJwtPayload(token: string): unknown | null {
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

function readJwtExp(accessToken: string): number | null {
  const payload = decodeJwtPayload(accessToken);
  if (!payload || typeof payload !== "object") return null;
  return readEpochSeconds((payload as Record<string, unknown>).exp);
}

function coerceDisplayNameFromRecord(record: Record<string, unknown>): string | null {
  const direct = readObjectString(record, ["name", "display_name", "displayName", "full_name", "fullName"]);
  if (direct) return direct;
  const first = readObjectString(record, ["given_name", "givenName", "first_name", "firstName"]);
  const last = readObjectString(record, ["family_name", "familyName", "last_name", "lastName"]);
  const combined = [first, last].filter((value): value is string => Boolean(value)).join(" ").trim();
  return combined || null;
}

function coerceAvatarUrlFromRecord(record: Record<string, unknown>): string | null {
  return readObjectString(record, [
    "picture",
    "picture_url",
    "pictureUrl",
    "profile_picture_url",
    "profilePictureUrl",
    "avatar_url",
    "avatarUrl",
    "image_url",
    "imageUrl",
  ]);
}

function decodeUserFromIdentityToken(token: string): StoredAuthSessionV1["user"] | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const id = readString(record.sub);
  if (!id) return null;
  return {
    id,
    email: readString(record.email),
    displayName: coerceDisplayNameFromRecord(record),
    avatarUrl: coerceAvatarUrlFromRecord(record),
  };
}

function coerceUser(value: unknown): StoredAuthSessionV1["user"] | null {
  const record = asObject(value);
  if (!record) return null;
  const id = readString(record.id) ?? readString(record.user_id) ?? readString(record.sub);
  if (!id) return null;
  return {
    id,
    email: readString(record.email),
    displayName: coerceDisplayNameFromRecord(record),
    avatarUrl: coerceAvatarUrlFromRecord(record),
  };
}

function findNestedObjectCandidate(
  payload: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const nested = asObject(payload[key]);
    if (nested) return nested;
  }
  return null;
}

function findSessionPayload(payload: unknown, requireRefreshToken = true): Record<string, unknown> | null {
  const initial = asObject(payload);
  if (!initial) return null;
  const queue: Record<string, unknown>[] = [initial];
  const visited = new Set<Record<string, unknown>>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const accessToken = readObjectString(current, ["access_token", "accessToken"]);
    const refreshToken = readObjectString(current, ["refresh_token", "refreshToken"]);
    if (accessToken && (!requireRefreshToken || refreshToken)) return current;

    const nested = findNestedObjectCandidate(current, ["session", "data", "result", "payload"]);
    if (nested) queue.push(nested);
  }
  return null;
}

function coerceSessionExpiresAt(
  sessionPayload: Record<string, unknown>,
  accessToken: string,
): number | null {
  const nowSec = Math.floor(Date.now() / 1000);
  const direct = readEpochSeconds(sessionPayload.expires_at ?? sessionPayload.expiresAt);
  if (direct) return direct;
  const expiresIn = readEpochSeconds(sessionPayload.expires_in ?? sessionPayload.expiresIn);
  if (expiresIn) return nowSec + Math.max(1, expiresIn);
  return readJwtExp(accessToken);
}

function hasUsableAccessToken(
  stored: Pick<StoredAuthSessionV1, "accessTokenExpiresAt">,
  nowSec: number,
  minHeadroomSec = 0,
): boolean {
  return typeof stored.accessTokenExpiresAt === "number" && stored.accessTokenExpiresAt > nowSec + minHeadroomSec;
}

function normalizeStoredState(
  payload: unknown,
  options: {
    requireRefreshToken?: boolean;
    fallback?: StoredAuthSessionV1 | null;
  } = {},
): StoredAuthSessionV1 | null {
  const requireRefreshToken = options.requireRefreshToken !== false;
  const sessionPayload = findSessionPayload(payload, requireRefreshToken);
  if (!sessionPayload) return null;

  const accessToken = readObjectString(sessionPayload, ["access_token", "accessToken"]);
  const refreshToken =
    readObjectString(sessionPayload, ["refresh_token", "refreshToken"]) ?? options.fallback?.refreshToken ?? null;
  const idToken = readObjectString(sessionPayload, ["id_token", "idToken"]) ?? options.fallback?.idToken ?? null;
  if (!accessToken || (requireRefreshToken && !refreshToken)) return null;

  const accessTokenExpiresAt =
    coerceSessionExpiresAt(sessionPayload, accessToken) ?? options.fallback?.accessTokenExpiresAt ?? null;
  const user =
    coerceUser(sessionPayload.user) ??
    decodeUserFromIdentityToken(idToken ?? accessToken) ??
    options.fallback?.user ??
    null;
  if (!user?.id) return null;

  return {
    accessToken,
    idToken,
    refreshToken: refreshToken ?? "",
    accessTokenExpiresAt,
    user,
  };
}

function encodeStoredState(value: StoredAuthSessionV1): string {
  return JSON.stringify(value);
}

async function decodeStoredState(
  row: Pick<AuthSessionRow, "encryptedSecretHex" | "secretIvHex">,
): Promise<StoredAuthSessionV1 | null> {
  try {
    const plaintext = await decryptStoredSecret({
      encryptedSecretHex: String(row.encryptedSecretHex),
      secretIvHex: String(row.secretIvHex),
    });
    const payload = JSON.parse(plaintext) as unknown;
    const record = asObject(payload);
    if (!record) return null;
    const accessToken = readString(record.accessToken);
    const refreshToken = readString(record.refreshToken);
    const user = coerceUser(record.user);
    if (!accessToken || !refreshToken || !user?.id) return null;
    return {
      accessToken,
      idToken: readString(record.idToken),
      refreshToken,
      accessTokenExpiresAt: readEpochSeconds(record.accessTokenExpiresAt),
      user,
    };
  } catch {
    return null;
  }
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function buildSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

function resolveOAuthAuthorizeUrl(): string {
  return readEnv("ARX_AUTH_AUTHORIZE_URL");
}

function resolveOAuthTokenUrl(): string {
  return readEnv("ARX_AUTH_TOKEN_URL");
}

function resolveOAuthLogoutUrl(): string {
  return readEnv("ARX_AUTH_LOGOUT_URL");
}

function resolveOAuthClientId(): string {
  return readEnv("ARX_AUTH_CLIENT_ID");
}

function resolveOAuthClientSecret(): string {
  return readEnv("ARX_AUTH_CLIENT_SECRET");
}

function resolveOAuthScope(): string {
  return readEnv("ARX_AUTH_SCOPE") || DEFAULT_OAUTH_SCOPE;
}

function resolveOAuthAudience(): string {
  return readEnv("ARX_AUTH_AUDIENCE");
}

function isLikelyWorkOsAuthUrl(value: string): boolean {
  const raw = normalizeString(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.trim().toLowerCase();
    const path = parsed.pathname.trim().toLowerCase();
    if (host === "api.workos.com" && path.startsWith("/user_management/")) return true;
    if (host.endsWith(".authkit.app")) return true;
    return false;
  } catch {
    return false;
  }
}

function isLikelyWorkOsAuthConfiguration(params: {
  authorizeUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  issuer?: string;
  jwksUrl?: string;
}): boolean {
  const clientId = normalizeString(params.clientId);
  if (!clientId.startsWith("client_")) return false;
  const candidates = [params.authorizeUrl, params.tokenUrl, params.issuer, params.jwksUrl];
  return candidates.some((value) => isLikelyWorkOsAuthUrl(String(value ?? "")));
}

async function refreshUpstreamSession(existing: StoredAuthSessionV1): Promise<StoredAuthSessionV1> {
  const tokenUrlRaw = resolveOAuthTokenUrl();
  const clientId = resolveOAuthClientId();
  if (!tokenUrlRaw) throw new Error("auth_verifier_misconfigured: missing token URL");
  if (!clientId) throw new Error("auth_verifier_misconfigured: missing client id");

  const isWorkOsAuth = isLikelyWorkOsAuthConfiguration({
    authorizeUrl: resolveOAuthAuthorizeUrl(),
    tokenUrl: tokenUrlRaw,
    clientId,
    issuer: readEnv("ARX_AUTH_JWT_ISSUER"),
    jwksUrl: readEnv("ARX_AUTH_JWT_JWKS_URL"),
  });

  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", existing.refreshToken);
  form.set("client_id", clientId);
  if (!isWorkOsAuth) {
    const clientSecret = resolveOAuthClientSecret();
    if (clientSecret) form.set("client_secret", clientSecret);
    const audience = resolveOAuthAudience();
    if (audience) form.set("audience", audience);
  } else {
    const scope = resolveOAuthScope();
    if (scope) form.set("scope", scope);
  }

  const upstreamUrl = isWorkOsAuth ? WORKOS_AUTHENTICATE_UPSTREAM_URL : tokenUrlRaw;
  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `auth_refresh_failed_${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  const refreshed = normalizeStoredState(payload, {
    requireRefreshToken: false,
    fallback: existing,
  });
  if (!refreshed?.refreshToken) {
    throw new Error("invalid_refresh_payload");
  }
  return refreshed;
}

async function logoutUpstream(accessToken: string): Promise<void> {
  const logoutUrl = resolveOAuthLogoutUrl();
  if (!logoutUrl || !normalizeString(accessToken)) return;
  try {
    await fetch(logoutUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        scope: "local",
        access_token: accessToken,
      }),
    });
  } catch {
    // best effort only
  }
}

function toPublicSession(stored: StoredAuthSessionV1) {
  return {
    access_token: stored.accessToken,
    ...(stored.idToken ? { id_token: stored.idToken } : null),
    expires_at: stored.accessTokenExpiresAt ?? Math.floor(Date.now() / 1000) + 60,
    user: {
      id: stored.user.id,
      ...(stored.user.email ? { email: stored.user.email } : null),
      ...(stored.user.displayName ? { displayName: stored.user.displayName } : null),
      ...(stored.user.avatarUrl ? { avatarUrl: stored.user.avatarUrl } : null),
    },
  };
}

async function getAuthSessionRowBySessionId(ctx: any, sessionId: string): Promise<AuthSessionRow | null> {
  const row = await ctx.db
    .query("authSessions")
    .withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId))
    .first();
  return (row as AuthSessionRow | null) ?? null;
}

async function resolveAuthSessionRowForAction(
  ctx: {
    runQuery: (queryRef: any, args: Record<string, unknown>) => Promise<unknown>;
  },
  requestedSessionId: string,
): Promise<
  | {
      ok: true;
      row: AuthSessionRow;
      resolvedSessionId: string;
      wasRedirected: boolean;
    }
  | {
      ok: false;
      reason: "auth_session_missing" | "auth_session_chain_invalid";
    }
> {
  let currentSessionId = requestedSessionId;
  const visited = new Set<string>();

  for (let depth = 0; depth < MAX_SESSION_CHAIN_DEPTH; depth += 1) {
    if (visited.has(currentSessionId)) {
      return { ok: false, reason: "auth_session_chain_invalid" };
    }
    visited.add(currentSessionId);
    const row = (await ctx.runQuery(internal.authSessions.getAuthSessionBySessionIdInternal as any, {
      sessionId: currentSessionId,
    })) as AuthSessionRow | null;
    if (!row) {
      return { ok: false, reason: "auth_session_missing" };
    }
    const replacementSessionId = normalizeString(row.replacedBySessionId);
    if (!replacementSessionId) {
      return {
        ok: true,
        row,
        resolvedSessionId: currentSessionId,
        wasRedirected: currentSessionId !== requestedSessionId,
      };
    }
    currentSessionId = replacementSessionId;
  }

  return { ok: false, reason: "auth_session_chain_invalid" };
}

function isTerminalRefreshFailure(reason: string): boolean {
  return (
    reason.includes("invalid_grant") ||
    reason.includes("invalid refresh token") ||
    reason.includes("missing refresh token") ||
    reason.includes("auth_refresh_failed_400") ||
    reason.includes("auth_refresh_failed_401") ||
    reason.includes("auth_refresh_failed_403")
  );
}

export const getAuthSessionBySessionIdInternal = internalQuery({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    return await getAuthSessionRowBySessionId(ctx, args.sessionId);
  },
});

export const createAuthSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    authSubject: v.string(),
    userId: v.id("users"),
    accessToken: v.string(),
    idToken: v.optional(v.string()),
    refreshToken: v.string(),
    accessTokenExpiresAt: v.optional(v.number()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    externalUserId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const encrypted = await encryptSecret(
      encodeStoredState({
        accessToken: args.accessToken,
        idToken: normalizeString(args.idToken) || null,
        refreshToken: args.refreshToken,
        accessTokenExpiresAt:
          typeof args.accessTokenExpiresAt === "number" && Number.isFinite(args.accessTokenExpiresAt)
            ? Math.floor(args.accessTokenExpiresAt)
            : null,
        user: {
          id: args.externalUserId,
          email: normalizeString(args.email) || null,
          displayName: normalizeString(args.displayName) || null,
          avatarUrl: normalizeString(args.avatarUrl) || null,
        },
      }),
    );

    const existing = await getAuthSessionRowBySessionId(ctx, args.sessionId);
    const patch = {
      authSubject: args.authSubject,
      userId: args.userId,
      replacedBySessionId: undefined,
      encryptedSecretHex: encrypted.encryptedSecretHex,
      secretIvHex: encrypted.secretIvHex,
      secretVersion: encrypted.secretVersion,
      accessTokenExpiresAt:
        typeof args.accessTokenExpiresAt === "number" && Number.isFinite(args.accessTokenExpiresAt)
          ? Math.floor(args.accessTokenExpiresAt)
          : undefined,
      email: normalizeString(args.email) || undefined,
      displayName: normalizeString(args.displayName) || undefined,
      avatarUrl: normalizeString(args.avatarUrl) || undefined,
      lastRefreshAt: args.nowMs,
      revokedAt: undefined,
      updatedAt: args.nowMs,
    };

    if (!existing) {
      const id = await ctx.db.insert("authSessions", {
        sessionId: args.sessionId,
        createdAt: args.nowMs,
        ...patch,
      });
      return { id };
    }

    await ctx.db.patch(existing._id as any, patch);
    return { id: existing._id };
  },
});

export const updateAuthSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    accessToken: v.string(),
    idToken: v.optional(v.string()),
    refreshToken: v.string(),
    accessTokenExpiresAt: v.optional(v.number()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    externalUserId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await getAuthSessionRowBySessionId(ctx, args.sessionId);
    if (!existing) return { updated: false };

    const encrypted = await encryptSecret(
      encodeStoredState({
        accessToken: args.accessToken,
        idToken: normalizeString(args.idToken) || null,
        refreshToken: args.refreshToken,
        accessTokenExpiresAt:
          typeof args.accessTokenExpiresAt === "number" && Number.isFinite(args.accessTokenExpiresAt)
            ? Math.floor(args.accessTokenExpiresAt)
            : null,
        user: {
          id: args.externalUserId,
          email: normalizeString(args.email) || null,
          displayName: normalizeString(args.displayName) || null,
          avatarUrl: normalizeString(args.avatarUrl) || null,
        },
      }),
    );

    await ctx.db.patch(existing._id as any, {
      replacedBySessionId: undefined,
      encryptedSecretHex: encrypted.encryptedSecretHex,
      secretIvHex: encrypted.secretIvHex,
      secretVersion: encrypted.secretVersion,
      accessTokenExpiresAt:
        typeof args.accessTokenExpiresAt === "number" && Number.isFinite(args.accessTokenExpiresAt)
          ? Math.floor(args.accessTokenExpiresAt)
          : undefined,
      email: normalizeString(args.email) || undefined,
      displayName: normalizeString(args.displayName) || undefined,
      avatarUrl: normalizeString(args.avatarUrl) || undefined,
      lastRefreshAt: args.nowMs,
      revokedAt: undefined,
      updatedAt: args.nowMs,
    });
    return { updated: true };
  },
});

export const revokeAuthSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await getAuthSessionRowBySessionId(ctx, args.sessionId);
    if (!existing) return { revoked: false };
    await ctx.db.patch(existing._id as any, {
      revokedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { revoked: true };
  },
});

export const rotateAuthSessionInternal = internalMutation({
  args: {
    currentSessionId: v.string(),
    newSessionId: v.string(),
    accessToken: v.string(),
    idToken: v.optional(v.string()),
    refreshToken: v.string(),
    accessTokenExpiresAt: v.optional(v.number()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    externalUserId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await getAuthSessionRowBySessionId(ctx, args.currentSessionId);
    if (!existing) return { rotated: false };

    const encrypted = await encryptSecret(
      encodeStoredState({
        accessToken: args.accessToken,
        idToken: normalizeString(args.idToken) || null,
        refreshToken: args.refreshToken,
        accessTokenExpiresAt:
          typeof args.accessTokenExpiresAt === "number" && Number.isFinite(args.accessTokenExpiresAt)
            ? Math.floor(args.accessTokenExpiresAt)
            : null,
        user: {
          id: args.externalUserId,
          email: normalizeString(args.email) || null,
          displayName: normalizeString(args.displayName) || null,
          avatarUrl: normalizeString(args.avatarUrl) || null,
        },
      }),
    );

    await ctx.db.insert("authSessions", {
      sessionId: args.newSessionId,
      authSubject: existing.authSubject,
      userId: existing.userId as any,
      encryptedSecretHex: encrypted.encryptedSecretHex,
      secretIvHex: encrypted.secretIvHex,
      secretVersion: encrypted.secretVersion,
      accessTokenExpiresAt:
        typeof args.accessTokenExpiresAt === "number" && Number.isFinite(args.accessTokenExpiresAt)
          ? Math.floor(args.accessTokenExpiresAt)
          : undefined,
      email: normalizeString(args.email) || undefined,
      displayName: normalizeString(args.displayName) || undefined,
      avatarUrl: normalizeString(args.avatarUrl) || undefined,
      lastRefreshAt: args.nowMs,
      revokedAt: undefined,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });

    await ctx.db.patch(existing._id as any, {
      replacedBySessionId: args.newSessionId,
      revokedAt: args.nowMs,
      updatedAt: args.nowMs,
    });

    return { rotated: true };
  },
});

export const bootstrapAuthSessionInternal = internalAction({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveAuthSessionRowForAction(ctx, args.sessionId);
    if (!resolved.ok) {
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.bootstrap_failed",
        status: "failed",
        severity: "warning",
        surface: "auth_bridge_bootstrap",
        errorCode: normalizeDiagnosticErrorCode(resolved.reason, "auth_session_resolution_failed"),
      });
      return { status: "terminal_failure" as const, reason: resolved.reason };
    }
    const row = resolved.row;
    if (typeof row.revokedAt === "number") {
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.bootstrap_failed",
        status: "failed",
        severity: "warning",
        userId: row.userId,
        surface: "auth_bridge_bootstrap",
        errorCode: "auth_session_missing",
      });
      return { status: "terminal_failure" as const, reason: "auth_session_missing" };
    }
    const stored = await decodeStoredState(row);
    if (!stored?.refreshToken) {
      await ctx.runMutation(internal.authSessions.revokeAuthSessionInternal as any, {
        sessionId: resolved.resolvedSessionId,
        nowMs: Date.now(),
      });
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.bootstrap_failed",
        status: "failed",
        severity: "warning",
        userId: row.userId,
        surface: "auth_bridge_bootstrap",
        errorCode: "auth_session_invalid",
      });
      return { status: "terminal_failure" as const, reason: "auth_session_invalid" };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (hasUsableAccessToken(stored, nowSec, 60)) {
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_established",
        status: "succeeded",
        userId: row.userId,
        surface: "auth_bridge_bootstrap",
        metadata: {
          bootstrapPath: "stored_token",
          rotatedSessionFollowed: resolved.wasRedirected,
        },
      });
      return {
        status: "ready" as const,
        session: toPublicSession(stored),
        sessionId: resolved.resolvedSessionId,
        trace: {
          bootstrapPath: "stored_token",
          rotatedSessionFollowed: resolved.wasRedirected,
        },
      };
    }
    try {
      const upstreamRefreshStartedAt = Date.now();
      const refreshed = await refreshUpstreamSession(stored);
      const upstreamRefreshMs = Date.now() - upstreamRefreshStartedAt;
      await ctx.runMutation(internal.authSessions.updateAuthSessionInternal as any, {
        sessionId: resolved.resolvedSessionId,
        accessToken: refreshed.accessToken,
        ...(refreshed.idToken ? { idToken: refreshed.idToken } : null),
        refreshToken: refreshed.refreshToken,
        ...(typeof refreshed.accessTokenExpiresAt === "number"
          ? { accessTokenExpiresAt: refreshed.accessTokenExpiresAt }
          : null),
        externalUserId: refreshed.user.id,
        ...(refreshed.user.email ? { email: refreshed.user.email } : null),
        ...(refreshed.user.displayName ? { displayName: refreshed.user.displayName } : null),
        ...(refreshed.user.avatarUrl ? { avatarUrl: refreshed.user.avatarUrl } : null),
        nowMs: Date.now(),
      });
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_established",
        status: "succeeded",
        userId: row.userId,
        surface: "auth_bridge_bootstrap",
        latencyMs: upstreamRefreshMs,
        metadata: {
          bootstrapPath: "upstream_refresh",
          rotatedSessionFollowed: resolved.wasRedirected,
        },
      });
      return {
        status: "ready" as const,
        session: toPublicSession(refreshed),
        sessionId: resolved.resolvedSessionId,
        trace: {
          bootstrapPath: "upstream_refresh",
          rotatedSessionFollowed: resolved.wasRedirected,
          upstreamRefreshMs,
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error ?? "");
      if (isTerminalRefreshFailure(reason)) {
        await ctx.runMutation(internal.authSessions.revokeAuthSessionInternal as any, {
          sessionId: resolved.resolvedSessionId,
          nowMs: Date.now(),
        });
        await recordAuthSessionDiagnostic(ctx, {
          eventType: "auth.bootstrap_failed",
          status: "failed",
          severity: "error",
          userId: row.userId,
          surface: "auth_bridge_bootstrap",
          errorCode: normalizeDiagnosticErrorCode(reason, "auth_session_refresh_invalid"),
        });
        return { status: "terminal_failure" as const, reason: reason || "auth_session_refresh_invalid" };
      }
      if (hasUsableAccessToken(stored, nowSec, 0)) {
        await recordAuthSessionDiagnostic(ctx, {
          eventType: "auth.bootstrap_failed",
          status: "failed",
          severity: "warning",
          userId: row.userId,
          surface: "auth_bridge_bootstrap",
          errorCode: normalizeDiagnosticErrorCode(reason, "auth_session_refresh_unavailable"),
          metadata: {
            recoveredWithStoredToken: true,
          },
        });
        return {
          status: "ready" as const,
          session: toPublicSession(stored),
          sessionId: resolved.resolvedSessionId,
        };
      }
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.bootstrap_failed",
        status: "failed",
        severity: "warning",
        userId: row.userId,
        surface: "auth_bridge_bootstrap",
        errorCode: normalizeDiagnosticErrorCode(reason, "auth_session_refresh_unavailable"),
      });
      return { status: "transient_failure" as const, reason: reason || "auth_session_refresh_unavailable" };
    }
  },
});

export const refreshAuthSessionInternal = internalAction({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveAuthSessionRowForAction(ctx, args.sessionId);
    if (!resolved.ok) {
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_refresh_failed",
        status: "failed",
        severity: "warning",
        surface: "auth_bridge_refresh",
        errorCode: normalizeDiagnosticErrorCode(resolved.reason, "auth_session_resolution_failed"),
      });
      return { status: "terminal_failure" as const, reason: resolved.reason };
    }
    const row = resolved.row;
    if (typeof row.revokedAt === "number") {
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_refresh_failed",
        status: "failed",
        severity: "warning",
        userId: row.userId,
        surface: "auth_bridge_refresh",
        errorCode: "auth_session_missing",
      });
      return { status: "terminal_failure" as const, reason: "auth_session_missing" };
    }
    const stored = await decodeStoredState(row);
    if (!stored?.refreshToken) {
      await ctx.runMutation(internal.authSessions.revokeAuthSessionInternal as any, {
        sessionId: resolved.resolvedSessionId,
        nowMs: Date.now(),
      });
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_refresh_failed",
        status: "failed",
        severity: "warning",
        userId: row.userId,
        surface: "auth_bridge_refresh",
        errorCode: "auth_session_invalid",
      });
      return { status: "terminal_failure" as const, reason: "auth_session_invalid" };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    try {
      const upstreamRefreshStartedAt = Date.now();
      const refreshed = await refreshUpstreamSession(stored);
      const upstreamRefreshMs = Date.now() - upstreamRefreshStartedAt;
      const newSessionId = buildSessionId();
      await ctx.runMutation(internal.authSessions.rotateAuthSessionInternal as any, {
        currentSessionId: resolved.resolvedSessionId,
        newSessionId,
        accessToken: refreshed.accessToken,
        ...(refreshed.idToken ? { idToken: refreshed.idToken } : null),
        refreshToken: refreshed.refreshToken,
        ...(typeof refreshed.accessTokenExpiresAt === "number"
          ? { accessTokenExpiresAt: refreshed.accessTokenExpiresAt }
          : null),
        externalUserId: refreshed.user.id,
        ...(refreshed.user.email ? { email: refreshed.user.email } : null),
        ...(refreshed.user.displayName ? { displayName: refreshed.user.displayName } : null),
        ...(refreshed.user.avatarUrl ? { avatarUrl: refreshed.user.avatarUrl } : null),
        nowMs: Date.now(),
      });
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_refreshed",
        status: "succeeded",
        userId: row.userId,
        surface: "auth_bridge_refresh",
        latencyMs: upstreamRefreshMs,
      });
      return {
        status: "refreshed" as const,
        session: toPublicSession(refreshed),
        sessionId: newSessionId,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error ?? "");
      if (isTerminalRefreshFailure(reason)) {
        await ctx.runMutation(internal.authSessions.revokeAuthSessionInternal as any, {
          sessionId: resolved.resolvedSessionId,
          nowMs: Date.now(),
        });
        await recordAuthSessionDiagnostic(ctx, {
          eventType: "auth.session_refresh_failed",
          status: "failed",
          severity: "error",
          userId: row.userId,
          surface: "auth_bridge_refresh",
          errorCode: normalizeDiagnosticErrorCode(reason, "auth_session_refresh_invalid"),
        });
        return { status: "terminal_failure" as const, reason: reason || "auth_session_refresh_invalid" };
      }
      if (hasUsableAccessToken(stored, nowSec, 0)) {
        await recordAuthSessionDiagnostic(ctx, {
          eventType: "auth.session_refresh_failed",
          status: "failed",
          severity: "warning",
          userId: row.userId,
          surface: "auth_bridge_refresh",
          errorCode: normalizeDiagnosticErrorCode(reason, "auth_session_refresh_unavailable"),
          metadata: {
            recoveredWithStoredToken: true,
          },
        });
        return {
          status: "ready" as const,
          session: toPublicSession(stored),
          sessionId: resolved.resolvedSessionId,
        };
      }
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_refresh_failed",
        status: "failed",
        severity: "warning",
        userId: row.userId,
        surface: "auth_bridge_refresh",
        errorCode: normalizeDiagnosticErrorCode(reason, "auth_session_refresh_unavailable"),
      });
      return { status: "transient_failure" as const, reason: reason || "auth_session_refresh_unavailable" };
    }
  },
});

export const logoutAuthSessionInternal = internalAction({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveAuthSessionRowForAction(ctx, args.sessionId);
    if (!resolved.ok) {
      return { status: "ok" as const };
    }
    const row = resolved.row;
    if (typeof row.revokedAt === "number") {
      return { status: "ok" as const };
    }
    const stored = await decodeStoredState(row);
    if (stored?.accessToken) {
      await logoutUpstream(stored.accessToken);
    }
    await ctx.runMutation(internal.authSessions.revokeAuthSessionInternal as any, {
      sessionId: resolved.resolvedSessionId,
      nowMs: Date.now(),
    });
    return { status: "ok" as const };
  },
});

export const pruneRevokedAuthSessionsForMaintenance = mutation({
  args: {
    secret: v.string(),
    revokedBeforeMs: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = readEnv("ARX_AUTH_MIGRATION_AUDIT_SECRET");
    if (!expectedSecret || args.secret !== expectedSecret) {
      throw new Error("auth_session_maintenance_unauthorized");
    }
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
        ? Math.floor(args.limit)
        : 500;
    const rows = await ctx.db.query("authSessions").collect();
    let deleted = 0;
    let remaining = 0;

    for (const row of rows) {
      const revokedAt =
        typeof row.revokedAt === "number" && Number.isFinite(row.revokedAt) ? Math.floor(row.revokedAt) : null;
      if (revokedAt === null || revokedAt > args.revokedBeforeMs) continue;
      if (deleted >= limit) {
        remaining += 1;
        continue;
      }
      await ctx.db.delete(row._id);
      deleted += 1;
    }

    return {
      deleted,
      remaining,
      done: remaining === 0,
    };
  },
});

export { normalizeStoredState };
