import { internal } from "./_generated/api";
import { decryptStoredSecret, encryptSecret } from "./providerConnections";

const CHATGPT_OAUTH_ISSUER = "https://auth.openai.com";
const CHATGPT_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CHATGPT_OAUTH_SCOPE = "openid profile email offline_access";
const CHATGPT_OAUTH_ORIGINATOR = "codex_cli_rs";
const CHATGPT_CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";

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

type RuntimeChatgptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatgptCompletionSuccess = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
  resolvedModelId: string | null;
};

type ChatgptCompletionFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  contentType?: string | null;
  bodyPreview?: string | null;
  upstreamRequestId?: string | null;
  cfRay?: string | null;
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

function normalizeHeaderValue(value: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildBodyPreview(bytes: Uint8Array): string | null {
  try {
    const decoded = new TextDecoder().decode(bytes).replace(/\s+/g, " ").trim();
    return decoded ? decoded.slice(0, 800) : null;
  } catch {
    return null;
  }
}

function looksLikeSsePayload(decoded: string, contentType: string): boolean {
  const normalizedContentType = String(contentType ?? "").toLowerCase();
  if (normalizedContentType.includes("text/event-stream")) return true;
  const sample = decoded.slice(0, 512);
  return /(^|[\n\r\s])(?:event:|data:)\s*/i.test(sample);
}

function extractBalancedJsonSlice(body: string, startIndex: number): { value: string; nextIndex: number } | null {
  if (body[startIndex] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = startIndex; index < body.length; index += 1) {
    const ch = body[index];
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (ch === "\\") {
        escaping = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          value: body.slice(startIndex, index + 1),
          nextIndex: index + 1,
        };
      }
    }
  }
  return null;
}

function extractSseDataPayloads(body: string): string[] {
  const payloads: string[] = [];
  const token = "data:";
  let cursor = 0;
  while (cursor < body.length) {
    const dataIndex = body.indexOf(token, cursor);
    if (dataIndex < 0) break;
    let valueIndex = dataIndex + token.length;
    while (valueIndex < body.length && /\s/.test(body[valueIndex])) valueIndex += 1;
    if (valueIndex >= body.length) break;

    if (body.startsWith("[DONE]", valueIndex)) {
      payloads.push("[DONE]");
      cursor = valueIndex + "[DONE]".length;
      continue;
    }

    const balanced = extractBalancedJsonSlice(body, valueIndex);
    if (balanced) {
      payloads.push(balanced.value);
      cursor = balanced.nextIndex;
      continue;
    }

    let lineEnd = body.indexOf("\n", valueIndex);
    if (lineEnd < 0) lineEnd = body.length;
    payloads.push(body.slice(valueIndex, lineEnd).trim());
    cursor = lineEnd + 1;
  }
  return payloads.filter(Boolean);
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
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return payload;
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
    const accountId = String(parsed.accountId ?? "").trim() || extractChatgptAccountIdFromToken(idToken) || extractChatgptAccountIdFromToken(accessToken);
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

function normalizeChatgptCloudTurnRequest(params: {
  modelId: string;
  messages: RuntimeChatgptMessage[];
}): { instructions: string | null; inputItems: unknown[] } {
  const modelId = String(params.modelId ?? "").trim();
  if (!modelId) throw new Error("model_id_required");
  if (modelId.length > 128) throw new Error("model_id_too_long");
  if (!Array.isArray(params.messages) || params.messages.length === 0) throw new Error("messages_required");
  if (params.messages.length > 80) throw new Error("messages_exceed_max_count");

  const instructionsParts: string[] = [];
  const inputItems: unknown[] = [];
  let totalChars = 0;

  for (const message of params.messages) {
    const role = String(message.role ?? "").trim().toLowerCase();
    const content = String(message.content ?? "").trim();
    if (!content) continue;
    totalChars += content.length;
    if (totalChars > 250_000) throw new Error("messages_exceed_size_budget");

    if (role === "system") {
      instructionsParts.push(content);
      continue;
    }
    if (role === "user") {
      inputItems.push({
        role: "user",
        content: [{ type: "input_text", text: content }],
      });
      continue;
    }
    if (role === "assistant") {
      inputItems.push({
        role: "assistant",
        content: [{ type: "output_text", text: content }],
      });
      continue;
    }
    throw new Error("messages_contain_unsupported_role");
  }

  if (inputItems.length === 0) throw new Error("messages_must_include_user_or_assistant");
  return {
    instructions: instructionsParts.length > 0 ? instructionsParts.join("\n\n") : null,
    inputItems,
  };
}

function parseChatgptCloudTurnResponseBytes(bytes: Uint8Array, contentType: string): { text: string; modelId: string | null } {
  const body = new TextDecoder().decode(bytes);
  const ssePayloads = extractSseDataPayloads(body);
  if (looksLikeSsePayload(body, contentType) || ssePayloads.length > 0) {
    let text = "";
    let sawDelta = false;
    let sawDoneText = false;
    let modelId: string | null = null;

    for (const data of ssePayloads) {
      if (data === "[DONE]") break;

      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(data) as Record<string, any>;
      } catch {
        continue;
      }

      if (!modelId) {
        modelId =
          (typeof parsed?.response?.model === "string" && parsed.response.model.trim()) ||
          (typeof parsed?.model === "string" && parsed.model.trim()) ||
          null;
      }

      const kind = typeof parsed?.type === "string" ? parsed.type : "";
      if (kind === "error") {
        const message =
          (typeof parsed?.message === "string" && parsed.message.trim()) ||
          (typeof parsed?.error?.message === "string" && parsed.error.message.trim()) ||
          "ChatGPT inference failed.";
        throw new Error(message);
      }

      if (kind === "response.output_text.delta") {
        const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
        if (delta) {
          sawDelta = true;
          text += delta;
        }
        continue;
      }

      if (kind === "response.output_text.done" && !sawDelta && !sawDoneText) {
        const doneText = typeof parsed?.text === "string" ? parsed.text : "";
        if (doneText.trim()) {
          sawDoneText = true;
          text += doneText;
        }
        continue;
      }

      if (kind === "response.output_item.done" && !sawDelta && !sawDoneText) {
        const item = parsed?.item;
        if (!item || typeof item !== "object" || item.type !== "message" || !Array.isArray(item.content)) {
          continue;
        }
        let doneText = "";
        for (const part of item.content) {
          if (!part || typeof part !== "object") continue;
          if (part.type !== "output_text") continue;
          if (typeof part.text === "string" && part.text) doneText += part.text;
        }
        if (doneText.trim()) {
          sawDoneText = true;
          text += doneText;
        }
      }
    }

    return { text, modelId };
  }

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(body) as Record<string, any>;
  } catch {
    throw new Error("ChatGPT returned invalid JSON");
  }

  const errorMessage = typeof parsed?.error?.message === "string" ? parsed.error.message.trim() : "";
  if (errorMessage) throw new Error(errorMessage);

  const modelId =
    (typeof parsed?.model === "string" && parsed.model.trim()) ||
    (typeof parsed?.response?.model === "string" && parsed.response.model.trim()) ||
    null;
  const text =
    (typeof parsed?.output_text === "string" && parsed.output_text) ||
    (typeof parsed?.output?.[0]?.content?.[0]?.text === "string" && parsed.output[0].content[0].text) ||
    "";
  return { text, modelId };
}

