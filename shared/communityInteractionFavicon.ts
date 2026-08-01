const BLOCKED_FAVICON_HOSTNAMES = new Set(["localhost"]);
const BLOCKED_FAVICON_HOSTNAME_SUFFIXES = [
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
const COMMON_COUNTRY_CODE_SECOND_LEVEL_LABELS = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "org",
]);

function normalizedPublicHostname(raw: string): string | null {
  const hostname = raw.trim().toLowerCase().replace(/\.+$/, "");
  if (
    !hostname ||
    !hostname.includes(".") ||
    hostname.includes(":") ||
    /^\d+(?:\.\d+){3}$/.test(hostname) ||
    BLOCKED_FAVICON_HOSTNAMES.has(hostname) ||
    BLOCKED_FAVICON_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return null;
  }
  const labels = hostname.split(".");
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    ? hostname
    : null;
}

function immediateParentHostname(hostname: string): string | null {
  const labels = hostname.split(".");
  if (labels.length < 3) return null;
  if (
    labels.length === 3 &&
    labels[2]?.length === 2 &&
    COMMON_COUNTRY_CODE_SECOND_LEVEL_LABELS.has(labels[1] ?? "")
  ) {
    return null;
  }
  return normalizedPublicHostname(labels.slice(1).join("."));
}

export function communityInteractionFaviconCandidates(rawHref: unknown): string[] {
  try {
    const url = new URL(String(rawHref ?? ""));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return [];
    }
    const hostname = normalizedPublicHostname(url.hostname);
    if (!hostname) return [];

    const candidates = [`https://${hostname}/favicon.ico`];
    const parentHostname = immediateParentHostname(hostname);
    if (parentHostname && parentHostname !== hostname) {
      candidates.push(`https://${parentHostname}/favicon.ico`);
    }
    return candidates;
  } catch {
    return [];
  }
}
