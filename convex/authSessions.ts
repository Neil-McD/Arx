import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { decryptStoredSecret, encryptSecret } from "./providerConnections";
import { fetchAuthProviderText } from "./authProviderRequest";
import {
  AUTH_PROVIDER_LOGOUT_TIMEOUT_MS,
  AUTH_SECURE_RANDOM_UNAVAILABLE,
  AUTH_SESSION_ABSOLUTE_TTL_MS,
  AUTH_SESSION_REFRESH_LEASE_MS,
  AUTH_SESSION_SECRET_VERSION,
  classifyAuthSessionLogoutResolutionFailure,
  completeConfirmedAuthSessionLogout,
  computeAuthSessionPurgeAfter,
  createSecureAuthSessionId,
  hashAuthSessionCredential,
  normalizeAuthSessionBatchLimit,
  resolveAuthSessionLifecycle,
  type AuthProviderLogoutOutcome,
} from "./authSessionCore";

export {
  AUTH_SECURE_RANDOM_UNAVAILABLE,
  classifyAuthSessionLogoutResolutionFailure,
  completeConfirmedAuthSessionLogout,
  createSecureAuthSessionId,
  hashAuthSessionCredential,
  resolveAuthSessionLifecycle,
} from "./authSessionCore";

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
  sessionTokenHash: string;
  userId: unknown;
  encryptedSecretHex: string;
  secretIvHex: string;
  secretVersion: number;
  expiresAt: number;
  refreshLeaseId?: string | null;
  refreshLeaseExpiresAt?: number | null;
  secretRevision: number;
  revokedAt?: number | null;
  purgeAfterAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

const DEFAULT_OAUTH_SCOPE = "openid profile email offline_access";
const WORKOS_AUTHENTICATE_UPSTREAM_URL = "https://api.workos.com/user_management/authenticate";

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

function readObservedRefreshSubjects(payload: unknown): string[] {
  const sessionPayload = findSessionPayload(payload, false);
  if (!sessionPayload) return [];
  const accessToken = readObjectString(sessionPayload, ["access_token", "accessToken"]);
  const idToken = readObjectString(sessionPayload, ["id_token", "idToken"]);
  const subjects = [
    coerceUser(sessionPayload.user)?.id ?? null,
    idToken ? decodeUserFromIdentityToken(idToken)?.id ?? null : null,
    accessToken ? decodeUserFromIdentityToken(accessToken)?.id ?? null : null,
  ]
    .map((value) => normalizeString(value))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(subjects));
}

function encodeStoredState(value: StoredAuthSessionV1): string {
  return JSON.stringify(value);
}

async function decodeStoredState(
  row: Pick<AuthSessionRow, "encryptedSecretHex" | "secretIvHex" | "secretVersion">,
): Promise<StoredAuthSessionV1 | null> {
  try {
    if (row.secretVersion !== AUTH_SESSION_SECRET_VERSION) return null;
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
  const response = await fetchAuthProviderText(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!response.ok) {
    const text = response.bodyText.trim();
    throw new Error(text || `auth_refresh_failed_${response.status}`);
  }
  const payload = JSON.parse(response.bodyText) as unknown;
  const expectedSubject = normalizeString(existing.user.id);
  const observedSubjects = readObservedRefreshSubjects(payload);
  if (observedSubjects.length === 0) {
    throw new Error("auth_session_subject_unverifiable");
  }
  if (!expectedSubject || observedSubjects.some((subject) => subject !== expectedSubject)) {
    throw new Error("auth_session_subject_mismatch");
  }
  const refreshed = normalizeStoredState(payload, {
    requireRefreshToken: false,
    fallback: existing,
  });
  if (!refreshed?.refreshToken) {
    throw new Error("invalid_refresh_payload");
  }
  return refreshed;
}

async function logoutUpstream(accessToken: string): Promise<AuthProviderLogoutOutcome> {
  const logoutUrl = resolveOAuthLogoutUrl();
  if (!logoutUrl || !normalizeString(accessToken)) return "skipped";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_PROVIDER_LOGOUT_TIMEOUT_MS);
  try {
    const response = await fetch(logoutUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        scope: "local",
        access_token: accessToken,
      }),
      signal: controller.signal,
    });
    return response.ok ? "succeeded" : "failed";
  } catch {
    return "failed";
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
      ...(stored.user.displayName ? { displayName: stored.user.displayName } : null),
      ...(stored.user.avatarUrl ? { avatarUrl: stored.user.avatarUrl } : null),
    },
  };
}

