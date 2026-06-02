function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

export function normalizeWebResearchUrl(rawUrl: string): string | null {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return null;
  try {
    const prefixed =
      trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    const url = new URL(prefixed);
    if (url.hostname === "duckduckgo.com" && url.pathname === "/l/") {
      const redirected = url.searchParams.get("uddg");
      if (redirected) {
        return normalizeWebResearchUrl(decodeBasicHtmlEntities(redirected));
      }
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isLiteralIpv4(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function parseIpv4Octets(hostname: string): number[] | null {
  if (!isLiteralIpv4(hostname)) return null;
  const octets = hostname.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return octets;
}

function isDeniedWebResearchHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  const unbracketedHost = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    unbracketedHost === "::1" ||
    unbracketedHost.startsWith("fc") ||
    unbracketedHost.startsWith("fd") ||
    unbracketedHost.startsWith("fe80:")
  ) {
    return true;
  }
  const octets = parseIpv4Octets(host);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

export function classifyWebResearchUrlAccess(rawUrl: string): {
  ok: boolean;
  normalizedUrl: string | null;
  code: "invalid_tool_args" | "web_research_local_url_not_supported" | null;
  message: string | null;
} {
  const normalizedUrl = normalizeWebResearchUrl(rawUrl);
  if (!normalizedUrl) {
    return {
      ok: false,
      normalizedUrl: null,
      code: "invalid_tool_args",
      message: "web_research open_page requires a valid http or https URL.",
    };
  }
  const hostname = new URL(normalizedUrl).hostname;
  if (isDeniedWebResearchHostname(hostname)) {
    return {
      ok: false,
      normalizedUrl,
      code: "web_research_local_url_not_supported",
      message:
        "web_research only opens public web URLs. For sandbox localhost or app previews, use workspace bash/terminal checks or the workspace preview surface.",
    };
  }
  return {
    ok: true,
    normalizedUrl,
    code: null,
    message: null,
  };
}
