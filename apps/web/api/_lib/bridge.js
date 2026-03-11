import { randomBytes, webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const BRIDGE_PREAUTH_COOKIE = "arx_bridge_preauth_v1";
const BRIDGE_SESSION_COOKIE = "arx_bridge_session_v1";
const BRIDGE_PREAUTH_TTL_SEC = 10 * 60;
const BRIDGE_SESSION_TTL_SEC = 30 * 24 * 60 * 60;
const DEFAULT_RETURN_TO = "/workspace";

function readEnv(name) {
  return String(process.env[name] ?? "").trim();
}

function readRequiredEnv(name) {
  const value = readEnv(name);
  if (!value) throw new Error(`${name}_required`);
  return value;
}

function resolveBridgeSecret() {
  return readEnv("ARX_SESSION_BRIDGE_SECRET") || readEnv("ARX_DB_KEY");
}

function trimTrailingSlash(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

function deriveConvexRuntimeUrl() {
  const explicit = readEnv("VITE_CONVEX_SITE_URL");
  if (explicit) return trimTrailingSlash(explicit);
  const cloudUrl = readEnv("VITE_CONVEX_URL");
  if (!cloudUrl) return "";
  try {
    const parsed = new URL(cloudUrl);
    if (parsed.hostname.endsWith(".convex.cloud")) {
      parsed.hostname = parsed.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    }
    return trimTrailingSlash(parsed.toString());
  } catch {
    return "";
  }
}

function resolveAppOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] ?? "").trim();
  const host = forwardedHost || String(req.headers.host ?? "").trim();
  const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  if (!host) throw new Error("request_host_required");
  return `${proto}://${host}`;
}

function resolveBridgeRedirectUri(req) {
  const explicit = readEnv("ARX_AUTH_REDIRECT_URI");
  if (explicit) {
    try {
      return new URL(explicit).toString().replace(/\/+$/, "");
    } catch {
      throw new Error("auth_redirect_uri_invalid");
    }
  }
  return resolveAppOrigin(req);
}

function isSecureRequest(req) {
  try {
    const origin = new URL(resolveAppOrigin(req));
    const host = origin.hostname.trim().toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    return origin.protocol === "https:";
  } catch {
    return false;
  }
}

function isSameOriginRequest(req) {
  const originHeader = String(req.headers.origin ?? "").trim();
  if (!originHeader) return true;
  try {
    const requestOrigin = new URL(resolveAppOrigin(req));
    const callerOrigin = new URL(originHeader);
    return (
      requestOrigin.protocol === callerOrigin.protocol &&
      requestOrigin.host === callerOrigin.host
    );
  } catch {
    return false;
  }
}

function parseCookies(req) {
  const raw = String(req.headers.cookie ?? "");
  const cookies = {};
  for (const part of raw.split(/;\s*/)) {
    if (!part) continue;
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = decodeURIComponent(part.slice(0, index).trim());
    const value = decodeURIComponent(part.slice(index + 1).trim());
    cookies[key] = value;
  }
  return cookies;
}

function appendSetCookie(res, value) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", [value]);
    return;
  }
  const list = Array.isArray(existing) ? existing.slice() : [String(existing)];
  list.push(value);
  res.setHeader("Set-Cookie", list);
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

function clearCookie(res, req, name) {
  appendSetCookie(
    res,
    serializeCookie(name, "", {
      path: "/",
      maxAge: 0,
      secure: isSecureRequest(req),
      sameSite: "Lax",
    }),
  );
}

function json(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeReturnTo(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return DEFAULT_RETURN_TO;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("#")) return `/${value}`;
  return DEFAULT_RETURN_TO;
}

function base64UrlEncode(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return new Uint8Array(Buffer.from(padded, "base64"));
}

const bridgeKeyCache = new Map();

async function getBridgeKey(label) {
  const normalizedLabel = String(label ?? "").trim();
  if (bridgeKeyCache.has(normalizedLabel)) return bridgeKeyCache.get(normalizedLabel);
  const secret = resolveBridgeSecret();
  if (!secret) throw new Error("bridge_secret_required");
  const seed = textEncoder.encode(`arx:auth-bridge:v1:${normalizedLabel}:${secret}`);
  const digest = await webcrypto.subtle.digest("SHA-256", seed);
  const keyPromise = webcrypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  bridgeKeyCache.set(normalizedLabel, keyPromise);
  return keyPromise;
}

