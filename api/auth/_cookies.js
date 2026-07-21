import { createHmac } from "node:crypto";

const AUTH_SESSION_COOKIE_NAME_SECURE = "__Secure-arx-auth-session";
const AUTH_SESSION_COOKIE_NAME_LOCAL = "arx-auth-session";
const AUTH_FLOW_COOKIE_NAME_SECURE = "__Secure-arx-auth-flow";
const AUTH_FLOW_COOKIE_NAME_LOCAL = "arx-auth-flow";
const AUTH_FLOW_TTL_MS = 20 * 60 * 1000;
const DEFAULT_SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_POST_SIGN_IN_PATH = "/";
const MAX_AUTH_SESSION_COOKIE_VALUE_LENGTH = 256;
const MAX_AUTH_FLOW_COOKIE_VALUE_LENGTH = 4096;

function readEnv(name) {
  return String(process.env?.[name] ?? "").trim();
}

function normalizeHost(host) {
  return String(host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
}

function shouldUseSecureCookies(req) {
  const proto = String(req.headers["x-forwarded-proto"] ?? "").trim().toLowerCase();
  if (proto === "https") return true;
  const host = normalizeHost(req.headers.host);
  return host !== "localhost" && host !== "127.0.0.1";
}

function resolveCookieName(req, kind) {
  const secure = shouldUseSecureCookies(req);
  if (kind === "session") {
    return secure ? AUTH_SESSION_COOKIE_NAME_SECURE : AUTH_SESSION_COOKIE_NAME_LOCAL;
  }
  return secure ? AUTH_FLOW_COOKIE_NAME_SECURE : AUTH_FLOW_COOKIE_NAME_LOCAL;
}

function resolveCookieDomain(req) {
  const configured = readEnv("ARX_AUTH_SESSION_COOKIE_DOMAIN").replace(/^\./, "");
  if (!configured) return null;
  const host = normalizeHost(req.headers.host);
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host === configured || host.endsWith(`.${configured}`) ? configured : null;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join("; ");
}

function appendSetCookie(res, value) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", value);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, value]);
    return;
  }
  res.setHeader("Set-Cookie", [existing, value]);
}

function getCookie(req, name) {
  const raw = String(req.headers.cookie ?? "");
  if (!raw) return null;
  for (const entry of raw.split(/;\s*/)) {
    const [cookieName, ...rest] = entry.split("=");
    if (cookieName === name) return rest.join("=") || null;
  }
  return null;
}

function decodeCookieValue(rawValue, maxLength) {
  if (!rawValue) return { status: "missing" };
  if (rawValue.length > maxLength) return { status: "invalid" };
  try {
    const value = decodeURIComponent(rawValue);
    if (!value || value.length > maxLength) return { status: "invalid" };
    return { status: "valid", value };
  } catch {
    return { status: "invalid" };
  }
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value ?? "").trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function signValue(rawPayload) {
  const secret = readEnv("ARX_AUTH_BRIDGE_SECRET");
  if (!secret) throw new Error("Missing ARX_AUTH_BRIDGE_SECRET.");
  const payloadBuffer = Buffer.from(rawPayload, "utf8");
  const signature = createHmac("sha256", secret).update(payloadBuffer).digest();
  return `${encodeBase64Url(payloadBuffer)}.${encodeBase64Url(signature)}`;
}

function timingSafeBufferEquals(left, right) {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right) || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function verifySignedValue(rawToken) {
  const secret = readEnv("ARX_AUTH_BRIDGE_SECRET");
  if (!secret) throw new Error("Missing ARX_AUTH_BRIDGE_SECRET.");
  const token = String(rawToken ?? "").trim();
  const dot = token.indexOf(".");
  if (!token || dot <= 0 || dot === token.length - 1) return null;
  const payloadBuffer = decodeBase64Url(token.slice(0, dot));
  const signatureBuffer = decodeBase64Url(token.slice(dot + 1));
  const expected = createHmac("sha256", secret).update(payloadBuffer).digest();
  if (signatureBuffer.length !== expected.length) return null;
  if (!timingSafeBufferEquals(signatureBuffer, expected)) return null;
  try {
    return JSON.parse(payloadBuffer.toString("utf8"));
  } catch {
    return null;
  }
}

