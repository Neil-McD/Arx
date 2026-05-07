import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import {
  type AppConnectionRow,
  type DeveloperAppRow,
  normalizeString,
} from "./appCore";
import {
  decryptStoredSecret,
  encryptSecret,
  sha256HexText,
} from "./providerConnections";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import {
  findDiscoverAppCatalogEntryById,
  resolveDiscoverAppCatalogConnectPolicy,
} from "../shared/discoverCatalog";

type StoredOAuthTokenBundleV1 = {
  kind: "oauth_tokens_v1";
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  expiresAt: number | null;
  clientId: string;
  clientSecret: string | null;
  tokenEndpoint: string;
  issuer: string | null;
  resource: string;
  tokenResourceMode: OAuthTokenResourceMode;
};

type OAuthTokenResourceMode = "token_and_refresh" | "authorize_only";

type OAuthMetadata = {
  issuer?: unknown;
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
  registration_endpoint?: unknown;
  code_challenge_methods_supported?: unknown;
  scopes_supported?: unknown;
};

type ClientCredentials = {
  client_id?: unknown;
  client_secret?: unknown;
};

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
};

type AppOAuthFinalizeResult = {
  ok: boolean;
  catalog_app_id: string | null;
  mount_id?: string | null;
  validation_status?: string | null;
  error_message?: string | null;
};

const APP_OAUTH_STATE_TTL_MS = 10 * 60_000;
const APP_OAUTH_REFRESH_WINDOW_MS = 60_000;
const APP_OAUTH_JSON_MAX_BYTES = 128_000;
const APP_OAUTH_HTTP_TIMEOUT_MS = 10_000;
const APP_OAUTH_FINALIZE_PROCESSING_TIMEOUT_MS = 2 * 60_000;
const DEFAULT_NOTION_MCP_ENDPOINT = "https://mcp.notion.com/mcp";

function resolveOAuthTokenResourceMode(catalogAppId: unknown): OAuthTokenResourceMode {
  // Notion's MCP OAuth guide currently omits `resource` from token and refresh
  // requests even though its authorization URL accepts MCP resource binding.
  return normalizeString(catalogAppId, 120) === "notion"
    ? "authorize_only"
    : "token_and_refresh";
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function normalizeReturnToPath(value: unknown): string {
  const trimmed = normalizeString(value, 2_000);
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/discover";
  }
  return trimmed;
}

function parseFinalizeResultJson(raw: unknown): AppOAuthFinalizeResult | null {
  try {
    const parsed = JSON.parse(normalizeString(raw, 4_000));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return {
      ok: record.ok === true,
      catalog_app_id: normalizeString(record.catalog_app_id, 120) || null,
      mount_id: normalizeString(record.mount_id, 200) || null,
      validation_status: normalizeString(record.validation_status, 200) || null,
      error_message: normalizeString(record.error_message, 500) || null,
    };
  } catch {
    return null;
  }
}

function stringifyFinalizeResult(result: AppOAuthFinalizeResult): string {
  return JSON.stringify({
    ok: result.ok === true,
    catalog_app_id: result.catalog_app_id ?? null,
    mount_id: result.mount_id ?? null,
    validation_status: result.validation_status ?? null,
    error_message: result.error_message ?? null,
  });
}

function normalizeHttpsOrLocalOrigin(value: unknown): string | null {
  const raw = normalizeString(value, 2_000).replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    const local = hostname === "localhost" || hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeHttpsUrl(value: unknown, maxLength = 2_000): string {
  const raw = normalizeString(value, maxLength);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password || parsed.hash) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeHttpsIssuer(value: unknown): string {
  const raw = normalizeString(value, 2_000);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return "";
    parsed.pathname = parsed.pathname.replace(/\/+$/g, "") || "/";
    return parsed.toString();
  } catch {
    return "";
  }
}

function resolveCallbackOrigin(fallback: unknown): string {
  const envOrigin = normalizeHttpsOrLocalOrigin(
    readEnv("ARX_APP_OAUTH_CALLBACK_BASE_URL") ||
      readEnv("CONVEX_SITE_URL") ||
      readEnv("VITE_CONVEX_SITE_URL") ||
      readEnv("PUBLIC_CONVEX_SITE_URL"),
  );
  if (envOrigin) return envOrigin;
  const fallbackOrigin = normalizeHttpsOrLocalOrigin(fallback);
  if (fallbackOrigin) return fallbackOrigin;
  throw new Error("app_oauth_callback_origin_missing");
}

function buildCallbackUri(callbackBaseUrl: unknown): string {
  return `${resolveCallbackOrigin(callbackBaseUrl)}/app-oauth/callback`;
}