export async function runChatgptCompletion(params: {
  ctx: any;
  userId: string;
  modelId: string;
  messages: RuntimeChatgptMessage[];
  maxTokens: number;
}): Promise<ChatgptCompletionSuccess | ChatgptCompletionFailure> {
  let requestBytes: Uint8Array;
  try {
    const normalized = normalizeChatgptCloudTurnRequest({
      modelId: params.modelId,
      messages: params.messages,
    });
    const requestBody: Record<string, unknown> = {
      model: params.modelId,
      store: false,
      stream: true,
      input: normalized.inputItems,
    };
    if (normalized.instructions) requestBody.instructions = normalized.instructions;
    requestBytes = new TextEncoder().encode(JSON.stringify(requestBody));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 400,
      code: "invalid_chatgpt_request",
      message: message || "Invalid ChatGPT request.",
    };
  }

  let firstFailure: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const auth = await getFreshChatgptAuthForUser({
      ctx: params.ctx,
      userId: params.userId,
      forceRefresh: attempt > 0,
    });
    if (!auth) {
      return {
        ok: false,
        status: 403,
        code: "provider_connection_required",
        message: "Reconnect ChatGPT and retry.",
      };
    }

    let response: Response;
    try {
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${auth.accessToken}`);
      headers.set("User-Agent", "codex-cli");
      headers.set("Content-Type", "application/json");
      headers.set("Accept", "text/event-stream");
      if (auth.accountId) headers.set("ChatGPT-Account-Id", auth.accountId);
      response = await fetch(CHATGPT_CODEX_RESPONSES_URL, {
        method: "POST",
        headers,
        body: requestBytes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        status: 503,
        code: "provider_unavailable",
        message: message || "ChatGPT request failed.",
        contentType: null,
        bodyPreview: null,
        upstreamRequestId: null,
        cfRay: null,
      };
    }

    const contentType = String(response.headers.get("content-type") ?? "");
    const body = new Uint8Array(await response.arrayBuffer());
    const upstreamRequestId =
      normalizeHeaderValue(response.headers.get("x-request-id")) ||
      normalizeHeaderValue(response.headers.get("openai-request-id")) ||
      normalizeHeaderValue(response.headers.get("x-openai-request-id"));
    const cfRay = normalizeHeaderValue(response.headers.get("cf-ray"));
    const bodyPreview = buildBodyPreview(body);
    if (!response.ok) {
      const detail = bodyPreview ?? "";
      const failure = detail
        ? `ChatGPT inference failed (HTTP ${response.status}): ${detail}`
        : `ChatGPT inference failed (HTTP ${response.status}).`;
      if (attempt === 0) {
        firstFailure = failure;
        continue;
      }
      return {
        ok: false,
        status: response.status >= 400 && response.status < 600 ? response.status : 502,
        code: response.status === 401 || response.status === 403 ? "provider_connection_required" : "provider_error",
        message: firstFailure || failure,
        contentType: contentType || null,
        bodyPreview,
        upstreamRequestId,
        cfRay,
      };
    }

    try {
      const parsed = parseChatgptCloudTurnResponseBytes(body, contentType);
      const text = parsed.text.trim();
      if (!text) {
        return {
          ok: false,
          status: 502,
          code: "provider_empty_response",
          message: "ChatGPT returned an empty response.",
        };
      }
      return {
        content: text,
        promptTokens: null,
        completionTokens: null,
        resolvedModelId: parsed.modelId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 0) {
        firstFailure = message || "ChatGPT inference failed.";
        continue;
      }
      return {
        ok: false,
        status: 502,
        code: "provider_invalid_response",
        message: firstFailure || message || "ChatGPT inference failed.",
        contentType: contentType || null,
        bodyPreview,
        upstreamRequestId,
        cfRay,
      };
    }
  }

  return {
    ok: false,
    status: 502,
    code: "provider_error",
    message: "ChatGPT inference failed.",
    contentType: null,
    bodyPreview: null,
    upstreamRequestId: null,
    cfRay: null,
  };
}
