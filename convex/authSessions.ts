import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { decryptStoredSecret, encryptSecret } from "./secretCrypto";
import {
  pruneRevokedAuthSessionsBatch,
  requireAuthSessionMaintenanceSecret,
  scrubRevokedAuthSessionSecretsBatch,
} from "./authSessionMaintenanceCore";
import {
  AUTH_SESSION_ABSOLUTE_TTL_MS,
  AUTH_SESSION_IDLE_TTL_MS,
  AUTH_SESSION_REFRESH_COALESCE_MS,
  AUTH_SESSION_REFRESH_WAIT_ATTEMPTS,
  AUTH_SESSION_REFRESH_WAIT_INTERVAL_MS,
  authSessionRefreshFinalizerOwnsLease,
  normalizeAuthSessionRefreshGeneration,
  resolveAuthSessionLifetime,
  resolveAuthSessionRefreshClaim,
} from "./authSessionLifecycleCore";

type StoredAuthSessionV1 = {
  accessToken: string;
  idToken: string | null;
  refreshToken: string;
  accessTokenExpiresAt: number | null;
  user: {
    id: string;
    email: string | null;
    emailVerified: boolean;
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
  encryptedSecretHex?: string | null;
  secretIvHex?: string | null;
  secretVersion?: number | null;
  accessTokenExpiresAt?: number | null;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  refreshGeneration?: number | null;
  refreshLeaseId?: string | null;
  refreshLeaseExpiresAt?: number | null;
  lastUsedAt?: number | null;
  idleExpiresAt?: number | null;
  absoluteExpiresAt?: number | null;
  lastRefreshAt?: number | null;
  revokedAt?: number | null;
  revokedReason?: string | null;
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
  if (normalized.includes("auth_session_idle_expired")) return "auth_session_idle_expired";
  if (normalized.includes("auth_session_absolute_expired")) return "auth_session_absolute_expired";
  if (normalized.includes("auth_session_refresh_wait_timeout")) return "auth_session_refresh_wait_timeout";
  if (normalized.includes("auth_session_refresh_lease_lost")) return "auth_session_refresh_lease_lost";
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

function readObjectBoolean(record: Record<string, unknown>, keys: readonly string[]): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return false;
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
    emailVerified: readObjectBoolean(record, [
      "email_verified",
      "emailVerified",
      "verified_email",
      "verifiedEmail",
    ]),
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
    emailVerified: readObjectBoolean(record, [
      "email_verified",
      "emailVerified",
      "verified_email",
      "verifiedEmail",
    ]),
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
  // A refresh response that omits id_token did not rotate it. Do not keep the
  // old ID token as a runtime credential; the new access token is authoritative.
  const idToken = readObjectString(sessionPayload, ["id_token", "idToken"]);
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
    const encryptedSecretHex = normalizeString(row.encryptedSecretHex);
    const secretIvHex = normalizeString(row.secretIvHex);
    if (!encryptedSecretHex || !secretIvHex) return null;
    const plaintext = await decryptStoredSecret({
      encryptedSecretHex,
      secretIvHex,
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
  if (typeof crypto?.randomUUID !== "function") {
    throw new Error("auth_session_secure_random_unavailable");
  }
  return crypto.randomUUID();
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    await fetch(logoutUrl, {
      method: "POST",
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeout);
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
      email_verified: stored.user.emailVerified,
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

async function resolveAuthSessionRowInDatabase(
  ctx: any,
  requestedSessionId: string,
): Promise<
  | {
      ok: true;
      row: AuthSessionRow;
      resolvedSessionId: string;
      wasRedirected: boolean;
      chainDepth: number;
      replacedRows: AuthSessionRow[];
    }
  | {
      ok: false;
      reason: "auth_session_missing" | "auth_session_chain_invalid";
    }
> {
  let currentSessionId = requestedSessionId;
  const visited = new Set<string>();
  const replacedRows: AuthSessionRow[] = [];

  for (let depth = 0; depth < MAX_SESSION_CHAIN_DEPTH; depth += 1) {
    if (visited.has(currentSessionId)) {
      return { ok: false, reason: "auth_session_chain_invalid" };
    }
    visited.add(currentSessionId);
    const row = await getAuthSessionRowBySessionId(ctx, currentSessionId);
    if (!row) return { ok: false, reason: "auth_session_missing" };
    const replacementSessionId = normalizeString(row.replacedBySessionId);
    if (!replacementSessionId) {
      return {
        ok: true,
        row,
        resolvedSessionId: currentSessionId,
        wasRedirected: currentSessionId !== requestedSessionId,
        chainDepth: depth,
        replacedRows,
      };
    }
    replacedRows.push(row);
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

export const resolveAuthSessionBySessionIdInternal = internalQuery({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveAuthSessionRowInDatabase(ctx, args.sessionId);
    if (!resolved.ok) return resolved;
    return {
      ok: true as const,
      row: resolved.row,
      resolvedSessionId: resolved.resolvedSessionId,
      wasRedirected: resolved.wasRedirected,
      chainDepth: resolved.chainDepth,
    };
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
    emailVerified: v.optional(v.boolean()),
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
          emailVerified: args.emailVerified === true,
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
      refreshGeneration: 0,
      refreshLeaseId: undefined,
      refreshLeaseExpiresAt: undefined,
      lastUsedAt: args.nowMs,
      idleExpiresAt: args.nowMs + AUTH_SESSION_IDLE_TTL_MS,
      absoluteExpiresAt: args.nowMs + AUTH_SESSION_ABSOLUTE_TTL_MS,
      lastRefreshAt: args.nowMs,
      revokedAt: undefined,
      revokedReason: undefined,
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

export const revokeAuthSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    nowMs: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveAuthSessionRowInDatabase(ctx, args.sessionId);
    if (!resolved.ok) return { revoked: false };
    await eraseLegacyReplacementSecrets(ctx, resolved.replacedRows, args.nowMs);
    await revokeAuthSessionRow({
      ctx,
      row: resolved.row,
      nowMs: args.nowMs,
      reason: normalizeString(args.reason) || "revoked",
    });
    return { revoked: true };
  },
});

async function revokeAuthSessionRow(args: {
  ctx: any;
  row: AuthSessionRow;
  nowMs: number;
  reason: string;
}): Promise<void> {
  await args.ctx.db.patch(args.row._id as any, {
    encryptedSecretHex: undefined,
    secretIvHex: undefined,
    secretVersion: undefined,
    accessTokenExpiresAt: undefined,
    refreshLeaseId: undefined,
    refreshLeaseExpiresAt: undefined,
    revokedAt: args.nowMs,
    revokedReason: args.reason,
    updatedAt: args.nowMs,
  });
}

async function eraseLegacyReplacementSecrets(
  ctx: any,
  rows: AuthSessionRow[],
  nowMs: number,
): Promise<void> {
  for (const row of rows) {
    if (
      !row.encryptedSecretHex &&
      !row.secretIvHex &&
      typeof row.accessTokenExpiresAt !== "number" &&
      !row.refreshLeaseId
    ) {
      continue;
    }
    await ctx.db.patch(row._id as any, {
      encryptedSecretHex: undefined,
      secretIvHex: undefined,
      secretVersion: undefined,
      accessTokenExpiresAt: undefined,
      refreshLeaseId: undefined,
      refreshLeaseExpiresAt: undefined,
      updatedAt: Math.max(row.updatedAt, nowMs),
    });
  }
}

export const touchAuthSessionForUseInternal = internalMutation({
  args: {
    sessionId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveAuthSessionRowInDatabase(ctx, args.sessionId);
    if (!resolved.ok) {
      return { status: "terminal_failure" as const, reason: resolved.reason };
    }
    await eraseLegacyReplacementSecrets(
      ctx,
      resolved.replacedRows,
      args.nowMs,
    );
    const row = resolved.row;
    if (typeof row.revokedAt === "number") {
      return {
        status: "terminal_failure" as const,
        reason: row.revokedReason || "auth_session_revoked",
      };
    }
    const lifetime = resolveAuthSessionLifetime(row, args.nowMs);
    if (!lifetime.ok) {
      await revokeAuthSessionRow({
        ctx,
        row,
        nowMs: args.nowMs,
        reason: lifetime.reason,
      });
      return { status: "terminal_failure" as const, reason: lifetime.reason };
    }
    await ctx.db.patch(row._id as any, {
      refreshGeneration: normalizeAuthSessionRefreshGeneration(
        row.refreshGeneration,
      ),
      lastUsedAt: lifetime.lastUsedAt,
      idleExpiresAt: lifetime.idleExpiresAt,
      absoluteExpiresAt: lifetime.absoluteExpiresAt,
      updatedAt: Math.max(row.updatedAt, args.nowMs),
    });
    return {
      status: "ready" as const,
      sessionId: resolved.resolvedSessionId,
      wasRedirected: resolved.wasRedirected,
      chainDepth: resolved.chainDepth,
      generation: normalizeAuthSessionRefreshGeneration(
        row.refreshGeneration,
      ),
    };
  },
});

export const claimAuthSessionRefreshInternal = internalMutation({
  args: {
    sessionId: v.string(),
    leaseId: v.string(),
    nowMs: v.number(),
    forceRefresh: v.optional(v.boolean()),
    refreshRequestedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveAuthSessionRowInDatabase(ctx, args.sessionId);
    if (!resolved.ok) {
      return { status: "terminal_failure" as const, reason: resolved.reason };
    }
    await eraseLegacyReplacementSecrets(
      ctx,
      resolved.replacedRows,
      args.nowMs,
    );
    const row = resolved.row;
    const generation = normalizeAuthSessionRefreshGeneration(
      row.refreshGeneration,
    );
    const refreshRequestedAt =
      typeof args.refreshRequestedAt === "number" &&
      Number.isFinite(args.refreshRequestedAt)
        ? Math.max(0, Math.floor(args.refreshRequestedAt))
        : args.nowMs;
    const forcedRefreshAlreadyCompleted =
      args.forceRefresh === true &&
      typeof row.lastRefreshAt === "number" &&
      row.lastRefreshAt >= refreshRequestedAt;
    const recentRefreshCanBeReused =
      args.forceRefresh !== true &&
      typeof row.lastRefreshAt === "number" &&
      row.lastRefreshAt >= args.nowMs - AUTH_SESSION_REFRESH_COALESCE_MS;
    if (
      typeof row.revokedAt !== "number" &&
      (forcedRefreshAlreadyCompleted || recentRefreshCanBeReused) &&
      typeof row.accessTokenExpiresAt === "number" &&
      row.accessTokenExpiresAt > Math.floor(args.nowMs / 1_000) + 5
    ) {
      const lifetime = resolveAuthSessionLifetime(row, args.nowMs);
      if (!lifetime.ok) {
        await revokeAuthSessionRow({
          ctx,
          row,
          nowMs: args.nowMs,
          reason: lifetime.reason,
        });
        return { status: "terminal_failure" as const, reason: lifetime.reason };
      }
      await ctx.db.patch(row._id as any, {
        refreshGeneration: normalizeAuthSessionRefreshGeneration(
          row.refreshGeneration,
        ),
        lastUsedAt: lifetime.lastUsedAt,
        idleExpiresAt: lifetime.idleExpiresAt,
        absoluteExpiresAt: lifetime.absoluteExpiresAt,
        updatedAt: Math.max(row.updatedAt, args.nowMs),
      });
      return {
        status: "ready" as const,
        sessionId: resolved.resolvedSessionId,
        generation: normalizeAuthSessionRefreshGeneration(
          row.refreshGeneration,
        ),
        wasRedirected: resolved.wasRedirected,
        chainDepth: resolved.chainDepth,
      };
    }
    const claim = resolveAuthSessionRefreshClaim(row, {
      leaseId: args.leaseId,
      nowMs: args.nowMs,
    });
    if (claim.status === "terminal_failure") {
      if (
        claim.reason === "auth_session_idle_expired" ||
        claim.reason === "auth_session_absolute_expired"
      ) {
        await revokeAuthSessionRow({
          ctx,
          row,
          nowMs: args.nowMs,
          reason: claim.reason,
        });
      }
      return { status: "terminal_failure" as const, reason: claim.reason };
    }
    if (claim.status === "waiting") {
      return {
        status: "waiting" as const,
        sessionId: resolved.resolvedSessionId,
        generation: claim.generation,
        leaseExpiresAt: claim.leaseExpiresAt,
        wasRedirected: resolved.wasRedirected,
        chainDepth: resolved.chainDepth,
      };
    }
    await ctx.db.patch(row._id as any, {
      refreshGeneration: claim.generation,
      refreshLeaseId: args.leaseId,
      refreshLeaseExpiresAt: claim.leaseExpiresAt,
      lastUsedAt: claim.lifetime.lastUsedAt,
      idleExpiresAt: claim.lifetime.idleExpiresAt,
      absoluteExpiresAt: claim.lifetime.absoluteExpiresAt,
      updatedAt: Math.max(row.updatedAt, args.nowMs),
    });
    return {
      status: "leader" as const,
      sessionId: resolved.resolvedSessionId,
      generation: claim.generation,
      leaseExpiresAt: claim.leaseExpiresAt,
      leaseTakeover: claim.leaseTakeover,
      wasRedirected: resolved.wasRedirected,
      chainDepth: resolved.chainDepth,
    };
  },
});

export const getAuthSessionRefreshSnapshotInternal = internalQuery({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await getAuthSessionRowBySessionId(ctx, args.sessionId);
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      generation: normalizeAuthSessionRefreshGeneration(
        row.refreshGeneration,
      ),
      refreshLeaseId: normalizeString(row.refreshLeaseId) || null,
      refreshLeaseExpiresAt:
        typeof row.refreshLeaseExpiresAt === "number"
          ? row.refreshLeaseExpiresAt
          : null,
      revokedAt: typeof row.revokedAt === "number" ? row.revokedAt : null,
      revokedReason: normalizeString(row.revokedReason) || null,
    };
  },
});

export const finalizeAuthSessionRefreshInternal = internalMutation({
  args: {
    sessionId: v.string(),
    leaseId: v.string(),
    expectedGeneration: v.number(),
    accessToken: v.string(),
    idToken: v.optional(v.string()),
    refreshToken: v.string(),
    accessTokenExpiresAt: v.optional(v.number()),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    externalUserId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await getAuthSessionRowBySessionId(ctx, args.sessionId);
    if (!row) return { status: "lost" as const, reason: "auth_session_missing" };
    if (
      !authSessionRefreshFinalizerOwnsLease(row, {
        leaseId: args.leaseId,
        expectedGeneration: args.expectedGeneration,
      })
    ) {
      return { status: "lost" as const, reason: "auth_session_refresh_lease_lost" };
    }
    const lifetime = resolveAuthSessionLifetime(row, args.nowMs);
    if (!lifetime.ok) {
      await revokeAuthSessionRow({
        ctx,
        row,
        nowMs: args.nowMs,
        reason: lifetime.reason,
      });
      return { status: "terminal_failure" as const, reason: lifetime.reason };
    }
    const encrypted = await encryptSecret(
      encodeStoredState({
        accessToken: args.accessToken,
        idToken: normalizeString(args.idToken) || null,
        refreshToken: args.refreshToken,
        accessTokenExpiresAt:
          typeof args.accessTokenExpiresAt === "number" &&
          Number.isFinite(args.accessTokenExpiresAt)
            ? Math.floor(args.accessTokenExpiresAt)
            : null,
        user: {
          id: args.externalUserId,
          email: normalizeString(args.email) || null,
          emailVerified: args.emailVerified === true,
          displayName: normalizeString(args.displayName) || null,
          avatarUrl: normalizeString(args.avatarUrl) || null,
        },
      }),
    );
    const generation =
      normalizeAuthSessionRefreshGeneration(args.expectedGeneration) + 1;
    await ctx.db.patch(row._id as any, {
      encryptedSecretHex: encrypted.encryptedSecretHex,
      secretIvHex: encrypted.secretIvHex,
      secretVersion: encrypted.secretVersion,
      accessTokenExpiresAt:
        typeof args.accessTokenExpiresAt === "number" &&
        Number.isFinite(args.accessTokenExpiresAt)
          ? Math.floor(args.accessTokenExpiresAt)
          : undefined,
      email: normalizeString(args.email) || undefined,
      displayName: normalizeString(args.displayName) || undefined,
      avatarUrl: normalizeString(args.avatarUrl) || undefined,
      refreshGeneration: generation,
      refreshLeaseId: undefined,
      refreshLeaseExpiresAt: undefined,
      lastUsedAt: lifetime.lastUsedAt,
      idleExpiresAt: lifetime.idleExpiresAt,
      absoluteExpiresAt: lifetime.absoluteExpiresAt,
      lastRefreshAt: args.nowMs,
      revokedAt: undefined,
      revokedReason: undefined,
      updatedAt: args.nowMs,
    });
    return { status: "finalized" as const, generation };
  },
});

export const failAuthSessionRefreshInternal = internalMutation({
  args: {
    sessionId: v.string(),
    leaseId: v.string(),
    expectedGeneration: v.number(),
    terminal: v.boolean(),
    reason: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await getAuthSessionRowBySessionId(ctx, args.sessionId);
    if (!row) return { applied: false };
    if (
      normalizeString(row.refreshLeaseId) !== args.leaseId ||
      normalizeAuthSessionRefreshGeneration(row.refreshGeneration) !==
        normalizeAuthSessionRefreshGeneration(args.expectedGeneration)
    ) {
      return { applied: false };
    }
    if (args.terminal) {
      await revokeAuthSessionRow({
        ctx,
        row,
        nowMs: args.nowMs,
        reason: normalizeDiagnosticErrorCode(
          args.reason,
          "auth_session_refresh_invalid",
        ),
      });
      return { applied: true, revoked: true };
    }
    await ctx.db.patch(row._id as any, {
      refreshLeaseId: undefined,
      refreshLeaseExpiresAt: undefined,
      updatedAt: Math.max(row.updatedAt, args.nowMs),
    });
    return { applied: true, revoked: false };
  },
});

type AuthSessionActionContext = {
  runMutation: (
    mutationRef: any,
    args: Record<string, unknown>,
  ) => Promise<any>;
  runQuery: (
    queryRef: any,
    args: Record<string, unknown>,
  ) => Promise<any>;
};

type StableRefreshResult =
  | {
      status: "refreshed";
      session: ReturnType<typeof toPublicSession>;
      sessionId: string;
      generation: number;
      waited: boolean;
      leaseTakeover: boolean;
      chainDepth: number;
    }
  | {
      status: "ready";
      session: ReturnType<typeof toPublicSession>;
      sessionId: string;
      generation: number;
      waited: boolean;
      chainDepth: number;
    }
  | {
      status: "terminal_failure" | "transient_failure";
      reason: string;
    };

type BootstrapAuthSessionResult =
  | {
      status: "ready";
      session: ReturnType<typeof toPublicSession>;
      sessionId: string;
      trace: {
        bootstrapPath: string;
        rotatedSessionFollowed: boolean;
        upstreamRefreshMs?: number;
      };
    }
  | {
      status: "terminal_failure" | "transient_failure";
      reason: string;
    };

function waitForAuthSessionRefresh(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function readDecodedAuthSessionById(
  ctx: AuthSessionActionContext,
  sessionId: string,
): Promise<
  | { ok: true; row: AuthSessionRow; stored: StoredAuthSessionV1 }
  | { ok: false; reason: string }
> {
  const row = (await ctx.runQuery(
    internal.authSessions.getAuthSessionBySessionIdInternal as any,
    { sessionId },
  )) as AuthSessionRow | null;
  if (!row) return { ok: false, reason: "auth_session_missing" };
  if (typeof row.revokedAt === "number") {
    return {
      ok: false,
      reason: normalizeString(row.revokedReason) || "auth_session_revoked",
    };
  }
  const stored = await decodeStoredState(row);
  if (!stored?.refreshToken) {
    return { ok: false, reason: "auth_session_invalid" };
  }
  return { ok: true, row, stored };
}

async function refreshAuthSessionWithServerLease(
  ctx: AuthSessionActionContext,
  requestedSessionId: string,
  options?: { forceRefresh?: boolean },
): Promise<StableRefreshResult> {
  const forceRefresh = options?.forceRefresh === true;
  const refreshRequestedAt = Date.now();
  for (let claimAttempt = 0; claimAttempt < 2; claimAttempt += 1) {
    const leaseId = buildSessionId();
    const claim = await ctx.runMutation(
      internal.authSessions.claimAuthSessionRefreshInternal as any,
      {
        sessionId: requestedSessionId,
        leaseId,
        nowMs: Date.now(),
        ...(forceRefresh ? { forceRefresh: true, refreshRequestedAt } : null),
      },
    );
    if (claim?.status === "terminal_failure") {
      return {
        status: "terminal_failure",
        reason: normalizeString(claim.reason) || "auth_session_invalid",
      };
    }
    if (claim?.status === "ready") {
      const sessionId = normalizeString(claim.sessionId);
      const current = await readDecodedAuthSessionById(ctx, sessionId);
      if (!current.ok) {
        return { status: "terminal_failure", reason: current.reason };
      }
      return {
        status: "ready",
        session: toPublicSession(current.stored),
        sessionId,
        generation: normalizeAuthSessionRefreshGeneration(claim.generation),
        waited: false,
        chainDepth: Number(claim.chainDepth ?? 0),
      };
    }
    if (claim?.status === "waiting") {
      const sessionId = normalizeString(claim.sessionId);
      const observedGeneration = normalizeAuthSessionRefreshGeneration(
        claim.generation,
      );
      if (!sessionId) {
        return {
          status: "transient_failure",
          reason: "auth_session_refresh_claim_invalid",
        };
      }
      for (
        let waitAttempt = 0;
        waitAttempt < AUTH_SESSION_REFRESH_WAIT_ATTEMPTS;
        waitAttempt += 1
      ) {
        await waitForAuthSessionRefresh(
          AUTH_SESSION_REFRESH_WAIT_INTERVAL_MS,
        );
        const snapshot = await ctx.runQuery(
          internal.authSessions.getAuthSessionRefreshSnapshotInternal as any,
          { sessionId },
        );
        if (!snapshot) {
          return {
            status: "terminal_failure",
            reason: "auth_session_missing",
          };
        }
        if (typeof snapshot.revokedAt === "number") {
          return {
            status: "terminal_failure",
            reason:
              normalizeString(snapshot.revokedReason) ||
              "auth_session_revoked",
          };
        }
        const generation = normalizeAuthSessionRefreshGeneration(
          snapshot.generation,
        );
        if (generation > observedGeneration) {
          const current = await readDecodedAuthSessionById(ctx, sessionId);
          if (!current.ok) {
            return { status: "terminal_failure", reason: current.reason };
          }
          return {
            status: "refreshed",
            session: toPublicSession(current.stored),
            sessionId,
            generation,
            waited: true,
            leaseTakeover: false,
            chainDepth: Number(claim.chainDepth ?? 0),
          };
        }
        const activeLeaseId = normalizeString(snapshot.refreshLeaseId);
        const activeLeaseExpiresAt = Number(
          snapshot.refreshLeaseExpiresAt ?? 0,
        );
        if (
          !activeLeaseId ||
          !Number.isFinite(activeLeaseExpiresAt) ||
          activeLeaseExpiresAt <= Date.now()
        ) {
          break;
        }
      }
      continue;
    }
    if (claim?.status !== "leader") {
      return {
        status: "transient_failure",
        reason: "auth_session_refresh_claim_invalid",
      };
    }

    const sessionId = normalizeString(claim.sessionId);
    const generation = normalizeAuthSessionRefreshGeneration(
      claim.generation,
    );
    const current = await readDecodedAuthSessionById(ctx, sessionId);
    if (!current.ok) {
      await ctx.runMutation(
        internal.authSessions.failAuthSessionRefreshInternal as any,
        {
          sessionId,
          leaseId,
          expectedGeneration: generation,
          terminal: true,
          reason: current.reason,
          nowMs: Date.now(),
        },
      );
      return { status: "terminal_failure", reason: current.reason };
    }

    let upstreamRefreshSucceeded = false;
    try {
      const refreshed = await refreshUpstreamSession(current.stored);
      upstreamRefreshSucceeded = true;
      const finalizeArgs = {
        sessionId,
        leaseId,
        expectedGeneration: generation,
        accessToken: refreshed.accessToken,
        ...(refreshed.idToken ? { idToken: refreshed.idToken } : null),
        refreshToken: refreshed.refreshToken,
        ...(typeof refreshed.accessTokenExpiresAt === "number"
          ? { accessTokenExpiresAt: refreshed.accessTokenExpiresAt }
          : null),
        externalUserId: refreshed.user.id,
        ...(refreshed.user.email ? { email: refreshed.user.email } : null),
        emailVerified: refreshed.user.emailVerified,
        ...(refreshed.user.displayName
          ? { displayName: refreshed.user.displayName }
          : null),
        ...(refreshed.user.avatarUrl
          ? { avatarUrl: refreshed.user.avatarUrl }
          : null),
        nowMs: Date.now(),
      };
      let finalized;
      try {
        finalized = await ctx.runMutation(
          internal.authSessions.finalizeAuthSessionRefreshInternal as any,
          finalizeArgs,
        );
      } catch {
        // A refresh provider may rotate its secret. Retrying the generation-
        // fenced write prevents an ambiguous mutation response from dropping
        // the only fresh credential. The retry is safe if the first committed.
        finalized = await ctx.runMutation(
          internal.authSessions.finalizeAuthSessionRefreshInternal as any,
          finalizeArgs,
        );
      }
      if (finalized?.status === "finalized") {
        return {
          status: "refreshed",
          session: toPublicSession(refreshed),
          sessionId,
          generation: normalizeAuthSessionRefreshGeneration(
            finalized.generation,
          ),
          waited: false,
          leaseTakeover: claim.leaseTakeover === true,
          chainDepth: Number(claim.chainDepth ?? 0),
        };
      }
      if (finalized?.status === "terminal_failure") {
        return {
          status: "terminal_failure",
          reason:
            normalizeString(finalized.reason) || "auth_session_invalid",
        };
      }
      const winner = await readDecodedAuthSessionById(ctx, sessionId);
      if (
        winner.ok &&
        normalizeAuthSessionRefreshGeneration(winner.row.refreshGeneration) >
          generation
      ) {
        return {
          status: "refreshed",
          session: toPublicSession(winner.stored),
          sessionId,
          generation: normalizeAuthSessionRefreshGeneration(
            winner.row.refreshGeneration,
          ),
          waited: true,
          leaseTakeover: false,
          chainDepth: Number(claim.chainDepth ?? 0),
        };
      }
      return {
        status: "transient_failure",
        reason: "auth_session_refresh_lease_lost",
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error ?? "");
      if (upstreamRefreshSucceeded) {
        const winner = await readDecodedAuthSessionById(ctx, sessionId);
        if (
          winner.ok &&
          normalizeAuthSessionRefreshGeneration(winner.row.refreshGeneration) >
            generation
        ) {
          return {
            status: "refreshed",
            session: toPublicSession(winner.stored),
            sessionId,
            generation: normalizeAuthSessionRefreshGeneration(
              winner.row.refreshGeneration,
            ),
            waited: true,
            leaseTakeover: false,
            chainDepth: Number(claim.chainDepth ?? 0),
          };
        }
        // Do not release this lease after an upstream rotation that could not
        // be durably finalized. Let its bounded expiry contain the ambiguity.
        return {
          status: "transient_failure",
          reason: "auth_session_refresh_finalize_unavailable",
        };
      }
      const terminal = isTerminalRefreshFailure(reason);
      await ctx.runMutation(
        internal.authSessions.failAuthSessionRefreshInternal as any,
        {
          sessionId,
          leaseId,
          expectedGeneration: generation,
          terminal,
          reason: reason || "auth_session_refresh_unavailable",
          nowMs: Date.now(),
        },
      );
      if (terminal) {
        return {
          status: "terminal_failure",
          reason: reason || "auth_session_refresh_invalid",
        };
      }
      const nowSec = Math.floor(Date.now() / 1000);
      if (!forceRefresh && hasUsableAccessToken(current.stored, nowSec, 0)) {
        return {
          status: "ready",
          session: toPublicSession(current.stored),
          sessionId,
          generation,
          waited: false,
          chainDepth: Number(claim.chainDepth ?? 0),
        };
      }
      return {
        status: "transient_failure",
        reason: reason || "auth_session_refresh_unavailable",
      };
    }
  }

  return {
    status: "transient_failure",
    reason: "auth_session_refresh_wait_timeout",
  };
}

export const bootstrapAuthSessionInternal = internalAction({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args): Promise<BootstrapAuthSessionResult> => {
    const startedAt = Date.now();
    const touched = (await ctx.runMutation(
      internal.authSessions.touchAuthSessionForUseInternal as any,
      { sessionId: args.sessionId, nowMs: startedAt },
    )) as
      | {
          status: "ready";
          sessionId: string;
          wasRedirected: boolean;
          chainDepth: number;
          generation: number;
        }
      | { status: "terminal_failure"; reason: string };
    if (touched?.status !== "ready") {
      const reason =
        normalizeString(touched?.reason) || "auth_session_resolution_failed";
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.bootstrap_failed",
        status: "failed",
        severity: "warning",
        surface: "auth_bridge_bootstrap",
        errorCode: normalizeDiagnosticErrorCode(
          reason,
          "auth_session_resolution_failed",
        ),
      });
      return { status: "terminal_failure" as const, reason };
    }
    const sessionId = normalizeString(touched.sessionId);
    const current = await readDecodedAuthSessionById(ctx, sessionId);
    if (!current.ok) {
      await ctx.runMutation(internal.authSessions.revokeAuthSessionInternal as any, {
        sessionId,
        nowMs: Date.now(),
        reason: current.reason,
      });
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.bootstrap_failed",
        status: "failed",
        severity: "warning",
        surface: "auth_bridge_bootstrap",
        errorCode: normalizeDiagnosticErrorCode(
          current.reason,
          "auth_session_invalid",
        ),
      });
      return { status: "terminal_failure" as const, reason: current.reason };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (hasUsableAccessToken(current.stored, nowSec, 60)) {
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_established",
        status: "succeeded",
        userId: current.row.userId,
        surface: "auth_bridge_bootstrap",
        metadata: {
          bootstrapPath: "stored_token",
          rotatedSessionFollowed: touched.wasRedirected === true,
          chainDepth: Number(touched.chainDepth ?? 0),
        },
      });
      return {
        status: "ready" as const,
        session: toPublicSession(current.stored),
        sessionId,
        trace: {
          bootstrapPath: "stored_token",
          rotatedSessionFollowed: touched.wasRedirected === true,
        },
      };
    }
    const refreshed = await refreshAuthSessionWithServerLease(
      ctx,
      sessionId,
    );
    if (refreshed.status === "refreshed" || refreshed.status === "ready") {
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_established",
        status: "succeeded",
        userId: current.row.userId,
        surface: "auth_bridge_bootstrap",
        latencyMs: Date.now() - startedAt,
        metadata: {
          bootstrapPath:
            refreshed.status === "refreshed"
              ? "stable_refresh"
              : "stored_token_recovery",
          rotatedSessionFollowed: touched.wasRedirected === true,
          chainDepth: Math.max(
            Number(touched.chainDepth ?? 0),
            refreshed.chainDepth,
          ),
        },
      });
      return {
        status: "ready" as const,
        session: refreshed.session,
        sessionId: refreshed.sessionId,
        trace: {
          bootstrapPath:
            refreshed.status === "refreshed"
              ? "stable_refresh"
              : "stored_token_recovery",
          rotatedSessionFollowed: touched.wasRedirected === true,
          upstreamRefreshMs: Date.now() - startedAt,
        },
      };
    }
    await recordAuthSessionDiagnostic(ctx, {
      eventType: "auth.bootstrap_failed",
      status: "failed",
      severity:
        refreshed.status === "terminal_failure" ? "error" : "warning",
      userId: current.row.userId,
      surface: "auth_bridge_bootstrap",
      errorCode: normalizeDiagnosticErrorCode(
        refreshed.reason,
        "auth_session_refresh_unavailable",
      ),
    });
    return refreshed;
  },
});

