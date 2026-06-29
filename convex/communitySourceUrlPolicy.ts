export const COMMUNITY_SOURCE_URL_DENIED_HOSTNAME_SUFFIXES = [
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

export function normalizeCommunitySourcePolicyString(value: unknown, maxLength = 2_000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeHostname(rawHostname: string): string {
  let hostname = String(rawHostname ?? "").trim().toLowerCase();
  if (hostname.startsWith("[") && hostname.endsWith("]")) hostname = hostname.slice(1, -1);
  return hostname.replace(/\.+$/, "");
}

function isLiteralIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const parts = hostname.split(".").map((part) => Number(part));
  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function ipv4ToNumber(value: string): number | null {
  if (!isLiteralIpv4(value)) return null;
  const parts = value.split(".").map((part) => Number(part));
  return parts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
}

function isIpv4InRange(value: string, base: string, prefixLength: number): boolean {
  const addressNumber = ipv4ToNumber(value);
  const baseNumber = ipv4ToNumber(base);
  if (addressNumber === null || baseNumber === null) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (addressNumber & mask) === (baseNumber & mask);
}

function isPrivateOrReservedIpv4(value: string): boolean {
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

function hasEmbeddedPrivateIpv4(hostname: string): boolean {
  const candidates = hostname.replace(/-/g, ".").match(/\d{1,3}(?:\.\d{1,3}){3}/g) ?? [];
  return candidates.some((candidate) => isLiteralIpv4(candidate) && isPrivateOrReservedIpv4(candidate));
}

export function isDeniedCommunitySourceHostname(rawHostname: string): boolean {
  const hostname = normalizeHostname(rawHostname);
  return (
    !hostname ||
    hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    hostname.includes(":") ||
    hostname.startsWith("[") ||
    hostname.endsWith("]") ||
    /^\d+$/.test(hostname) ||
    isLiteralIpv4(hostname) ||
    hasEmbeddedPrivateIpv4(hostname) ||
    COMMUNITY_SOURCE_URL_DENIED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

export function requireSafeCommunitySourceUrl(raw: unknown, maxLength = 2_000): string {
  const input = normalizeCommunitySourcePolicyString(raw, maxLength);
  if (!input) throw new Error("community_source_url_required");
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("community_source_url_invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("community_source_url_https_required");
  }
  if (parsed.username || parsed.password) {
    throw new Error("community_source_url_credentials_not_supported");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("community_source_url_port_not_supported");
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (isDeniedCommunitySourceHostname(hostname)) {
    throw new Error("community_source_url_private_or_local");
  }
  parsed.hostname = hostname;
  parsed.hash = "";
  return parsed.toString();
}

export function maybeSafeCommunitySourceUrl(raw: unknown, maxLength = 2_000): string | null {
  try {
    return requireSafeCommunitySourceUrl(raw, maxLength);
  } catch {
    return null;
  }
}

export function requireSafeCommunitySourceFetcherEndpoint(raw: unknown, maxLength = 2_000): string {
  const input = normalizeCommunitySourcePolicyString(raw, maxLength);
  if (!input) throw new Error("community_source_url_fetcher_not_configured");
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("community_source_url_fetcher_invalid");
  }
  if (parsed.protocol !== "https:") throw new Error("community_source_url_fetcher_invalid");
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("community_source_url_fetcher_invalid");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("community_source_url_fetcher_invalid");
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (isDeniedCommunitySourceHostname(hostname)) {
    throw new Error("community_source_url_fetcher_invalid");
  }
  parsed.hostname = hostname;
  return parsed.toString();
}
