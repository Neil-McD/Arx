import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import { timingSafeEqual } from "node:crypto";

const BROKER_SECRET_ENV = "ARX_SOURCE_URL_FETCHER_SECRET";
const USER_AGENT = "PolyNet Community Source Ingestion/1.0";
const MAX_REQUEST_BODY_BYTES = 24_000;
const DEFAULT_MAX_BYTES = 750_000;
const DEFAULT_MAX_CHARS = 20_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 3;
const HARD_MAX_BYTES = 750_000;
const HARD_MAX_CHARS = 20_000;
const HARD_TIMEOUT_MS = 8_000;
const HARD_MAX_REDIRECTS = 3;
const DENIED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);
const DENIED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
  ".corp",
  ".arpa",
  ".test",
  ".invalid",
  ".example",
];

class SourceFetchError extends Error {
  constructor(code, status = 400, message = code) {
    super(message);
    this.name = "SourceFetchError";
    this.code = code;
    this.status = status;
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function readEnv(name) {
  return String(process.env?.[name] ?? "").trim();
}

function firstHeader(value) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function requireBearerSecret(req) {
  const secret = readEnv(BROKER_SECRET_ENV);
  if (!secret) {
    throw new SourceFetchError(
      "source_url_fetcher_secret_not_configured",
      503,
      "Source URL fetcher secret is not configured.",
    );
  }
  const authorization = firstHeader(req.headers.authorization).trim();
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) {
    throw new SourceFetchError("source_url_fetcher_unauthorized", 401, "Missing bearer token.");
  }
  const token = authorization.slice(prefix.length).trim();
  if (!token || !constantTimeEquals(token, secret)) {
    throw new SourceFetchError("source_url_fetcher_unauthorized", 401, "Invalid bearer token.");
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    return parseJsonBody(req.body);
  }
  if (Buffer.isBuffer(req.body)) {
    return parseJsonBody(req.body.toString("utf8"));
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_REQUEST_BODY_BYTES) {
      throw new SourceFetchError("source_url_fetcher_request_too_large", 413, "Request body is too large.");
    }
    chunks.push(buffer);
  }
  return parseJsonBody(Buffer.concat(chunks).toString("utf8"));
}

function parseJsonBody(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("bad_body");
    }
    return parsed;
  } catch {
    throw new SourceFetchError("source_url_fetcher_invalid_json", 400, "Request body must be JSON.");
  }
}

function readString(value, maxLength) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength);
}

function readPositiveInt(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(number), max));
}

function normalizeHostname(rawHostname) {
  let hostname = String(rawHostname ?? "").trim().toLowerCase();
  if (hostname.startsWith("[") && hostname.endsWith("]")) hostname = hostname.slice(1, -1);
  hostname = hostname.replace(/\.+$/, "");
  return hostname;
}

function isLiteralIpv4(value) {
  return net.isIP(value) === 4;
}

function ipv4ToNumber(value) {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
}

function isIpv4InRange(value, base, prefixLength) {
  const addressNumber = ipv4ToNumber(value);
  const baseNumber = ipv4ToNumber(base);
  if (addressNumber === null || baseNumber === null) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (addressNumber & mask) === (baseNumber & mask);
}

function isPrivateOrReservedIpv4(value) {
  return (
    isIpv4InRange(value, "0.0.0.0", 8) ||
    isIpv4InRange(value, "10.0.0.0", 8) ||
    isIpv4InRange(value, "100.64.0.0", 10) ||
    isIpv4InRange(value, "127.0.0.0", 8) ||
    isIpv4InRange(value, "169.254.0.0", 16) ||
    isIpv4InRange(value, "172.16.0.0", 12) ||
    isIpv4InRange(value, "192.0.0.0", 24) ||
    isIpv4InRange(value, "192.0.2.0", 24) ||
    isIpv4InRange(value, "192.168.0.0", 16) ||
    isIpv4InRange(value, "198.18.0.0", 15) ||
    isIpv4InRange(value, "198.51.100.0", 24) ||
    isIpv4InRange(value, "203.0.113.0", 24) ||
    isIpv4InRange(value, "224.0.0.0", 4) ||
    isIpv4InRange(value, "240.0.0.0", 4) ||
    value === "255.255.255.255"
  );
}

function ipv4FromIpv6Mapped(value) {
  const lower = value.toLowerCase();
  const match = lower.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  return match?.[1] ?? null;
}

function isPrivateOrReservedIpv6(value) {
  const lower = value.toLowerCase();
  const mappedIpv4 = ipv4FromIpv6Mapped(lower);
  if (mappedIpv4) return isPrivateOrReservedIpv4(mappedIpv4);
  if (lower === "::" || lower === "::1") return true;
  const firstGroup = Number.parseInt(lower.split(":")[0] || "0", 16);
  if (!Number.isFinite(firstGroup)) return true;
  if ((firstGroup & 0xfe00) === 0xfc00) return true;
  if ((firstGroup & 0xffc0) === 0xfe80) return true;
  if ((firstGroup & 0xff00) === 0xff00) return true;
  if (lower.startsWith("2001:db8:") || lower === "2001:db8::") return true;
  return false;
}