async function encryptBridgePayload(label, payload) {
  const key = await getBridgeKey(label);
  const iv = randomBytes(12);
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

async function decryptBridgePayload(label, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const [version, ivRaw, cipherRaw] = raw.split(".");
  if (version !== "v1" || !ivRaw || !cipherRaw) return null;
  const key = await getBridgeKey(label);
  try {
    const plaintext = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlDecode(ivRaw) },
      key,
      base64UrlDecode(cipherRaw),
    );
    return JSON.parse(textDecoder.decode(plaintext));
  } catch {
    return null;
  }
}

function createCodeVerifier() {
  return base64UrlEncode(randomBytes(32));
}

async function createCodeChallenge(verifier) {
  const digest = await webcrypto.subtle.digest("SHA-256", textEncoder.encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function createState() {
  return base64UrlEncode(randomBytes(24));
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token ?? "").split(".");
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readEpochSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value.trim());
    if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  }
  return null;
}

function decodeUserFromAccessToken(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload || typeof payload !== "object") return null;
  const id = readString(payload.sub);
  if (!id) return null;
  const directName = readString(payload.name) || readString(payload.display_name);
  const firstName = readString(payload.given_name) || readString(payload.first_name);
  const lastName = readString(payload.family_name) || readString(payload.last_name);
  return {
    id,
    email: readString(payload.email) ?? undefined,
    displayName: directName ?? ([firstName, lastName].filter(Boolean).join(" ").trim() || undefined),
    avatarUrl:
      readString(payload.picture) ||
      readString(payload.picture_url) ||
      readString(payload.profile_picture_url) ||
      undefined,
  };
}

function coerceSessionPayload(payload, { requireRefreshToken }) {
  const record =
    payload && typeof payload === "object"
      ? payload.session && typeof payload.session === "object"
        ? payload.session
        : payload
      : null;
  if (!record || typeof record !== "object") return null;
  const accessToken = readString(record.access_token) || readString(record.accessToken);
  const refreshToken = readString(record.refresh_token) || readString(record.refreshToken);
  if (!accessToken) return null;
  if (requireRefreshToken && !refreshToken) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt =
    readEpochSeconds(record.expires_at) ||
    readEpochSeconds(record.expiresAt) ||
    (() => {
      const expiresIn = readEpochSeconds(record.expires_in) || readEpochSeconds(record.expiresIn);
      return expiresIn ? nowSec + expiresIn : null;
    })() ||
    (() => {
      const jwtPayload = decodeJwtPayload(accessToken);
      return jwtPayload ? readEpochSeconds(jwtPayload.exp) : null;
    })();
  if (!expiresAt) return null;
  const user =
    (record.user && typeof record.user === "object" && readString(record.user.id)
      ? {
          id: readString(record.user.id),
          email: readString(record.user.email) ?? undefined,
          displayName: readString(record.user.displayName) || readString(record.user.display_name) || undefined,
          avatarUrl: readString(record.user.avatarUrl) || readString(record.user.avatar_url) || undefined,
        }
      : null) || decodeUserFromAccessToken(accessToken);
  if (!user?.id) return null;
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    user,
  };
}

function toBrowserSession(session) {
  return {
    access_token: session.access_token,
    expires_at: session.expires_at,
    user: session.user,
  };
}

