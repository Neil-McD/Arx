// Pure helpers for community front-end sessions, shared by the backend and tests.

import { POLYNET_CANONICAL_TOOL_NAMES, type PolynetCanonicalToolName } from "./polynetCanonicalToolContract.ts";

// A member session on a community's own domain. Expiry signs the member in
// again through the same invisible hop.
export const COMMUNITY_APP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// One-time sign-in handoff code from Polynet's login to a community's edge.
export const COMMUNITY_APP_HANDOFF_TTL_MS = 60 * 1000;
export const COMMUNITY_APP_HANDOFF_PREFIX = "pnh_";
export const COMMUNITY_APP_TOKEN_PREFIX = "pna_";
export const COMMUNITY_APP_MAX_REQUEST_BYTES = 64 * 1024;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCommunityAppSessionToken(): string {
  return `${COMMUNITY_APP_TOKEN_PREFIX}${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export function generateCommunityAppHandoffCode(): string {
  return `${COMMUNITY_APP_HANDOFF_PREFIX}${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export function isCommunityAppHandoffCode(value: unknown): value is string {
  return typeof value === "string" && /^pnh_[A-Za-z0-9_-]{43}$/.test(value);
}

export function isCommunityAppSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^pna_[A-Za-z0-9_-]{43}$/.test(value);
}

// Sign-in state from a community edge: opaque, URL-safe, bounded.
export function isCommunityAppHandoffState(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22,128}$/.test(value);
}

export async function hashCommunityAppSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readCommunityAppBearerToken(authorization: string | null): string | null {
  const match = /^Bearer (pna_[A-Za-z0-9_-]{43})$/.exec(String(authorization ?? "").trim());
  return match ? match[1] : null;
}

// Exact HTTPS origin, or http on localhost or *.localhost for development. No credentials,
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
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.origin;
  return null;
}

// A front end uses the same five verbs as every other actor.
export function isCommunityAppTool(value: unknown): value is PolynetCanonicalToolName {
  return typeof value === "string" && (POLYNET_CANONICAL_TOOL_NAMES as readonly string[]).includes(value);
}
