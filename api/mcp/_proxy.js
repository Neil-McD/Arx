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

function shouldSkipRequestHeader(name) {
  return new Set([
    "accept-encoding",
    "connection",
    "content-length",
    "cookie",
    "host",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-vercel-deployment-url",
    "x-vercel-forwarded-for",
    "x-vercel-id",
    "x-vercel-ip-city",
    "x-vercel-ip-continent",
    "x-vercel-ip-country",
    "x-vercel-ip-country-region",
    "x-vercel-ip-latitude",
    "x-vercel-ip-longitude",
    "x-vercel-ip-timezone",
  ]).has(name.toLowerCase());
}

function shouldSkipResponseHeader(name) {
  return new Set([
    "connection",
    "content-encoding",
    "content-length",
    "keep-alive",
    "transfer-encoding",
  ]).has(name.toLowerCase());
}

function buildProxyHeaders(req) {
  const headers = new Headers();
  for (const [rawName, rawValue] of Object.entries(req.headers ?? {})) {
    const name = String(rawName).toLowerCase();
    if (shouldSkipRequestHeader(name)) continue;
    const value = firstHeader(rawValue);
    if (!value) continue;
    headers.set(rawName, value);
  }
  const apiKey = readConvexPublicKey();
  if (apiKey && !headers.has("apikey")) headers.set("apikey", apiKey);
  const forwardedHost = firstHeader(req.headers?.host);
  if (forwardedHost) headers.set("x-forwarded-host", forwardedHost);
  headers.set("x-forwarded-proto", firstHeader(req.headers?.["x-forwarded-proto"]) || "https");
  return headers;
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
  const base = readConvexRuntimeUrl();
  if (!base) {
    sendJson(res, 503, {
      error: "convex_runtime_url_missing",
      error_description: "VITE_CONVEX_SITE_URL or VITE_CONVEX_URL is required to proxy MCP routes.",
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
      headers: buildProxyHeaders(req),
      body: await readRequestBody(req),
      redirect: "manual",
      signal: controller.signal,
    });
    res.statusCode = upstream.status;
    for (const [name, value] of upstream.headers.entries()) {
      if (!shouldSkipResponseHeader(name)) res.setHeader(name, value);
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength === 0) {
      res.end();
    } else {
      res.end(buffer);
    }
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? `MCP runtime proxy timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? error.message
          : "MCP runtime proxy failed.";
    sendJson(res, 502, {
      error: "mcp_runtime_proxy_failed",
      error_description: message,
    });
  } finally {
    clearTimeout(timeout);
  }
}
