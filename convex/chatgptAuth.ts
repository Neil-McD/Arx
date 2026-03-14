import { internal } from "./_generated/api";
import { decryptStoredSecret, encryptSecret } from "./providerConnections";

const CHATGPT_OAUTH_ISSUER = "https://auth.openai.com";
const CHATGPT_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CHATGPT_OAUTH_SCOPE = "openid profile email offline_access";
const CHATGPT_OAUTH_ORIGINATOR = "codex_cli_rs";

export type StoredChatgptAuthV1 = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  accountId: string | null;
  email: string | null;
  accessTokenExpiresAt: number | null;
};

type ChatgptTokenExchangeResponse = {
  id_token: string;
  access_token: string;
  refresh_token: string;
};

type ChatgptTokenRefreshResponse = {
  id_token?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

export function isWebChatgptSpikeEnabled(): boolean {
  const raw = readEnv("ARX_ENABLE_WEB_CHATGPT_SPIKE").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(bytesLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLength));
  return bytesToBase64Url(bytes);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const raw = String(token ?? "").trim();
  if (!raw) return null;
  try {
    const parts = raw.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function jwtStringClaim(token: string, key: string): string | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function jwtI64Claim(token: string, key: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function extractChatgptAccountIdFromClaims(claims: Record<string, unknown>): string | null {
  const direct = typeof claims.chatgpt_account_id === "string" ? claims.chatgpt_account_id.trim() : "";
  if (direct) return direct;

  const apiAuth = claims["https://api.openai.com/auth"];
  if (apiAuth && typeof apiAuth === "object" && !Array.isArray(apiAuth)) {
    const nested = (apiAuth as Record<string, unknown>).chatgpt_account_id;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }

  const organizations = claims.organizations;
  if (Array.isArray(organizations)) {
    const first = organizations[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const id = (first as Record<string, unknown>).id;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
  }

  return null;
}

export function extractChatgptAccountIdFromToken(token: string): string | null {
  const claims = decodeJwtPayload(token);
  if (!claims) return null;
  return extractChatgptAccountIdFromClaims(claims);
}

export async function generateChatgptPkce(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = randomBase64Url(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = bytesToBase64Url(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

export function generateChatgptState(): string {
  return randomBase64Url(32);
}

export function buildChatgptAuthorizeUrl(params: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const base = `${CHATGPT_OAUTH_ISSUER}/oauth/authorize`;
  const url = new URL(base);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CHATGPT_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", CHATGPT_OAUTH_SCOPE);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("state", params.state);
  url.searchParams.set("originator", CHATGPT_OAUTH_ORIGINATOR);
  return url.toString();
}

export async function exchangeChatgptCodeForTokens(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<StoredChatgptAuthV1> {
  const response = await fetch(`${CHATGPT_OAUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: CHATGPT_OAUTH_CLIENT_ID,
      code_verifier: params.codeVerifier,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ChatGPT login failed: ${(body || response.statusText).trim()}`);
  }
  const parsed = (await response.json()) as ChatgptTokenExchangeResponse;
  return {
    idToken: String(parsed.id_token ?? "").trim(),
    accessToken: String(parsed.access_token ?? "").trim(),
    refreshToken: String(parsed.refresh_token ?? "").trim(),
    accountId:
      extractChatgptAccountIdFromToken(String(parsed.id_token ?? "")) ||
      extractChatgptAccountIdFromToken(String(parsed.access_token ?? "")),
    email: jwtStringClaim(String(parsed.id_token ?? ""), "email"),
    accessTokenExpiresAt: jwtI64Claim(String(parsed.access_token ?? ""), "exp"),
  };
}

export async function refreshChatgptTokens(refreshToken: string): Promise<StoredChatgptAuthV1 | null> {
  const trimmedRefreshToken = String(refreshToken ?? "").trim();
  if (!trimmedRefreshToken) return null;
  const response = await fetch(`${CHATGPT_OAUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CHATGPT_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: trimmedRefreshToken,
      scope: "openid profile email",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ChatGPT refresh failed: ${(body || response.statusText).trim()}`);
  }
  const parsed = (await response.json()) as ChatgptTokenRefreshResponse;
  const idToken = String(parsed.id_token ?? "").trim();
  const accessToken = String(parsed.access_token ?? "").trim();
  const nextRefreshToken = String(parsed.refresh_token ?? trimmedRefreshToken).trim() || trimmedRefreshToken;
  return {
    idToken,
    accessToken,
    refreshToken: nextRefreshToken,
    accountId: extractChatgptAccountIdFromToken(idToken) || extractChatgptAccountIdFromToken(accessToken),
    email: jwtStringClaim(idToken, "email"),
    accessTokenExpiresAt: jwtI64Claim(accessToken, "exp"),
  };
}

export function encodeStoredChatgptAuth(value: StoredChatgptAuthV1): string {
  return JSON.stringify({
    idToken: value.idToken,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    accountId: value.accountId ?? null,
    email: value.email ?? null,
    accessTokenExpiresAt: value.accessTokenExpiresAt ?? null,
  });
}

export function decodeStoredChatgptAuth(raw: string): StoredChatgptAuthV1 | null {
  try {
    const parsed = JSON.parse(String(raw ?? "")) as Record<string, unknown>;
    const idToken = String(parsed.idToken ?? "").trim();
    const accessToken = String(parsed.accessToken ?? "").trim();
    const refreshToken = String(parsed.refreshToken ?? "").trim();
    if (!idToken || !accessToken || !refreshToken) return null;
    const accessTokenExpiresAt =
      typeof parsed.accessTokenExpiresAt === "number" && Number.isFinite(parsed.accessTokenExpiresAt)
        ? Math.floor(parsed.accessTokenExpiresAt)
        : jwtI64Claim(accessToken, "exp");
    const accountId =
      String(parsed.accountId ?? "").trim() ||
      extractChatgptAccountIdFromToken(idToken) ||
      extractChatgptAccountIdFromToken(accessToken);
    const email = String(parsed.email ?? "").trim() || jwtStringClaim(idToken, "email");
    return {
      idToken,
      accessToken,
      refreshToken,
      accountId: accountId || null,
      email: email || null,
      accessTokenExpiresAt,
    };
  } catch {
    return null;
  }
}

async function loadStoredChatgptAuthForUser(ctx: any, userId: string): Promise<StoredChatgptAuthV1 | null> {
  const row = (await ctx.runQuery(internal.providerConnections.getChatgptConnectionForUserInternal as any, {
    userId,
  })) as { encryptedSecretHex?: unknown; secretIvHex?: unknown } | null;
  if (!row?.encryptedSecretHex || !row?.secretIvHex) return null;
  try {
    const secret = await decryptStoredSecret({
      encryptedSecretHex: String(row.encryptedSecretHex),
      secretIvHex: String(row.secretIvHex),
    });
    return decodeStoredChatgptAuth(secret);
  } catch {
    return null;
  }
}

async function persistStoredChatgptAuthForUser(ctx: any, userId: string, value: StoredChatgptAuthV1, nowMs: number) {
  const encrypted = await encryptSecret(encodeStoredChatgptAuth(value));
  await ctx.runMutation(internal.providerConnections.upsertChatgptConnectionInternal as any, {
    userId,
    ...encrypted,
    accountId: value.accountId ?? undefined,
    email: value.email ?? undefined,
    accessTokenExpiresAt: value.accessTokenExpiresAt ?? undefined,
    validatedAt: nowMs,
    nowMs,
  });
}

export async function getFreshChatgptAuthForUser(params: {
  ctx: any;
  userId: string;
  forceRefresh?: boolean;
}): Promise<StoredChatgptAuthV1 | null> {
  const current = await loadStoredChatgptAuthForUser(params.ctx, params.userId);
  if (!current) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const shouldRefresh =
    params.forceRefresh === true ||
    (typeof current.accessTokenExpiresAt === "number" && current.accessTokenExpiresAt > 0 && nowSec + 60 >= current.accessTokenExpiresAt);
  if (!shouldRefresh) return current;
  if (!current.refreshToken.trim()) return current;

  try {
    const refreshed = await refreshChatgptTokens(current.refreshToken);
    if (!refreshed?.accessToken || !refreshed.idToken || !refreshed.refreshToken) {
      throw new Error("refresh_incomplete");
    }
    const merged: StoredChatgptAuthV1 = {
      idToken: refreshed.idToken || current.idToken,
      accessToken: refreshed.accessToken || current.accessToken,
      refreshToken: refreshed.refreshToken || current.refreshToken,
      accountId: refreshed.accountId || current.accountId || null,
      email: refreshed.email || current.email || null,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt ?? current.accessTokenExpiresAt ?? null,
    };
    await persistStoredChatgptAuthForUser(params.ctx, params.userId, merged, Date.now());
    return merged;
  } catch {
    await params.ctx.runMutation(internal.providerConnections.deleteChatgptConnectionInternal as any, {
      userId: params.userId,
    });
    return null;
  }
}