function isPrivateOrReservedIp(address) {
  const version = net.isIP(address);
  if (version === 4) return isPrivateOrReservedIpv4(address);
  if (version === 6) return isPrivateOrReservedIpv6(address);
  return true;
}

function hasEmbeddedPrivateIpv4(hostname) {
  const matches = hostname.match(/\d{1,3}(?:\.\d{1,3}){3}/g) ?? [];
  return matches.some((candidate) => isLiteralIpv4(candidate) && isPrivateOrReservedIpv4(candidate));
}

function requireSafeSourceUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl ?? ""));
  } catch {
    throw new SourceFetchError("community_source_url_invalid", 400, "Source URL is invalid.");
  }
  if (parsed.protocol !== "https:") {
    throw new SourceFetchError("community_source_url_https_required", 400, "Source URL must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new SourceFetchError(
      "community_source_url_credentials_not_supported",
      400,
      "Source URL credentials are not supported.",
    );
  }
  if (parsed.hash) parsed.hash = "";
  if (parsed.port && parsed.port !== "443") {
    throw new SourceFetchError(
      "community_source_url_port_not_supported",
      400,
      "Source URL custom ports are not supported.",
    );
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) throw new SourceFetchError("community_source_url_invalid", 400, "Source URL host is missing.");
  if (
    DENIED_HOSTNAMES.has(hostname) ||
    DENIED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    net.isIP(hostname) ||
    hasEmbeddedPrivateIpv4(hostname)
  ) {
    throw new SourceFetchError("community_source_url_hostname_denied", 403, "Source URL host is denied.");
  }
  parsed.hostname = hostname;
  return parsed;
}

async function resolvePublicAddress(hostname) {
  let rows;
  try {
    rows = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SourceFetchError("community_source_url_dns_lookup_failed", 502, "Source URL DNS lookup failed.");
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new SourceFetchError("community_source_url_dns_lookup_failed", 502, "Source URL DNS lookup returned no addresses.");
  }
  const hasDeniedAddress = rows.some((row) => isPrivateOrReservedIp(row.address));
  if (hasDeniedAddress) {
    throw new SourceFetchError("community_source_url_private_address_denied", 403, "Source URL resolved to a denied address.");
  }
  const selected = rows.find((row) => row.family === 4) ?? rows.find((row) => row.family === 6);
  if (!selected) {
    throw new SourceFetchError("community_source_url_dns_lookup_failed", 502, "Source URL DNS lookup returned no usable address.");
  }
  return selected;
}

function isPdfUrl(url) {
  return url.pathname.toLowerCase().endsWith(".pdf");
}

function normalizeContentType(value) {
  return String(value ?? "").split(";")[0].trim().toLowerCase();
}

function isReadableContentType(contentType) {
  if (!contentType) return true;
  return (
    contentType.startsWith("text/") ||
    contentType.includes("application/json") ||
    contentType.includes("application/xml") ||
    contentType.includes("xml")
  );
}

function readHeaderNumber(headers, name) {
  const value = Number(headers[name]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function requestOnce(parsedUrl, options) {
  return new Promise(async (resolve, reject) => {
    let pinnedAddress;
    try {
      pinnedAddress = await resolvePublicAddress(parsedUrl.hostname);
    } catch (error) {
      reject(error);
      return;
    }

    const request = https.request(
      {
        method: "GET",
        protocol: "https:",
        hostname: pinnedAddress.address,
        port: parsedUrl.port ? Number(parsedUrl.port) : 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        servername: parsedUrl.hostname,
        lookup: (_hostname, _options, callback) => {
          callback(null, pinnedAddress.address, pinnedAddress.family);
        },
        headers: {
          Host: parsedUrl.host,
          "User-Agent": USER_AGENT,
          Accept: options.accept,
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = Number(response.statusCode ?? 0);
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ redirectUrl: response.headers.location });
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          reject(new SourceFetchError(`community_source_url_fetch_failed_${status || 0}`, 502, "Source URL fetch failed."));
          return;
        }

        const contentType = normalizeContentType(response.headers["content-type"]);
        if (contentType.includes("application/pdf") || isPdfUrl(parsedUrl)) {
          response.resume();
          reject(
            new SourceFetchError(
              "community_source_pdf_ingestion_not_supported",
              415,
              "PDF source ingestion is not supported.",
            ),
          );
          return;
        }
        if (!isReadableContentType(contentType)) {
          response.resume();
          reject(
            new SourceFetchError(
              "community_source_url_content_type_not_supported",
              415,
              "Source URL content type is not supported.",
            ),
          );
          return;
        }

        const contentLength = readHeaderNumber(response.headers, "content-length");
        if (contentLength !== null && contentLength > options.maxBytes) {
          response.resume();
          reject(new SourceFetchError("community_source_url_too_large", 413, "Source URL response is too large."));
          return;
        }

        const chunks = [];
        let total = 0;
        response.on("error", (error) => {
          reject(error);
        });
        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buffer.byteLength;
          if (total > options.maxBytes) {
            response.destroy(new SourceFetchError("community_source_url_too_large", 413, "Source URL response is too large."));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          resolve({
            finalUrl: parsedUrl.toString(),
            contentType: contentType || "text/plain",
            rawText: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new SourceFetchError("community_source_url_timeout", 504, "Source URL request timed out."));
    });
    request.on("error", (error) => {
      reject(error);
    });
    request.end();
  });
}

async function fetchSourceUrl(rawUrl, options) {
  let currentUrl = requireSafeSourceUrl(rawUrl);
  for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
    const result = await requestOnce(currentUrl, options);
    if (!result.redirectUrl) return result;
    if (redirectCount >= options.maxRedirects) {
      throw new SourceFetchError("community_source_url_too_many_redirects", 400, "Source URL redirected too many times.");
    }
    const nextUrl = new URL(String(result.redirectUrl), currentUrl);
    currentUrl = requireSafeSourceUrl(nextUrl.toString());
  }
  throw new SourceFetchError("community_source_url_too_many_redirects", 400, "Source URL redirected too many times.");
}

function decodeBasicHtmlEntities(raw) {
  const named = {
    amp: "&",
    gt: ">",
    lt: "<",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return String(raw).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity) => {
    const lower = String(entity).toLowerCase();
    if (lower.startsWith("#x")) {
      const value = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    }
    if (lower.startsWith("#")) {
      const value = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    }
    return named[lower] ?? " ";
  });
}

