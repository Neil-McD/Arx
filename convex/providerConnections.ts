import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

export type ProviderConnectionProvider = "openrouter" | "chatgpt";
export type ProviderConnectionAuthKind = "api_key" | "oauth_tokens";

type ProviderConnectionRow = {
  _id?: unknown;
  userId: unknown;
  provider: ProviderConnectionProvider;
  authKind: ProviderConnectionAuthKind;
  encryptedSecretHex: string;
  secretIvHex: string;
  secretVersion: number;
  keyLastFour?: string | null;
  keyFingerprint?: string | null;
  accountId?: string | null;
  email?: string | null;
  accessTokenExpiresAt?: number | null;
  validatedAt: number;
  createdAt: number;
  updatedAt: number;
};

type PublicOpenRouterConnection = {
  provider: "openrouter";
  auth_kind: "api_key";
  connected: boolean;
  key_last_four: string | null;
  validated_at: string | null;
  updated_at: string | null;
};

type PublicChatgptConnection = {
  provider: "chatgpt";
  auth_kind: "oauth_tokens";
  connected: boolean;
  email: string | null;
  account_id: string | null;
  access_token_expires_at: string | null;
  validated_at: string | null;
  updated_at: string | null;
};

type ProviderAuthStateRow = {
  _id?: unknown;
  userId: unknown;
  provider: "chatgpt";
  state: string;
  codeVerifier: string;
  returnToPath?: string | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
};

type ProviderDeviceAuthStateRow = {
  _id?: unknown;
  userId: unknown;
  provider: "chatgpt";
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  pollIntervalSeconds: number;
  returnToPath?: string | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
};

type StoredChatgptAuthV1 = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  accountId: string | null;
  email: string | null;
  accessTokenExpiresAt: number | null;
};

const CHATGPT_OAUTH_ISSUER = "https://auth.openai.com";
const CHATGPT_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CHATGPT_LOCALHOST_CALLBACK_URL = "http://localhost:1455/auth/callback";
const CHATGPT_DEVICE_VERIFICATION_URL = `${CHATGPT_OAUTH_ISSUER}/codex/device`;
const CHATGPT_DEVICE_CALLBACK_URL = `${CHATGPT_OAUTH_ISSUER}/deviceauth/callback`;

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function firstIsoOrNull(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

function readRequiredEnv(name: string): string {
  const value = normalizeString((globalThis as any)?.process?.env?.[name]);
  if (!value) throw new Error(`${name}_required`);
  return value;
}

const utf8Encoder = new TextEncoder();
let encryptionKeyPromise: Promise<CryptoKey> | null = null;

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const value of bytes) {
    out += value.toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = normalizeString(hex).toLowerCase();
  if (!normalized || normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) {
    throw new Error("invalid_hex");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

async function loadEncryptionKey(): Promise<CryptoKey> {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = (async () => {
      const dbKey = readRequiredEnv("ARX_DB_KEY");
      const seed = utf8Encoder.encode(`arx:user-provider-connections:v1:${dbKey}`);
      const digest = await crypto.subtle.digest("SHA-256", seed);
      return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    })();
  }
  return await encryptionKeyPromise;
}

async function sha256HexText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8Encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function encryptSecret(secret: string): Promise<{
  encryptedSecretHex: string;
  secretIvHex: string;
  secretVersion: number;
}> {
  const key = await loadEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    utf8Encoder.encode(secret),
  );
  return {
    encryptedSecretHex: bytesToHex(new Uint8Array(encrypted)),
    secretIvHex: bytesToHex(iv),
    secretVersion: 1,
  };
}

export async function decryptStoredSecret(row: {
  encryptedSecretHex: string;
  secretIvHex: string;
}): Promise<string> {
  const key = await loadEncryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: hexToBytes(row.secretIvHex),
    },
    key,
    hexToBytes(row.encryptedSecretHex),
  );
  return new TextDecoder().decode(plaintext).trim();
}