function buildRuntimeUrl(path) {
  const base = deriveConvexRuntimeUrl();
  if (!base) throw new Error("convex_runtime_url_required");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function callRuntimeJson(path, payload, { accessToken = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  const apiKey = readEnv("VITE_CONVEX_PUBLIC_KEY");
  if (apiKey) headers.apikey = apiKey;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(buildRuntimeUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

function buildErrorMessage(body, fallback) {
  return readString(body?.message) || readString(body?.error) || fallback;
}

function buildRedirectTarget(req, returnTo, params = {}) {
  const url = new URL(normalizeReturnTo(returnTo), resolveAppOrigin(req));
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

function getAuthorizationBearer(req) {
  const raw = String(req.headers.authorization ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

async function readSessionContinuity(req) {
  const cookies = parseCookies(req);
  return await decryptBridgePayload("session", cookies[BRIDGE_SESSION_COOKIE] ?? "");
}

function setSessionCookie(res, req, continuity) {
  return encryptBridgePayload("session", continuity).then((encrypted) => {
    appendSetCookie(
      res,
      serializeCookie(BRIDGE_SESSION_COOKIE, encrypted, {
        path: "/",
        httpOnly: true,
        secure: isSecureRequest(req),
        sameSite: "Lax",
        maxAge: BRIDGE_SESSION_TTL_SEC,
      }),
    );
  });
}

function setPreauthCookie(res, req, payload) {
  return encryptBridgePayload("preauth", payload).then((encrypted) => {
    appendSetCookie(
      res,
      serializeCookie(BRIDGE_PREAUTH_COOKIE, encrypted, {
        path: "/",
        httpOnly: true,
        secure: isSecureRequest(req),
        sameSite: "Lax",
        maxAge: BRIDGE_PREAUTH_TTL_SEC,
      }),
    );
  });
}

async function rotateContinuity(res, req, session, previousContinuity) {
  const refreshToken = session.refresh_token || previousContinuity?.refreshToken;
  if (!refreshToken) throw new Error("bridge_refresh_token_required");
  const continuity = {
    v: 1,
    refreshToken,
    issuedAt: previousContinuity?.issuedAt ?? Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };
  await setSessionCookie(res, req, continuity);
}

export async function handleAuthStart(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  if (!isSameOriginRequest(req)) return json(res, 403, { ok: false, error: "invalid_origin" });

  const body = await readJsonBody(req);
  const returnTo = normalizeReturnTo(body.return_to);
  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const state = createState();
  const callbackUrl = resolveBridgeRedirectUri(req);

  const { response, body: payload } = await callRuntimeJson("/runtime/auth_begin_google_sign_in", {
    provider: "GoogleOAuth",
    redirect_to: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  if (!response.ok) {
    return json(res, response.status, {
      ok: false,
      error: buildErrorMessage(payload, "Failed to begin Google sign-in."),
    });
  }

  const authUrl = readString(payload?.auth_url) || readString(payload?.authUrl) || readString(payload?.url);
  if (!authUrl) {
    return json(res, 502, { ok: false, error: "Missing authorize URL from upstream auth response." });
  }

  await setPreauthCookie(res, req, {
    v: 1,
    state,
    codeVerifier: verifier,
    returnTo,
    createdAt: Math.floor(Date.now() / 1000),
  });
  return json(res, 200, { ok: true, auth_url: authUrl });
}

export async function handleAuthCallback(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (req.method === "POST" && !isSameOriginRequest(req)) {
    return json(res, 403, { ok: false, error: "invalid_origin" });
  }

  const cookies = parseCookies(req);
  const preauth = await decryptBridgePayload("preauth", cookies[BRIDGE_PREAUTH_COOKIE] ?? "");
  const fallbackReturnTo = normalizeReturnTo(preauth?.returnTo);
  let callbackError = null;
  let authCode = null;
  let state = null;

  if (req.method === "GET") {
    const requestUrl = new URL(req.url, resolveAppOrigin(req));
    callbackError =
      readString(requestUrl.searchParams.get("error_description")) ||
      readString(requestUrl.searchParams.get("error_code")) ||
      readString(requestUrl.searchParams.get("error"));
    authCode = readString(requestUrl.searchParams.get("code"));
    state = readString(requestUrl.searchParams.get("state"));
  } else {
    const body = await readJsonBody(req);
    callbackError =
      readString(body.error_description) ||
      readString(body.error_code) ||
      readString(body.error);
    authCode = readString(body.auth_code) || readString(body.code);
    state = readString(body.state);
  }

  if (callbackError) {
    clearCookie(res, req, BRIDGE_PREAUTH_COOKIE);
    if (req.method === "GET") {
      return redirect(
        res,
        buildRedirectTarget(req, fallbackReturnTo, {
          error_description: callbackError,
        }),
      );
    }
    return json(res, 400, { ok: false, error: callbackError });
  }

  if (!preauth || !authCode || !state || state !== readString(preauth.state)) {
    clearCookie(res, req, BRIDGE_PREAUTH_COOKIE);
    if (req.method === "GET") {
      return redirect(
        res,
        buildRedirectTarget(req, fallbackReturnTo, {
          error_description: "Google sign-in failed: invalid OAuth callback state.",
        }),
      );
    }
    return json(res, 400, { ok: false, error: "Google sign-in failed: invalid OAuth callback state." });
  }

  const callbackUrl = resolveBridgeRedirectUri(req);
  const exchange = await callRuntimeJson("/runtime/auth_exchange_pkce_code", {
    auth_code: authCode,
    code_verifier: preauth.codeVerifier,
    redirect_to: callbackUrl,
  });
  const exchanged = coerceSessionPayload(exchange.body, { requireRefreshToken: true });
  if (!exchange.response.ok || !exchanged?.refresh_token) {
    clearCookie(res, req, BRIDGE_PREAUTH_COOKIE);
    const errorMessage = buildErrorMessage(exchange.body, "Google sign-in failed during code exchange.");
    if (req.method === "GET") {
      return redirect(
        res,
        buildRedirectTarget(req, fallbackReturnTo, {
          error_description: errorMessage,
        }),
      );
    }
    return json(res, exchange.response.ok ? 400 : exchange.response.status, { ok: false, error: errorMessage });
  }

  await setSessionCookie(res, req, {
    v: 1,
    refreshToken: exchanged.refresh_token,
    issuedAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  });
  clearCookie(res, req, BRIDGE_PREAUTH_COOKIE);
  if (req.method === "GET") {
    return redirect(res, buildRedirectTarget(req, fallbackReturnTo));
  }
  return json(res, 200, { ok: true, return_to: fallbackReturnTo });
}

async function refreshFromContinuity(req, res) {
  const continuity = await readSessionContinuity(req);
  const refreshToken = readString(continuity?.refreshToken);
  if (!refreshToken) {
    clearCookie(res, req, BRIDGE_SESSION_COOKIE);
    return { ok: false, status: 401, error: "No active bridge session." };
  }

  const refresh = await callRuntimeJson("/runtime/auth_refresh_session", {
    refresh_token: refreshToken,
  });
  const refreshed = coerceSessionPayload(refresh.body, { requireRefreshToken: false });
  if (!refresh.response.ok || !refreshed) {
    clearCookie(res, req, BRIDGE_SESSION_COOKIE);
    return {
      ok: false,
      status: refresh.response.ok ? 401 : refresh.response.status,
      error: buildErrorMessage(refresh.body, "Session refresh failed."),
    };
  }

  await rotateContinuity(res, req, refreshed, continuity);
  return { ok: true, session: toBrowserSession(refreshed) };
}

export async function handleSessionBootstrap(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  if (!isSameOriginRequest(req)) return json(res, 403, { ok: false, error: "invalid_origin" });
  const result = await refreshFromContinuity(req, res);
  if (!result.ok) return json(res, result.status, { ok: false, error: result.error, code: "bridge_session_missing" });
  return json(res, 200, { ok: true, session: result.session });
}

export async function handleSessionRefresh(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  if (!isSameOriginRequest(req)) return json(res, 403, { ok: false, error: "invalid_origin" });
  const result = await refreshFromContinuity(req, res);
  if (!result.ok) return json(res, result.status, { ok: false, error: result.error, code: "bridge_session_missing" });
  return json(res, 200, { ok: true, session: result.session });
}

export async function handleSessionLogout(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  if (!isSameOriginRequest(req)) return json(res, 403, { ok: false, error: "invalid_origin" });

  const accessToken = getAuthorizationBearer(req);
  if (accessToken) {
    try {
      await callRuntimeJson(
        "/runtime/auth_logout_session",
        { scope: "local", access_token: accessToken },
        { accessToken },
      );
    } catch {
      // Best-effort remote logout only.
    }
  }

  clearCookie(res, req, BRIDGE_PREAUTH_COOKIE);
  clearCookie(res, req, BRIDGE_SESSION_COOKIE);
  return json(res, 200, { ok: true });
}
