import {
  probeConvexAuthenticatedActorSessionDetailed,
  type ConvexAuthenticatedSessionProbeResult,
} from "./convexAuthSessionProbe";
import { APP_ADMISSION_TIMEOUT_MS } from "./asyncDeadline";
import { applyTestMemberRun } from "./testMemberRun";

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

export type AuthBridgeBootstrapTrace = {
  bootstrapPath: string | null;
  rotatedSessionFollowed: boolean;
  upstreamRefreshMs: number | null;
};

export type AuthSessionBootstrapResult = {
  session: AuthSession | null;
  trace: AuthBridgeBootstrapTrace | null;
};

export type AuthSessionRefreshResult =
  | { status: "refreshed"; session: AuthSession }
  | { status: "transient_failure"; reason: string }
  | { status: "terminal_failure"; reason: string };

export type AuthSessionRefreshResultInFlightRef = {
  current: {
    lockKey: number;
    promise: Promise<AuthSessionRefreshResult>;
  } | null;
};

export type AuthSessionEnsureResult =
  | { status: "ready"; session: AuthSession; runtimeAcceptance?: ConvexAuthenticatedSessionProbeResult }
  | {
      status: "transient_failure";
      reason: string;
      runtimeAcceptance?: ConvexAuthenticatedSessionProbeResult;
    }
  | { status: "terminal_failure"; reason: string };

export class VoiceTranscriptionRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(args: {
    message: string;
    status: number;
    code?: string | null;
  }) {
    super(args.message);
    this.name = "VoiceTranscriptionRequestError";
    this.status = args.status;
    this.code = args.code ?? null;
  }
}

function readFirstNonEmptyEnv(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = (import.meta.env?.[key as keyof ImportMetaEnv] as string | undefined) ?? "";
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

const AUTH_GATEWAY_BEGIN_PATH = "/api/auth/google/start";
const AUTH_GATEWAY_SESSION_PATH = "/api/auth/session";
const AUTH_GATEWAY_REFRESH_PATH = "/api/auth/refresh";
const AUTH_GATEWAY_LOGOUT_PATH = "/api/auth/logout";

function buildSameOriginAuthUrl(routePath: string): string {
  const route = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return new URL(route, window.location.origin).toString();
}

async function callSameOriginAuthEndpoint<T>(params: {
  path: string;
  method?: "GET" | "POST";
  payload?: Record<string, unknown>;
  consume: (response: Response) => Promise<T>;
}): Promise<T | null> {
  const hasBody = params.method !== "GET" && typeof params.payload === "object" && params.payload !== null;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), APP_ADMISSION_TIMEOUT_MS);
  try {
    const response = await fetch(buildSameOriginAuthUrl(params.path), {
      method: params.method ?? "POST",
      credentials: "include",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      signal: controller.signal,
      ...(hasBody ? { body: JSON.stringify(params.payload) } : null),
    }).catch(() => null);
    // Fetch settles at headers; retain the same deadline through body reads.
    return response ? await params.consume(response) : null;
  } finally {
    window.clearTimeout(timeoutId);
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

function readOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value.trim());
    if (Number.isFinite(numeric)) return numeric;
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
  return applyTestMemberRun({
    access_token: record.access_token,
    ...(record.id_token ? { id_token: record.id_token } : null),
    expires_at: record.expires_at,
    user: record.user,
  });
}

function coerceAuthBridgeBootstrapTrace(payload: unknown): AuthBridgeBootstrapTrace | null {
  const record = asObject(payload);
  if (!record) return null;
  const bootstrapPath =
    readObjectString(record, ["bootstrap_path", "bootstrapPath", "path"]) ?? null;
  const rotatedSessionFollowed =
    record.rotated_session_followed === true || record.rotatedSessionFollowed === true;
  const upstreamRefreshMs = readOptionalNumber(
    record.upstream_refresh_ms ?? record.upstreamRefreshMs,
  );
  if (!bootstrapPath && !rotatedSessionFollowed && upstreamRefreshMs === null) return null;
  return {
    bootstrapPath,
    rotatedSessionFollowed,
    upstreamRefreshMs,
  };
}

export type BeginOAuthSignInUrlResult =
  | { ok: true; authUrl: string }
  | { ok: false; error: string };

export async function beginOAuthSignIn(params: {
  returnTo?: string;
}): Promise<BeginOAuthSignInUrlResult> {
  const authUrl = new URL(buildSameOriginAuthUrl(AUTH_GATEWAY_BEGIN_PATH));
  const returnTo = readString(params.returnTo);
  if (returnTo) authUrl.searchParams.set("return_to", returnTo);
  return { ok: true, authUrl: authUrl.toString() };
}

