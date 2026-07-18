export const INTERACTION_EMBED_RESOLVER_VERSION = 4;
export const INTERACTION_EMBED_REFRESH_SUCCESS_MS = 7 * 24 * 60 * 60 * 1000;
export const INTERACTION_EMBED_REFRESH_LEASE_MS = 15 * 60 * 1000;
export const INTERACTION_EMBED_REFRESH_RETRY_BASE_MS = 6 * 60 * 60 * 1000;
export const INTERACTION_EMBED_REFRESH_RETRY_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export type XPostContext = "post" | "reply" | "quote";

export type XStatusIdentity = {
  statusId: string;
  handle: string | null;
};

export function interactionXStatusIdentity(raw: unknown): XStatusIdentity | null {
  try {
    const parsed = new URL(String(raw ?? ""));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== "443") ||
      (host !== "x.com" && host !== "twitter.com")
    ) return null;
    const match = /^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,24})\/?$/i.exec(parsed.pathname);
    if (!match) return null;
    return {
      statusId: match[2],
      handle: match[1].toLowerCase() === "i" ? null : match[1],
    };
  } catch {
    return null;
  }
}

export function interactionEmbedRefreshRetryMs(failureCount: number): number {
  const boundedCount = Math.max(1, Math.min(Math.floor(failureCount), 16));
  return Math.min(
    INTERACTION_EMBED_REFRESH_RETRY_BASE_MS * 2 ** (boundedCount - 1),
    INTERACTION_EMBED_REFRESH_RETRY_MAX_MS,
  );
}

export function interactionEmbedPreviewIsStale(fetchedAtMs: number | null, nowMs = Date.now()): boolean {
  return fetchedAtMs === null || nowMs - fetchedAtMs >= INTERACTION_EMBED_REFRESH_SUCCESS_MS;
}