type AuthSessionLookup = {
  sessionTokenHash: string;
};

function normalizeSecretRevision(row: AuthSessionRow): number {
  return typeof row.secretRevision === "number" && Number.isFinite(row.secretRevision)
    ? Math.max(0, Math.floor(row.secretRevision))
    : 0;
}

function resolveRowLifecycle(row: AuthSessionRow, nowMs: number) {
  return resolveAuthSessionLifecycle({ expiresAt: row.expiresAt, revokedAt: row.revokedAt }, nowMs);
}

async function getAuthSessionRowByLookup(
  ctx: any,
  lookup: AuthSessionLookup,
): Promise<AuthSessionRow | null> {
  const byHash = await ctx.db
    .query("authSessions")
    .withIndex("by_sessionTokenHash", (q: any) =>
      q.eq("sessionTokenHash", lookup.sessionTokenHash),
    )
    .first();
  return (byHash as AuthSessionRow | null) ?? null;
}

function buildStoredStateArgs(args: {
  accessToken: string;
  idToken?: string;
  refreshToken: string;
  accessTokenExpiresAt?: number;
  externalUserId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}): StoredAuthSessionV1 {
  return {
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
  };
}

function isTerminalRefreshFailure(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes("invalid_grant") ||
    normalized.includes("invalid refresh token") ||
    normalized.includes("missing refresh token") ||
    normalized.includes("auth_session_subject_mismatch") ||
    normalized.includes("auth_refresh_failed_400") ||
    normalized.includes("auth_refresh_failed_401") ||
    normalized.includes("auth_refresh_failed_403")
  );
}

const lookupArgs = {
  sessionTokenHash: v.string(),
};

export const getAuthSessionByCredentialInternal = internalQuery({
  args: lookupArgs,
  handler: async (ctx, args) => await getAuthSessionRowByLookup(ctx, args),
});