export function getRequestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] ?? "").trim() || "https";
  const host = String(req.headers.host ?? "").trim();
  return host ? `${proto}://${host}` : "";
}

export function normalizeReturnToPath(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return DEFAULT_POST_SIGN_IN_PATH;
  if (value.startsWith("//")) return DEFAULT_POST_SIGN_IN_PATH;
  if (value.startsWith("/")) return value;
  if (value.startsWith("#")) return `${DEFAULT_POST_SIGN_IN_PATH}${value}`;
  return DEFAULT_POST_SIGN_IN_PATH;
}

export function buildRedirectUrl(req, returnTo, params = {}) {
  const origin = getRequestOrigin(req) || "http://localhost";
  const url = new URL(normalizeReturnToPath(returnTo), origin);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function setAuthSessionCookie(res, req, sessionId) {
  const name = resolveCookieName(req, "session");
  const domain = resolveCookieDomain(req);
  const configuredMaxAge = Number(
    readEnv("ARX_AUTH_SESSION_COOKIE_MAX_AGE_SECONDS") || DEFAULT_SESSION_COOKIE_MAX_AGE_SECONDS,
  );
  const maxAge = Math.min(
    MAX_SESSION_COOKIE_MAX_AGE_SECONDS,
    Number.isFinite(configuredMaxAge) && configuredMaxAge > 0
      ? Math.floor(configuredMaxAge)
      : DEFAULT_SESSION_COOKIE_MAX_AGE_SECONDS,
  );
  appendSetCookie(
    res,
    serializeCookie(name, encodeURIComponent(String(sessionId ?? "")), {
      maxAge,
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: "Lax",
      ...(domain ? { domain } : null),
    }),
  );
}

export function clearAuthSessionCookie(res, req) {
  const name = resolveCookieName(req, "session");
  const domain = resolveCookieDomain(req);
  appendSetCookie(
    res,
    serializeCookie(name, "", {
      maxAge: 0,
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: "Lax",
      ...(domain ? { domain } : null),
    }),
  );
}

export function readAuthSessionCookie(req) {
  const name = resolveCookieName(req, "session");
  return decodeCookieValue(getCookie(req, name), MAX_AUTH_SESSION_COOKIE_VALUE_LENGTH);
}

export function setAuthFlowCookie(res, req, payload) {
  const name = resolveCookieName(req, "flow");
  const domain = resolveCookieDomain(req);
  const signed = signValue(
    JSON.stringify({
      state: String(payload.state ?? "").trim(),
      codeVerifier: String(payload.codeVerifier ?? "").trim(),
      redirectTo: String(payload.redirectTo ?? "").trim(),
      returnTo: normalizeReturnToPath(payload.returnTo),
      createdAtMs: typeof payload.createdAtMs === "number" ? payload.createdAtMs : Date.now(),
    }),
  );
  appendSetCookie(
    res,
    serializeCookie(name, encodeURIComponent(signed), {
      maxAge: Math.ceil(AUTH_FLOW_TTL_MS / 1000),
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: "Lax",
      ...(domain ? { domain } : null),
    }),
  );
}

export function clearAuthFlowCookie(res, req) {
  const name = resolveCookieName(req, "flow");
  const domain = resolveCookieDomain(req);
  appendSetCookie(
    res,
    serializeCookie(name, "", {
      maxAge: 0,
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: "Lax",
      ...(domain ? { domain } : null),
    }),
  );
}

export function readVerifiedAuthFlow(req) {
  const name = resolveCookieName(req, "flow");
  const decoded = decodeCookieValue(getCookie(req, name), MAX_AUTH_FLOW_COOKIE_VALUE_LENGTH);
  if (decoded.status !== "valid") return null;
  const parsed = verifySignedValue(decoded.value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const createdAtMs = Number(parsed.createdAtMs ?? 0);
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return null;
  if (Date.now() - createdAtMs > AUTH_FLOW_TTL_MS) return null;
  const state = String(parsed.state ?? "").trim();
  const codeVerifier = String(parsed.codeVerifier ?? "").trim();
  const redirectTo = String(parsed.redirectTo ?? "").trim();
  if (!state || !codeVerifier || !redirectTo) return null;
  return {
    state,
    codeVerifier,
    redirectTo,
    returnTo: normalizeReturnToPath(parsed.returnTo),
    createdAtMs,
  };
}