function buildDisconnectedOpenRouterConnection(): PublicOpenRouterConnection {
  return {
    provider: "openrouter",
    auth_kind: "api_key",
    connected: false,
    key_last_four: null,
    validated_at: null,
    updated_at: null,
  };
}

function toPublicOpenRouterConnection(row: ProviderConnectionRow | null): PublicOpenRouterConnection {
  if (!row || row.provider !== "openrouter") return buildDisconnectedOpenRouterConnection();
  return {
    provider: "openrouter",
    auth_kind: "api_key",
    connected: true,
    key_last_four: normalizeString(row.keyLastFour) || null,
    validated_at: firstIsoOrNull(row.validatedAt),
    updated_at: firstIsoOrNull(row.updatedAt),
  };
}

function buildDisconnectedChatgptConnection(): PublicChatgptConnection {
  return {
    provider: "chatgpt",
    auth_kind: "oauth_tokens",
    connected: false,
    email: null,
    account_id: null,
    access_token_expires_at: null,
    validated_at: null,
    updated_at: null,
  };
}

function toPublicChatgptConnection(row: ProviderConnectionRow | null): PublicChatgptConnection {
  if (!row || row.provider !== "chatgpt") return buildDisconnectedChatgptConnection();
  return {
    provider: "chatgpt",
    auth_kind: "oauth_tokens",
    connected: true,
    email: normalizeString(row.email) || null,
    account_id: normalizeString(row.accountId) || null,
    access_token_expires_at: firstIsoOrNull(row.accessTokenExpiresAt),
    validated_at: firstIsoOrNull(row.validatedAt),
    updated_at: firstIsoOrNull(row.updatedAt),
  };
}

async function resolveUserIdForAuthenticatedRequest(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<any> {
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  const user = await args.ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
    .first();
  if (!user) throw new Error("user_not_found");
  return user._id;
}

async function resolveActionUser(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<{ userId: any; authSubject: string }> {
  const actor = (await args.ctx.runQuery(api.auth.getActor as any, {
    authState: "authenticated",
    authSubject: args.authSubject ?? undefined,
  })) as { userId?: unknown; authSubject?: unknown } | null;
  const authSubject = normalizeString(actor?.authSubject);
  if (!authSubject) throw new Error("authenticated_user_required");
  const userId = await args.ctx.runQuery(internal.providerConnections.getUserIdByAuthSubjectInternal as any, {
    authSubject,
  });
  if (!userId) throw new Error("authenticated_user_required");
  return { userId, authSubject };
}

async function validateOpenRouterKey(apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/key", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "OpenRouter validation failed.");
  }

  const raw = await response.text();
  if (response.ok) return;

  let message = "";
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    message = normalizeString(parsed?.error?.message) || normalizeString(parsed?.message);
  } catch {
    message = raw.trim();
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Invalid OpenRouter API key.");
  }
  throw new Error(message || `OpenRouter validation failed (${response.status}).`);
}

async function getProviderConnectionRow(ctx: any, userId: any, provider: ProviderConnectionProvider) {
  return (await ctx.db
    .query("userProviderConnections")
    .withIndex("by_user_provider", (q: any) => q.eq("userId", userId).eq("provider", provider))
    .first()) as ProviderConnectionRow | null;
}

function normalizeReturnToPath(value: unknown): string | null {
  const trimmed = normalizeString(value);
  if (!trimmed) return null;
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  return trimmed;
}

function isWebChatgptSpikeEnabled(): boolean {
  const raw = normalizeString((globalThis as any)?.process?.env?.ARX_ENABLE_WEB_CHATGPT_SPIKE).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (const value of bytes) out += String.fromCharCode(value);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(bytesLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLength));
  return bytesToBase64Url(bytes);
}