export const createAuthSessionInternal = internalMutation({
  args: {
    sessionTokenHash: v.string(),
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
    const existing = await getAuthSessionRowByLookup(ctx, {
      sessionTokenHash: args.sessionTokenHash,
    });
    if (existing) throw new Error("auth_session_credential_collision");
    const encrypted = await encryptSecret(encodeStoredState(buildStoredStateArgs(args)));
    const expiresAt = args.nowMs + AUTH_SESSION_ABSOLUTE_TTL_MS;
    const purgeAfterAt = computeAuthSessionPurgeAfter(expiresAt);
    const id = await ctx.db.insert("authSessions", {
      sessionTokenHash: args.sessionTokenHash,
      userId: args.userId,
      encryptedSecretHex: encrypted.encryptedSecretHex,
      secretIvHex: encrypted.secretIvHex,
      secretVersion: encrypted.secretVersion,
      expiresAt,
      purgeAfterAt,
      secretRevision: 0,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { id, expiresAt };
  },
});

export const claimAuthSessionRefreshInternal = internalMutation({
  args: {
    ...lookupArgs,
    expectedSecretRevision: v.number(),
    leaseId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await getAuthSessionRowByLookup(ctx, args);
    if (!row) return { status: "missing" as const };
    const lifecycle = resolveRowLifecycle(row, args.nowMs);
    if (lifecycle.status === "terminal") return lifecycle;
    if (normalizeSecretRevision(row) !== args.expectedSecretRevision) {
      return { status: "stale" as const };
    }
    const activeLease =
      normalizeString(row.refreshLeaseId) &&
      typeof row.refreshLeaseExpiresAt === "number" &&
      row.refreshLeaseExpiresAt > args.nowMs;
    if (activeLease) return { status: "busy" as const };
    await ctx.db.patch(row._id as any, {
      refreshLeaseId: args.leaseId,
      refreshLeaseExpiresAt: args.nowMs + AUTH_SESSION_REFRESH_LEASE_MS,
      updatedAt: args.nowMs,
    });
    return { status: "claimed" as const, expiresAt: lifecycle.expiresAt };
  },
});

export const completeAuthSessionRefreshInternal = internalMutation({
  args: {
    ...lookupArgs,
    expectedSecretRevision: v.number(),
    leaseId: v.string(),
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
    const row = await getAuthSessionRowByLookup(ctx, args);
    if (!row) return { committed: false, reason: "missing" as const };
    const lifecycle = resolveRowLifecycle(row, args.nowMs);
    if (lifecycle.status === "terminal") {
      return { committed: false, reason: lifecycle.reason };
    }
    if (
      normalizeString(row.refreshLeaseId) !== args.leaseId ||
      normalizeSecretRevision(row) !== args.expectedSecretRevision
    ) {
      return { committed: false, reason: "lease_lost" as const };
    }
    const encrypted = await encryptSecret(encodeStoredState(buildStoredStateArgs(args)));
    await ctx.db.patch(row._id as any, {
      encryptedSecretHex: encrypted.encryptedSecretHex,
      secretIvHex: encrypted.secretIvHex,
      secretVersion: encrypted.secretVersion,
      secretRevision: args.expectedSecretRevision + 1,
      refreshLeaseId: undefined,
      refreshLeaseExpiresAt: undefined,
      updatedAt: args.nowMs,
    });
    return { committed: true, expiresAt: lifecycle.expiresAt };
  },
});

export const releaseAuthSessionRefreshInternal = internalMutation({
  args: {
    ...lookupArgs,
    leaseId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await getAuthSessionRowByLookup(ctx, args);
    if (!row || normalizeString(row.refreshLeaseId) !== args.leaseId) {
      return { released: false };
    }
    await ctx.db.patch(row._id as any, {
      refreshLeaseId: undefined,
      refreshLeaseExpiresAt: undefined,
      updatedAt: args.nowMs,
    });
    return { released: true };
  },
});

export const revokeAuthSessionInternal = internalMutation({
  args: {
    ...lookupArgs,
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await getAuthSessionRowByLookup(ctx, args);
    if (!row) return { revoked: false, missing: true };
    const revokedAt =
      typeof row.revokedAt === "number" && Number.isFinite(row.revokedAt)
        ? Math.floor(row.revokedAt)
        : Math.floor(args.nowMs);
    const purgeAfterAt = computeAuthSessionPurgeAfter(
      Math.min(row.expiresAt, revokedAt),
    );
    const alreadyCanonical =
      row.revokedAt === revokedAt &&
      row.purgeAfterAt === purgeAfterAt &&
      !normalizeString(row.refreshLeaseId) &&
      typeof row.refreshLeaseExpiresAt !== "number";
    if (alreadyCanonical) return { revoked: true, missing: false };
    await ctx.db.patch(row._id as any, {
      revokedAt,
      purgeAfterAt,
      refreshLeaseId: undefined,
      refreshLeaseExpiresAt: undefined,
      updatedAt: args.nowMs,
    });
    return { revoked: true, missing: false };
  },
});

export const pruneTerminalAuthSessionsInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeAuthSessionBatchLimit(args.limit);
    const nowMs =
      typeof args.nowMs === "number" && Number.isFinite(args.nowMs) ? args.nowMs : Date.now();
    const rows = await ctx.db
      .query("authSessions")
      .withIndex("by_purgeAfterAt", (q: any) =>
        q.gt("purgeAfterAt", 0).lte("purgeAfterAt", nowMs),
      )
      .take(limit);
    let deleted = 0;
    let repaired = 0;
    for (const row of rows) {
      const revokedAt =
        typeof row.revokedAt === "number" && Number.isFinite(row.revokedAt)
          ? Math.floor(row.revokedAt)
          : undefined;
      const purgeAfterAt = computeAuthSessionPurgeAfter(
        revokedAt === undefined ? row.expiresAt : Math.min(row.expiresAt, revokedAt),
      );
      if (purgeAfterAt > nowMs) {
        if (row.purgeAfterAt !== purgeAfterAt) {
          await ctx.db.patch(row._id, { purgeAfterAt, updatedAt: nowMs });
          repaired += 1;
        }
        continue;
      }
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    const doneForNow = rows.length < limit;
    if (!doneForNow) {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).authSessions.pruneTerminalAuthSessionsInternal,
        { nowMs, limit },
      );
    }
    return {
      deleted,
      repaired,
      limit,
      doneForNow,
      continuationScheduled: !doneForNow,
    };
  },
});

