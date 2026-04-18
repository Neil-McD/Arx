import {
  probeConvexAuthenticatedActorSessionDetailed,
  type ConvexAuthenticatedSessionProbeResult,
} from "./convexAuthSessionProbe";
import { readConvexRuntimeUrl } from "./convexRuntime";
import { isStandaloneWebApp } from "./browserRuntimeMode";

export type AuthUser = {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
};

export type AuthSession = {
  access_token: string;
  id_token?: string;
  expires_at: number; // epoch seconds
  user: AuthUser;
};

export type AuthSessionRef = {
  current: AuthSession | null;
};

export type AuthSessionRefreshInFlightRef = {
  current: Promise<AuthSession | null> | null;
};

export type AuthSessionRefreshResult =
  | { status: "refreshed"; session: AuthSession }
  | { status: "transient_failure"; reason: string }
  | { status: "terminal_failure"; reason: string };

export type AuthSessionRefreshResultInFlightRef = {
  current: Promise<AuthSessionRefreshResult> | null;
};

export type AuthSessionEnsureResult =
  | { status: "ready"; session: AuthSession; runtimeAcceptance?: ConvexAuthenticatedSessionProbeResult }
  | { status: "transient_failure"; reason: string }
  | { status: "terminal_failure"; reason: string };

function readFirstNonEmptyEnv(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = (import.meta.env[key as keyof ImportMetaEnv] as string | undefined) ?? "";
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function getAuthUrl(): string | null {
  return readFirstNonEmptyEnv(["VITE_CONVEX_URL"]);
}

export function getAuthPublicKey(): string | null {
  return readFirstNonEmptyEnv(["VITE_CONVEX_PUBLIC_KEY"]);
}

export async function readAuthError(response: Response): Promise<string> {
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
  return `Cloud error (${response.status})`;
}

export function decodeAuthJwtPayload(token: string): unknown | null {
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

export function getAuthUid(session: AuthSession): string {
  const payload = decodeAuthJwtPayload(session.id_token ?? session.access_token);
  const sub =
    payload && typeof payload === "object" && "sub" in payload && typeof (payload as any).sub === "string"
      ? String((payload as any).sub)
      : null;
  return sub ?? session.user.id;
}

const AUTH_GATEWAY_MAGIC_LINK_PATH = "/api/auth/magic-link";
function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildConvexRuntimeUrl(baseUrl: string, routePath: string): string {
  const route = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${trimTrailingSlashes(baseUrl)}${route}`;
}

function buildSameOriginAuthUrl(routePath: string): string {
  const route = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return new URL(route, window.location.origin).toString();
}

async function callSameOriginAuthEndpoint(params: {
  path: string;
  method?: "GET" | "POST";
  payload?: Record<string, unknown>;
}): Promise<Response | null> {
  const hasBody = params.method !== "GET" && typeof params.payload === "object" && params.payload !== null;
  try {
    return await fetch(buildSameOriginAuthUrl(params.path), {
      method: params.method ?? "POST",
      credentials: "include",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      ...(hasBody ? { body: JSON.stringify(params.payload) } : null),
    });
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readObjectString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return null;
}

function coerceDisplayNameFromRecord(record: Record<string, unknown>): string | null {
  const direct = readObjectString(record, [
    "name",
    "display_name",
    "displayName",
    "full_name",
    "fullName",
  ]);
  if (direct) return direct;
  const first = readObjectString(record, [
    "given_name",
    "givenName",
    "first_name",
    "firstName",
  ]);
  const last = readObjectString(record, [
    "family_name",
    "familyName",
    "last_name",
    "lastName",
  ]);
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

function readEpochSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
    const parsedMs = Date.parse(trimmed);
    if (Number.isFinite(parsedMs) && parsedMs > 0) {
      return Math.floor(parsedMs / 1000);
    }
  }
  return null;
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

function readJwtExp(accessToken: string): number | null {
  const payload = decodeAuthJwtPayload(accessToken);
  if (!payload || typeof payload !== "object") return null;
  const exp = readEpochSeconds((payload as Record<string, unknown>).exp);
  return exp;
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
  const jwtExp = readJwtExp(accessToken);
  if (jwtExp) return jwtExp;
  return null;
}

function decodeAuthUserFromIdentityToken(token: string): AuthUser | null {
  const payload = decodeAuthJwtPayload(token);
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const id = readString(record.sub);
  if (!id) return null;
  const user: AuthUser = { id };
  const email = readString(record.email);
  const displayName = coerceDisplayNameFromRecord(record);
  const avatarUrl = coerceAvatarUrlFromRecord(record);
  if (email) user.email = email;
  if (displayName) user.displayName = displayName;
  if (avatarUrl) user.avatarUrl = avatarUrl;
  return user;
}

function coerceAuthUser(value: unknown): AuthUser | null {
  const record = asObject(value);
  if (!record) return null;
  const id = readString(record.id) ?? readString(record.user_id) ?? readString(record.sub);
  if (!id) return null;
  const user: AuthUser = { id };
  const email = readString(record.email) ?? undefined;
  const displayName = coerceDisplayNameFromRecord(record) ?? undefined;
  const avatarUrl = coerceAvatarUrlFromRecord(record) ?? undefined;
  if (email) user.email = email;
  if (displayName) user.displayName = displayName;
  if (avatarUrl) user.avatarUrl = avatarUrl;
  return user;
}

type PersistedAuthSessionRecord = AuthSession & {
  refresh_token: string;
};

function toPersistedAuthSessionRecord(
  payload: unknown,
  options: {
    requireRefreshToken?: boolean;
  } = {},
): PersistedAuthSessionRecord | null {
  const requireRefreshToken = options.requireRefreshToken !== false;
  const sessionPayload = findSessionPayload(payload, requireRefreshToken);
  if (!sessionPayload) return null;
  const accessToken = readObjectString(sessionPayload, ["access_token", "accessToken"]);
  const idToken = readObjectString(sessionPayload, ["id_token", "idToken"]);
  const refreshToken = readObjectString(sessionPayload, ["refresh_token", "refreshToken"]);
  if (!accessToken) return null;
  if (requireRefreshToken && !refreshToken) return null;
  const expiresAt = coerceSessionExpiresAt(sessionPayload, accessToken);
  if (!expiresAt) return null;
  const user =
    coerceAuthUser(sessionPayload.user) ??
    decodeAuthUserFromIdentityToken(idToken ?? accessToken) ?? { id: "" };
  return {
    access_token: accessToken,
    ...(idToken ? { id_token: idToken } : null),
    refresh_token: refreshToken ?? "",
    expires_at: expiresAt,
    user,
  };
}

function coerceAuthSession(
  payload: unknown,
  options: {
    requireRefreshToken?: boolean;
  } = {},
): AuthSession | null {
  const record = toPersistedAuthSessionRecord(payload, options);
  if (!record) return null;
  return {
    access_token: record.access_token,
    ...(record.id_token ? { id_token: record.id_token } : null),
    expires_at: record.expires_at,
    user: record.user,
  };
}

function buildAuthHeaders(params: {
  apiKey?: string | null;
  accessToken?: string | null;
  includeJsonContentType?: boolean;
}): Headers {
  const headers = new Headers();
  if (params.includeJsonContentType !== false) headers.set("Content-Type", "application/json");
  const apiKey = readString(params.apiKey);
  if (apiKey) {
    headers.set("apikey", apiKey);
  }
  const bearerToken = readString(params.accessToken) ?? (apiKey && isLikelyAuthJwt(apiKey) ? apiKey : null);
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
  return headers;
}

function ensureResultFromRefreshFailure(
  refresh: Exclude<AuthSessionRefreshResult, { status: "refreshed"; session: AuthSession }>,
): AuthSessionEnsureResult {
  if (refresh.status === "terminal_failure") {
    return { status: "terminal_failure", reason: refresh.reason };
  }
  return { status: "transient_failure", reason: refresh.reason };
}

export async function sendAuthMagicLinkOtp(params: {
  email: string;
  createUser?: boolean;
  redirectTo?: string;
}): Promise<void> {
  const gatewayResponse = await callSameOriginAuthEndpoint({
    path: AUTH_GATEWAY_MAGIC_LINK_PATH,
    method: "POST",
    payload: {
      email: params.email,
      create_user: params.createUser ?? true,
      redirect_to: params.redirectTo,
      email_redirect_to: params.redirectTo,
    },
  });
  if (!gatewayResponse) throw new Error("Auth gateway is unavailable.");
  if (!gatewayResponse.ok) throw new Error(await readAuthError(gatewayResponse));
}

export async function transcribeVoice(params: {
  session: { access_token: string };
  audioBase64: string;
  mimeType: string;
  language?: string | null;
  surface: string;
  preferPrimary?: boolean;
}): Promise<string> {
  const accessToken = readString(params.session?.access_token);
  if (!accessToken) throw new Error("Sign in to use voice input.");
  const convexUrl = readConvexRuntimeUrl();
  if (!convexUrl) throw new Error("Voice transcription is unavailable: missing Convex URL.");

  const response = await fetch(buildConvexRuntimeUrl(convexUrl, "/runtime/voice_transcribe"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      audio_base64: params.audioBase64,
      mime_type: params.mimeType,
      language: params.language ?? undefined,
      surface: params.surface,
      prefer_primary: params.preferPrimary ?? false,
    }),
  });
  if (!response.ok) {
    throw new Error(await readAuthError(response));
  }
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }
  if (!payload) throw new Error("Transcription failed.");
  const payloadRecord = asObject(payload);
  const text = readString(payloadRecord?.text);
  return text ?? "";
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

export async function isAuthJwtExpired(response: Response, requestUrl?: string): Promise<boolean> {
  if (response.ok) return false;
  if (response.status !== 400 && response.status !== 401 && response.status !== 403) return false;
  void requestUrl;
  void response.url;
  try {
    const data = (await response.clone().json()) as { code?: unknown; message?: unknown; error?: unknown };
    const code = typeof data?.code === "string" ? data.code : typeof data?.code === "number" ? String(data.code) : "";
    const normalizedCode = code.trim().toLowerCase();
    if (normalizedCode === "auth_missing_bearer_token" || normalizedCode === "auth_invalid_bearer_token") return true;
    if (normalizedCode === "invalid_jwt" || normalizedCode === "jwt_expired") return true;
    const message = typeof data?.message === "string" ? data.message : "";
    const error = typeof data?.error === "string" ? data.error : "";
    if (includesJwtFailureText(message) || includesJwtFailureText(error)) return true;
    if (isBearerTokenFailureText(message) || isBearerTokenFailureText(error)) return true;
  } catch {
    try {
      const text = await response.clone().text();
      if (includesJwtFailureText(text)) return true;
      if (isBearerTokenFailureText(text)) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function isLikelyAuthJwt(value: string): boolean {
  const token = value.trim();
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export async function ensureAuthSessionForRequest(
  session: AuthSession,
  refreshLocked: () => Promise<AuthSession | null>,
): Promise<AuthSession | null> {
  const ensured = await ensureAuthSessionForRequestResult(session, async () => {
    const refreshed = await refreshLocked();
    if (!refreshed) return { status: "terminal_failure", reason: "refresh_failed" } as const;
    return { status: "refreshed", session: refreshed } as const;
  });
  return ensured.status === "ready" ? ensured.session : null;
}

export async function ensureAuthSessionForRequestResult(
  session: AuthSession,
  refreshLockedResult: () => Promise<AuthSessionRefreshResult>,
): Promise<AuthSessionEnsureResult> {
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at > now + 60) return { status: "ready", session };
  const refreshed = await refreshLockedResult();
  if (refreshed.status === "refreshed") {
    return { status: "ready", session: refreshed.session };
  }
  if (refreshed.status === "transient_failure" && session.expires_at > now) {
    return { status: "ready", session };
  }
  return ensureResultFromRefreshFailure(refreshed);
}

export async function ensureAuthSessionForAuthenticatedSend(params: {
  session: AuthSession;
  sessionRef?: AuthSessionRef;
  refreshLocked: () => Promise<AuthSession | null>;
}): Promise<AuthSession | null> {
  const ensured = await ensureAuthSessionForAuthenticatedSendResult({
    session: params.session,
    sessionRef: params.sessionRef,
    refreshLockedResult: async () => {
      const refreshed = await params.refreshLocked();
      if (!refreshed) return { status: "terminal_failure", reason: "refresh_failed" } as const;
      return { status: "refreshed", session: refreshed } as const;
    },
  });
  return ensured.status === "ready" ? ensured.session : null;
}

export async function ensureAuthSessionForAuthenticatedSendResult(params: {
  session: AuthSession;
  sessionRef?: AuthSessionRef;
  refreshLockedResult: () => Promise<AuthSessionRefreshResult>;
}): Promise<AuthSessionEnsureResult> {
  const { session, sessionRef, refreshLockedResult } = params;
  const sameSession = (a: AuthSession | null | undefined, b: AuthSession | null | undefined): boolean => {
    if (!a || !b) return false;
    return a.access_token === b.access_token;
  };

  // Step 1: ensure not expiring imminently.
  const base = sessionRef?.current ?? session;
  const ensuredBase = await ensureAuthSessionForRequestResult(base, refreshLockedResult);
  if (ensuredBase.status !== "ready") return ensuredBase;
  let current = ensuredBase.session;

  // Step 2: verify the bearer is accepted by Convex runtime auth.
  const firstAccepted = await isAuthSessionAcceptedForRuntime(current);
  if (firstAccepted.accepted) {
    return { status: "ready", session: current, runtimeAcceptance: firstAccepted };
  }

  // Step 3: if another concurrent path already rotated session, try it.
  const latest = sessionRef?.current ?? null;
  if (latest && !sameSession(latest, current)) {
    const latestAccepted = await isAuthSessionAcceptedForRuntime(latest);
    if (latestAccepted.accepted) {
      return { status: "ready", session: latest, runtimeAcceptance: latestAccepted };
    }
    current = latest;
  }

  // Step 4: one locked refresh + one verification retry.
  const refreshed = await refreshLockedResult();
  if (refreshed.status !== "refreshed") return ensureResultFromRefreshFailure(refreshed);
  const refreshedAccepted = await isAuthSessionAcceptedForRuntime(refreshed.session);
  if (!refreshedAccepted.accepted) {
    return {
      status: "transient_failure",
      reason: "runtime_auth_verification_failed",
    };
  }
  return { status: "ready", session: refreshed.session, runtimeAcceptance: refreshedAccepted };
}

export async function fetchAuthUser(token: string): Promise<AuthUser | null> {
  return decodeAuthUserFromIdentityToken(token);
}

async function isAuthSessionAcceptedForRuntime(
  session: AuthSession,
): Promise<ConvexAuthenticatedSessionProbeResult> {
  return await probeConvexAuthenticatedActorSessionDetailed(session);
}

export async function refreshAuthSessionWithLock(params: {
  inFlightRef: AuthSessionRefreshInFlightRef;
  refreshSession: () => Promise<AuthSession | null>;
  onRefreshed: (session: AuthSession) => void | Promise<void>;
}): Promise<AuthSession | null> {
  const { inFlightRef, refreshSession, onRefreshed } = params;
  if (inFlightRef.current) {
    return await inFlightRef.current;
  }
  const promise = (async () => {
    const refreshed = await refreshSession();
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

export async function refreshAuthSessionWithLockResult(params: {
  inFlightRef: AuthSessionRefreshResultInFlightRef;
  refreshSession: () => Promise<AuthSessionRefreshResult>;
  onRefreshed: (session: AuthSession) => void | Promise<void>;
}): Promise<AuthSessionRefreshResult> {
  const { inFlightRef, refreshSession, onRefreshed } = params;
  if (inFlightRef.current) {
    return await inFlightRef.current;
  }
  const promise = (async () => {
    const refreshed = await refreshSession();
    if (refreshed.status !== "refreshed") return refreshed;
    await onRefreshed(refreshed.session);
    return refreshed;
  })();
  inFlightRef.current = promise;
  try {
    return await promise;
  } finally {
    inFlightRef.current = null;
  }
}

export async function fetchWithAuthShared(params: {
  url: string;
  init: RequestInit;
  session: AuthSession;
  sessionRef: AuthSessionRef;
  refreshLocked: () => Promise<AuthSession | null>;
  refreshLockedResult?: () => Promise<AuthSessionRefreshResult>;
  onSessionExpired: () => void | Promise<void>;
  sessionExpiredMessage?: string;
  transientFailureMessage?: string;
}): Promise<Response> {
  const apiKey = getAuthPublicKey();

  const {
    url,
    init,
    session,
    sessionRef,
    refreshLocked,
    refreshLockedResult,
    onSessionExpired,
    sessionExpiredMessage = "Session expired. Please sign in again.",
    transientFailureMessage = "Auth refresh is temporarily unavailable. Retry in a moment.",
  } = params;

  const expireSession = async (): Promise<never> => {
    await onSessionExpired();
    throw new Error(sessionExpiredMessage);
  };

  const failTransiently = (reason?: string): never => {
    throw new Error(reason?.trim() || transientFailureMessage);
  };

  const refreshResult = refreshLockedResult
    ? refreshLockedResult
    : async (): Promise<AuthSessionRefreshResult> => {
        const refreshed = await refreshLocked();
        if (!refreshed) return { status: "terminal_failure", reason: transientFailureMessage };
        return { status: "refreshed", session: refreshed };
      };

  const doFetch = async (current: AuthSession): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (apiKey) headers.set("apikey", apiKey);
    headers.set("Authorization", `Bearer ${current.access_token}`);
    return await fetch(url, { ...init, headers });
  };

  const isSameSession = (a: AuthSession | null | undefined, b: AuthSession | null | undefined): boolean => {
    if (!a || !b) return false;
    return a.access_token === b.access_token;
  };

  const tryFetchWithLatestSession = async (): Promise<Response | null> => {
    const latest = sessionRef.current;
    if (!latest || isSameSession(latest, requestSession)) return null;
    requestSession = latest;
    return await doFetch(latest);
  };

  const tryRefreshAndFetch = async (): Promise<Response | null> => {
    const refreshed = await refreshResult();
    if (refreshed.status === "refreshed") {
      const refreshedSession = refreshed.session;
      requestSession = refreshedSession;
      return await doFetch(refreshedSession);
    }
    if (refreshed.status === "terminal_failure") {
      return await expireSession();
    }
    failTransiently(transientFailureMessage);
    return null;
  };

  const isAuthFailureStatus = (response: Response): boolean =>
    response.status === 401 || response.status === 403;
  const canRetryWithSession = (
    candidate: AuthSession | null,
    baseline: AuthSession,
  ): candidate is AuthSession => {
    if (!candidate) return false;
    return candidate.access_token !== baseline.access_token;
  };

  const baseSession = sessionRef.current ?? session;
  let requestSession = baseSession;
  const opportunisticEnsure = await ensureAuthSessionForRequestResult(baseSession, refreshResult);
  if (opportunisticEnsure.status === "ready") {
    requestSession = opportunisticEnsure.session;
  } else if (opportunisticEnsure.status === "terminal_failure") {
    return await expireSession();
  } else {
    failTransiently(transientFailureMessage);
  }

  const first = await doFetch(requestSession);
  if (isAuthFailureStatus(first)) {
    const latestAttempt = await tryFetchWithLatestSession();
    if (latestAttempt && !isAuthFailureStatus(latestAttempt)) return latestAttempt;

    const refreshedAttempt = await tryRefreshAndFetch();
    if (refreshedAttempt && !isAuthFailureStatus(refreshedAttempt)) return refreshedAttempt;

    let finalFailure = refreshedAttempt ?? latestAttempt ?? first;
    const verifiedSession = await ensureAuthSessionForAuthenticatedSendResult({
      session: requestSession,
      sessionRef,
      refreshLockedResult: refreshResult,
    });
    if (verifiedSession.status === "ready") {
      const readySession = verifiedSession.session;
      if (canRetryWithSession(readySession, requestSession)) {
        requestSession = readySession;
        const verifiedAttempt = await doFetch(readySession);
        if (!isAuthFailureStatus(verifiedAttempt)) return verifiedAttempt;
        finalFailure = verifiedAttempt;
      }
    } else if (verifiedSession.status === "terminal_failure") {
      return await expireSession();
    } else {
      failTransiently(transientFailureMessage);
    }
    return finalFailure;
  }
  if (!(await isAuthJwtExpired(first, url))) return first;

  const latestAttempt = await tryFetchWithLatestSession();
  if (latestAttempt && !(await isAuthJwtExpired(latestAttempt, url))) return latestAttempt;

  const refreshedAttempt = await tryRefreshAndFetch();
  if (!refreshedAttempt) {
    const finalFailure = latestAttempt ?? first;
    if (await isAuthJwtExpired(finalFailure, url)) return await expireSession();
    return finalFailure;
  }
  if (await isAuthJwtExpired(refreshedAttempt, url)) return await expireSession();
  return refreshedAttempt;
}

export async function fetchWithPublicShared(url: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = getAuthPublicKey();
  const headers = new Headers(init.headers);
  if (apiKey) headers.set("apikey", apiKey);
  if (apiKey && !headers.has("Authorization") && isLikelyAuthJwt(apiKey)) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return await fetch(url, { ...init, headers });
}
