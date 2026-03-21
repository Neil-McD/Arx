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
  id_token?: string;
  expires_at: number; // epoch seconds
  user: CloudUser;
};

export type CloudSessionRef = {
  current: CloudSession | null;
};

export type CloudSessionRefreshInFlightRef = {
  current: Promise<CloudSession | null> | null;
};

export type CloudSessionRefreshResult =
  | { status: "refreshed"; session: CloudSession }
  | { status: "transient_failure"; reason: string }
  | { status: "terminal_failure"; reason: string };

export type CloudSessionRefreshResultInFlightRef = {
  current: Promise<CloudSessionRefreshResult> | null;
};

export type CloudSessionEnsureResult =
  | { status: "ready"; session: CloudSession }
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
  const payload = decodeJwtPayload(session.id_token ?? session.access_token);
  const sub =
    payload && typeof payload === "object" && "sub" in payload && typeof (payload as any).sub === "string"
      ? String((payload as any).sub)
      : null;
  return sub ?? session.user.id;
}

const CLOUD_RUNTIME_AUTH_OTP_PATH = "/runtime/auth_send_magic_link_otp";
const CLOUD_RUNTIME_AUTH_BEGIN_PATH = "/runtime/auth_begin_google_sign_in";
const CLOUD_RUNTIME_AUTH_EXCHANGE_PATH = "/runtime/auth_exchange_pkce_code";
const CLOUD_RUNTIME_AUTH_REFRESH_PATH = "/runtime/auth_refresh_session";
const CLOUD_RUNTIME_AUTH_LOGOUT_PATH = "/runtime/auth_logout_session";
const CLOUD_SESSION_STORAGE_KEY = "arx_cloud_session:active";
const CLOUD_PKCE_STORAGE_KEY = "arx_cloud_session:pkce";

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

function getSessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readSessionStorageRecord(key: string): Record<string, unknown> | null {
  const storage = getSessionStorageOrNull();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return asObject(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeSessionStorageRecord(key: string, value: Record<string, unknown>): void {
  const storage = getSessionStorageOrNull();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

function removeSessionStorageRecord(key: string): void {
  const storage = getSessionStorageOrNull();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function randomBase64Url(bytes: number): string {
  const view = new Uint8Array(bytes);
  crypto.getRandomValues(view);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createCodeVerifier(): string {
  return randomBase64Url(64);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createState(): string {
  return randomBase64Url(24);
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

function decodeCloudUserFromIdentityToken(token: string): CloudUser | null {
  const payload = decodeJwtPayload(token);
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

type PersistedCloudSessionRecord = CloudSession & {
  refresh_token: string;
};

function toPersistedCloudSessionRecord(
  payload: unknown,
  options: {
    requireRefreshToken?: boolean;
  } = {},
): PersistedCloudSessionRecord | null {
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
    coerceCloudUser(sessionPayload.user) ??
    decodeCloudUserFromIdentityToken(idToken ?? accessToken) ?? { id: "" };
  return {
    access_token: accessToken,
    ...(idToken ? { id_token: idToken } : null),
    refresh_token: refreshToken ?? "",
    expires_at: expiresAt,
    user,
  };
}

function coerceCloudSession(
  payload: unknown,
  options: {
    requireRefreshToken?: boolean;
  } = {},
): CloudSession | null {
  const record = toPersistedCloudSessionRecord(payload, options);
  if (!record) return null;
  return {
    access_token: record.access_token,
    ...(record.id_token ? { id_token: record.id_token } : null),
    expires_at: record.expires_at,
    user: record.user,
  };
}

function readPersistedCloudSessionRecord(): PersistedCloudSessionRecord | null {
  const payload = readSessionStorageRecord(CLOUD_SESSION_STORAGE_KEY);
  if (!payload) return null;
  const record = toPersistedCloudSessionRecord(payload, {
    requireRefreshToken: true,
  });
  if (!record || !record.refresh_token) {
    removeSessionStorageRecord(CLOUD_SESSION_STORAGE_KEY);
    return null;
  }
  return record;
}

function persistCloudSessionRecord(record: PersistedCloudSessionRecord): void {
  writeSessionStorageRecord(CLOUD_SESSION_STORAGE_KEY, record);
}

function clearPersistedCloudSessionRecord(): void {
  removeSessionStorageRecord(CLOUD_SESSION_STORAGE_KEY);
}

type PendingPkceState = {
  state: string;
  codeVerifier: string;
  redirectTo: string;
  returnTo: string | null;
};

function readPendingPkceState(): PendingPkceState | null {
  const payload = readSessionStorageRecord(CLOUD_PKCE_STORAGE_KEY);
  if (!payload) return null;
  const state = readString(payload.state);
  const codeVerifier = readString(payload.codeVerifier);
  const redirectTo = readString(payload.redirectTo);
  const returnTo = readString(payload.returnTo);
  if (!state || !codeVerifier || !redirectTo) {
    removeSessionStorageRecord(CLOUD_PKCE_STORAGE_KEY);
    return null;
  }
  return {
    state,
    codeVerifier,
    redirectTo,
    returnTo,
  };
}

function persistPendingPkceState(state: PendingPkceState): void {
  writeSessionStorageRecord(CLOUD_PKCE_STORAGE_KEY, {
    state: state.state,
    codeVerifier: state.codeVerifier,
    redirectTo: state.redirectTo,
    returnTo: state.returnTo,
  });
}

function clearPendingPkceState(): void {
  removeSessionStorageRecord(CLOUD_PKCE_STORAGE_KEY);
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

export type BeginCloudOAuthSignInUrlResult =
  | { ok: true; authUrl: string }
  | { ok: false; error: string };

export async function beginCloudOAuthSignIn(params: {
  provider: string;
  returnTo?: string;
}): Promise<BeginCloudOAuthSignInUrlResult> {
  const redirectTo = getOAuthRedirectUrl();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createState();
  persistPendingPkceState({
    state,
    codeVerifier,
    redirectTo,
    returnTo: readString(params.returnTo) ?? null,
  });
  const runtimeResponse = await callConvexRuntimeAuthEndpoint({
    path: CLOUD_RUNTIME_AUTH_BEGIN_PATH,
    method: "POST",
    payload: {
      provider: params.provider,
      redirect_to: redirectTo,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    },
  });
  if (!runtimeResponse) {
    clearPendingPkceState();
    return { ok: false, error: "Google sign-in failed: auth runtime is unavailable." };
  }
  if (!runtimeResponse.ok) {
    const error = (await readCloudError(runtimeResponse)) || "Google sign-in failed: auth runtime could not create authorize URL.";
    clearPendingPkceState();
    return { ok: false, error };
  }
  try {
    const payload = (await runtimeResponse.json()) as Record<string, unknown>;
    const authUrl = readString(payload.auth_url ?? payload.authUrl ?? payload.url);
    if (authUrl) return { ok: true, authUrl };
    clearPendingPkceState();
    return { ok: false, error: "Google sign-in failed: authorize URL missing from auth runtime response." };
  } catch {
    clearPendingPkceState();
    return { ok: false, error: "Google sign-in failed: invalid auth runtime response." };
  }
}

export async function bootstrapCloudSession(): Promise<CloudSession | null> {
  const record = readPersistedCloudSessionRecord();
  if (!record) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (record.expires_at > nowSec + 60) {
    return toCloudSession(record);
  }
  const refreshed = await refreshCloudSessionResult();
  if (refreshed.status === "refreshed") return refreshed.session;
  if (refreshed.status === "transient_failure") return toCloudSession(record);
  return null;
}

export async function completeCloudOAuthCallback(params: {
  authCode: string;
  state?: string | null;
}): Promise<{ ok: true; returnTo?: string | null } | { ok: false; error: string }> {
  const pending = readPendingPkceState();
  const callbackState = readString(params.state ?? null);
  if (!pending || !pending.codeVerifier || !pending.state || pending.state !== callbackState) {
    clearPendingPkceState();
    return { ok: false, error: "Google sign-in failed: invalid OAuth callback state." };
  }
  const runtimeResponse = await callConvexRuntimeAuthEndpoint({
    path: CLOUD_RUNTIME_AUTH_EXCHANGE_PATH,
    method: "POST",
    payload: {
      auth_code: params.authCode,
      code_verifier: pending.codeVerifier,
      redirect_to: pending.redirectTo,
    },
  });
  if (!runtimeResponse) {
    return { ok: false, error: "Google sign-in failed: auth runtime is unavailable." };
  }
  if (!runtimeResponse.ok) {
    return {
      ok: false,
      error: (await readCloudError(runtimeResponse)) || "Google sign-in failed during session exchange.",
    };
  }
  try {
    const payload = (await runtimeResponse.json()) as unknown;
    const record = toPersistedCloudSessionRecord(payload, { requireRefreshToken: true });
    if (!record || !record.refresh_token) {
      return { ok: false, error: "Google sign-in failed: session payload was incomplete." };
    }
    persistCloudSessionRecord(record);
    clearPendingPkceState();
    return {
      ok: true,
      returnTo: pending.returnTo,
    };
  } catch {
    return { ok: false, error: "Google sign-in failed: invalid session response." };
  }
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
    payload: { scope },
  });
  if (!runtimeResponse || runtimeResponse.ok) return;
}

function toCloudSession(record: PersistedCloudSessionRecord): CloudSession {
  return {
    access_token: record.access_token,
    expires_at: record.expires_at,
    user: record.user,
  };
}

function includesRefreshFailureText(value: string, patterns: readonly string[]): boolean {
  const lower = value.trim().toLowerCase();
  if (!lower) return false;
  return patterns.some((pattern) => lower.includes(pattern));
}

function isTerminalRefreshFailureText(value: string): boolean {
  return includesRefreshFailureText(value, [
    "invalid_grant",
    "invalid refresh token",
    "refresh token invalid",
    "refresh token expired",
    "refresh token revoked",
    "revoked refresh token",
    "missing refresh token",
    "malformed refresh token",
    "invalid token",
    "token expired",
    "token revoked",
    "session expired",
    "session not found",
    "unauthorized_client",
    "invalid_client",
    "unsupported grant type",
  ]);
}

function isTransientRefreshFailureText(value: string): boolean {
  return includesRefreshFailureText(value, [
    "temporarily unavailable",
    "try again",
    "timeout",
    "timed out",
    "upstream unavailable",
    "auth_upstream_unavailable",
    "auth_verifier_misconfigured",
    "service unavailable",
    "rate limit",
    "too many requests",
    "network",
  ]);
}

async function classifyCloudRefreshFailureResponse(response: Response): Promise<CloudSessionRefreshResult> {
  const reason = (await readCloudError(response)).trim() || `auth_refresh_failed_${response.status}`;
  if (response.status === 429 || response.status >= 500) {
    return { status: "transient_failure", reason };
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    if (isTransientRefreshFailureText(reason)) {
      return { status: "transient_failure", reason };
    }
    if (isTerminalRefreshFailureText(reason)) {
      return { status: "terminal_failure", reason };
    }
    return { status: "terminal_failure", reason };
  }
  return { status: "transient_failure", reason };
}

function ensureResultFromRefreshFailure(
  refresh: Exclude<CloudSessionRefreshResult, { status: "refreshed"; session: CloudSession }>,
): CloudSessionEnsureResult {
  if (refresh.status === "terminal_failure") {
    return { status: "terminal_failure", reason: refresh.reason };
  }
  return { status: "transient_failure", reason: refresh.reason };
}

export async function refreshCloudSessionResult(): Promise<CloudSessionRefreshResult> {
  const existing = readPersistedCloudSessionRecord();
  if (!existing?.refresh_token) {
    clearPersistedCloudSessionRecord();
    return { status: "terminal_failure", reason: "missing_refresh_token" };
  }
  const runtimeResponse = await callConvexRuntimeAuthEndpoint({
    path: CLOUD_RUNTIME_AUTH_REFRESH_PATH,
    method: "POST",
    payload: {
      refresh_token: existing.refresh_token,
    },
  });
  if (!runtimeResponse) {
    return { status: "transient_failure", reason: "auth_runtime_unavailable" };
  }
  if (!runtimeResponse.ok) {
    const failure = await classifyCloudRefreshFailureResponse(runtimeResponse);
    if (failure.status === "terminal_failure") {
      clearPersistedCloudSessionRecord();
    }
    return failure;
  }
  try {
    const payload = (await runtimeResponse.json()) as unknown;
    const refreshed = toPersistedCloudSessionRecord(payload, {
      requireRefreshToken: false,
    });
    if (!refreshed) {
      return { status: "transient_failure", reason: "invalid_refresh_payload" };
    }
    const merged: PersistedCloudSessionRecord = {
      ...refreshed,
      refresh_token: refreshed.refresh_token || existing.refresh_token,
    };
    if (!merged.refresh_token) {
      clearPersistedCloudSessionRecord();
      return { status: "terminal_failure", reason: "missing_refresh_token" };
    }
    persistCloudSessionRecord(merged);
    return { status: "refreshed", session: toCloudSession(merged) };
  } catch {
    return { status: "transient_failure", reason: "invalid_refresh_response" };
  }
}

export async function refreshCloudSession(): Promise<CloudSession | null> {
  const refreshed = await refreshCloudSessionResult();
  if (refreshed.status === "refreshed") {
    return refreshed.session;
  }
  if (refreshed.status === "terminal_failure") {
    clearPersistedCloudSessionRecord();
  }
  return null;
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
  refreshLocked: () => Promise<CloudSession | null>,
): Promise<CloudSession | null> {
  const ensured = await ensureCloudSessionForRequestResult(session, async () => {
    const refreshed = await refreshLocked();
    if (!refreshed) return { status: "terminal_failure", reason: "refresh_failed" } as const;
    return { status: "refreshed", session: refreshed } as const;
  });
  return ensured.status === "ready" ? ensured.session : null;
}

export async function ensureCloudSessionForRequestResult(
  session: CloudSession,
  refreshLockedResult: () => Promise<CloudSessionRefreshResult>,
): Promise<CloudSessionEnsureResult> {
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

export async function ensureCloudSessionForAuthenticatedSend(params: {
  session: CloudSession;
  sessionRef?: CloudSessionRef;
  refreshLocked: () => Promise<CloudSession | null>;
}): Promise<CloudSession | null> {
  const ensured = await ensureCloudSessionForAuthenticatedSendResult({
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

export async function ensureCloudSessionForAuthenticatedSendResult(params: {
  session: CloudSession;
  sessionRef?: CloudSessionRef;
  refreshLockedResult: () => Promise<CloudSessionRefreshResult>;
}): Promise<CloudSessionEnsureResult> {
  const { session, sessionRef, refreshLockedResult } = params;
  const sameSession = (a: CloudSession | null | undefined, b: CloudSession | null | undefined): boolean => {
    if (!a || !b) return false;
    return a.access_token === b.access_token;
  };

  // Step 1: ensure not expiring imminently.
  const base = sessionRef?.current ?? session;
  const ensuredBase = await ensureCloudSessionForRequestResult(base, refreshLockedResult);
  if (ensuredBase.status !== "ready") return ensuredBase;
  let current = ensuredBase.session;

  // Step 2: verify the bearer is accepted by Convex runtime auth.
  const firstAccepted = await isCloudSessionAcceptedForRuntime(current);
  if (firstAccepted) return { status: "ready", session: current };

  // Step 3: if another concurrent path already rotated session, try it.
  const latest = sessionRef?.current ?? null;
  if (latest && !sameSession(latest, current)) {
    const latestAccepted = await isCloudSessionAcceptedForRuntime(latest);
    if (latestAccepted) return { status: "ready", session: latest };
    current = latest;
  }

  // Step 4: one locked refresh + one verification retry.
  const refreshed = await refreshLockedResult();
  if (refreshed.status !== "refreshed") return ensureResultFromRefreshFailure(refreshed);
  const refreshedAccepted = await isCloudSessionAcceptedForRuntime(refreshed.session);
  if (!refreshedAccepted) {
    return {
      status: "transient_failure",
      reason: "runtime_auth_verification_failed",
    };
  }
  return { status: "ready", session: refreshed.session };
}

export async function fetchCloudUser(token: string): Promise<CloudUser | null> {
  return decodeCloudUserFromIdentityToken(token);
}

async function isCloudSessionAcceptedForRuntime(session: CloudSession): Promise<boolean> {
  try {
    return await probeConvexAuthenticatedActorSession(session);
  } catch {
    return false;
  }
}

export async function refreshCloudSessionWithLock(params: {
  inFlightRef: CloudSessionRefreshInFlightRef;
  refreshSession: () => Promise<CloudSession | null>;
  onRefreshed: (session: CloudSession) => void | Promise<void>;
}): Promise<CloudSession | null> {
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

export async function refreshCloudSessionWithLockResult(params: {
  inFlightRef: CloudSessionRefreshResultInFlightRef;
  refreshSession: () => Promise<CloudSessionRefreshResult>;
  onRefreshed: (session: CloudSession) => void | Promise<void>;
}): Promise<CloudSessionRefreshResult> {
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

export async function fetchWithCloudAuthShared(params: {
  url: string;
  init: RequestInit;
  session: CloudSession;
  sessionRef: CloudSessionRef;
  refreshLocked: () => Promise<CloudSession | null>;
  refreshLockedResult?: () => Promise<CloudSessionRefreshResult>;
  onSessionExpired: () => void | Promise<void>;
  sessionExpiredMessage?: string;
  transientFailureMessage?: string;
}): Promise<Response> {
  const apiKey = getCloudAnonKey();

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
    : async (): Promise<CloudSessionRefreshResult> => {
        const refreshed = await refreshLocked();
        if (!refreshed) return { status: "terminal_failure", reason: transientFailureMessage };
        return { status: "refreshed", session: refreshed };
      };

  const doFetch = async (current: CloudSession): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (apiKey) headers.set("apikey", apiKey);
    headers.set("Authorization", `Bearer ${current.access_token}`);
    return await fetch(url, { ...init, headers });
  };

  const isSameSession = (a: CloudSession | null | undefined, b: CloudSession | null | undefined): boolean => {
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
    if (refreshed.status !== "refreshed") {
      if (refreshed.status === "terminal_failure") {
        return await expireSession();
      }
      failTransiently(transientFailureMessage);
    }
    requestSession = refreshed.session;
    return await doFetch(refreshed.session);
  };

  const isAuthFailureStatus = (response: Response): boolean =>
    response.status === 401 || response.status === 403;
  const canRetryWithSession = (
    candidate: CloudSession | null,
    baseline: CloudSession,
  ): candidate is CloudSession => {
    if (!candidate) return false;
    return candidate.access_token !== baseline.access_token;
  };

  const baseSession = sessionRef.current ?? session;
  let requestSession = baseSession;
  const opportunisticEnsure = await ensureCloudSessionForRequestResult(baseSession, refreshResult);
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
    const verifiedSession = await ensureCloudSessionForAuthenticatedSendResult({
      session: requestSession,
      sessionRef,
      refreshLockedResult: refreshResult,
    });
    if (verifiedSession.status === "terminal_failure") return await expireSession();
    if (verifiedSession.status === "transient_failure") failTransiently(transientFailureMessage);
    if (canRetryWithSession(verifiedSession.session, requestSession)) {
      requestSession = verifiedSession.session;
      const verifiedAttempt = await doFetch(verifiedSession.session);
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