export async function bootstrapSessionDetailed(): Promise<AuthSessionBootstrapResult> {
  const result = await callSameOriginAuthEndpoint({
    path: AUTH_GATEWAY_SESSION_PATH,
    method: "GET",
    consume: async (response) => {
      if (!response.ok) throw new Error(await readAuthError(response));
      const payload = (await response.json()) as Record<string, unknown>;
      return {
        session: coerceAuthSession(payload?.session ?? null, { requireRefreshToken: false }),
        trace: coerceAuthBridgeBootstrapTrace(payload?.trace ?? null),
      };
    },
  });
  if (!result) throw new Error("Auth gateway is unavailable.");
  return result;
}

export async function bootstrapSession(): Promise<AuthSession | null> {
  return (await bootstrapSessionDetailed()).session;
}

export async function logoutAuthSessionRemote(): Promise<void> {
  const confirmed = await callSameOriginAuthEndpoint({
    path: AUTH_GATEWAY_LOGOUT_PATH,
    method: "POST",
    payload: {},
    consume: async (response) => {
      const payload = response.ok ? await response.json().catch(() => null) : null;
      return response.ok && payload?.ok === true;
    },
  });
  if (confirmed !== true) {
    throw new Error("Sign out couldn't be confirmed. Try again.");
  }
}

function ensureResultFromRefreshFailure(
  refresh: Exclude<AuthSessionRefreshResult, { status: "refreshed"; session: AuthSession }>,
): AuthSessionEnsureResult {
  if (refresh.status === "terminal_failure") {
    return { status: "terminal_failure", reason: refresh.reason };
  }
  return { status: "transient_failure", reason: refresh.reason };
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
      runtimeAcceptance: refreshedAccepted,
    };
  }
  return { status: "ready", session: refreshed.session, runtimeAcceptance: refreshedAccepted };
}

export async function refreshAuthSessionResult(): Promise<AuthSessionRefreshResult> {
  const result = await callSameOriginAuthEndpoint<AuthSessionRefreshResult>({
    path: AUTH_GATEWAY_REFRESH_PATH,
    method: "POST",
    payload: {},
    consume: async (response) => {
      if (!response.ok) {
        return {
          status: response.status === 401 ? "terminal_failure" : "transient_failure",
          reason: (await readAuthError(response)).trim() ||
            (response.status === 401 ? "auth_session_invalid" : `auth_refresh_failed_${response.status}`),
        };
      }
      try {
        const payload = (await response.json()) as Record<string, unknown>;
        const refreshed = coerceAuthSession(payload?.session ?? null, {
          requireRefreshToken: false,
        });
        if (!refreshed) {
          return { status: "transient_failure", reason: "invalid_refresh_response" };
        }
        return { status: "refreshed", session: refreshed };
      } catch {
        return { status: "transient_failure", reason: "invalid_refresh_response" };
      }
    },
  });
  return result ?? { status: "transient_failure", reason: "auth_gateway_unavailable" };
}

async function isAuthSessionAcceptedForRuntime(
  session: AuthSession,
): Promise<ConvexAuthenticatedSessionProbeResult> {
  return await probeConvexAuthenticatedActorSessionDetailed(session);
}

export async function refreshAuthSessionWithLockResult(params: {
  inFlightRef: AuthSessionRefreshResultInFlightRef;
  lockKey: number;
  isLockKeyCurrent: (lockKey: number) => boolean;
  refreshSession: () => Promise<AuthSessionRefreshResult>;
  onRefreshed: (session: AuthSession) => void | Promise<void>;
}): Promise<AuthSessionRefreshResult> {
  const {
    inFlightRef,
    lockKey,
    isLockKeyCurrent,
    refreshSession,
    onRefreshed,
  } = params;
  if (inFlightRef.current?.lockKey === lockKey) {
    return await inFlightRef.current.promise;
  }
  const promise = (async (): Promise<AuthSessionRefreshResult> => {
    const refreshed = await refreshSession();
    if (refreshed.status !== "refreshed") return refreshed;
    if (!isLockKeyCurrent(lockKey)) {
      return { status: "transient_failure", reason: "session_changed" };
    }
    await onRefreshed(refreshed.session);
    if (!isLockKeyCurrent(lockKey)) {
      return { status: "transient_failure", reason: "session_changed" };
    }
    return refreshed;
  })();
  inFlightRef.current = { lockKey, promise };
  try {
    return await promise;
  } finally {
    if (inFlightRef.current?.promise === promise) {
      inFlightRef.current = null;
    }
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