export const refreshAuthSessionInternal = internalAction({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args): Promise<StableRefreshResult> => {
    const startedAt = Date.now();
    const refreshed = await refreshAuthSessionWithServerLease(
      ctx,
      args.sessionId,
      { forceRefresh: true },
    );
    if (refreshed.status === "refreshed" || refreshed.status === "ready") {
      const current = await ctx.runQuery(
        internal.authSessions.getAuthSessionBySessionIdInternal as any,
        { sessionId: refreshed.sessionId },
      );
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_refreshed",
        status: "succeeded",
        ...(current?.userId ? { userId: current.userId } : null),
        surface: "auth_bridge_refresh",
        latencyMs: Date.now() - startedAt,
        metadata: {
          generation: refreshed.generation,
          refreshMode:
            refreshed.status === "refreshed"
              ? "stable_update"
              : "stored_token_recovery",
          waited: refreshed.waited,
          leaseTakeover:
            refreshed.status === "refreshed"
              ? refreshed.leaseTakeover
              : false,
          chainDepth: refreshed.chainDepth,
        },
      });
      return refreshed;
    }
    await recordAuthSessionDiagnostic(ctx, {
      eventType: "auth.session_refresh_failed",
      status: "failed",
      severity:
        refreshed.status === "terminal_failure" ? "error" : "warning",
      surface: "auth_bridge_refresh",
      errorCode: normalizeDiagnosticErrorCode(
        refreshed.reason,
        "auth_session_refresh_unavailable",
      ),
    });
    return refreshed;
  },
});

