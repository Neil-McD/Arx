function readEnv(name) {
  return String(process.env?.[name] ?? "").trim();
}

function trimTrailingSlashes(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

function deriveConvexSiteUrlFromCloud(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".convex.cloud")) return null;
    parsed.hostname = parsed.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    return trimTrailingSlashes(parsed.toString());
  } catch {
    return null;
  }
}

export function readConvexRuntimeUrl() {
  const explicitSiteUrl =
    readEnv("VITE_CONVEX_SITE_URL") ||
    readEnv("VITE_PUBLIC_CONVEX_SITE_URL") ||
    readEnv("PUBLIC_CONVEX_SITE_URL");
  if (explicitSiteUrl) return trimTrailingSlashes(explicitSiteUrl);
  const cloudUrl =
    readEnv("VITE_CONVEX_URL") ||
    readEnv("VITE_PUBLIC_CONVEX_URL") ||
    readEnv("PUBLIC_CONVEX_URL");
  if (!cloudUrl) return "";
  return deriveConvexSiteUrlFromCloud(cloudUrl) ?? trimTrailingSlashes(cloudUrl);
}

function readConvexPublicKey() {
  return readEnv("VITE_CONVEX_PUBLIC_KEY") || "";
}

function readBridgeSecret() {
  return readEnv("ARX_AUTH_BRIDGE_SECRET");
}

function buildRuntimeUrl(routePath) {
  const base = readConvexRuntimeUrl();
  if (!base) return "";
  const path = String(routePath ?? "").startsWith("/") ? String(routePath) : `/${routePath}`;
  return `${base}${path}`;
}

function buildHeaders(params = {}) {
  const headers = new Headers();
  if (params.includeJsonContentType !== false) {
    headers.set("Content-Type", "application/json");
  }
  const apiKey = readConvexPublicKey();
  if (apiKey) headers.set("apikey", apiKey);
  const accessToken = String(params.accessToken ?? "").trim();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

function buildBridgeHeaders(params = {}) {
  const bridgeSecret = readBridgeSecret();
  if (!bridgeSecret) throw new Error("Missing ARX_AUTH_BRIDGE_SECRET.");
  const headers = buildHeaders(params);
  headers.set("X-Arx-Auth-Bridge-Secret", bridgeSecret);
  return headers;
}

export async function readResponseError(response) {
  try {
    const json = await response.clone().json();
    if (typeof json?.message === "string" && json.message.trim()) return json.message.trim();
    if (typeof json?.error === "string" && json.error.trim()) return json.error.trim();
  } catch {
    // ignore
  }
  try {
    const text = await response.clone().text();
    if (text.trim()) return text.trim();
  } catch {
    // ignore
  }
  return `Request failed (${response.status})`;
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export async function callRuntimeAuthJson(routePath, payload) {
  const url = buildRuntimeUrl(routePath);
  if (!url) throw new Error("Missing Convex runtime URL.");
  return await fetch(url, {
    method: "POST",
    headers: buildBridgeHeaders(),
    body: JSON.stringify(payload ?? {}),
  });
}

export async function callAuthBridgeJson(routePath, params = {}) {
  const url = buildRuntimeUrl(routePath);
  if (!url) throw new Error("Missing Convex runtime URL.");
  const headers = buildBridgeHeaders({
    accessToken: params.accessToken ?? "",
  });
  return await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(params.payload ?? {}),
  });
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function readString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function findSessionPayload(payload, requireRefreshToken = false) {
  const initial = asObject(payload);
  if (!initial) return null;
  const queue = [initial];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const accessToken = readString(current.access_token) ?? readString(current.accessToken);
    const refreshToken = readString(current.refresh_token) ?? readString(current.refreshToken);
    if (accessToken && (!requireRefreshToken || refreshToken)) return current;

    for (const key of ["session", "data", "result", "payload"]) {
      const nested = asObject(current[key]);
      if (nested) queue.push(nested);
    }
  }
  return null;
}

export function extractAccessTokenFromAuthPayload(payload) {
  const sessionPayload = findSessionPayload(payload, false);
  if (!sessionPayload) return null;
  return readString(sessionPayload.access_token) ?? readString(sessionPayload.accessToken);
}

export function getRequestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] ?? "").trim() || "https";
  const host = String(req.headers.host ?? "").trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

export function isSameOriginPost(req) {
  const origin = String(req.headers.origin ?? "").trim();
  if (!origin) return true;
  return origin === getRequestOrigin(req);
}
