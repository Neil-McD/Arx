import http from "node:http";
import crypto from "node:crypto";
import httpProxy from "http-proxy";
import { verifyPreviewProxySessionToken } from "./previewProxySessionToken.js";

const PREVIEW_COOKIE_NAME = "arx-daytona-preview";
const PROXY_LAYER = "fly-preview-proxy";

function buildRequestId() {
  return crypto.randomUUID().slice(0, 8);
}

function hashTokenPrefix(value) {
  const token = String(value ?? "").trim();
  if (!token) return "none";
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 10);
}

function hashConfigFingerprint(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "missing";
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

function setProxyHeaders(target, requestId, reason = null) {
  target.setHeader("X-Arx-Proxy-Layer", PROXY_LAYER);
  target.setHeader("X-Arx-Proxy-Request-Id", requestId);
  if (reason) {
    target.setHeader("X-Arx-Proxy-Reason", reason);
  }
}

function logProxyEvent(level, requestId, message, detail = {}) {
  const payload = {
    level,
    requestId,
    message,
    ...detail,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

function isAllowedDaytonaPreviewHost(hostname) {
  const host = String(hostname ?? "").trim().toLowerCase();
  if (!host) return false;
  return (
    host.includes("daytonaproxy") ||
    host.endsWith(".proxy.daytona.work") ||
    host.endsWith(".proxy.daytona.works") ||
    host.endsWith(".proxy.daytona.dev") ||
    host.endsWith(".daytona.work") ||
    host.endsWith(".daytona.works")
  );
}

function getCookieValue(rawCookie, name) {
  const cookie = String(rawCookie ?? "");
  if (!cookie) return null;
  for (const part of cookie.split(/;\s*/)) {
    const [cookieName, ...rest] = part.split("=");
    if (cookieName === name) return rest.join("=") || null;
  }
  return null;
}

function shouldUseSecureCookie(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").trim().toLowerCase();
  if (forwardedProto === "https") return true;
  return req.socket.encrypted === true;
}

function buildSetCookie(req, rawToken, maxAgeSeconds) {
  const parts = [
    `${PREVIEW_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=None",
  ];
  if (Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0) {
    parts.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
  }
  if (shouldUseSecureCookie(req)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function buildClearCookie(req) {
  const parts = [
    `${PREVIEW_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=None",
  ];
  if (shouldUseSecureCookie(req)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function parseStartRoute(pathname) {
  const match = String(pathname ?? "").match(/^\/_preview\/start\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  return {
    rawToken: decodeURIComponent(match[1]),
    previewPath: typeof match[2] === "string" ? match[2] : "",
  };
}

function buildUpstreamUrl(previewUrl, reqPathname, reqSearch, startRoute) {
  const upstreamUrl = new URL(previewUrl.toString());
  const basePath =
    typeof previewUrl.pathname === "string" && previewUrl.pathname.trim() && previewUrl.pathname !== "/"
      ? previewUrl.pathname.replace(/\/+$/, "")
      : "";
  if (startRoute && startRoute.previewPath) {
    upstreamUrl.pathname = `/${startRoute.previewPath}`.replace(/\/{2,}/g, "/");
  } else if (!startRoute && reqPathname && reqPathname !== "/") {
    upstreamUrl.pathname = reqPathname;
  } else {
    upstreamUrl.pathname = basePath || "/";
  }
  const requestSearchParams = new URLSearchParams(reqSearch || "");
  const mergedSearchParams = new URLSearchParams(upstreamUrl.search);
  for (const key of new Set(requestSearchParams.keys())) {
    if (
      key === "polynet_preview" ||
      key === "polynet_preview_contract" ||
      key === "polynet_preview_width" ||
      key === "polynet_preview_height"
    ) {
      continue;
    }
    mergedSearchParams.delete(key);
    for (const value of requestSearchParams.getAll(key)) {
      mergedSearchParams.append(key, value);
    }
  }
  const mergedSearch = mergedSearchParams.toString();
  upstreamUrl.search = mergedSearch ? `?${mergedSearch}` : "";
  return upstreamUrl;
}

async function resolveProxySession(req) {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  const startRoute = parseStartRoute(requestUrl.pathname);
  const rawCookieToken = getCookieValue(req.headers.cookie, PREVIEW_COOKIE_NAME);
  const rawToken = startRoute?.rawToken || (typeof rawCookieToken === "string" ? decodeURIComponent(rawCookieToken) : null);
  const parsedResult = rawToken
    ? await verifyPreviewProxySessionToken(rawToken)
    : {
        ok: false,
        status: 400,
        code: "invalid_preview_proxy_token",
        message: "Invalid or missing preview session.",
      };
  if (!parsedResult.ok) {
    return {
      ok: false,
      status: parsedResult.status,
      code: parsedResult.code,
      message: parsedResult.message,
      clearCookie: true,
    };
  }
  const parsed = parsedResult.payload;
  if (!isAllowedDaytonaPreviewHost(parsed.previewUrl.hostname)) {
    let code = "invalid_preview_proxy_token";
    if (parsed.kind !== "workspace_preview" && parsed.kind !== "live_desktop") code = "wrong_kind";
    else if (parsed.kind === "live_desktop" && !parsed.previewToken) code = "missing_preview_token";
    else if (!isAllowedDaytonaPreviewHost(parsed.previewUrl.hostname)) code = "host_rejected";
    return {
      ok: false,
      status: 400,
      code,
      message: "Invalid or missing preview session.",
      clearCookie: true,
    };
  }
  if (parsed.kind === "live_desktop" && !parsed.previewToken) {
    return {
      ok: false,
      status: 400,
      code: "missing_preview_token",
      message: "Invalid or missing preview session.",
      clearCookie: true,
    };
  }
  const upstreamUrl = buildUpstreamUrl(parsed.previewUrl, requestUrl.pathname, requestUrl.search, startRoute);
  return {
    ok: true,
    kind: parsed.kind,
    upstreamUrl,
    previewUrl: parsed.previewUrl,
    previewToken: parsed.previewToken,
    expiresAtMs: parsed.expiresAtMs,
    setCookie:
      rawToken && startRoute
        ? buildSetCookie(req, rawToken, Math.max(1, Math.floor((parsed.expiresAtMs - Date.now()) / 1000)))
        : null,
  };
}

function writeErrorResponse(req, res, status, message, clearCookie = false, reason = "proxy_error") {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  setProxyHeaders(res, req.__liveDesktopProxyRequestId ?? "unknown", reason);
  if (clearCookie) {
    res.setHeader("Set-Cookie", buildClearCookie(req));
  }
  res.end(message);
}

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  ws: true,
  secure: true,
  xfwd: false,
});

proxy.on("proxyReq", (proxyReq, req) => {
  const session = req.__liveDesktopProxySession;
  if (!session) return;
  if (typeof session.previewToken === "string" && session.previewToken.trim()) {
    proxyReq.setHeader("X-Daytona-Preview-Token", session.previewToken);
  }
  proxyReq.setHeader("X-Daytona-Skip-Preview-Warning", "true");
  if (req.headers.host) {
    proxyReq.setHeader("X-Forwarded-Host", String(req.headers.host));
  }
});

proxy.on("proxyReqWs", (proxyReq, req) => {
  const session = req.__liveDesktopProxySession;
  if (!session) return;
  if (typeof session.previewToken === "string" && session.previewToken.trim()) {
    proxyReq.setHeader("X-Daytona-Preview-Token", session.previewToken);
  }
  proxyReq.setHeader("X-Daytona-Skip-Preview-Warning", "true");
  if (req.headers.host) {
    proxyReq.setHeader("X-Forwarded-Host", String(req.headers.host));
  }
});

proxy.on("proxyRes", (proxyRes, req) => {
  const session = req.__liveDesktopProxySession;
  if (!session) return;
  proxyRes.headers["x-arx-proxy-layer"] = PROXY_LAYER;
  proxyRes.headers["x-arx-proxy-request-id"] = req.__liveDesktopProxyRequestId ?? "unknown";
  const locationHeader = proxyRes.headers.location;
  if (typeof locationHeader === "string" && locationHeader.trim()) {
    try {
      const redirected = new URL(locationHeader, session.previewUrl.origin);
      if (redirected.origin === session.previewUrl.origin) {
        proxyRes.headers.location = `${redirected.pathname}${redirected.search}${redirected.hash}`;
      }
    } catch {
      // Ignore malformed redirect headers and let the browser handle them.
    }
  }
  if (typeof req.__liveDesktopProxySetCookie === "string" && req.__liveDesktopProxySetCookie) {
    const existing = proxyRes.headers["set-cookie"];
    const cookies = Array.isArray(existing) ? existing.slice() : existing ? [String(existing)] : [];
    cookies.unshift(req.__liveDesktopProxySetCookie);
    proxyRes.headers["set-cookie"] = cookies;
  }
  logProxyEvent("info", req.__liveDesktopProxyRequestId ?? "unknown", "proxy_response", {
    upstreamHost: session.previewUrl.hostname,
    upstreamPath: req.url,
    status: proxyRes.statusCode ?? null,
  });
});

proxy.on("error", (error, req, resOrSocket) => {
  const message = error instanceof Error ? error.message : "Proxy request failed.";
  logProxyEvent("error", req?.__liveDesktopProxyRequestId ?? "unknown", "proxy_error", {
    error: message,
    upstreamPath: req?.url ?? null,
  });
  if (resOrSocket && typeof resOrSocket.writeHead === "function") {
    const res = resOrSocket;
    if (!res.headersSent) {
      res.writeHead(502, {
        "Cache-Control": "no-store",
        "X-Arx-Proxy-Layer": PROXY_LAYER,
        "X-Arx-Proxy-Request-Id": req?.__liveDesktopProxyRequestId ?? "unknown",
        "X-Arx-Proxy-Reason": "proxy_error",
      });
    }
    res.end(message);
    return;
  }
  try {
    resOrSocket.end(`HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n${message}`);
  } catch {
    // ignore socket close failures
  }
});

function validatePreviewProxyConfig() {
  const signingSecret = String(process.env.ARX_PREVIEW_PROXY_SIGNING_SECRET ?? "").trim();
  if (!signingSecret) {
    throw new Error("ARX_PREVIEW_PROXY_SIGNING_SECRET is required.");
  }
  return {
    signingSecretFingerprint: hashConfigFingerprint(signingSecret),
    nodeEnv: String(process.env.NODE_ENV ?? "").trim() || null,
    flyAppName: String(process.env.FLY_APP_NAME ?? "").trim() || null,
    flyRegion: String(process.env.FLY_REGION ?? "").trim() || null,
    hostname: String(process.env.HOSTNAME ?? "").trim() || null,
  };
}

function buildForwardHeaders(req, previewToken = null) {
  const forwarded = {
    "X-Daytona-Skip-Preview-Warning": "true",
  };
  if (typeof previewToken === "string" && previewToken.trim()) {
    forwarded["X-Daytona-Preview-Token"] = previewToken.trim();
  }
  if (req.headers.host) {
    forwarded["X-Forwarded-Host"] = String(req.headers.host);
  }
  const passThrough = [
    "accept",
    "accept-language",
    "cache-control",
    "content-type",
    "origin",
    "pragma",
    "referer",
    "user-agent",
    "x-requested-with",
  ];
  for (const name of passThrough) {
    const value = req.headers?.[name];
    if (typeof value === "string" && value.trim()) forwarded[name] = value;
  }
  return forwarded;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function stripFrameAncestorsDirective(value) {
  const parts = String(value ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const kept = parts.filter((part) => !part.toLowerCase().startsWith("frame-ancestors"));
  return kept.join("; ");
}

function copyFetchHeadersToResponse(upstream, res, kind) {
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "content-length" || lower === "transfer-encoding") return;
    if (kind === "workspace_preview") {
      if (lower === "x-frame-options") return;
      if (lower === "content-security-policy" || lower === "content-security-policy-report-only") {
        const normalized = stripFrameAncestorsDirective(value);
        if (normalized) {
          res.setHeader(key, normalized);
        }
        return;
      }
    }
    res.setHeader(key, value);
  });
}

function shouldInjectPreviewMetrics(requestUrl) {
  const mode = requestUrl.searchParams.get("polynet_preview");
  return typeof mode === "string" && mode.trim().length > 0;
}

function injectPreviewMetricsReporter(html) {
  const script = `<script>
(() => {
  const params = new URLSearchParams(window.location.search);
  const previewMode = params.get("polynet_preview") || null;
  const previewContract = params.get("polynet_preview_contract") || null;
  const sendMetrics = () => {
    try {
      const root = document.documentElement;
      const body = document.body;
      const viewportWidth = Math.max(root?.clientWidth || 0, window.innerWidth || 0);
      const viewportHeight = Math.max(root?.clientHeight || 0, window.innerHeight || 0);
      const width = Math.max(
        root?.scrollWidth || 0,
        root?.offsetWidth || 0,
        root?.clientWidth || 0,
        body?.scrollWidth || 0,
        body?.offsetWidth || 0,
        body?.clientWidth || 0,
        window.innerWidth || 0,
      );
      const height = Math.max(
        root?.scrollHeight || 0,
        root?.offsetHeight || 0,
        root?.clientHeight || 0,
        body?.scrollHeight || 0,
        body?.offsetHeight || 0,
        body?.clientHeight || 0,
        window.innerHeight || 0,
      );
      const overflowX = width > viewportWidth + 2;
      const overflowY = height > viewportHeight + 2;
      const visibleTextLength = String(body?.innerText || "").replace(/\\s+/g, " ").trim().length;
      const elementCount = document.querySelectorAll("body *").length;
      const mediaElementCount = document.querySelectorAll("img,svg,canvas,video,picture,iframe").length;
      window.parent?.postMessage(
        {
          type: "polynet_preview_metrics",
          previewMode,
          previewContract,
          width,
          height,
          viewportWidth,
          viewportHeight,
          overflowX,
          overflowY,
          visibleTextLength,
          elementCount,
          mediaElementCount,
        },
        "*",
      );
    } catch {}
  };

  const scheduleMetrics = () => {
    window.requestAnimationFrame(() => {
      window.setTimeout(sendMetrics, 0);
    });
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    scheduleMetrics();
  } else {
    window.addEventListener("DOMContentLoaded", scheduleMetrics, { once: true });
  }
  window.addEventListener("load", scheduleMetrics);
  window.addEventListener("resize", scheduleMetrics);

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(scheduleMetrics);
    observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
  }

  if ("MutationObserver" in window) {
    const observer = new MutationObserver(scheduleMetrics);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  window.setInterval(sendMetrics, 1200);
})();
</script>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}</body>`);
  }
  if (html.includes("</html>")) {
    return html.replace("</html>", `${script}</html>`);
  }
  return `${html}${script}`;
}

async function proxyWorkspacePreviewHttp(req, res, resolved, requestUrl) {
  const method = String(req.method ?? "GET").toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);

  let upstream;
  try {
    upstream = await fetch(resolved.upstreamUrl.toString(), {
      method,
      headers: buildForwardHeaders(req, resolved.previewToken),
      body,
      redirect: "manual",
    });
  } catch (error) {
    if (typeof resolved.setCookie === "string" && resolved.setCookie) {
      res.setHeader("Set-Cookie", resolved.setCookie);
    }
    res.statusCode = 502;
    res.setHeader("Cache-Control", "no-store");
    setProxyHeaders(res, req.__liveDesktopProxyRequestId ?? "unknown", "upstream_fetch_failed");
    res.end(error instanceof Error ? error.message : "Preview proxy request failed.");
    return;
  }

  const location = upstream.headers.get("location");
  if (location) {
    try {
      const redirected = new URL(location, resolved.upstreamUrl.toString());
      if (redirected.origin === resolved.previewUrl.origin) {
        if (typeof resolved.setCookie === "string" && resolved.setCookie) {
          res.setHeader("Set-Cookie", resolved.setCookie);
        }
        res.statusCode = upstream.status;
        res.setHeader("Cache-Control", "no-store");
        setProxyHeaders(res, req.__liveDesktopProxyRequestId ?? "unknown", "redirect");
        res.setHeader("Location", `${redirected.pathname}${redirected.search}${redirected.hash}`);
        res.end();
        return;
      }
    } catch {
      // fall through and proxy as-is
    }
  }

  if (typeof resolved.setCookie === "string" && resolved.setCookie) {
    res.setHeader("Set-Cookie", resolved.setCookie);
  }
  res.statusCode = upstream.status;
  res.setHeader("Cache-Control", "no-store");
  setProxyHeaders(res, req.__liveDesktopProxyRequestId ?? "unknown");
  copyFetchHeadersToResponse(upstream, res, resolved.kind);

  if (method === "HEAD") {
    res.end();
    return;
  }

  const responseBuffer = Buffer.from(await upstream.arrayBuffer());
  const contentType = String(upstream.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("text/html") && shouldInjectPreviewMetrics(requestUrl)) {
    const html = responseBuffer.toString("utf8");
    res.end(Buffer.from(injectPreviewMetricsReporter(html), "utf8"));
    return;
  }
  res.end(responseBuffer);
}

export function createPreviewProxyServer() {
  const server = http.createServer(async (req, res) => {
    req.__liveDesktopProxyRequestId = buildRequestId();
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
    if (requestUrl.pathname === "/health") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      setProxyHeaders(res, req.__liveDesktopProxyRequestId);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const resolved = await resolveProxySession(req);
    if (!resolved.ok) {
      const rawCookieToken = getCookieValue(req.headers.cookie, PREVIEW_COOKIE_NAME);
      const rawToken = parseStartRoute(requestUrl.pathname)?.rawToken || rawCookieToken;
      const reason = (() => {
        switch (resolved.code) {
          case "preview_session_expired":
            return "expired";
          case "wrong_kind":
            return "wrong_kind";
          case "missing_preview_token":
            return "missing_preview_token";
          case "host_rejected":
            return "host_rejected";
          case "invalid_preview_proxy_token":
          default:
            return rawToken ? "bad_signature_or_payload" : "missing_token";
        }
      })();
      logProxyEvent("info", req.__liveDesktopProxyRequestId, "session_rejected", {
        reason,
        host: req.headers.host ?? null,
        pathname: requestUrl.pathname,
        via: parseStartRoute(requestUrl.pathname)?.rawToken ? "path" : rawCookieToken ? "cookie" : "missing",
        tokenHash: hashTokenPrefix(rawToken),
        status: resolved.status,
      });
      writeErrorResponse(req, res, resolved.status, resolved.message, resolved.clearCookie === true, reason);
      return;
    }

    req.__liveDesktopProxySession = {
      previewUrl: resolved.previewUrl,
      previewToken: resolved.previewToken,
    };
    req.__liveDesktopProxySetCookie = resolved.setCookie;
    logProxyEvent("info", req.__liveDesktopProxyRequestId, "session_accepted", {
      host: req.headers.host ?? null,
      pathname: requestUrl.pathname,
      kind: resolved.kind,
      upstreamHost: resolved.previewUrl.hostname,
      upstreamPath: resolved.upstreamUrl.pathname,
      via: parseStartRoute(requestUrl.pathname)?.rawToken ? "path" : "cookie",
      tokenHash: hashTokenPrefix(
        parseStartRoute(requestUrl.pathname)?.rawToken || getCookieValue(req.headers.cookie, PREVIEW_COOKIE_NAME),
      ),
    });

    if (resolved.kind === "workspace_preview") {
      void proxyWorkspacePreviewHttp(req, res, resolved, requestUrl);
      return;
    }

    const originalUrl = req.url;
    req.url = `${resolved.upstreamUrl.pathname}${resolved.upstreamUrl.search}`;
    proxy.web(req, res, { target: resolved.upstreamUrl.origin });
    req.url = originalUrl;
  });

  server.on("upgrade", async (req, socket, head) => {
    req.__liveDesktopProxyRequestId = buildRequestId();
    const resolved = await resolveProxySession(req);
    if (!resolved.ok) {
      logProxyEvent("info", req.__liveDesktopProxyRequestId, "upgrade_rejected", {
        host: req.headers.host ?? null,
        pathname: req.url ?? null,
        status: resolved.status,
      });
      socket.end(
        `HTTP/1.1 ${resolved.status} ${resolved.status === 401 ? "Unauthorized" : "Bad Request"}\r\nConnection: close\r\n\r\n${resolved.message}`,
      );
      return;
    }

    req.__liveDesktopProxySession = {
      previewUrl: resolved.previewUrl,
      previewToken: resolved.previewToken,
    };
    logProxyEvent("info", req.__liveDesktopProxyRequestId, "upgrade_accepted", {
      host: req.headers.host ?? null,
      pathname: req.url ?? null,
      kind: resolved.kind,
      upstreamHost: resolved.previewUrl.hostname,
      upstreamPath: resolved.upstreamUrl.pathname,
    });

    const originalUrl = req.url;
    req.url = `${resolved.upstreamUrl.pathname}${resolved.upstreamUrl.search}`;
    proxy.ws(req, socket, head, { target: resolved.upstreamUrl.origin });
    req.url = originalUrl;
  });

  return server;
}

export function startPreviewProxyServer(options = {}) {
  const { port = Math.max(1, Math.floor(Number(process.env.PORT ?? 8080) || 8080)) } = options;
  const config = validatePreviewProxyConfig();
  const server = createPreviewProxyServer();
  server.listen(port, () => {
    logProxyEvent("info", "startup", "preview_proxy_ready", {
      port,
      signingSecretFingerprint: config.signingSecretFingerprint,
      nodeEnv: config.nodeEnv,
      flyAppName: config.flyAppName,
      flyRegion: config.flyRegion,
      hostname: config.hostname,
    });
  });
  return server;
}
