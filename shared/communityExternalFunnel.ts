const MAX_EXTERNAL_FUNNEL_URL_LENGTH = 2048;

/** A public marketing destination. It never grants community access. */
export function normalizeCommunityExternalFunnelUrl(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") throw new Error("community_external_funnel_url_invalid");
  const value = raw.trim();
  if (!value) return null;
  if (value.length > MAX_EXTERNAL_FUNNEL_URL_LENGTH) {
    throw new Error("community_external_funnel_url_too_long");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("community_external_funnel_url_invalid");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !host.includes(".") ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^[\d.:[\]]+$/.test(host)
  ) {
    throw new Error("community_external_funnel_url_invalid");
  }
  return url.href;
}

export function readCommunityExternalFunnelUrl(raw: unknown): string | null {
  try {
    return normalizeCommunityExternalFunnelUrl(raw);
  } catch {
    return null;
  }
}

export function externalFunnelHost(raw: unknown): string | null {
  const value = readCommunityExternalFunnelUrl(raw);
  return value ? new URL(value).hostname : null;
}
