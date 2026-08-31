import { randomUUID } from "node:crypto";

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

function readConvexRuntimeUrl() {
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

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function firstHeader(value) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "authorization",
  "content-type",
  "last-event-id",
  "mcp-protocol-version",
  "mcp-session-id",
  "origin",
]);

const CORS_PREFLIGHT_REQUEST_HEADERS = new Set([
  "access-control-request-headers",
  "access-control-request-method",
]);

function shouldSkipResponseHeader(name) {
  return new Set([
    "connection",
    "content-encoding",
    "content-length",
    "keep-alive",
    "transfer-encoding",
  ]).has(name.toLowerCase());
}

function shouldForwardRequestHeader(req, name) {
  if (FORWARDED_REQUEST_HEADERS.has(name)) return true;
  return (
    String(req.method ?? "").toUpperCase() === "OPTIONS" &&
    CORS_PREFLIGHT_REQUEST_HEADERS.has(name)
  );
}

function connectionHeaderTokens(req) {
  return new Set(
    firstHeader(req.headers?.connection)
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function buildProxyHeaders(req, requestId = randomUUID()) {
  const headers = new Headers();
  const connectionTokens = connectionHeaderTokens(req);
  for (const [rawName, rawValue] of Object.entries(req.headers ?? {})) {
    const name = String(rawName).toLowerCase();
    if (!shouldForwardRequestHeader(req, name) || connectionTokens.has(name)) continue;
    const value = firstHeader(rawValue);
    if (!value) continue;
    headers.set(name, value);
  }
  const apiKey = readConvexPublicKey();
  if (apiKey && !headers.has("apikey")) headers.set("apikey", apiKey);
  const forwardedHost = firstHeader(req.headers?.host);
  if (forwardedHost) headers.set("x-forwarded-host", forwardedHost);
  headers.set("x-forwarded-proto", firstHeader(req.headers?.["x-forwarded-proto"]) || "https");
  headers.set("x-arx-request-id", requestId);
  return headers;
}

function hasHeader(req, name) {
  return Object.keys(req.headers ?? {}).some(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
}

function errorCauseCode(error) {
  const cause = error && typeof error === "object" ? error.cause : null;
  if (!cause || typeof cause !== "object") return null;
  return typeof cause.code === "string" ? cause.code : null;
}

async function readRequestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
}

function readTimeoutMs() {
  const parsed = Number(readEnv("ARX_MCP_PROXY_TIMEOUT_MS"));
  if (!Number.isFinite(parsed) || parsed <= 0) return 30_000;
  return Math.max(1_000, Math.min(Math.floor(parsed), 120_000));
}

export async function proxyConvexRuntimeRequest(req, res, targetPath) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  res.setHeader("x-arx-request-id", requestId);
  const base = readConvexRuntimeUrl();
  if (!base) {
    sendJson(res, 503, {
      error: "convex_runtime_url_missing",
      error_description: "VITE_CONVEX_SITE_URL or VITE_CONVEX_URL is required to proxy MCP routes.",
      request_id: requestId,
    });
    return;
  }

  const path = String(targetPath ?? "").startsWith("/") ? String(targetPath) : `/${targetPath}`;
  const targetUrl = `${base}${path}`;
  const timeoutMs = readTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: buildProxyHeaders(req, requestId),
      body: await readRequestBody(req),
      redirect: "manual",
      signal: controller.signal,
    });
    res.statusCode = upstream.status;
    for (const [name, value] of upstream.headers.entries()) {
      if (!shouldSkipResponseHeader(name)) res.setHeader(name, value);
    }
    res.setHeader("x-arx-request-id", requestId);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength === 0) {
      res.end();
    } else {
      res.end(buffer);
    }
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    console.error(
      JSON.stringify({
        event: "mcp_runtime_proxy_failed",
        requestId,
        method: String(req.method ?? ""),
        targetPath: path,
        elapsedMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : "Error",
        causeCode: errorCauseCode(error),
        timedOut,
        inboundTransport: {
          transferEncoding: hasHeader(req, "transfer-encoding"),
          expect: hasHeader(req, "expect"),
        },
      }),
    );
    sendJson(res, 502, {
      error: "mcp_runtime_proxy_failed",
      error_description: timedOut
        ? `MCP runtime proxy timed out after ${timeoutMs}ms.`
        : "MCP runtime proxy request failed.",
      request_id: requestId,
    });
  } finally {
    clearTimeout(timeout);
  }
}
