// Pure helpers for community app sessions, shared by the backend and tests.

export const COMMUNITY_APP_SESSION_TTL_MS = 15 * 60 * 1000;
export const COMMUNITY_APP_TOKEN_PREFIX = "pna_";
export const COMMUNITY_APP_MAX_REQUEST_BYTES = 64 * 1024;
export const COMMUNITY_APP_TOOLS = [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
] as const;
export type CommunityAppTool = (typeof COMMUNITY_APP_TOOLS)[number];

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCommunityAppSessionToken(): string {
  return `${COMMUNITY_APP_TOKEN_PREFIX}${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export async function hashCommunityAppSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readCommunityAppBearerToken(authorization: string | null): string | null {
  const match = /^Bearer (pna_[A-Za-z0-9_-]{43})$/.exec(String(authorization ?? "").trim());
  return match ? match[1] : null;
}

// Exact HTTPS origin, or http on localhost for development. No credentials,
// path, query or fragment.
export function normalizeCommunityAppOrigin(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.origin;
  return null;
}

export function normalizeCommunityAppSlug(raw: string): string | null {
  const slug = String(raw ?? "").trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) ? slug : null;
}

export function isCommunityAppTool(value: unknown): value is CommunityAppTool {
  return typeof value === "string" && (COMMUNITY_APP_TOOLS as readonly string[]).includes(value);
}

// postMessage protocol between Polynet's shell and an embedded community app.
// The shell only answers requests from the app's exact registered origin and
// only posts to that origin.
export const COMMUNITY_APP_SESSION_REQUEST = "polynet:session:request";
export const COMMUNITY_APP_SESSION_MESSAGE = "polynet:session";
export const COMMUNITY_APP_SESSION_ERROR = "polynet:session:error";

export type CommunityAppSessionMessage = {
  type: typeof COMMUNITY_APP_SESSION_MESSAGE;
  version: 1;
  token: string;
  expires_at: string;
  community_slug: string;
  api_url: string;
};