async function readAuthSessionForAction(ctx: any, lookup: AuthSessionLookup) {
  return (await ctx.runQuery(
    (internal as any).authSessions.getAuthSessionByCredentialInternal,
    lookup,
  )) as AuthSessionRow | null;
}

async function revokeAuthSessionForAction(ctx: any, lookup: AuthSessionLookup, nowMs: number) {
  return await ctx.runMutation((internal as any).authSessions.revokeAuthSessionInternal, {
    ...lookup,
    nowMs,
  });
}

async function recordAuthSessionRefreshFailure(
  ctx: any,
  input: {
    forceRefresh: boolean;
    surface: "auth_bridge_bootstrap" | "auth_bridge_refresh";
    reason: string;
    userId?: unknown;
    latencyMs?: number;
  },
) {
  await recordAuthSessionDiagnostic(ctx, {
    eventType: input.forceRefresh ? "auth.session_refresh_failed" : "auth.bootstrap_failed",
    status: "failed",
    userId: input.userId,
    surface: input.surface,
    ...(typeof input.latencyMs === "number" ? { latencyMs: input.latencyMs } : null),
    errorCode: normalizeDiagnosticErrorCode(input.reason, "auth_session_unavailable"),
  });
}

async function refreshAuthSessionForAction(params: {
  ctx: any;
  lookup: AuthSessionLookup;
  forceRefresh: boolean;
  surface: "auth_bridge_bootstrap" | "auth_bridge_refresh";
}) {
  const { ctx, lookup, forceRefresh, surface } = params;
  const row = await readAuthSessionForAction(ctx, lookup);
  if (!row) {
    await recordAuthSessionRefreshFailure(ctx, {
      forceRefresh,
      surface,
      reason: "auth_session_missing",
    });
    return { status: "terminal_failure" as const, reason: "auth_session_missing" };
  }
  const nowMs = Date.now();
  const lifecycle = resolveRowLifecycle(row, nowMs);
  if (lifecycle.status === "terminal") {
    if (lifecycle.reason === "auth_session_expired" && typeof row.revokedAt !== "number") {
      await revokeAuthSessionForAction(ctx, lookup, nowMs);
    }
    await recordAuthSessionRefreshFailure(ctx, {
      forceRefresh,
      surface,
      reason: lifecycle.reason,
      userId: row.userId,
    });
    return { status: "terminal_failure" as const, reason: lifecycle.reason };
  }
  const stored = await decodeStoredState(row);
  if (!stored?.refreshToken) {
    await revokeAuthSessionForAction(ctx, lookup, nowMs);
    await recordAuthSessionRefreshFailure(ctx, {
      forceRefresh,
      surface,
      reason: "auth_session_invalid",
      userId: row.userId,
    });
    return { status: "terminal_failure" as const, reason: "auth_session_invalid" };
  }
  const nowSec = Math.floor(nowMs / 1_000);
  if (!forceRefresh && hasUsableAccessToken(stored, nowSec, 60)) {
    await recordAuthSessionDiagnostic(ctx, {
      eventType: "auth.session_established",
      status: "succeeded",
      userId: row.userId,
      surface,
      metadata: { bootstrapPath: "stored_token", refreshLeaseContended: false },
    });
    return {
      status: "ready" as const,
      session: toPublicSession(stored),
      trace: { bootstrapPath: "stored_token", refreshLeaseContended: false },
    };
  }

  let leaseId: string;
  try {
    leaseId = createSecureAuthSessionId();
  } catch {
    await recordAuthSessionRefreshFailure(ctx, {
      forceRefresh,
      surface,
      reason: AUTH_SECURE_RANDOM_UNAVAILABLE,
      userId: row.userId,
    });
    return { status: "transient_failure" as const, reason: AUTH_SECURE_RANDOM_UNAVAILABLE };
  }
  const expectedSecretRevision = normalizeSecretRevision(row);
  const claim = (await ctx.runMutation(
    (internal as any).authSessions.claimAuthSessionRefreshInternal,
    {
      ...lookup,
      expectedSecretRevision,
      leaseId,
      nowMs,
    },
  )) as { status: string };
  if (claim.status !== "claimed") {
    if ((claim.status === "busy" || claim.status === "stale") && hasUsableAccessToken(stored, nowSec, 0)) {
      if (!forceRefresh) {
        await recordAuthSessionDiagnostic(ctx, {
          eventType: "auth.session_established",
          status: "succeeded",
          userId: row.userId,
          surface,
          metadata: { bootstrapPath: "stored_token", refreshLeaseContended: true },
        });
      }
      return {
        status: "ready" as const,
        session: toPublicSession(stored),
        trace: { bootstrapPath: "stored_token", refreshLeaseContended: true },
      };
    }
    if (claim.status === "missing" || claim.status === "terminal") {
      await recordAuthSessionRefreshFailure(ctx, {
        forceRefresh,
        surface,
        reason: "auth_session_invalid",
        userId: row.userId,
      });
      return { status: "terminal_failure" as const, reason: "auth_session_invalid" };
    }
    await recordAuthSessionRefreshFailure(ctx, {
      forceRefresh,
      surface,
      reason: "auth_session_refresh_in_progress",
      userId: row.userId,
    });
    return { status: "transient_failure" as const, reason: "auth_session_refresh_in_progress" };
  }

  const refreshStartedAt = Date.now();
  try {
    const refreshed = await refreshUpstreamSession(stored);
    const completed = (await ctx.runMutation(
      (internal as any).authSessions.completeAuthSessionRefreshInternal,
      {
        ...lookup,
        expectedSecretRevision,
        leaseId,
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
      },
    )) as { committed: boolean };
    if (!completed.committed) {
      await recordAuthSessionRefreshFailure(ctx, {
        forceRefresh,
        surface,
        reason: "auth_session_refresh_commit_lost",
        userId: row.userId,
        latencyMs: Date.now() - refreshStartedAt,
      });
      return { status: "transient_failure" as const, reason: "auth_session_refresh_commit_lost" };
    }
    await recordAuthSessionDiagnostic(ctx, {
      eventType: forceRefresh ? "auth.session_refreshed" : "auth.session_established",
      status: "succeeded",
      userId: row.userId,
      surface,
      latencyMs: Date.now() - refreshStartedAt,
      ...(forceRefresh
        ? null
        : { metadata: { bootstrapPath: "upstream_refresh", refreshLeaseContended: false } }),
    });
    return {
      status: forceRefresh ? ("refreshed" as const) : ("ready" as const),
      session: toPublicSession(refreshed),
      trace: {
        bootstrapPath: "upstream_refresh",
        refreshLeaseContended: false,
        upstreamRefreshMs: Date.now() - refreshStartedAt,
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error ?? "");
    if (isTerminalRefreshFailure(reason)) {
      await revokeAuthSessionForAction(ctx, lookup, Date.now());
      await recordAuthSessionRefreshFailure(ctx, {
        forceRefresh,
        surface,
        reason: reason || "auth_session_refresh_invalid",
        userId: row.userId,
        latencyMs: Date.now() - refreshStartedAt,
      });
      return { status: "terminal_failure" as const, reason: reason || "auth_session_refresh_invalid" };
    }
    await ctx.runMutation((internal as any).authSessions.releaseAuthSessionRefreshInternal, {
      ...lookup,
      leaseId,
      nowMs: Date.now(),
    });
    await recordAuthSessionRefreshFailure(ctx, {
      forceRefresh,
      surface,
      reason: reason || "auth_session_refresh_unavailable",
      userId: row.userId,
      latencyMs: Date.now() - refreshStartedAt,
    });
    if (hasUsableAccessToken(stored, Math.floor(Date.now() / 1_000), 0)) {
      return {
        status: "ready" as const,
        session: toPublicSession(stored),
        trace: { bootstrapPath: "stored_token", recoveredAfterRefreshFailure: true },
      };
    }
    return { status: "transient_failure" as const, reason: reason || "auth_session_refresh_unavailable" };
  }
}

export const bootstrapAuthSessionInternal = internalAction({
  args: lookupArgs,
  handler: async (ctx, args) =>
    await refreshAuthSessionForAction({
      ctx,
      lookup: args,
      forceRefresh: false,
      surface: "auth_bridge_bootstrap",
    }),
});

export const refreshAuthSessionInternal = internalAction({
  args: lookupArgs,
  handler: async (ctx, args) =>
    await refreshAuthSessionForAction({
      ctx,
      lookup: args,
      forceRefresh: true,
      surface: "auth_bridge_refresh",
    }),
});

export const logoutAuthSessionInternal = internalAction({
  args: lookupArgs,
  handler: async (ctx, args) => {
    const row = await readAuthSessionForAction(ctx, args);
    if (!row) return classifyAuthSessionLogoutResolutionFailure("auth_session_missing");
    if (typeof row.revokedAt === "number") return { status: "ok" as const };
    const stored = await decodeStoredState(row);
    const logoutStartedAt = Date.now();
    const result = await completeConfirmedAuthSessionLogout({
      revokeLocalSession: async () => {
        const revoked = await revokeAuthSessionForAction(ctx, args, Date.now());
        if (!revoked?.revoked) throw new Error("auth_session_logout_unavailable");
      },
      ...(stored?.accessToken ? { logoutProvider: () => logoutUpstream(stored.accessToken) } : null),
    });
    if (result.status === "transient_failure") {
      await recordAuthSessionDiagnostic(ctx, {
        eventType: "auth.session_logout_failed",
        status: "failed",
        severity: "error",
        userId: row.userId,
        surface: "auth_bridge_logout",
        latencyMs: Date.now() - logoutStartedAt,
        errorCode: "auth_session_logout_unavailable",
      });
      return { status: "transient_failure" as const, reason: "auth_session_logout_unavailable" };
    }
    await recordAuthSessionDiagnostic(ctx, {
      eventType: "auth.session_logged_out",
      status: "succeeded",
      severity: result.providerLogoutOutcome === "failed" ? "warning" : "info",
      userId: row.userId,
      surface: "auth_bridge_logout",
      latencyMs: Date.now() - logoutStartedAt,
      metadata: { providerLogoutOutcome: result.providerLogoutOutcome },
    });
    return { status: "ok" as const };
  },
});

export { normalizeStoredState };