async function generateChatgptPkce(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = randomBase64Url(32);
  const digest = await crypto.subtle.digest("SHA-256", utf8Encoder.encode(codeVerifier));
  const codeChallenge = bytesToBase64Url(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

function generateChatgptState(): string {
  return randomBase64Url(32);
}

type ParsedChatgptCallbackInput = {
  code: string | null;
  state: string | null;
  oauthError: string | null;
  oauthErrorDescription: string | null;
};

function applySearchParamsToParsedTarget(
  target: ParsedChatgptCallbackInput,
  params: URLSearchParams,
): ParsedChatgptCallbackInput {
  const code = normalizeString(params.get("code"));
  const state = normalizeString(params.get("state"));
  const oauthError = normalizeString(params.get("error"));
  const oauthErrorDescription = normalizeString(params.get("error_description"));
  return {
    code: code || target.code,
    state: state || target.state,
    oauthError: oauthError || target.oauthError,
    oauthErrorDescription: oauthErrorDescription || target.oauthErrorDescription,
  };
}

function parseChatgptCallbackInput(raw: unknown): ParsedChatgptCallbackInput {
  const trimmed = normalizeString(raw);
  let parsed: ParsedChatgptCallbackInput = {
    code: null,
    state: null,
    oauthError: null,
    oauthErrorDescription: null,
  };
  if (!trimmed) return parsed;

  const candidates: string[] = [];
  const urlCandidate =
    /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith("localhost:")
        ? `http://${trimmed}`
        : "";
  if (urlCandidate) {
    try {
      const url = new URL(urlCandidate);
      if (url.search) candidates.push(url.search);
      if (url.hash) candidates.push(url.hash);
    } catch {
      // ignore
    }
  }
  if (trimmed.includes("?")) candidates.push(trimmed.slice(trimmed.indexOf("?")));
  if (trimmed.includes("#")) candidates.push(trimmed.slice(trimmed.indexOf("#")));
  if (trimmed.includes("=")) candidates.push(trimmed);

  for (const candidate of candidates) {
    const normalized = candidate.startsWith("?") || candidate.startsWith("#") ? candidate.slice(1) : candidate;
    parsed = applySearchParamsToParsedTarget(parsed, new URLSearchParams(normalized));
  }

  if (!parsed.code && !parsed.oauthError) {
    const bareToken = trimmed
      .replace(/^https?:\/\/[^?#]+/i, "")
      .replace(/^[?#]/, "")
      .trim();
    if (bareToken && !bareToken.includes("=") && !bareToken.includes("&")) {
      parsed.code = bareToken;
    }
  }

  return parsed;
}

function buildChatgptAuthorizeUrl(params: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(`${CHATGPT_OAUTH_ISSUER}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CHATGPT_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", "openid profile email offline_access");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("state", params.state);
  url.searchParams.set("originator", "codex_cli_rs");
  return url.toString();
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const raw = normalizeString(token);
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

function jwtStringClaim(token: string, key: string): string | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jwtI64Claim(token: string, key: string): number | null {
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

function extractChatgptAccountIdFromToken(token: string): string | null {
  const claims = decodeJwtPayload(token);
  if (!claims) return null;
  return extractChatgptAccountIdFromClaims(claims);
}

function encodeStoredChatgptAuth(value: StoredChatgptAuthV1): string {
  return JSON.stringify({
    idToken: value.idToken,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    accountId: value.accountId ?? null,
    email: value.email ?? null,
    accessTokenExpiresAt: value.accessTokenExpiresAt ?? null,
  });
}

async function exchangeChatgptCodeForTokens(params: {
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
  const parsed = (await response.json()) as {
    id_token?: unknown;
    access_token?: unknown;
    refresh_token?: unknown;
  };
  const idToken = normalizeString(parsed.id_token);
  const accessToken = normalizeString(parsed.access_token);
  const refreshToken = normalizeString(parsed.refresh_token);
  if (!idToken || !accessToken || !refreshToken) {
    throw new Error("ChatGPT login returned incomplete tokens.");
  }
  return {
    idToken,
    accessToken,
    refreshToken,
    accountId: extractChatgptAccountIdFromToken(idToken) || extractChatgptAccountIdFromToken(accessToken),
    email: jwtStringClaim(idToken, "email"),
    accessTokenExpiresAt: jwtI64Claim(accessToken, "exp"),
  };
}

function parseDeviceCodeIntervalSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }
  const parsed = Number.parseInt(normalizeString(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, parsed) : 5;
}

async function requestChatgptDeviceCode(): Promise<{
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  pollIntervalSeconds: number;
}> {
  const response = await fetch(`${CHATGPT_OAUTH_ISSUER}/api/accounts/deviceauth/usercode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CHATGPT_OAUTH_CLIENT_ID,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ChatGPT device-code login failed: ${(body || response.statusText).trim()}`);
  }
  const parsed = (await response.json()) as {
    device_auth_id?: unknown;
    user_code?: unknown;
    usercode?: unknown;
    interval?: unknown;
  };
  const deviceAuthId = normalizeString(parsed.device_auth_id);
  const userCode = normalizeString(parsed.user_code) || normalizeString(parsed.usercode);
  if (!deviceAuthId || !userCode) {
    throw new Error("ChatGPT device-code login returned incomplete data.");
  }
  return {
    deviceAuthId,
    userCode,
    verificationUrl: CHATGPT_DEVICE_VERIFICATION_URL,
    pollIntervalSeconds: parseDeviceCodeIntervalSeconds(parsed.interval),
  };
}

async function pollChatgptDeviceCode(params: {
  deviceAuthId: string;
  userCode: string;
}): Promise<
  | { status: "pending" }
  | {
      status: "authorized";
      authorizationCode: string;
      codeVerifier: string;
      codeChallenge: string;
    }
> {
  const response = await fetch(`${CHATGPT_OAUTH_ISSUER}/api/accounts/deviceauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_auth_id: params.deviceAuthId,
      user_code: params.userCode,
    }),
  });

  if (response.status === 403 || response.status === 404) {
    return { status: "pending" };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ChatGPT device-code polling failed: ${(body || response.statusText).trim()}`);
  }

  const parsed = (await response.json()) as {
    authorization_code?: unknown;
    code_verifier?: unknown;
    code_challenge?: unknown;
  };
  const authorizationCode = normalizeString(parsed.authorization_code);
  const codeVerifier = normalizeString(parsed.code_verifier);
  const codeChallenge = normalizeString(parsed.code_challenge);
  if (!authorizationCode || !codeVerifier) {
    throw new Error("ChatGPT device-code polling returned incomplete authorization data.");
  }
  return {
    status: "authorized",
    authorizationCode,
    codeVerifier,
    codeChallenge,
  };
}

export const getCurrentUserProviderConnections = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const [openrouter, chatgpt] = await Promise.all([
      getProviderConnectionRow(ctx, userId, "openrouter"),
      getProviderConnectionRow(ctx, userId, "chatgpt"),
    ]);
    return {
      openrouter: toPublicOpenRouterConnection(openrouter),
      chatgpt: toPublicChatgptConnection(chatgpt),
    };
  },
});

export const getOpenRouterConnectionForUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await getProviderConnectionRow(ctx, args.userId, "openrouter");
  },
});

export const getUserIdByAuthSubjectInternal = internalQuery({
  args: {
    authSubject: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q: any) => q.eq("authSubject", args.authSubject))
      .first();
    return user?._id ?? null;
  },
});

export const getChatgptConnectionForUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await getProviderConnectionRow(ctx, args.userId, "chatgpt");
  },
});

export const upsertOpenRouterConnectionInternal = internalMutation({
  args: {
    userId: v.id("users"),
    encryptedSecretHex: v.string(),
    secretIvHex: v.string(),
    secretVersion: v.number(),
    keyLastFour: v.string(),
    keyFingerprint: v.string(),
    validatedAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await getProviderConnectionRow(ctx, args.userId, "openrouter");

    const patch = {
      provider: "openrouter" as const,
      authKind: "api_key" as const,
      encryptedSecretHex: args.encryptedSecretHex,
      secretIvHex: args.secretIvHex,
      secretVersion: args.secretVersion,
      keyLastFour: args.keyLastFour,
      keyFingerprint: args.keyFingerprint,
      accountId: undefined,
      email: undefined,
      accessTokenExpiresAt: undefined,
      validatedAt: args.validatedAt,
      updatedAt: args.nowMs,
    };

    if (!existing) {
      const id = await ctx.db.insert("userProviderConnections", {
        userId: args.userId,
        ...patch,
        createdAt: args.nowMs,
      });
      return { id };
    }

    await ctx.db.patch(existing._id, patch);
    return { id: existing._id };
  },
});

export const upsertChatgptConnectionInternal = internalMutation({
  args: {
    userId: v.id("users"),
    encryptedSecretHex: v.string(),
    secretIvHex: v.string(),
    secretVersion: v.number(),
    accountId: v.optional(v.string()),
    email: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    validatedAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await getProviderConnectionRow(ctx, args.userId, "chatgpt");

    const patch = {
      provider: "chatgpt" as const,
      authKind: "oauth_tokens" as const,
      encryptedSecretHex: args.encryptedSecretHex,
      secretIvHex: args.secretIvHex,
      secretVersion: args.secretVersion,
      keyLastFour: undefined,
      keyFingerprint: undefined,
      accountId: normalizeString(args.accountId) || undefined,
      email: normalizeString(args.email) || undefined,
      accessTokenExpiresAt:
        typeof args.accessTokenExpiresAt === "number" && Number.isFinite(args.accessTokenExpiresAt)
          ? Math.floor(args.accessTokenExpiresAt)
          : undefined,
      validatedAt: args.validatedAt,
      updatedAt: args.nowMs,
    };

    if (!existing) {
      const id = await ctx.db.insert("userProviderConnections", {
        userId: args.userId,
        ...patch,
        createdAt: args.nowMs,
      });
      return { id };
    }

    await ctx.db.patch(existing._id, patch);
    return { id: existing._id };
  },
});

export const deleteOpenRouterConnectionInternal = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await getProviderConnectionRow(ctx, args.userId, "openrouter");
    if (!existing) return { deleted: false };
    await ctx.db.delete(existing._id);
    return { deleted: true };
  },
});

export const deleteChatgptConnectionInternal = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await getProviderConnectionRow(ctx, args.userId, "chatgpt");
    if (!existing) return { deleted: false };
    await ctx.db.delete(existing._id);
    return { deleted: true };
  },
});

export const getChatgptAuthStateByStateInternal = internalQuery({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    return (await ctx.db
      .query("userProviderAuthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first()) as ProviderAuthStateRow | null;
  },
});

export const getLatestChatgptAuthStateForUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("userProviderAuthStates")
      .withIndex("by_user_provider", (q) => q.eq("userId", args.userId).eq("provider", "chatgpt"))
      .collect();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    rows.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
    return rows[0] as ProviderAuthStateRow | null;
  },
});

export const upsertChatgptAuthStateInternal = internalMutation({
  args: {
    userId: v.id("users"),
    state: v.string(),
    codeVerifier: v.string(),
    returnToPath: v.optional(v.string()),
    expiresAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existingRows = await ctx.db
      .query("userProviderAuthStates")
      .withIndex("by_user_provider", (q) => q.eq("userId", args.userId).eq("provider", "chatgpt"))
      .collect();
    for (const row of existingRows) {
      await ctx.db.delete(row._id);
    }
    const id = await ctx.db.insert("userProviderAuthStates", {
      userId: args.userId,
      provider: "chatgpt",
      state: normalizeString(args.state),
      codeVerifier: normalizeString(args.codeVerifier),
      returnToPath: normalizeReturnToPath(args.returnToPath) ?? undefined,
      expiresAt: Math.max(args.nowMs + 60_000, Math.floor(args.expiresAt)),
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { id };
  },
});

export const deleteChatgptAuthStateByStateInternal = internalMutation({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userProviderAuthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (!existing) return { deleted: false };
    await ctx.db.delete(existing._id);
    return { deleted: true };
  },
});

export const getChatgptDeviceAuthStateByIdInternal = internalQuery({
  args: {
    id: v.id("userProviderDeviceAuthStates"),
  },
  handler: async (ctx, args) => {
    return (await ctx.db.get(args.id)) as ProviderDeviceAuthStateRow | null;
  },
});

export const getLatestChatgptDeviceAuthStateForUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("userProviderDeviceAuthStates")
      .withIndex("by_user_provider", (q) => q.eq("userId", args.userId).eq("provider", "chatgpt"))
      .collect();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    rows.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
    return rows[0] as ProviderDeviceAuthStateRow | null;
  },
});

export const upsertChatgptDeviceAuthStateInternal = internalMutation({
  args: {
    userId: v.id("users"),
    deviceAuthId: v.string(),
    userCode: v.string(),
    verificationUrl: v.string(),
    pollIntervalSeconds: v.number(),
    returnToPath: v.optional(v.string()),
    expiresAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existingRows = await ctx.db
      .query("userProviderDeviceAuthStates")
      .withIndex("by_user_provider", (q) => q.eq("userId", args.userId).eq("provider", "chatgpt"))
      .collect();
    for (const row of existingRows) {
      await ctx.db.delete(row._id);
    }
    const id = await ctx.db.insert("userProviderDeviceAuthStates", {
      userId: args.userId,
      provider: "chatgpt",
      deviceAuthId: normalizeString(args.deviceAuthId),
      userCode: normalizeString(args.userCode),
      verificationUrl: normalizeString(args.verificationUrl) || CHATGPT_DEVICE_VERIFICATION_URL,
      pollIntervalSeconds: Math.max(1, Math.floor(args.pollIntervalSeconds)),
      returnToPath: normalizeReturnToPath(args.returnToPath) ?? undefined,
      expiresAt: Math.max(args.nowMs + 60_000, Math.floor(args.expiresAt)),
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { id };
  },
});

export const deleteChatgptDeviceAuthStateInternal = internalMutation({
  args: {
    id: v.id("userProviderDeviceAuthStates"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return { deleted: false };
    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});

export const connectOpenRouterApiKey = action({
  args: {
    authSubject: v.optional(v.string()),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const apiKey = normalizeString(args.apiKey);
    if (!apiKey) throw new Error("OpenRouter API key is required.");

    await validateOpenRouterKey(apiKey);

    const validatedAt = Date.now();
    const encrypted = await encryptSecret(apiKey);
    const keyFingerprint = await sha256HexText(apiKey);
    await ctx.runMutation(internal.providerConnections.upsertOpenRouterConnectionInternal as any, {
      userId,
      ...encrypted,
      keyLastFour: apiKey.slice(-4),
      keyFingerprint,
      validatedAt,
      nowMs: validatedAt,
    });

    const row = await ctx.runQuery(internal.providerConnections.getOpenRouterConnectionForUserInternal as any, {
      userId,
    });
    const chatgpt = await ctx.runQuery(internal.providerConnections.getChatgptConnectionForUserInternal as any, {
      userId,
    });
    return {
      openrouter: toPublicOpenRouterConnection((row as ProviderConnectionRow | null) ?? null),
      chatgpt: toPublicChatgptConnection((chatgpt as ProviderConnectionRow | null) ?? null),
    };
  },
});

export const disconnectOpenRouterApiKey = action({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await ctx.runMutation(internal.providerConnections.deleteOpenRouterConnectionInternal as any, {
      userId,
    });
    const chatgpt = await ctx.runQuery(internal.providerConnections.getChatgptConnectionForUserInternal as any, {
      userId,
    });
    return {
      openrouter: buildDisconnectedOpenRouterConnection(),
      chatgpt: toPublicChatgptConnection((chatgpt as ProviderConnectionRow | null) ?? null),
    };
  },
});

export const disconnectChatgpt = action({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await ctx.runMutation(internal.providerConnections.deleteChatgptConnectionInternal as any, {
      userId,
    });
    const openrouter = await ctx.runQuery(internal.providerConnections.getOpenRouterConnectionForUserInternal as any, {
      userId,
    });
    return {
      openrouter: toPublicOpenRouterConnection((openrouter as ProviderConnectionRow | null) ?? null),
      chatgpt: buildDisconnectedChatgptConnection(),
    };
  },
});

export const beginChatgptConnect = action({
  args: {
    authSubject: v.optional(v.string()),
    returnToPath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isWebChatgptSpikeEnabled()) throw new Error("Web ChatGPT auth is disabled.");
    const { userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const returnToPath = normalizeReturnToPath(args.returnToPath) ?? "/";
    const deviceCode = await requestChatgptDeviceCode();
    const nowMs = Date.now();
    const inserted = await ctx.runMutation(internal.providerConnections.upsertChatgptDeviceAuthStateInternal as any, {
      userId,
      deviceAuthId: deviceCode.deviceAuthId,
      userCode: deviceCode.userCode,
      verificationUrl: deviceCode.verificationUrl,
      pollIntervalSeconds: deviceCode.pollIntervalSeconds,
      returnToPath,
      expiresAt: nowMs + 15 * 60_000,
      nowMs,
    });
    return {
      mode: "device_code",
      login_id: String(inserted.id),
      verification_url: deviceCode.verificationUrl,
      user_code: deviceCode.userCode,
      poll_interval_seconds: deviceCode.pollIntervalSeconds,
    };
  },
});

export const beginChatgptManualConnect = action({
  args: {
    authSubject: v.optional(v.string()),
    returnToPath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isWebChatgptSpikeEnabled()) throw new Error("Web ChatGPT auth is disabled.");
    const { userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const returnToPath = normalizeReturnToPath(args.returnToPath) ?? "/";
    const { codeVerifier, codeChallenge } = await generateChatgptPkce();
    const state = generateChatgptState();
    const nowMs = Date.now();
    await ctx.runMutation(internal.providerConnections.upsertChatgptAuthStateInternal as any, {
      userId,
      state,
      codeVerifier,
      returnToPath,
      expiresAt: nowMs + 15 * 60_000,
      nowMs,
    });
    return {
      mode: "browser_callback",
      authorize_url: buildChatgptAuthorizeUrl({
        redirectUri: CHATGPT_LOCALHOST_CALLBACK_URL,
        codeChallenge,
        state,
      }),
    };
  },
});

export const pollChatgptConnect = action({
  args: {
    authSubject: v.optional(v.string()),
    loginId: v.id("userProviderDeviceAuthStates"),
  },
  handler: async (ctx, args) => {
    if (!isWebChatgptSpikeEnabled()) throw new Error("Web ChatGPT auth is disabled.");
    const { userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const stateRow = (await ctx.runQuery(internal.providerConnections.getChatgptDeviceAuthStateByIdInternal as any, {
      id: args.loginId,
    })) as ProviderDeviceAuthStateRow | null;
    if (!stateRow || String(stateRow.userId) !== String(userId)) {
      throw new Error("ChatGPT sign-in state was invalid or expired. Start the connection flow again.");
    }
    const expiresAt = Number(stateRow.expiresAt ?? 0);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      await ctx.runMutation(internal.providerConnections.deleteChatgptDeviceAuthStateInternal as any, {
        id: args.loginId,
      });
      throw new Error("ChatGPT device-code sign-in expired. Start the connection flow again.");
    }

    const pollResult = await pollChatgptDeviceCode({
      deviceAuthId: normalizeString(stateRow.deviceAuthId),
      userCode: normalizeString(stateRow.userCode),
    });
    if (pollResult.status === "pending") {
      return {
        status: "pending",
      };
    }

    const tokens = await exchangeChatgptCodeForTokens({
      code: pollResult.authorizationCode,
      redirectUri: CHATGPT_DEVICE_CALLBACK_URL,
      codeVerifier: pollResult.codeVerifier,
    });
    const encrypted = await encryptSecret(encodeStoredChatgptAuth(tokens));
    const nowMs = Date.now();
    await ctx.runMutation(internal.providerConnections.upsertChatgptConnectionInternal as any, {
      userId,
      ...encrypted,
      accountId: tokens.accountId ?? undefined,
      email: tokens.email ?? undefined,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? undefined,
      validatedAt: nowMs,
      nowMs,
    });
    await ctx.runMutation(internal.providerConnections.deleteChatgptDeviceAuthStateInternal as any, {
      id: args.loginId,
    });

    const openrouter = await ctx.runQuery(internal.providerConnections.getOpenRouterConnectionForUserInternal as any, {
      userId,
    });
    const chatgpt = await ctx.runQuery(internal.providerConnections.getChatgptConnectionForUserInternal as any, {
      userId,
    });
    return {
      status: "connected",
      openrouter: toPublicOpenRouterConnection((openrouter as ProviderConnectionRow | null) ?? null),
      chatgpt: toPublicChatgptConnection((chatgpt as ProviderConnectionRow | null) ?? null),
    };
  },
});

export const completeChatgptConnect = action({
  args: {
    authSubject: v.optional(v.string()),
    callbackInput: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isWebChatgptSpikeEnabled()) throw new Error("Web ChatGPT auth is disabled.");
    const { userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const parsed = parseChatgptCallbackInput(args.callbackInput);
    if (parsed.oauthError) {
      throw new Error(parsed.oauthErrorDescription || parsed.oauthError || "ChatGPT sign-in was denied.");
    }

    const stateRow =
      (parsed.state
        ? ((await ctx.runQuery(internal.providerConnections.getChatgptAuthStateByStateInternal as any, {
            state: parsed.state,
          })) as ProviderAuthStateRow | null)
        : ((await ctx.runQuery(internal.providerConnections.getLatestChatgptAuthStateForUserInternal as any, {
            userId,
          })) as ProviderAuthStateRow | null)) ?? null;

    if (!stateRow || String(stateRow.userId) !== String(userId)) {
      throw new Error("ChatGPT sign-in state was invalid or expired. Start the connection flow again.");
    }
    const expiresAt = Number(stateRow.expiresAt ?? 0);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      throw new Error("ChatGPT sign-in expired. Start the connection flow again.");
    }
    const code = normalizeString(parsed.code);
    if (!code) {
      throw new Error("Paste the full localhost callback URL after OpenAI finishes signing you in.");
    }

    const tokens = await exchangeChatgptCodeForTokens({
      code,
      redirectUri: CHATGPT_LOCALHOST_CALLBACK_URL,
      codeVerifier: normalizeString(stateRow.codeVerifier),
    });
    const encrypted = await encryptSecret(encodeStoredChatgptAuth(tokens));
    const nowMs = Date.now();
    await ctx.runMutation(internal.providerConnections.upsertChatgptConnectionInternal as any, {
      userId,
      ...encrypted,
      accountId: tokens.accountId ?? undefined,
      email: tokens.email ?? undefined,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? undefined,
      validatedAt: nowMs,
      nowMs,
    });
    await ctx.runMutation(internal.providerConnections.deleteChatgptAuthStateByStateInternal as any, {
      state: normalizeString(stateRow.state),
    });

    const openrouter = await ctx.runQuery(internal.providerConnections.getOpenRouterConnectionForUserInternal as any, {
      userId,
    });
    const chatgpt = await ctx.runQuery(internal.providerConnections.getChatgptConnectionForUserInternal as any, {
      userId,
    });
    return {
      openrouter: toPublicOpenRouterConnection((openrouter as ProviderConnectionRow | null) ?? null),
      chatgpt: toPublicChatgptConnection((chatgpt as ProviderConnectionRow | null) ?? null),
    };
  },
});

export { encryptSecret, sha256HexText };
