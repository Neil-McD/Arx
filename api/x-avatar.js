import dns from "node:dns";
import https from "node:https";

const X_AVATAR_HOST = "pbs.twimg.com";
const MAX_AVATAR_BYTES = 1_000_000;
const AVATAR_TIMEOUT_MS = 4_000;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const ALLOWED_SIZES = new Set(["mini", "normal", "bigger", "200x200", "400x400"]);

class AvatarProxyError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function firstValue(raw) {
  return Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
}

function requestedAvatarUrl(req) {
  const parsedQuery = firstValue(req.query?.url).trim();
  if (parsedQuery) return parsedQuery;
  try {
    return new URL(String(req.url ?? ""), "https://polynet.invalid").searchParams.get("url") ?? "";
  } catch {
    return "";
  }
}

function ipv4Number(raw) {
  const parts = String(raw).split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((value, part) => ((value << 8) + part) >>> 0, 0);
}

function ipv4InRange(raw, base, prefix) {
  const value = ipv4Number(raw);
  const baseValue = ipv4Number(base);
  if (value === null || baseValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

function isDeniedIpv4(raw) {
  return (
    ipv4InRange(raw, "0.0.0.0", 8) ||
    ipv4InRange(raw, "10.0.0.0", 8) ||
    ipv4InRange(raw, "100.64.0.0", 10) ||
    ipv4InRange(raw, "127.0.0.0", 8) ||
    ipv4InRange(raw, "169.254.0.0", 16) ||
    ipv4InRange(raw, "172.16.0.0", 12) ||
    ipv4InRange(raw, "192.0.0.0", 24) ||
    ipv4InRange(raw, "192.0.2.0", 24) ||
    ipv4InRange(raw, "192.168.0.0", 16) ||
    ipv4InRange(raw, "198.18.0.0", 15) ||
    ipv4InRange(raw, "198.51.100.0", 24) ||
    ipv4InRange(raw, "203.0.113.0", 24) ||
    ipv4InRange(raw, "224.0.0.0", 4) ||
    ipv4InRange(raw, "240.0.0.0", 4)
  );
}

export function approvedXAvatarSourceUrl(raw) {
  try {
    const parsed = new URL(String(raw ?? ""));
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.toLowerCase() !== X_AVATAR_HOST ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== "443") ||
      !/^\/profile_images\/[0-9]{1,24}\/[A-Za-z0-9._~-]{1,200}$/.test(parsed.pathname)
    ) return null;
    for (const key of parsed.searchParams.keys()) {
      if (key !== "format" && key !== "name") return null;
    }
    const format = parsed.searchParams.get("format");
    const size = parsed.searchParams.get("name");
    if (format && !ALLOWED_FORMATS.has(format.toLowerCase())) return null;
    if (size && !ALLOWED_SIZES.has(size.toLowerCase())) return null;
    const extension = /\.([A-Za-z0-9]+)$/.exec(parsed.pathname)?.[1]?.toLowerCase() ?? null;
    if ((extension && !ALLOWED_FORMATS.has(extension)) || (!extension && !format)) return null;
    parsed.hash = "";
    return parsed;
  } catch {
    return null;
  }
}

async function resolvePinnedIpv4() {
  let rows;
  try {
    rows = await dns.promises.lookup(X_AVATAR_HOST, { all: true, family: 4, verbatim: true });
  } catch {
    throw new AvatarProxyError(502, "x_avatar_dns_failed");
  }
  const selected = rows.find((row) => row.family === 4 && !isDeniedIpv4(row.address));
  if (!selected || rows.some((row) => row.family !== 4 || isDeniedIpv4(row.address))) {
    throw new AvatarProxyError(502, "x_avatar_dns_denied");
  }
  return selected.address;
}

async function fetchAvatar(sourceUrl) {
  const pinnedAddress = await resolvePinnedIpv4();
  return await new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: "GET",
        protocol: "https:",
        hostname: pinnedAddress,
        port: 443,
        path: `${sourceUrl.pathname}${sourceUrl.search}`,
        servername: X_AVATAR_HOST,
        lookup: (_hostname, _options, callback) => callback(null, pinnedAddress, 4),
        headers: {
          Host: X_AVATAR_HOST,
          "User-Agent": "Polynet X Avatar Proxy/1.0",
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = Number(response.statusCode ?? 0);
        if (status < 200 || status >= 300 || response.headers.location) {
          response.resume();
          reject(new AvatarProxyError(502, "x_avatar_fetch_failed"));
          return;
        }
        const contentType = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
          response.resume();
          reject(new AvatarProxyError(415, "x_avatar_content_type_denied"));
          return;
        }
        const declaredBytes = Number(response.headers["content-length"] ?? "");
        if (Number.isFinite(declaredBytes) && declaredBytes > MAX_AVATAR_BYTES) {
          response.resume();
          reject(new AvatarProxyError(413, "x_avatar_too_large"));
          return;
        }
        const chunks = [];
        let totalBytes = 0;
        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.byteLength;
          if (totalBytes > MAX_AVATAR_BYTES) {
            response.destroy(new AvatarProxyError(413, "x_avatar_too_large"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", reject);
        response.on("end", () => resolve({ contentType, body: Buffer.concat(chunks) }));
      },
    );
    request.setTimeout(AVATAR_TIMEOUT_MS, () => request.destroy(new AvatarProxyError(504, "x_avatar_timeout")));
    request.on("error", reject);
    request.end();
  });
}

function sendError(res, status, code) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(code);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    sendError(res, 405, "method_not_allowed");
    return;
  }
  const sourceUrl = approvedXAvatarSourceUrl(requestedAvatarUrl(req));
  if (!sourceUrl) {
    sendError(res, 400, "x_avatar_url_denied");
    return;
  }
  try {
    const avatar = await fetchAvatar(sourceUrl);
    res.statusCode = 200;
    res.setHeader("Content-Type", avatar.contentType);
    res.setHeader("Content-Length", String(avatar.body.byteLength));
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(avatar.body);
  } catch (error) {
    const known = error instanceof AvatarProxyError;
    sendError(res, known ? error.status : 502, known ? error.code : "x_avatar_unavailable");
  }
}