export const logoutAuthSessionInternal = internalAction({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const resolved = (await ctx.runQuery(
      internal.authSessions.resolveAuthSessionBySessionIdInternal as any,
      { sessionId: args.sessionId },
    )) as
      | {
          ok: true;
          row: AuthSessionRow;
          resolvedSessionId: string;
          wasRedirected: boolean;
          chainDepth: number;
        }
      | {
          ok: false;
          reason: "auth_session_missing" | "auth_session_chain_invalid";
        };
    if (!resolved.ok) {
      // An invalid chain is permanent and unusable, as bootstrap and refresh report.
      return resolved.reason === "auth_session_missing"
        ? { status: "ok" as const }
        : { status: "terminal_failure" as const, reason: resolved.reason };
    }
    const row = resolved.row;
    if (typeof row.revokedAt === "number") {
      return { status: "ok" as const };
    }
    await ctx.runMutation(internal.authSessions.revokeAuthSessionInternal as any, {
      sessionId: args.sessionId,
      nowMs: Date.now(),
      reason: "logout",
    });
    // Canonical revocation must not depend on provider availability. Decode
    // the pre-revocation snapshot solely for bounded best-effort provider logout.
    const stored = await decodeStoredState(row);
    if (stored?.accessToken) {
      await logoutUpstream(stored.accessToken);
    }
    return { status: "ok" as const };
  },
});

export const pruneRevokedAuthSessionsForMaintenance = mutation({
  args: {
    secret: v.string(),
    revokedBeforeMs: v.number(),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireAuthSessionMaintenanceSecret({
      expectedSecret: readEnv("ARX_AUTH_MIGRATION_AUDIT_SECRET"),
      providedSecret: args.secret,
    });
    return await pruneRevokedAuthSessionsBatch({
      ctx,
      revokedBeforeMs: args.revokedBeforeMs,
      limit: args.limit,
      dryRun: args.dryRun,
    });
  },
});

export const scrubRevokedAuthSessionSecretsForMaintenance = mutation({
  args: {
    secret: v.string(),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    requireAuthSessionMaintenanceSecret({
      expectedSecret: readEnv("ARX_AUTH_MIGRATION_AUDIT_SECRET"),
      providedSecret: args.secret,
    });
    return await scrubRevokedAuthSessionSecretsBatch({
      ctx,
      cursor: args.cursor,
      limit: args.limit,
      dryRun: args.dryRun,
      order: args.order,
    });
  },
});

export { normalizeStoredState };
