import { probeConvexAuthenticatedActorSession } from "./convexAuthSessionProbe";
import { readConvexRuntimeUrl } from "./convexRuntime";

export type CloudUser = {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
};

export type CloudSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  user: CloudUser;
};

export type CloudSessionRef = {
  current: CloudSession | null;
};

export type CloudSessionRefreshInFlightRef = {
  current: Promise<CloudSession | null> | null;
};

function readFirstNonEmptyEnv(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = (import.meta.env[key as keyof ImportMetaEnv] as string | undefined) ?? "";
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function getCloudUrl(): string | null {
  return readFirstNonEmptyEnv(["VITE_CONVEX_URL"]);
}

export function getCloudAnonKey(): string | null {
  return readFirstNonEmptyEnv(["VITE_CONVEX_PUBLIC_KEY"]);
}

export function getOAuthRedirectUrl(): string {
  return readFirstNonEmptyEnv(["VITE_AUTH_REDIRECT_URL"]) ?? window.location.origin;
}

export async function readCloudError(response: Response): Promise<string> {
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

export function getCloudAuthUid(session: CloudSession): string {
  const payload = decodeJwtPayload(session.access_token);
  const sub =
    payload && typeof payload === "object" && "sub" in payload && typeof (payload as any).sub === "string"
      ? String((payload as any).sub)
      : null;
  return sub ?? session.user.id;
}

const CLOUD_RUNTIME_AUTH_BEGIN_GOOGLE_PATH = "/runtime/auth_begin_google_sign_in";
const CLOUD_RUNTIME_AUTH_EXCHANGE_PKCE_PATH = "/runtime/auth_exchange_pkce_code";
const CLOUD_RUNTIME_AUTH_REFRESH_PATH = "/runtime/auth_refresh_session";
const CLOUD_RUNTIME_AUTH_OTP_PATH = "/runtime/auth_send_magic_link_otp";
const CLOUD_RUNTIME_AUTH_LOGOUT_PATH = "/runtime/auth_logout_session";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildConvexRuntimeUrl(baseUrl: string, routePath: string): string {
  const route = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${trimTrailingSlashes(baseUrl)}${route}`;
}

async function callConvexRuntimeAuthEndpoint(params: {
  path: string;
  method?: "GET" | "POST";
  payload?: Record<string, unknown>;
  accessToken?: string | null;
}): Promise<Response | null> {
  const convexUrl = readConvexRuntimeUrl();
  if (!convexUrl) return null;
  const apiKey = getCloudAnonKey();
  const hasBody = params.method !== "GET" && typeof params.payload === "object" && params.payload !== null;
  try {
    return await fetch(buildConvexRuntimeUrl(convexUrl, params.path), {
      method: params.method ?? "POST",
      headers: buildCloudAuthHeaders({
        apiKey,
        accessToken: params.accessToken ?? null,
        includeJsonContentType: hasBody,
      }),
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

function findSessionPayload(payload: unknown): Record<string, unknown> | null {
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
    if (accessToken && refreshToken) return current;

    const nested = findNestedObjectCandidate(current, ["session", "data", "result", "payload"]);
    if (nested) queue.push(nested);
  }
  return null;
}

function readJwtExp(accessToken: string): number | null {
  const payload = decodeJwtPayload(accessToken);
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

function decodeCloudUserFromAccessToken(accessToken: string): CloudUser | null {
  const payload = decodeJwtPayload(accessToken);
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const id = readString(record.sub);
  if (!id) return null;
  const user: CloudUser = { id };
  const email = readString(record.email);
  const displayName = coerceDisplayNameFromRecord(record);
  const avatarUrl = coerceAvatarUrlFromRecord(record);
  if (email) user.email = email;
  if (displayName) user.displayName = displayName;
  if (avatarUrl) user.avatarUrl = avatarUrl;
  return user;
}

function coerceCloudUser(value: unknown): CloudUser | null {
  const record = asObject(value);
  if (!record) return null;
  const id = readString(record.id) ?? readString(record.user_id) ?? readString(record.sub);
  if (!id) return null;
  const user: CloudUser = { id };
  const email = readString(record.email) ?? undefined;
  const displayName = coerceDisplayNameFromRecord(record) ?? undefined;
  const avatarUrl = coerceAvatarUrlFromRecord(record) ?? undefined;
  if (email) user.email = email;
  if (displayName) user.displayName = displayName;
  if (avatarUrl) user.avatarUrl = avatarUrl;
  return user;
}

function coerceCloudSession(payload: unknown): CloudSession | null {
  const sessionPayload = findSessionPayload(payload);
  if (!sessionPayload) return null;
  const accessToken = readObjectString(sessionPayload, ["access_token", "accessToken"]);
  const refreshToken = readObjectString(sessionPayload, ["refresh_token", "refreshToken"]);
  if (!accessToken || !refreshToken) return null;
  const expiresAt = coerceSessionExpiresAt(sessionPayload, accessToken);
  if (!expiresAt) return null;
  const user =
    coerceCloudUser(sessionPayload.user) ??
    decodeCloudUserFromAccessToken(accessToken) ?? { id: "" };
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    user,
  };
}

function buildCloudAuthHeaders(params: {
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
  const bearerToken = readString(params.accessToken) ?? (apiKey && isLikelyJwt(apiKey) ? apiKey : null);
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
  return headers;
}

export async function beginCloudOAuthSignInUrl(params: {
  provider: string;
  redirectTo: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  state?: string;
}): Promise<string | null> {
  const runtimeResponse = await callConvexRuntimeAuthEndpoint({
    path: CLOUD_RUNTIME_AUTH_BEGIN_GOOGLE_PATH,
    method: "POST",
    payload: {
      provider: params.provider,
      redirect_to: params.redirectTo,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod ?? "S256",
      state: params.state,
    },
  });
  if (runtimeResponse && runtimeResponse.ok) {
    try {
      const payload = (await runtimeResponse.json()) as Record<string, unknown>;
      const authUrl = readString(payload.auth_url ?? payload.authUrl ?? payload.url);
      if (authUrl) return authUrl;
    } catch {
      return null;
    }
  }
  return null;
}

export async function logoutCloudSessionRemote(params: {
  accessToken: string;
  scope?: string;
}): Promise<void> {
  const accessToken = readString(params.accessToken);
  if (!accessToken) return;
  const scope = readString(params.scope) ?? "local";

  const runtimeResponse = await callConvexRuntimeAuthEndpoint({
    path: CLOUD_RUNTIME_AUTH_LOGOUT_PATH,
    method: "POST",
    accessToken,
    payload: {
      scope,
      access_token: accessToken,
    },
  });
  if (!runtimeResponse || runtimeResponse.ok) return;
}

export async function refreshCloudSession(refreshToken: string): Promise<CloudSession | null> {
  const runtimeResponse = await callConvexRuntimeAuthEndpoint({
    path: CLOUD_RUNTIME_AUTH_REFRESH_PATH,
    method: "POST",
    payload: { refresh_token: refreshToken },
  });
  if (runtimeResponse && runtimeResponse.ok) {
    try {
      return coerceCloudSession((await runtimeResponse.json()) as unknown);
    } catch {
      return null;
    }
  }
  return null;
}

export async function exchangeCloudPkceCodeForSession(
  authCode: string,
  codeVerifier: string,
): Promise<CloudSession | null> {
  const redirectTo = getOAuthRedirectUrl();
  const runtimeResponse = await callConvexRuntimeAuthEndpoint({
    path: CLOUD_RUNTIME_AUTH_EXCHANGE_PKCE_PATH,
    method: "POST",
    payload: {
      auth_code: authCode,
      code_verifier: codeVerifier,
      redirect_to: redirectTo,
    },
  });
  if (!runtimeResponse) {
    throw new Error("Missing Convex URL.");
  }
  if (runtimeResponse && runtimeResponse.ok) {
    try {
      return coerceCloudSession((await runtimeResponse.json()) as unknown);
    } catch {
      return null;
    }
  }
  throw new Error(await readCloudError(runtimeResponse));
}

export async function sendCloudMagicLinkOtp(params: {
  email: string;
  createUser?: boolean;
  redirectTo?: string;
}): Promise<void> {
  const runtimeResponse = await callConvexRuntimeAuthEndpoint({
    path: CLOUD_RUNTIME_AUTH_OTP_PATH,
    method: "POST",
    payload: {
      email: params.email,
      create_user: params.createUser ?? true,
      redirect_to: params.redirectTo,
      email_redirect_to: params.redirectTo,
    },
  });
  if (!runtimeResponse) throw new Error("Missing Convex URL.");
  if (!runtimeResponse.ok) throw new Error(await readCloudError(runtimeResponse));
}

export async function transcribeCloudVoice(params: {
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
    throw new Error(await readCloudError(response));
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

export async function isCloudJwtExpired(response: Response, requestUrl?: string): Promise<boolean> {
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

export function isLikelyJwt(value: string): boolean {
  const token = value.trim();
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export async function ensureCloudSessionForRequest(
  session: CloudSession,
  refreshLocked: (refreshToken: string) => Promise<CloudSession | null>,
): Promise<CloudSession | null> {
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at > now + 60) return session;
  return await refreshLocked(session.refresh_token);
}

export async function ensureCloudSessionForAuthenticatedSend(params: {
  session: CloudSession;
  sessionRef?: CloudSessionRef;
  refreshLocked: (refreshToken: string) => Promise<CloudSession | null>;
}): Promise<CloudSession | null> {
  const { session, sessionRef, refreshLocked } = params;
  const sameSession = (a: CloudSession | null | undefined, b: CloudSession | null | undefined): boolean => {
    if (!a || !b) return false;
    return a.access_token === b.access_token && a.refresh_token === b.refresh_token;
  };

  // Step 1: ensure not expiring imminently.
  const base = sessionRef?.current ?? session;
  let current = await ensureCloudSessionForRequest(base, refreshLocked);
  if (!current) return null;

  // Step 2: verify the bearer is accepted by Convex runtime auth.
  const firstAccepted = await isCloudSessionAcceptedForRuntime(current);
  if (firstAccepted) return current;

  // Step 3: if another concurrent path already rotated session, try it.
  const latest = sessionRef?.current ?? null;
  if (latest && !sameSession(latest, current)) {
    const latestAccepted = await isCloudSessionAcceptedForRuntime(latest);
    if (latestAccepted) return latest;
    current = latest;
  }

  // Step 4: one locked refresh + one verification retry.
  const refreshToken = (sessionRef?.current?.refresh_token ?? current.refresh_token ?? "").trim();
  if (!refreshToken) return null;
  const refreshed = await refreshLocked(refreshToken);
  if (!refreshed) return null;
  const refreshedAccepted = await isCloudSessionAcceptedForRuntime(refreshed);
  if (!refreshedAccepted) return null;
  return refreshed;
}

export async function fetchCloudUser(accessToken: string): Promise<CloudUser | null> {
  return decodeCloudUserFromAccessToken(accessToken);
}

async function isCloudSessionAcceptedForRuntime(session: CloudSession): Promise<boolean> {
  try {
    if (await probeConvexAuthenticatedActorSession(session)) return true;
  } catch {
    return false;
  }
  const tokenUser = await fetchCloudUser(session.access_token);
  return Boolean(tokenUser?.id);
}

export async function refreshCloudSessionWithLock(params: {
  refreshToken: string;
  inFlightRef: CloudSessionRefreshInFlightRef;
  refreshSession: (refreshToken: string) => Promise<CloudSession | null>;
  onRefreshed: (session: CloudSession) => void | Promise<void>;
}): Promise<CloudSession | null> {
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

export async function fetchWithCloudAuthShared(params: {
  url: string;
  init: RequestInit;
  session: CloudSession;
  sessionRef: CloudSessionRef;
  refreshLocked: (refreshToken: string) => Promise<CloudSession | null>;
  onSessionExpired: () => void | Promise<void>;
  sessionExpiredMessage?: string;
}): Promise<Response> {
  const apiKey = getCloudAnonKey();

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

  const doFetch = async (current: CloudSession): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (apiKey) headers.set("apikey", apiKey);
    headers.set("Authorization", `Bearer ${current.access_token}`);
    return await fetch(url, { ...init, headers });
  };

  const isSameSession = (a: CloudSession | null | undefined, b: CloudSession | null | undefined): boolean => {
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

  const isAuthFailureStatus = (response: Response): boolean =>
    response.status === 401 || response.status === 403;
  const canRetryWithSession = (
    candidate: CloudSession | null,
    baseline: CloudSession,
  ): candidate is CloudSession => {
    if (!candidate) return false;
    return (
      candidate.access_token !== baseline.access_token ||
      candidate.refresh_token !== baseline.refresh_token
    );
  };

  const baseSession = sessionRef.current ?? session;
  let requestSession = baseSession;
  const opportunisticRefresh = await ensureCloudSessionForRequest(baseSession, refreshLocked);
  if (opportunisticRefresh) {
    requestSession = opportunisticRefresh;
  }

  const first = await doFetch(requestSession);
  if (isAuthFailureStatus(first)) {
    const latestAttempt = await tryFetchWithLatestSession();
    if (latestAttempt && !isAuthFailureStatus(latestAttempt)) return latestAttempt;

    const refreshedAttempt = await tryRefreshAndFetch();
    if (refreshedAttempt && !isAuthFailureStatus(refreshedAttempt)) return refreshedAttempt;

    let finalFailure = refreshedAttempt ?? latestAttempt ?? first;
    const verifiedSession = await ensureCloudSessionForAuthenticatedSend({
      session: requestSession,
      sessionRef,
      refreshLocked,
    });
    // If Auth cannot validate/refresh this session, fail closed and clear it.
    // We only avoid forced expiry when we can still prove a valid session.
    if (!verifiedSession) return await expireSession();
    if (canRetryWithSession(verifiedSession, requestSession)) {
      requestSession = verifiedSession;
      const verifiedAttempt = await doFetch(verifiedSession);
      if (!isAuthFailureStatus(verifiedAttempt)) return verifiedAttempt;
      finalFailure = verifiedAttempt;
    }
    return finalFailure;
  }
  if (!(await isCloudJwtExpired(first, url))) return first;

  const latestAttempt = await tryFetchWithLatestSession();
  if (latestAttempt && !(await isCloudJwtExpired(latestAttempt, url))) return latestAttempt;

  const refreshedAttempt = await tryRefreshAndFetch();
  if (!refreshedAttempt) {
    const finalFailure = latestAttempt ?? first;
    if (await isCloudJwtExpired(finalFailure, url)) return await expireSession();
    return finalFailure;
  }
  if (await isCloudJwtExpired(refreshedAttempt, url)) return await expireSession();
  return refreshedAttempt;
}

export async function fetchWithCloudPublicShared(url: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = getCloudAnonKey();
  const headers = new Headers(init.headers);
  if (apiKey) headers.set("apikey", apiKey);
  if (apiKey && !headers.has("Authorization") && isLikelyJwt(apiKey)) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return await fetch(url, { ...init, headers });
}