function buildPublicRedirectUrl(params: {
  returnToPath: string;
  status: "connected" | "error" | "pending";
  catalogAppId?: string | null;
  message?: string | null;
  state?: string | null;
  finalizeToken?: string | null;
}): string {
  let origin = "https://polynet.ai";
  try {
    origin = readCanonicalPublicAppOrigin();
  } catch {
    // Use the product origin as a last-resort redirect target.
  }
  const url = new URL(params.returnToPath || "/discover", origin);
  url.searchParams.set("app_oauth", params.status);
  if (params.catalogAppId) url.searchParams.set("catalog_app_id", params.catalogAppId);
  if (params.message) url.searchParams.set("app_oauth_message", params.message.slice(0, 300));
  if (params.state) url.searchParams.set("app_oauth_state", params.state);
  if (params.finalizeToken) {
    url.searchParams.set("app_oauth_finalize_token", params.finalizeToken);
  }
  return url.toString();
}

function randomBase64Url(byteCount: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function readBoundedResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (
    Number.isFinite(contentLength) &&
    contentLength > APP_OAUTH_JSON_MAX_BYTES
  ) {
    throw new Error("app_oauth_response_too_large");
  }
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > APP_OAUTH_JSON_MAX_BYTES) {
        await reader.cancel();
        throw new Error("app_oauth_response_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function readBoundedJson(response: Response): Promise<any> {
  const text = await readBoundedResponseText(response);
  return JSON.parse(text);
}

async function fetchOAuthJson(params: {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ ok: boolean; status: number; payload: any | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    APP_OAUTH_HTTP_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await fetch(params.url, {
      method: params.method,
      redirect: "manual",
      headers: params.headers,
      body: params.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("app_oauth_request_timed_out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, status: response.status, payload: null };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, payload: null };
  }
  return {
    ok: true,
    status: response.status,
    payload: await readBoundedJson(response),
  };
}

function buildProtectedResourceMetadataUrls(mcpServerUrl: string): string[] {
  const parsed = new URL(mcpServerUrl);
  const resourcePath = parsed.pathname.replace(/\/+$/g, "");
  const pathInsertion = new URL(
    `/.well-known/oauth-protected-resource${resourcePath}`,
    parsed.origin,
  ).toString();
  const legacyPathAppend = resourcePath
    ? new URL(
        `${resourcePath}/.well-known/oauth-protected-resource`,
        parsed.origin,
      ).toString()
    : "";
  const root = new URL(
    "/.well-known/oauth-protected-resource",
    parsed.origin,
  ).toString();
  return [...new Set([pathInsertion, root, legacyPathAppend].filter(Boolean))];
}

function buildAuthorizationServerMetadataUrls(authServer: string): string[] {
  const parsed = new URL(authServer);
  const issuerPath = parsed.pathname.replace(/\/+$/g, "");
  const oauthPathInsertion = new URL(
    issuerPath
      ? `/.well-known/oauth-authorization-server${issuerPath}`
      : "/.well-known/oauth-authorization-server",
    parsed.origin,
  ).toString();
  const oidcPathInsertion = new URL(
    issuerPath
      ? `/.well-known/openid-configuration${issuerPath}`
      : "/.well-known/openid-configuration",
    parsed.origin,
  ).toString();
  const oidcPathAppend = issuerPath
    ? new URL(`${issuerPath}/.well-known/openid-configuration`, parsed.origin).toString()
    : "";
  return [...new Set([oauthPathInsertion, oidcPathInsertion, oidcPathAppend].filter(Boolean))];
}

async function discoverOAuthMetadata(mcpServerUrl: string): Promise<{
  issuer: string | null;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  scope: string | null;
  resource: string;
}> {
  let protectedResource: any = null;
  for (const metadataUrl of buildProtectedResourceMetadataUrls(mcpServerUrl)) {
    const response = await fetchOAuthJson({
      url: metadataUrl,
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      protectedResource = response.payload;
      break;
    }
  }
  const authServers = Array.isArray(protectedResource?.authorization_servers)
    ? protectedResource.authorization_servers
    : [];
  const authServer = normalizeHttpsIssuer(authServers[0]);
  if (!authServer) throw new Error("app_oauth_authorization_server_missing");

  let metadata: OAuthMetadata | null = null;
  for (const metadataUrl of buildAuthorizationServerMetadataUrls(authServer)) {
    const response = await fetchOAuthJson({
      url: metadataUrl,
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      metadata = response.payload as OAuthMetadata;
      break;
    }
  }
  if (!metadata) throw new Error("app_oauth_metadata_unavailable");
  const authorizationEndpoint = normalizeHttpsUrl(
    metadata.authorization_endpoint,
  );
  const tokenEndpoint = normalizeHttpsUrl(metadata.token_endpoint);
  const registrationEndpoint = normalizeHttpsUrl(
    metadata.registration_endpoint,
  );
  if (!authorizationEndpoint || !tokenEndpoint || !registrationEndpoint) {
    throw new Error("app_oauth_metadata_incomplete");
  }
  const codeChallengeMethods = Array.isArray(
    metadata.code_challenge_methods_supported,
  )
    ? metadata.code_challenge_methods_supported.map((method) =>
        normalizeString(method, 40),
      )
    : [];
  if (!codeChallengeMethods.includes("S256")) {
    throw new Error("app_oauth_pkce_s256_required");
  }
  const scopesSupported = Array.isArray(metadata.scopes_supported)
    ? metadata.scopes_supported.map((scope) => normalizeString(scope, 80)).filter(Boolean)
    : [];
  return {
    issuer: normalizeString(metadata.issuer, 2_000) || authServer,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint,
    scope: scopesSupported.includes("offline_access") ? "offline_access" : null,
    resource: new URL(mcpServerUrl).toString(),
  };
}

async function registerOAuthClient(params: {
  metadata: Awaited<ReturnType<typeof discoverOAuthMetadata>>;
  redirectUri: string;
}): Promise<{ clientId: string; clientSecret: string | null }> {
  const body = {
    client_name: "Polynet",
    client_uri: "https://polynet.ai",
    redirect_uris: [params.redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    ...(params.metadata.scope ? { scope: params.metadata.scope } : null),
  };
  const response = await fetchOAuthJson({
    url: params.metadata.registrationEndpoint,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("app_oauth_client_registration_failed");
  const parsed = response.payload as ClientCredentials;
  const clientId = normalizeString(parsed.client_id, 2_000);
  if (!clientId) throw new Error("app_oauth_client_registration_incomplete");
  return {
    clientId,
    clientSecret: normalizeString(parsed.client_secret, 2_000) || null,
  };
}

function normalizeTokenResponse(args: {
  parsed: TokenResponse;
  existing?: StoredOAuthTokenBundleV1 | null;
  tokenEndpoint: string;
  issuer: string | null;
  clientId: string;
  clientSecret: string | null;
  resource: string;
  tokenResourceMode: OAuthTokenResourceMode;
  nowMs: number;
}): StoredOAuthTokenBundleV1 {
  const accessToken = normalizeString(args.parsed.access_token, 20_000);
  if (!accessToken) throw new Error("app_oauth_access_token_missing");
  const expiresIn = Number(args.parsed.expires_in ?? "");
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? args.nowMs + Math.floor(expiresIn * 1000)
      : null;
  return {
    kind: "oauth_tokens_v1",
    accessToken,
    refreshToken:
      normalizeString(args.parsed.refresh_token, 20_000) ||
      args.existing?.refreshToken ||
      null,
    tokenType:
      normalizeString(args.parsed.token_type, 80) ||
      args.existing?.tokenType ||
      "Bearer",
    scope:
      normalizeString(args.parsed.scope, 2_000) ||
      args.existing?.scope ||
      null,
    expiresAt,
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    tokenEndpoint: args.tokenEndpoint,
    issuer: args.issuer,
    resource: args.resource,
    tokenResourceMode: args.tokenResourceMode,
  };
}

async function exchangeCodeForTokenBundle(params: {
  catalogAppId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  tokenEndpoint: string;
  issuer: string | null;
  clientId: string;
  clientSecret: string | null;
  resource: string;
  scope: string | null;
  nowMs: number;
}): Promise<StoredOAuthTokenBundleV1> {
  const tokenResourceMode = resolveOAuthTokenResourceMode(params.catalogAppId);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });
  if (tokenResourceMode === "token_and_refresh") {
    body.set("resource", params.resource);
  }
  if (params.clientSecret) body.set("client_secret", params.clientSecret);
  const response = await fetchOAuthJson({
    url: params.tokenEndpoint,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!response.ok) throw new Error("app_oauth_token_exchange_failed");
  const parsed = response.payload as TokenResponse;
  return normalizeTokenResponse({
    parsed,
    tokenEndpoint: params.tokenEndpoint,
    issuer: params.issuer,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    resource: params.resource,
    tokenResourceMode,
    nowMs: params.nowMs,
  });
}

async function refreshTokenBundle(
  bundle: StoredOAuthTokenBundleV1,
): Promise<StoredOAuthTokenBundleV1> {
  if (!bundle.refreshToken) throw new Error("developer_app_oauth_reauth_required");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: bundle.refreshToken,
    client_id: bundle.clientId,
  });
  if (bundle.tokenResourceMode === "token_and_refresh") {
    body.set("resource", bundle.resource);
  }
  if (bundle.clientSecret) body.set("client_secret", bundle.clientSecret);
  const response = await fetchOAuthJson({
    url: bundle.tokenEndpoint,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!response.ok) throw new Error("developer_app_oauth_reauth_required");
  const parsed = response.payload as TokenResponse;
  return normalizeTokenResponse({
    parsed,
    existing: bundle,
    tokenEndpoint: bundle.tokenEndpoint,
    issuer: bundle.issuer,
    clientId: bundle.clientId,
    clientSecret: bundle.clientSecret,
    resource: bundle.resource,
    tokenResourceMode: bundle.tokenResourceMode,
    nowMs: Date.now(),
  });
}

function parseStoredOAuthTokenBundle(raw: unknown): StoredOAuthTokenBundleV1 | null {
  try {
    const parsed = JSON.parse(normalizeString(raw, 100_000));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.kind !== "oauth_tokens_v1") return null;
    const accessToken = normalizeString(record.accessToken, 20_000);
    const clientId = normalizeString(record.clientId, 2_000);
    const tokenEndpoint = normalizeString(record.tokenEndpoint, 2_000);
    const resource = normalizeHttpsUrl(record.resource, 2_000);
    const tokenResourceMode =
      record.tokenResourceMode === "authorize_only"
        ? "authorize_only"
        : "token_and_refresh";
    if (!accessToken || !clientId || !tokenEndpoint || !resource) return null;
    const expiresAt = Number(record.expiresAt ?? "");
    return {
      kind: "oauth_tokens_v1",
      accessToken,
      refreshToken: normalizeString(record.refreshToken, 20_000) || null,
      tokenType: normalizeString(record.tokenType, 80) || "Bearer",
      scope: normalizeString(record.scope, 2_000) || null,
      expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null,
      clientId,
      clientSecret: normalizeString(record.clientSecret, 2_000) || null,
      tokenEndpoint,
      issuer: normalizeString(record.issuer, 2_000) || null,
      resource,
      tokenResourceMode,
    };
  } catch {
    return null;
  }
}

async function storeOAuthTokenBundle(args: {
  ctx: any;
  developerAppId: any;
  bundle: StoredOAuthTokenBundleV1;
  nowMs: number;
  lastValidatedAt?: number;
}): Promise<void> {
  const encrypted = await encryptSecret(JSON.stringify(args.bundle));
  await args.ctx.runMutation(internal.appConnections.upsertAppConnectionInternal, {
    developerAppId: args.developerAppId,
    connectionStatus: "connected",
    authKind: "oauth_tokens",
    encryptedSecretHex: encrypted.encryptedSecretHex,
    secretIvHex: encrypted.secretIvHex,
    secretVersion: encrypted.secretVersion,
    lastValidatedAt: args.lastValidatedAt,
    nowMs: args.nowMs,
  });
}

async function resolveAuthenticatedActionUser(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<{ userId: any; authSubject: string }> {
  const actor = (await args.ctx.runQuery(
    internal.authActor.resolveAuthenticatedActorInternal as any,
    {
      authSubject: args.authSubject ?? undefined,
    },
  )) as { authSubject?: unknown; dbUserId?: unknown } | null;
  const authSubject = normalizeString(actor?.authSubject, 200);
  const userId = actor?.dbUserId;
  if (!authSubject || !userId) throw new Error("authenticated_user_required");
  return {
    userId,
    authSubject,
  };
}

export const getAppOAuthStateByStateInternal = internalQuery({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("appOAuthStates")
      .withIndex("by_state", (q: any) => q.eq("state", args.state))
      .first();
  },
});

export const insertAppOAuthStateInternal = internalMutation({
  args: {
    userId: v.id("users"),
    catalogAppId: v.string(),
    state: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
    returnToPath: v.string(),
    endpointUrl: v.string(),
    clientId: v.string(),
    clientSecretEncryptedHex: v.optional(v.string()),
    clientSecretIvHex: v.optional(v.string()),
    clientSecretVersion: v.optional(v.number()),
    authorizationEndpoint: v.string(),
    tokenEndpoint: v.string(),
    resource: v.string(),
    issuer: v.optional(v.string()),
    scope: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("appOAuthStates")
      .withIndex("by_user_catalogAppId", (q: any) =>
        q.eq("userId", args.userId).eq("catalogAppId", args.catalogAppId),
      )
      .collect();
    for (const row of existing) {
      if (Number(row.expiresAt ?? 0) <= args.createdAt) {
        await ctx.db.delete(row._id);
      }
    }
    return await ctx.db.insert("appOAuthStates", args);
  },
});

export const patchAppOAuthStateCallbackInternal = internalMutation({
  args: {
    stateId: v.id("appOAuthStates"),
    callbackCodeEncryptedHex: v.optional(v.string()),
    callbackCodeIvHex: v.optional(v.string()),
    callbackCodeVersion: v.optional(v.number()),
    finalizeTokenHash: v.optional(v.string()),
    callbackReceivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId, {
      callbackCodeEncryptedHex: args.callbackCodeEncryptedHex,
      callbackCodeIvHex: args.callbackCodeIvHex,
      callbackCodeVersion: args.callbackCodeVersion,
      finalizeTokenHash: args.finalizeTokenHash,
      callbackReceivedAt: args.callbackReceivedAt,
    });
    return { patched: true };
  },
});

export const deleteAppOAuthStateInternal = internalMutation({
  args: {
    stateId: v.id("appOAuthStates"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.stateId);
    if (!existing) return { deleted: false };
    await ctx.db.delete(args.stateId);
    return { deleted: true };
  },
});

export const claimAppOAuthFinalizeInternal = internalMutation({
  args: {
    state: v.string(),
    userId: v.id("users"),
    finalizeTokenHash: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const row = await ctx.db
      .query("appOAuthStates")
      .withIndex("by_state", (q: any) => q.eq("state", args.state))
      .first();
    if (!row) {
      return {
        status: "missing",
        result: {
          ok: false,
          catalog_app_id: null,
          error_message: "OAuth connection was not found. Start again.",
        },
      };
    }
    const catalogAppId = normalizeString(row.catalogAppId, 120);
    if (String(row.userId) !== String(args.userId)) {
      await ctx.db.delete(row._id);
      return {
        status: "wrong_user",
        result: {
          ok: false,
          catalog_app_id: catalogAppId,
          error_message:
            "OAuth connection must be finished by the Polynet account that started it.",
        },
      };
    }
    if (args.nowMs > Number(row.expiresAt ?? 0)) {
      await ctx.db.delete(row._id);
      return {
        status: "expired",
        result: {
          ok: false,
          catalog_app_id: catalogAppId,
          error_message: "OAuth connection expired. Start again.",
        },
      };
    }
    if (
      !normalizeString(row.finalizeTokenHash, 200) ||
      normalizeString(row.finalizeTokenHash, 200) !== args.finalizeTokenHash
    ) {
      throw new Error("app_oauth_finalize_token_mismatch");
    }
    const completedResult = parseFinalizeResultJson(row.finalizeResultJson);
    if (row.finalizeStatus === "completed" && completedResult) {
      return { status: "completed", result: completedResult };
    }
    if (row.finalizeStatus === "failed") {
      return {
        status: "failed",
        result:
          completedResult ?? {
            ok: false,
            catalog_app_id: catalogAppId,
            error_message:
              normalizeString(row.finalizeErrorMessage, 500) ||
              "Notion authorization could not be finalized. Start again.",
          },
      };
    }
    if (
      row.finalizeStatus === "processing" &&
      Number(row.finalizeStartedAt ?? 0) >
        args.nowMs - APP_OAUTH_FINALIZE_PROCESSING_TIMEOUT_MS
    ) {
      return {
        status: "processing",
        result: {
          ok: false,
          catalog_app_id: catalogAppId,
          error_message: "OAuth connection is finishing.",
        },
      };
    }
    await ctx.db.patch(row._id, {
      finalizeStatus: "processing",
      finalizeStartedAt: args.nowMs,
      finalizeErrorMessage: undefined,
    });
    return { status: "claimed" };
  },
});

export const completeAppOAuthFinalizeInternal = internalMutation({
  args: {
    stateId: v.id("appOAuthStates"),
    resultJson: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.stateId);
    if (!existing) return { completed: false };
    await ctx.db.patch(args.stateId, {
      clientSecretEncryptedHex: undefined,
      clientSecretIvHex: undefined,
      clientSecretVersion: undefined,
      callbackCodeEncryptedHex: undefined,
      callbackCodeIvHex: undefined,
      callbackCodeVersion: undefined,
      finalizeStatus: "completed",
      finalizeCompletedAt: args.nowMs,
      finalizeResultJson: args.resultJson,
      finalizeErrorMessage: undefined,
    });
    return { completed: true };
  },
});

export const failAppOAuthFinalizeInternal = internalMutation({
  args: {
    stateId: v.id("appOAuthStates"),
    resultJson: v.string(),
    errorMessage: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.stateId);
    if (!existing) return { failed: false };
    await ctx.db.patch(args.stateId, {
      clientSecretEncryptedHex: undefined,
      clientSecretIvHex: undefined,
      clientSecretVersion: undefined,
      callbackCodeEncryptedHex: undefined,
      callbackCodeIvHex: undefined,
      callbackCodeVersion: undefined,
      finalizeStatus: "failed",
      finalizeCompletedAt: args.nowMs,
      finalizeResultJson: args.resultJson,
      finalizeErrorMessage: args.errorMessage,
    });
    return { failed: true };
  },
});

export const beginUserPlatformAppOAuth = action({
  args: {
    authSubject: v.optional(v.string()),
    catalogAppId: v.string(),
    returnToPath: v.optional(v.string()),
    callbackBaseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const app = findDiscoverAppCatalogEntryById(args.catalogAppId);
    if (!app) throw new Error("catalog_app_not_found");
    const connectPolicy = resolveDiscoverAppCatalogConnectPolicy({
      catalogAppId: app.id,
      name: app.name,
      endpointUrl: app.personalConnect.endpointUrl,
      authType: "oauth",
    });
    if (!connectPolicy.ok) throw new Error(connectPolicy.message);
    const redirectUri = buildCallbackUri(args.callbackBaseUrl);
    const metadata = await discoverOAuthMetadata(connectPolicy.endpointUrl);
    const client = await registerOAuthClient({
      metadata,
      redirectUri,
    });
    const codeVerifier = randomBase64Url(32);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomBase64Url(32);
    const returnToPath = normalizeReturnToPath(args.returnToPath);
    const nowMs = Date.now();
    const encryptedClientSecret = client.clientSecret
      ? await encryptSecret(client.clientSecret)
      : null;
    await ctx.runMutation(internal.appOAuth.insertAppOAuthStateInternal as any, {
      userId,
      catalogAppId: connectPolicy.catalogAppId,
      state,
      codeVerifier,
      redirectUri,
      returnToPath,
      endpointUrl: connectPolicy.endpointUrl,
      clientId: client.clientId,
      clientSecretEncryptedHex: encryptedClientSecret?.encryptedSecretHex,
      clientSecretIvHex: encryptedClientSecret?.secretIvHex,
      clientSecretVersion: encryptedClientSecret?.secretVersion,
      authorizationEndpoint: metadata.authorizationEndpoint,
      tokenEndpoint: metadata.tokenEndpoint,
      resource: metadata.resource,
      issuer: metadata.issuer ?? undefined,
      scope: metadata.scope ?? undefined,
      createdAt: nowMs,
      expiresAt: nowMs + APP_OAUTH_STATE_TTL_MS,
    });
    const authorizationUrl = new URL(metadata.authorizationEndpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", client.clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("prompt", "consent");
    authorizationUrl.searchParams.set("resource", metadata.resource);
    if (metadata.scope) authorizationUrl.searchParams.set("scope", metadata.scope);
    return {
      ok: true,
      catalog_app_id: connectPolicy.catalogAppId,
      authorize_url: authorizationUrl.toString(),
      redirect_uri: redirectUri,
    };
  },
});

export const completeAppOAuthCallbackInternal = internalAction({
  args: {
    state: v.string(),
    code: v.optional(v.string()),
    oauthError: v.optional(v.string()),
    oauthErrorDescription: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const state = normalizeString(args.state, 500);
    const row = (await ctx.runQuery(
      internal.appOAuth.getAppOAuthStateByStateInternal as any,
      { state },
    )) as any | null;
    if (!row) {
      return {
        ok: false,
        redirect_url: buildPublicRedirectUrl({
          returnToPath: "/discover",
          status: "error",
          message: "OAuth state expired. Start the connection again.",
        }),
      };
    }
    const returnToPath = normalizeReturnToPath(row.returnToPath);
    const catalogAppId = normalizeString(row.catalogAppId, 120);
    if (Date.now() > Number(row.expiresAt ?? 0)) {
      await ctx.runMutation(internal.appOAuth.deleteAppOAuthStateInternal as any, {
        stateId: row._id,
      });
      return {
        ok: false,
        redirect_url: buildPublicRedirectUrl({
          returnToPath,
          status: "error",
          catalogAppId,
          message: "OAuth state expired. Start the connection again.",
        }),
      };
    }
    const oauthError = normalizeString(args.oauthError, 300);
    if (oauthError) {
      await ctx.runMutation(internal.appOAuth.deleteAppOAuthStateInternal as any, {
        stateId: row._id,
      });
      return {
        ok: false,
        redirect_url: buildPublicRedirectUrl({
          returnToPath,
          status: "error",
          catalogAppId,
          message:
            normalizeString(args.oauthErrorDescription, 300) ||
            oauthError ||
            "OAuth authorization was denied.",
        }),
      };
    }
    const code = normalizeString(args.code, 4_000);
    if (!code) {
      await ctx.runMutation(internal.appOAuth.deleteAppOAuthStateInternal as any, {
        stateId: row._id,
      });
      return {
        ok: false,
        redirect_url: buildPublicRedirectUrl({
          returnToPath,
          status: "error",
          catalogAppId,
          message: "OAuth callback did not include an authorization code.",
        }),
      };
    }
    const nowMs = Date.now();
    const finalizeToken = randomBase64Url(32);
    const finalizeTokenHash = await sha256HexText(finalizeToken);
    const encryptedCode = await encryptSecret(code);
    await ctx.runMutation(
      internal.appOAuth.patchAppOAuthStateCallbackInternal as any,
      {
        stateId: row._id,
        callbackCodeEncryptedHex: encryptedCode.encryptedSecretHex,
        callbackCodeIvHex: encryptedCode.secretIvHex,
        callbackCodeVersion: encryptedCode.secretVersion,
        finalizeTokenHash,
        callbackReceivedAt: nowMs,
      },
    );
    return {
      ok: true,
      redirect_url: buildPublicRedirectUrl({
        returnToPath,
        status: "pending",
        catalogAppId,
        state,
        finalizeToken,
      }),
    };
  },
});

export const finalizeUserPlatformAppOAuth = action({
  args: {
    authSubject: v.optional(v.string()),
    state: v.string(),
    finalizeToken: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const state = normalizeString(args.state, 500);
    const finalizeToken = normalizeString(args.finalizeToken, 500);
    const row = (await ctx.runQuery(
      internal.appOAuth.getAppOAuthStateByStateInternal as any,
      { state },
    )) as any | null;
    if (!row) {
      return {
        ok: false,
        catalog_app_id: null,
        error_message: "OAuth state expired. Start the connection again.",
      };
    }
    const catalogAppId = normalizeString(row.catalogAppId, 120);
    if (String(row.userId) !== String(userId)) {
      await ctx.runMutation(internal.appOAuth.deleteAppOAuthStateInternal as any, {
        stateId: row._id,
      });
      return {
        ok: false,
        catalog_app_id: catalogAppId,
        error_message:
          "OAuth connection must be finished by the Polynet account that started it.",
      };
    }
    if (Date.now() > Number(row.expiresAt ?? 0)) {
      await ctx.runMutation(internal.appOAuth.deleteAppOAuthStateInternal as any, {
        stateId: row._id,
      });
      return {
        ok: false,
        catalog_app_id: catalogAppId,
        error_message: "OAuth state expired. Start the connection again.",
      };
    }
    const expectedFinalizeTokenHash = normalizeString(row.finalizeTokenHash, 200);
    const actualFinalizeTokenHash = finalizeToken
      ? await sha256HexText(finalizeToken)
      : "";
    if (
      !expectedFinalizeTokenHash ||
      !actualFinalizeTokenHash ||
      expectedFinalizeTokenHash !== actualFinalizeTokenHash
    ) {
      throw new Error("app_oauth_finalize_token_mismatch");
    }
    const claim = (await ctx.runMutation(
      internal.appOAuth.claimAppOAuthFinalizeInternal as any,
      {
        state,
        userId,
        finalizeTokenHash: actualFinalizeTokenHash,
        nowMs: Date.now(),
      },
    )) as {
      status?: string;
      result?: AppOAuthFinalizeResult;
    } | null;
    if (claim?.status !== "claimed") {
      return claim?.result ?? {
        ok: false,
        catalog_app_id: catalogAppId || null,
        error_message: "OAuth connection could not be finalized.",
      };
    }
    if (!row.callbackCodeEncryptedHex || !row.callbackCodeIvHex) {
      return {
        ok: false,
        catalog_app_id: catalogAppId,
        error_message: "OAuth callback has not completed yet.",
      };
    }
    const code = normalizeString(
      await decryptStoredSecret({
        encryptedSecretHex: row.callbackCodeEncryptedHex,
        secretIvHex: row.callbackCodeIvHex,
      }),
      4_000,
    );
    if (!code) {
      return {
        ok: false,
        catalog_app_id: catalogAppId,
        error_message: "OAuth callback did not include an authorization code.",
      };
    }
    const app = findDiscoverAppCatalogEntryById(catalogAppId);
    if (!app) throw new Error("catalog_app_not_found");
    const connectPolicy = resolveDiscoverAppCatalogConnectPolicy({
      catalogAppId,
      name: app.name,
      endpointUrl: row.endpointUrl,
      authType: "oauth",
    });
    if (!connectPolicy.ok) throw new Error(connectPolicy.message);
    const nowMs = Date.now();
    const clientSecret =
      row.clientSecretEncryptedHex && row.clientSecretIvHex
        ? await decryptStoredSecret({
            encryptedSecretHex: row.clientSecretEncryptedHex,
            secretIvHex: row.clientSecretIvHex,
          })
        : null;
    let tokenBundle: StoredOAuthTokenBundleV1;
    try {
      tokenBundle = await exchangeCodeForTokenBundle({
        catalogAppId,
        code,
        codeVerifier: row.codeVerifier,
        redirectUri: row.redirectUri,
        tokenEndpoint: row.tokenEndpoint,
        issuer: normalizeString(row.issuer, 2_000) || null,
        clientId: row.clientId,
        clientSecret: normalizeString(clientSecret, 2_000) || null,
        resource: normalizeString(row.resource, 2_000),
        scope: normalizeString(row.scope, 2_000) || null,
        nowMs,
      });
    } catch {
      const result: AppOAuthFinalizeResult = {
        ok: false,
        catalog_app_id: catalogAppId || null,
        error_message: "Notion authorization could not be finalized. Start again.",
      };
      await ctx.runMutation(internal.appOAuth.failAppOAuthFinalizeInternal as any, {
        stateId: row._id,
        resultJson: stringifyFinalizeResult(result),
        errorMessage: result.error_message ?? "OAuth finalization failed.",
        nowMs: Date.now(),
      });
      return result;
    }
    await ctx.runAction(internal.userPlatformAppMounts.ensureUserHarnessAppInternal, {
      userId: row.userId,
      catalogAppId: connectPolicy.catalogAppId,
      name: connectPolicy.name,
      description: app.description,
      endpointUrl: connectPolicy.endpointUrl,
      authType: "oauth",
      enabled: true,
      sourceType: "personal",
      updateExistingMount: true,
      nowMs,
    });
    const existing = (await ctx.runQuery(
      internal.userPlatformAppMounts.findExistingUserPlatformMountByIdentityInternal,
      {
        userId: row.userId,
        catalogAppId: connectPolicy.catalogAppId,
        endpointUrl: connectPolicy.endpointUrl,
        authType: "oauth",
      },
    )) as { mount: any; app: DeveloperAppRow; connection: AppConnectionRow | null } | null;
    if (!existing) throw new Error("developer_app_mount_missing_after_oauth");
    await storeOAuthTokenBundle({
      ctx,
      developerAppId: existing.app._id,
      bundle: tokenBundle,
      nowMs,
    });
    const validation = (await ctx.runAction(
      internal.appValidation.validateDeveloperAppInternal,
      {
        developerAppId: existing.app._id,
      },
    )) as {
      validation_status?: unknown;
      snapshot?: { tools?: unknown };
    };
    if (String(validation.validation_status ?? "") === "ok") {
      const refreshedApp = (await ctx.runQuery(
        internal.developerApps.getDeveloperAppByIdInternal,
        {
          developerAppId: existing.app._id,
        },
      )) as DeveloperAppRow | null;
      const enabledTools = Array.isArray(validation.snapshot?.tools)
        ? (validation.snapshot?.tools as Array<{ tool_name?: unknown }>)
            .map((tool) => normalizeString(tool.tool_name, 200))
            .filter(Boolean)
        : undefined;
      await ctx.runAction(
        internal.userPlatformAppMounts.ensureUserHarnessAppInternal,
        {
          userId: row.userId,
          catalogAppId: connectPolicy.catalogAppId,
          name: connectPolicy.name,
          description: app.description,
          endpointUrl: connectPolicy.endpointUrl,
          authType: "oauth",
          toolSnapshotId: refreshedApp?.activeSnapshotId,
          enabled: true,
          enabledTools,
          sourceType: "personal",
          updateExistingMount: true,
          nowMs: Date.now(),
        },
      );
    }
    const result: AppOAuthFinalizeResult = {
      ok: true,
      catalog_app_id: catalogAppId,
      mount_id: String(existing.mount._id),
      validation_status: String(validation.validation_status ?? ""),
    };
    await ctx.runMutation(internal.appOAuth.completeAppOAuthFinalizeInternal as any, {
      stateId: row._id,
      resultJson: stringifyFinalizeResult(result),
      nowMs: Date.now(),
    });
    return result;
  },
});

export const getFreshDeveloperAppConnectionBundleInternal = internalAction({
  args: {
    developerAppId: v.id("developerApps"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const bundle = (await ctx.runQuery(
      internal.appConnections.getDecryptedDeveloperAppConnectionBundleInternal,
      {
        developerAppId: args.developerAppId,
      },
    )) as {
      app: DeveloperAppRow;
      connection: AppConnectionRow | null;
      secret: string | null;
    } | null;
    if (!bundle) return null;
    if (bundle.app.authType !== "oauth") return bundle;
    const parsed = parseStoredOAuthTokenBundle(bundle.secret);
    if (!parsed) {
      throw new Error("developer_app_oauth_reauth_required");
    }
    const nowMs = Date.now();
    if (
      parsed.expiresAt === null ||
      parsed.expiresAt > nowMs + APP_OAUTH_REFRESH_WINDOW_MS
    ) {
      return {
        ...bundle,
        secret: parsed.accessToken,
      };
    }
    const refreshed = await refreshTokenBundle(parsed);
    await storeOAuthTokenBundle({
      ctx,
      developerAppId: bundle.app._id,
      bundle: refreshed,
      nowMs,
    });
    return {
      ...bundle,
      secret: refreshed.accessToken,
    };
  },
});

export const __testOnlyNormalizeAppOAuthReturnToPath = action({
  args: {
    value: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    return normalizeReturnToPath(args.value);
  },
});

export const __testOnlyConstants = internalQuery({
  args: {},
  handler: async () => ({
    default_notion_mcp_endpoint: DEFAULT_NOTION_MCP_ENDPOINT,
    state_ttl_ms: APP_OAUTH_STATE_TTL_MS,
  }),
});