function normalizeExtractedText(raw, maxChars) {
  const value = String(raw ?? "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 3)).trimEnd() + "...";
}

function extractTitleFromHtml(html) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeBasicHtmlEntities(String(match?.[1] ?? "").replace(/<[^>]+>/g, " "));
  return title.replace(/\s+/g, " ").trim() || null;
}

function extractReadableTextFromHtml(html, maxChars) {
  const title = extractTitleFromHtml(html);
  const withoutScripts = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ");
  const blockSeparated = withoutScripts
    .replace(/<\/(?:p|div|section|article|header|footer|main|aside|li|ul|ol|h[1-6]|tr|table|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = normalizeExtractedText(decodeBasicHtmlEntities(blockSeparated.replace(/<[^>]+>/g, " ")), maxChars);
  return {
    title,
    text: normalizeExtractedText([title, text].filter(Boolean).join("\n\n"), maxChars),
  };
}

function extractReadableText(raw, contentType, maxChars) {
  const lowerContentType = normalizeContentType(contentType);
  if (lowerContentType.includes("text/html") || /<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw)) {
    return extractReadableTextFromHtml(raw, maxChars);
  }
  if (lowerContentType.includes("application/json")) {
    try {
      return {
        title: null,
        text: normalizeExtractedText(JSON.stringify(JSON.parse(raw), null, 2), maxChars),
      };
    } catch {
      return { title: null, text: normalizeExtractedText(raw, maxChars) };
    }
  }
  return { title: null, text: normalizeExtractedText(raw, maxChars) };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error_code: "method_not_allowed", error_message: "Method not allowed." });
    return;
  }

  try {
    requireBearerSecret(req);
    const payload = await readJsonBody(req);
    const url = readString(payload.url, 2_000);
    if (!url) {
      throw new SourceFetchError("community_source_url_required", 400, "Source URL is required.");
    }
    const options = {
      maxBytes: readPositiveInt(payload.max_bytes, DEFAULT_MAX_BYTES, HARD_MAX_BYTES),
      maxChars: readPositiveInt(payload.max_chars, DEFAULT_MAX_CHARS, HARD_MAX_CHARS),
      timeoutMs: readPositiveInt(payload.timeout_ms, DEFAULT_TIMEOUT_MS, HARD_TIMEOUT_MS),
      maxRedirects: readPositiveInt(payload.max_redirects, DEFAULT_MAX_REDIRECTS, HARD_MAX_REDIRECTS),
      accept:
        readString(payload.accept, 500) ||
        "text/html,text/plain,text/markdown,application/json,application/xml,text/xml,*/*;q=0.5",
    };
    const fetched = await fetchSourceUrl(url, options);
    const extracted = extractReadableText(fetched.rawText, fetched.contentType, options.maxChars);
    if (!extracted.text) {
      throw new SourceFetchError(
        "community_source_url_no_readable_content",
        422,
        "Source URL did not contain readable text.",
      );
    }
    sendJson(res, 200, {
      ok: true,
      final_url: fetched.finalUrl,
      content_type: fetched.contentType,
      title: extracted.title,
      text: extracted.text,
    });
  } catch (error) {
    const isKnown = error instanceof SourceFetchError;
    sendJson(res, isKnown ? error.status : 500, {
      ok: false,
      error_code: isKnown ? error.code : "source_url_fetcher_unavailable",
      error_message: isKnown ? error.message : "Source URL fetcher failed.",
    });
  }
}
