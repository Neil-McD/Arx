import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { requireVerifiedUserId } from "../_shared/auth.ts";
import { getEnv } from "../_shared/env.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";

type AgentTurnInput = {
  thread_id: string;
  max_tokens?: number;
  stream?: boolean;
  mode?: "respond" | "regenerate";
  inference_source?: "user" | "platform";
};

type ApiError = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};

function createApiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): ApiError {
  const err = new Error(message) as ApiError;
  err.code = code;
  err.status = status;
  if (details) err.details = details;
  return err;
}

function isApiError(error: unknown): error is ApiError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "status" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { status?: unknown }).status === "number",
  );
}

function isTruthyEnv(value: string): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function normalizeInferenceSource(value: unknown): "user" | "platform" | null {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v === "user") return "user";
  if (v === "platform") return "platform";
  return null;
}

function sanitizeUuid(value: string): string {
  const v = (value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(v)) throw new Error("Invalid id");
  return v;
}

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  return JSON.parse(text) as T;
}

type ThreadRow = {
  id: string;
  owner_id: string;
  engine_id: string;
  model_id: string | null;
  community_id: string | null;
};

type CommunityAgentSystemPromptRow = {
  draft_id: string;
  system_prompt: string;
};

type UserMemorySettingsRow = {
  memory_mode: "off" | "suggest" | "auto";
  remember_intent_enabled: boolean;
};

type UserModelSettingsRow = {
  system_prompt: string;
};

type PersonalMemoryRow = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  updated_at: string;
};

type BuilderTier = "free" | "builder" | "pro";

type InferenceSource = "user" | "platform";

type InferenceFallbackReason = "platform_quota_exceeded";

type InferenceFallback = {
  from: InferenceSource;
  to: InferenceSource;
  reason: InferenceFallbackReason;
};

type PlatformProvider = "openai" | "anthropic" | "google" | "x-ai";
type PlatformModelRef = { provider: PlatformProvider; model: string; ref: string };

type ModelRegistryRow = {
  id: string;
  provider: string;
  provider_model: string | null;
  enabled: boolean;
  platform_enabled: boolean;
  byok_enabled: boolean;
  display_name: string | null;
  sort_order: number | null;
};

function isPlatformQuotaExceededErrorMessage(message: string): boolean {
  const raw = String(message ?? "");
  return raw.toLowerCase().includes("platform_inference_quota_exceeded");
}

function isPlatformModelRoutingMisconfiguredMessage(message: string): boolean {
  const raw = String(message ?? "").trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.includes("platform_model_map_json") ||
    raw.includes("platform model not configured") ||
    raw.includes("invalid platform model mapping") ||
    raw.includes("unsupported platform model provider")
  );
}

function normalizePlatformProvider(input: string): PlatformProvider {
  const raw = (input ?? "").trim().toLowerCase();
  if (raw === "openai") return "openai";
  if (raw === "anthropic") return "anthropic";
  if (raw === "google") return "google";
  if (raw === "xai" || raw === "x-ai") return "x-ai";
  throw new Error("Unsupported platform model provider");
}

function formatProviderLabel(provider: PlatformProvider): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "google":
      return "Google";
    case "x-ai":
      return "xAI";
    default:
      return provider;
  }
}

function parsePlatformModelRef(ref: string): PlatformModelRef {
  const raw = (ref ?? "").trim();
  const idx = raw.indexOf("/");
  if (idx <= 0) throw new Error("Invalid platform model mapping");
  const provider = normalizePlatformProvider(raw.slice(0, idx));
  const model = raw.slice(idx + 1).trim();
  if (!model) throw new Error("Invalid platform model mapping");
  return { provider, model, ref: `${provider}/${model}` };
}

async function loadModelRegistryRow(modelId: string): Promise<ModelRegistryRow | null> {
  const id = (modelId ?? "").trim();
  if (!id) return null;
  const res = await supabaseAdminFetch(
    `/rest/v1/model_registry?select=id,provider,provider_model,enabled,platform_enabled,byok_enabled,display_name,sort_order&id=eq.${encodeURIComponent(
      id,
    )}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<Partial<ModelRegistryRow>>;
  const row = rows[0];
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    provider: String(row.provider ?? "").trim(),
    provider_model: typeof row.provider_model === "string" ? row.provider_model : null,
    enabled: row.enabled !== false,
    platform_enabled: row.platform_enabled !== false,
    byok_enabled: row.byok_enabled !== false,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : null,
  };
}

let cachedPlatformModelMap: { raw: string; parsed: Record<string, string> } | null = null;

function loadPlatformModelMap(): Record<string, string> {
  const raw = getEnv("PLATFORM_MODEL_MAP_JSON");
  if (!raw) return {};
  if (cachedPlatformModelMap?.raw === raw) return cachedPlatformModelMap.parsed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid PLATFORM_MODEL_MAP_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid PLATFORM_MODEL_MAP_JSON");
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const id = String(key ?? "").trim();
    const ref = value.trim();
    if (!id || !ref) continue;
    out[id] = ref;
  }
  cachedPlatformModelMap = { raw, parsed: out };
  return out;
}

function resolvePlatformModelForAliasLegacy(aliasModelId: string): PlatformModelRef {
  const map = loadPlatformModelMap();
  const cleanedAlias = (aliasModelId ?? "").trim();
  if (Object.keys(map).length > 0) {
    const raw = map[cleanedAlias];
    if (!raw) throw new Error(`Platform model not configured for '${cleanedAlias}'`);
    return parsePlatformModelRef(raw);
  }

  // Back-compat: if a single platform model is configured (legacy), use it.
  const fallback = getEnv("ARX_PLATFORM_MODEL_REF") || getEnv("OPENROUTER_PLATFORM_MODEL_ID");
  if (fallback) return parsePlatformModelRef(fallback);

  throw new Error("Missing PLATFORM_MODEL_MAP_JSON");
}

async function resolvePlatformModelForAliasOrRegistry(aliasModelId: string): Promise<PlatformModelRef> {
  const cleanedAlias = (aliasModelId ?? "").trim();
  if (!cleanedAlias) throw new Error("model_id is required");

  const row = await loadModelRegistryRow(cleanedAlias);
  if (row) {
    if (!row.enabled || !row.platform_enabled) {
      throw createApiError(
        "platform_inference_not_allowed",
        "Arx platform inference isn't available for this model.",
        403,
        { model_id: cleanedAlias },
      );
    }
    const provider = normalizePlatformProvider(row.provider);
    const providerModel = String(row.provider_model ?? "").trim();
    if (providerModel) return { provider, model: providerModel, ref: `${provider}/${providerModel}` };
    // Transition fallback: allow legacy env mapping until provider_model is populated.
  }

  return resolvePlatformModelForAliasLegacy(cleanedAlias);
}

async function resolveByokModelForAliasOrRegistry(aliasModelId: string): Promise<PlatformModelRef> {
  const cleanedAlias = (aliasModelId ?? "").trim();
  if (!cleanedAlias) throw new Error("model_id is required");

  const row = await loadModelRegistryRow(cleanedAlias);
  if (row) {
    if (!row.enabled || !row.byok_enabled) {
      throw createApiError("byok_inference_not_allowed", "BYOK is not available for this model.", 403, {
        model_id: cleanedAlias,
      });
    }
    const provider = normalizePlatformProvider(row.provider);
    const providerModel = String(row.provider_model ?? "").trim();
    if (providerModel) return { provider, model: providerModel, ref: `${provider}/${providerModel}` };
    // Transition fallback: allow legacy env mapping until provider_model is populated.
  }

  return resolvePlatformModelForAliasLegacy(cleanedAlias);
}

async function loadThread(threadId: string): Promise<ThreadRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}&select=id,owner_id,engine_id,model_id,community_id`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as ThreadRow[];
  const row = rows[0];
  if (!row) throw new Error("Thread not found");
  return row;
}

async function loadCommunityAgentSystemPrompt(params: {
  userId: string;
  communityId: string;
}): Promise<{ draftId: string; systemPrompt: string } | null> {
  const communityId = (params.communityId ?? "").trim();
  if (!communityId) return null;
  try {
    const res = await supabaseAdminFetch("/rest/v1/rpc/get_active_community_agent_system_prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: params.userId, p_community_id: communityId }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Partial<CommunityAgentSystemPromptRow>>;
    const row = rows[0];
    const systemPrompt = typeof row?.system_prompt === "string" ? row.system_prompt.trim() : "";
    if (!systemPrompt) return null;
    return { draftId: String(row?.draft_id ?? "").trim(), systemPrompt };
  } catch {
    // Best-effort: don't block inference if the RPC isn't deployed yet.
    return null;
  }
}

async function userHasActiveEntitlement(params: { userId: string; communityId: string }): Promise<boolean> {
  const userId = (params.userId ?? "").trim();
  const communityId = (params.communityId ?? "").trim();
  if (!userId || !communityId) return false;
  try {
    const res = await supabaseAdminFetch("/rest/v1/rpc/user_has_active_entitlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId, p_community_id: communityId }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as unknown;
    return data === true;
  } catch {
    return false;
  }
}

async function loadUserBuilderTier(userId: string): Promise<BuilderTier> {
  const res = await supabaseAdminFetch(
    `/rest/v1/profiles?select=builder_tier&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) return "free";
  const rows = (await res.json()) as Array<{ builder_tier?: unknown }>;
  const raw = String(rows[0]?.builder_tier ?? "free").trim().toLowerCase();
  return raw === "pro" || raw === "builder" ? raw : "free";
}

async function loadUserMemorySettings(userId: string): Promise<UserMemorySettingsRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/user_memory_settings?select=memory_mode,remember_intent_enabled&user_id=eq.${encodeURIComponent(
      userId,
    )}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<Partial<UserMemorySettingsRow>>;
  const row = rows[0];
  const mode = row?.memory_mode;
  return {
    memory_mode: mode === "suggest" || mode === "auto" ? mode : "off",
    remember_intent_enabled: row?.remember_intent_enabled !== false,
  };
}

async function loadUserModelSettings(userId: string): Promise<UserModelSettingsRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/user_model_settings?select=system_prompt&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) {
    // Best-effort: older deployments may not have this table yet.
    return { system_prompt: "" };
  }
  const rows = (await res.json()) as Array<Partial<UserModelSettingsRow>>;
  return { system_prompt: typeof rows[0]?.system_prompt === "string" ? rows[0]!.system_prompt! : "" };
}

async function loadPersonalMemoryItems(userId: string, limit = 32): Promise<PersonalMemoryRow[]> {
  const safeLimit = Math.max(0, Math.min(200, Math.floor(limit)));
  if (safeLimit === 0) return [];
  const res = await supabaseAdminFetch(
    `/rest/v1/personal_memory_items?select=id,content,scope,scope_id,pinned,updated_at&user_id=eq.${encodeURIComponent(
      userId,
    )}&scope=eq.global&order=pinned.desc,updated_at.desc&limit=${safeLimit}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as PersonalMemoryRow[];
}

type HistorySnippetRow = {
  thread_id: string;
  message_id: string;
  created_at: string;
  snippet: string;
};

async function loadHistorySnippets(params: {
  userId: string;
  query: string;
  excludeThreadId: string;
  limit?: number;
}): Promise<HistorySnippetRow[]> {
  const q = (params.query ?? "").trim();
  if (q.length < 4) return [];
  const res = await supabaseAdminFetch("/rest/v1/rpc/search_user_message_snippets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: params.userId,
      p_query: q.slice(0, 240),
      p_exclude_thread_id: params.excludeThreadId,
      p_limit: Math.max(0, Math.min(12, Math.floor(params.limit ?? 6))),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as HistorySnippetRow[];
}

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content_json: unknown;
  seq: number;
};

async function loadRecentMessages(threadId: string, limit = 50): Promise<MessageRow[]> {
  const res = await supabaseAdminFetch(
    `/rest/v1/messages?select=id,role,content_json,seq&thread_id=eq.${encodeURIComponent(threadId)}&order=seq.desc&limit=${limit}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as MessageRow[];
}

function extractTextFromContentJson(contentJson: unknown): string {
  if (contentJson === null || contentJson === undefined) return "";
  if (typeof contentJson === "string") {
    const trimmed = contentJson.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return extractTextFromContentJson(parsed);
    } catch {
      return trimmed;
    }
  }
  if (typeof contentJson === "object") {
    const asAny = contentJson as any;
    const baseText =
      typeof asAny.text === "string"
        ? asAny.text
        : typeof asAny.body === "string"
          ? asAny.body
          : typeof asAny.content === "string"
            ? asAny.content
            : "";

    const attachments = Array.isArray(asAny.attachments) ? (asAny.attachments as any[]) : [];
    if (attachments.length === 0) return baseText;

    const maxAttachments = 6;
    const maxPerAttachmentChars = 8000;
    const maxTotalAttachmentChars = 20000;
    let budget = maxTotalAttachmentChars;

    const blocks: string[] = [];
    for (const item of attachments) {
      if (blocks.length >= maxAttachments) break;
      if (!item || typeof item !== "object") continue;
      const name = String((item as any).name ?? "attachment").trim() || "attachment";
      const text = typeof (item as any).text === "string" ? String((item as any).text) : "";
      const truncated = (item as any).truncated === true;
      const dataUrl = typeof (item as any).data_url === "string" ? String((item as any).data_url) : "";
      const type = String((item as any).type ?? "").trim();

      if (text.trim()) {
        const snippetRaw = text.length > maxPerAttachmentChars ? text.slice(0, maxPerAttachmentChars) : text;
        const snippet = snippetRaw + (text.length > maxPerAttachmentChars || truncated ? "\n…[truncated]" : "");
        const block = `[Attachment: ${name}]\n\`\`\`\n${snippet}\n\`\`\``;
        if (block.length > budget) break;
        blocks.push(block);
        budget -= block.length;
        continue;
      }

      if ((type === "image" || dataUrl.startsWith("data:image/")) && name) {
        const block = `[Image attachment: ${name}]`;
        if (block.length > budget) break;
        blocks.push(block);
        budget -= block.length;
        continue;
      }

      const block = `[Attachment: ${name}]`;
      if (block.length > budget) break;
      blocks.push(block);
      budget -= block.length;
    }

    if (blocks.length === 0) return baseText;
    return baseText ? `${baseText}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n");
  }
  return "";
}

type OpenRouterChatMessage = { role: "system" | "user" | "assistant"; content: string };

type OpenAiUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

type OpenAiChatCompletion = {
  choices?: Array<{ message?: { role?: string; content?: string } }>;
  usage?: OpenAiUsage;
};

async function openAiChatCompletion(
  openaiKey: string,
  model: string,
  messages: OpenRouterChatMessage[],
  maxTokens: number,
): Promise<{ text: string; usage?: OpenAiUsage }> {
  return openAiCompatibleChatCompletion({
    apiKey: openaiKey,
    baseUrl: "https://api.openai.com/v1",
    model,
    messages,
    maxTokens,
  });
}

async function openAiCompatibleChatCompletion(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: OpenRouterChatMessage[];
  maxTokens: number;
}): Promise<{ text: string; usage?: OpenAiUsage }> {
  const url = `${params.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const tokenKey = params.baseUrl.includes("api.openai.com") ? "max_completion_tokens" : "max_tokens";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      Object.assign(
        {
          model: params.model,
          messages: params.messages,
          stream: false,
        },
        { [tokenKey]: params.maxTokens },
      ),
    ),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI-compatible error ${res.status}: ${text}`);
  const parsed = JSON.parse(text) as OpenAiChatCompletion;
  const out = String(parsed.choices?.[0]?.message?.content ?? "").trim();
  if (!out) throw new Error("Model returned an empty response");
  return { text: out, usage: parsed.usage };
}

type OpenRouterStreamChunk = {
  choices?: Array<{
    delta?: { content?: string | null } | null;
    message?: { content?: string | null } | null;
    text?: string | null;
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

function extractStreamDelta(chunk: OpenRouterStreamChunk): string {
  const choice = chunk.choices?.[0];
  const fromDelta = choice?.delta && typeof choice.delta.content === "string" ? choice.delta.content : null;
  const fromText = typeof choice?.text === "string" ? choice.text : null;
  const fromMessage = choice?.message && typeof choice.message.content === "string" ? choice.message.content : null;
  return (fromDelta ?? fromText ?? fromMessage ?? "").toString();
}

type AnthropicRole = "user" | "assistant";
type AnthropicMessage = { role: AnthropicRole; content: string };

function toAnthropicSystemAndMessages(messages: OpenRouterChatMessage[]): { system: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];
  for (const msg of messages) {
    if (!msg) continue;
    const role = msg.role;
    const content = String(msg.content ?? "");
    if (!content.trim()) continue;
    if (role === "system") {
      systemParts.push(content);
      continue;
    }
    if (role === "user" || role === "assistant") {
      out.push({ role, content });
    }
  }
  const system = systemParts.map((part) => part.trim()).filter(Boolean).join("\n\n---\n\n");
  // Anthropic expects alternating user/assistant; merge consecutive same-role messages.
  const merged: AnthropicMessage[] = [];
  for (const msg of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content = `${prev.content}\n\n${msg.content}`;
      continue;
    }
    merged.push({ ...msg });
  }
  return { system, messages: merged };
}

type AnthropicUsage = { input_tokens?: number; output_tokens?: number };
type AnthropicResponse = { content?: Array<{ type?: string; text?: string }>; usage?: AnthropicUsage };

async function anthropicChatCompletion(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  maxTokens: number;
  stream: false;
}): Promise<{ text: string; usage?: AnthropicUsage }> {
  const { system, messages } = toAnthropicSystemAndMessages(params.messages);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": getEnv("ANTHROPIC_VERSION") || "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      stream: false,
      ...(system ? { system } : {}),
      messages,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${text}`);
  const parsed = JSON.parse(text) as AnthropicResponse;
  const blocks = Array.isArray(parsed.content) ? parsed.content : [];
  const out = blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => String(b.text))
    .join("")
    .trim();
  if (!out) throw new Error("Model returned an empty response");
  return { text: out, usage: parsed.usage };
}

type GeminiRole = "user" | "model";
type GeminiPart = { text: string };
type GeminiContent = { role: GeminiRole; parts: GeminiPart[] };

function toGeminiSystemAndContents(messages: OpenRouterChatMessage[]): { system: string; contents: GeminiContent[] } {
  const systemParts: string[] = [];
  const raw: GeminiContent[] = [];
  for (const msg of messages) {
    if (!msg) continue;
    const content = String(msg.content ?? "");
    if (!content.trim()) continue;
    if (msg.role === "system") {
      systemParts.push(content);
      continue;
    }
    if (msg.role === "user") {
      raw.push({ role: "user", parts: [{ text: content }] });
      continue;
    }
    if (msg.role === "assistant") {
      raw.push({ role: "model", parts: [{ text: content }] });
      continue;
    }
  }
  const system = systemParts.map((part) => part.trim()).filter(Boolean).join("\n\n---\n\n");

  const merged: GeminiContent[] = [];
  for (const item of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === item.role) {
      prev.parts[0]!.text = `${prev.parts[0]!.text}\n\n${item.parts[0]!.text}`;
      continue;
    }
    merged.push({ role: item.role, parts: [{ text: item.parts[0]!.text }] });
  }

  return { system, contents: merged };
}

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: GeminiUsage;
};

async function googleGenerateContent(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  maxTokens: number;
}): Promise<{ text: string; usage?: GeminiUsage }> {
  const { system, contents } = toGeminiSystemAndContents(params.messages);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model,
  )}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: { maxOutputTokens: params.maxTokens },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google error ${res.status}: ${text}`);
  const parsed = JSON.parse(text) as GeminiResponse;
  const parts = parsed.candidates?.[0]?.content?.parts ?? [];
  const out = parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
  if (!out) throw new Error("Model returned an empty response");
  return { text: out, usage: parsed.usageMetadata };
}

async function insertAssistantMessage(params: {
  threadId: string;
  replyToId: string;
  contentText: string;
  modelId: string;
  openrouterModelId: string;
  runId: string;
  meta: Record<string, unknown> | null;
}): Promise<{ inserted: boolean }> {
  const contentJson: Record<string, unknown> = { text: params.contentText };
  if (params.meta && Object.keys(params.meta).length > 0) contentJson.meta = params.meta;
  const res = await supabaseAdminFetch(
    "/rest/v1/messages?select=id",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        thread_id: params.threadId,
        role: "assistant",
        content_json: contentJson,
        engine_id: "agent_web",
        model_id: params.modelId,
        run_id: params.runId,
        reply_to_id: params.replyToId,
      }),
    },
  );

  if (res.ok) return { inserted: true };

  // Idempotency: if another worker already inserted the assistant reply, treat as success.
  const body = await res.text();
  if (res.status === 409 || body.includes("duplicate key") || body.includes("23505")) {
    return { inserted: false };
  }

  throw new Error(body || "Failed to insert assistant message");
}

async function loadAssistantReplyId(threadId: string, replyToId: string): Promise<string | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/messages?select=id&thread_id=eq.${encodeURIComponent(threadId)}&reply_to_id=eq.${encodeURIComponent(
      replyToId,
    )}&role=eq.assistant&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ id: string }>;
  const id = String(rows[0]?.id ?? "").trim();
  return id ? id : null;
}

async function updateAssistantMessage(params: {
  id: string;
  contentText: string;
  modelId: string;
  runId: string;
  meta: Record<string, unknown> | null;
}): Promise<void> {
  const contentJson: Record<string, unknown> = { text: params.contentText };
  if (params.meta && Object.keys(params.meta).length > 0) contentJson.meta = params.meta;
  const res = await supabaseAdminFetch(
    `/rest/v1/messages?id=eq.${encodeURIComponent(params.id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        content_json: contentJson,
        engine_id: "agent_web",
        model_id: params.modelId,
        run_id: params.runId,
        edited_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

async function writeAssistantReply(params: {
  threadId: string;
  replyToId: string;
  contentText: string;
  modelId: string;
  openrouterModelId: string;
  runId: string;
  meta: Record<string, unknown> | null;
  allowUpdate: boolean;
}): Promise<{ status: "inserted" | "duplicate" | "updated" }> {
  if (params.allowUpdate) {
    const existingId = await loadAssistantReplyId(params.threadId, params.replyToId);
    if (existingId) {
      await updateAssistantMessage({
        id: existingId,
        contentText: params.contentText,
        modelId: params.modelId,
        runId: params.runId,
        meta: params.meta,
      });
      return { status: "updated" };
    }
  }

  const { inserted } = await insertAssistantMessage(params);
  if (inserted) return { status: "inserted" };
  if (params.allowUpdate) {
    const existingId = await loadAssistantReplyId(params.threadId, params.replyToId);
    if (existingId) {
      await updateAssistantMessage({
        id: existingId,
        contentText: params.contentText,
        modelId: params.modelId,
        runId: params.runId,
        meta: params.meta,
      });
      return { status: "updated" };
    }
  }
  return { status: "duplicate" };
}

type UserProviderKeyRpcRow = { has_key?: unknown; api_key?: unknown };

async function readUserProviderKeySecret(params: {
  userId: string;
  provider: PlatformProvider;
  reveal: boolean;
}): Promise<{ hasKey: boolean; key: string | null }> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/read_user_provider_key_secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: params.userId, p_provider: params.provider, p_reveal: params.reveal }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as UserProviderKeyRpcRow[];
  const row = rows[0] ?? {};
  const hasKey = Boolean(row.has_key);
  const key = typeof row.api_key === "string" ? row.api_key.trim() : "";
  return { hasKey, key: key ? key : null };
}

async function edgeRateLimitAllowKey(params: {
  key: string;
  windowSeconds: number;
  limit: number;
}): Promise<boolean> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/edge_rate_limit_allow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_key: params.key,
      p_window_seconds: params.windowSeconds,
      p_limit: params.limit,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as unknown;
  if (typeof data === "boolean") return data;
  return Boolean(data);
}

async function consumePlatformInferenceStandard(userId: string, units = 1): Promise<number> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/consume_platform_inference_standard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId, p_units: units }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as unknown;
  const remaining = Number(data);
  if (!Number.isFinite(remaining) || remaining < 0) return 0;
  return Math.floor(remaining);
}

function encodeSse(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

async function consumeSseEvents(params: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  onData: (data: string) => boolean | void;
}): Promise<void> {
  const decoder = new TextDecoder();
  let lineBuffer = "";
  let dataBuffer = "";

  const flush = (): boolean => {
    const raw = dataBuffer.trim();
    dataBuffer = "";
    if (!raw) return false;
    return Boolean(params.onData(raw));
  };

  while (true) {
    const { value, done } = await params.reader.read();
    if (done) break;
    lineBuffer += decoder.decode(value, { stream: true });
    while (true) {
      const idx = lineBuffer.indexOf("\n");
      if (idx < 0) break;
      let line = lineBuffer.slice(0, idx);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      lineBuffer = lineBuffer.slice(idx + 1);
      if (line === "") {
        if (flush()) return;
        continue;
      }
      if (line.startsWith("data:")) {
        dataBuffer += line.slice(5).trim();
      }
    }
  }
  flush();
}

function truncateUtf8(input: string, maxChars: number): string {
  const text = (input ?? "").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + "…";
}

function selectPersonalMemoryForPrompt(items: PersonalMemoryRow[]): PersonalMemoryRow[] {
  const pinned: PersonalMemoryRow[] = [];
  const recent: PersonalMemoryRow[] = [];
  for (const item of items) {
    if (!item || typeof item.content !== "string") continue;
    const content = item.content.trim();
    if (!content) continue;
    (item.pinned ? pinned : recent).push(item);
  }
  const maxPinned = 6;
  const maxTotal = 10;
  const out: PersonalMemoryRow[] = [];
  for (const item of pinned) {
    if (out.length >= maxPinned) break;
    out.push(item);
  }
  for (const item of recent) {
    if (out.length >= maxTotal) break;
    out.push(item);
  }
  return out;
}

function buildPersonalMemorySystemPrompt(items: PersonalMemoryRow[]): string | null {
  if (items.length === 0) return null;
  const maxItemChars = 420;
  const lines = items.map((item) => `- ${truncateUtf8(item.content, maxItemChars)}`).filter(Boolean);
  if (lines.length === 0) return null;

  return [
    "Personal memory (user-provided, explicit, durable):",
    ...lines,
    "",
    "Use this memory only when relevant to the user's request. If it's not clearly relevant, ignore it.",
    "If memory may be outdated or ambiguous, ask a clarifying question.",
    "Do not mention these notes unless the user asks about them.",
  ].join("\n");
}

type MemoryCandidate = {
  content: string;
  pinned: boolean;
};

const MEMORY_EXTRACTION_CUE_RE =
  /\b(my|mine|i\b|i'm|im|i am|favorite|prefer|like|love|hate|allerg|timezone|from|live|work|job|call me|name is)\b/i;

function looksLikeQuestion(text: string): boolean {
  const input = (text ?? "").trim();
  if (!input) return false;
  if (input.includes("?")) return true;
  const lower = input.toLowerCase().replace(/[’']/g, "");
  return /^(do|does|did|can|could|would|should|is|are|am|was|were|what|whats|which|who|whos|when|where|wheres|why|how|hows)\b/.test(
    lower,
  );
}

const MEMORY_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "then",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "mine",
  "you",
  "your",
  "yours",
  "we",
  "us",
  "our",
  "ours",
  "he",
  "him",
  "his",
  "she",
  "her",
  "hers",
  "they",
  "them",
  "their",
  "theirs",
  "it",
  "its",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "at",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
]);

function normalizeMemoryText(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMemoryText(input: string): string[] {
  const normalized = normalizeMemoryText(input);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !MEMORY_STOPWORDS.has(token))
    .slice(0, 24);
}

function memoryJaccardSimilarity(aTokens: Set<string>, bTokens: Set<string>): { score: number; overlap: number } {
  if (aTokens.size === 0 || bTokens.size === 0) return { score: 0, overlap: 0 };
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap += 1;
  const union = new Set([...aTokens, ...bTokens]).size;
  return { score: union === 0 ? 0 : overlap / union, overlap };
}

function isNearDuplicateMemory(candidate: string, existing: string): boolean {
  const a = normalizeMemoryText(candidate);
  const b = normalizeMemoryText(existing);
  if (!a || !b) return false;
  if (a === b) return true;

  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    if (shorter >= 12 && shorter / longer >= 0.7) return true;
  }

  const aTokens = new Set(tokenizeMemoryText(a));
  const bTokens = new Set(tokenizeMemoryText(b));
  const { score, overlap } = memoryJaccardSimilarity(aTokens, bTokens);
  return overlap >= 2 && score >= 0.75;
}

function shouldAttemptMemoryExtraction(params: {
  userText: string;
  priorAssistantText: string;
  existingMemory: PersonalMemoryRow[];
}): boolean {
  const userText = (params.userText ?? "").trim();
  if (!userText) return false;
  if (userText.length < 6) return false;
  if (looksLikeQuestion(userText)) return false;

  // If the user is explicitly describing themselves/preferences, attempt extraction.
  if (MEMORY_EXTRACTION_CUE_RE.test(userText)) return true;

  // If the prior assistant message was a question about user preferences, attempt extraction even if user reply is terse.
  const prior = (params.priorAssistantText ?? "").trim();
  if (prior && looksLikeQuestion(prior) && MEMORY_EXTRACTION_CUE_RE.test(prior)) return true;

  // If the user is making a short correction that overlaps existing memory (e.g. refining a preference), attempt extraction.
  if (userText.length > 120) return false;
  const userTokens = new Set(tokenizeMemoryText(userText));
  if (userTokens.size < 2) return false;
  for (const row of params.existingMemory) {
    const memText = String(row?.content ?? "").trim();
    if (!memText) continue;
    const memTokens = new Set(tokenizeMemoryText(memText));
    const { overlap } = memoryJaccardSimilarity(userTokens, memTokens);
    if (overlap >= 1) return true;
  }
  return false;
}

function buildHistorySystemPrompt(items: HistorySnippetRow[]): string | null {
  if (items.length === 0) return null;
  const lines = items
    .map((item) => {
      const snippet = truncateUtf8(item.snippet ?? "", 260);
      return snippet ? `- ${snippet}` : null;
    })
    .filter(Boolean) as string[];
  if (lines.length === 0) return null;
  return [
    "Relevant past context (from previous chats):",
    ...lines,
    "",
    "Use this context only when relevant. If it might be outdated, ask a clarifying question.",
  ].join("\n");
}

function safeJsonParseArray(input: string): unknown[] | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function normalizeMemoryCandidates(raw: unknown[]): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (!content) continue;
    // Never store questions as memory.
    if (looksLikeQuestion(content)) continue;
    out.push({
      content: content.length > 240 ? content.slice(0, 240).trimEnd() + "…" : content,
      pinned: Boolean(record.pinned),
    });
  }
  const deduped = new Map<string, MemoryCandidate>();
  for (const item of out) {
    const key = item.content.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return Array.from(deduped.values()).slice(0, 3);
}

async function extractMemoryCandidatesViaOpenAi(params: {
  openaiKey: string;
  baseUrl?: string;
  model: string;
  userText: string;
  priorAssistantText?: string;
}): Promise<MemoryCandidate[]> {
  const userText = (params.userText ?? "").trim();
  if (!userText) return [];
  const priorAssistantText = (params.priorAssistantText ?? "").trim();

  const prompt: OpenRouterChatMessage[] = [
    {
      role: "system",
      content:
        "You extract durable personal memory about a user.\n" +
        "Return ONLY valid JSON: an array of objects {\"content\": string, \"pinned\": boolean}.\n" +
        "Rules:\n" +
        "- Only store durable facts/preferences/goals that are likely helpful later.\n" +
        "- Do not store one-off tasks, transient details, secrets, or sensitive info.\n" +
        "- Never store questions; only store declarative facts about the user.\n" +
        "- You may use the prior assistant message for context, but only store facts the user explicitly states or affirms.\n" +
        "- If nothing should be remembered, return [].\n" +
        "- Keep each content item short (<= 200 chars).",
    },
    {
      role: "user",
      content:
        (priorAssistantText ? `Prior assistant message:\n${truncateUtf8(priorAssistantText, 600)}\n\n` : "") +
        `User message:\n${truncateUtf8(userText, 1600)}`,
    },
  ];

  const { text } = await openAiCompatibleChatCompletion({
    apiKey: params.openaiKey,
    baseUrl: params.baseUrl ?? "https://api.openai.com/v1",
    model: params.model,
    messages: prompt,
    maxTokens: 220,
  });
  const parsed = safeJsonParseArray(text);
  if (!parsed) return [];
  return normalizeMemoryCandidates(parsed);
}

async function extractMemoryCandidatesViaAnthropic(params: {
  apiKey: string;
  model: string;
  userText: string;
  priorAssistantText?: string;
}): Promise<MemoryCandidate[]> {
  const userText = (params.userText ?? "").trim();
  if (!userText) return [];
  const priorAssistantText = (params.priorAssistantText ?? "").trim();

  const prompt: OpenRouterChatMessage[] = [
    {
      role: "system",
      content:
        "You extract durable personal memory about a user.\n" +
        "Return ONLY valid JSON: an array of objects {\"content\": string, \"pinned\": boolean}.\n" +
        "Rules:\n" +
        "- Only store durable facts/preferences/goals that are likely helpful later.\n" +
        "- Do not store one-off tasks, transient details, secrets, or sensitive info.\n" +
        "- Never store questions; only store declarative facts about the user.\n" +
        "- You may use the prior assistant message for context, but only store facts the user explicitly states or affirms.\n" +
        "- If nothing should be remembered, return [].\n" +
        "- Keep each content item short (<= 200 chars).",
    },
    {
      role: "user",
      content:
        (priorAssistantText ? `Prior assistant message:\n${truncateUtf8(priorAssistantText, 600)}\n\n` : "") +
        `User message:\n${truncateUtf8(userText, 1600)}`,
    },
  ];

  const { text } = await anthropicChatCompletion({
    apiKey: params.apiKey,
    model: params.model,
    messages: prompt,
    maxTokens: 220,
    stream: false,
  });
  const parsed = safeJsonParseArray(text);
  if (!parsed) return [];
  return normalizeMemoryCandidates(parsed);
}

async function extractMemoryCandidatesViaGoogle(params: {
  apiKey: string;
  model: string;
  userText: string;
  priorAssistantText?: string;
}): Promise<MemoryCandidate[]> {
  const userText = (params.userText ?? "").trim();
  if (!userText) return [];
  const priorAssistantText = (params.priorAssistantText ?? "").trim();

  const prompt: OpenRouterChatMessage[] = [
    {
      role: "system",
      content:
        "You extract durable personal memory about a user.\n" +
        "Return ONLY valid JSON: an array of objects {\"content\": string, \"pinned\": boolean}.\n" +
        "Rules:\n" +
        "- Only store durable facts/preferences/goals that are likely helpful later.\n" +
        "- Do not store one-off tasks, transient details, secrets, or sensitive info.\n" +
        "- Never store questions; only store declarative facts about the user.\n" +
        "- You may use the prior assistant message for context, but only store facts the user explicitly states or affirms.\n" +
        "- If nothing should be remembered, return [].\n" +
        "- Keep each content item short (<= 200 chars).",
    },
    {
      role: "user",
      content:
        (priorAssistantText ? `Prior assistant message:\n${truncateUtf8(priorAssistantText, 600)}\n\n` : "") +
        `User message:\n${truncateUtf8(userText, 1600)}`,
    },
  ];

  const { text } = await googleGenerateContent({
    apiKey: params.apiKey,
    model: params.model,
    messages: prompt,
    maxTokens: 220,
  });
  const parsed = safeJsonParseArray(text);
  if (!parsed) return [];
  return normalizeMemoryCandidates(parsed);
}

async function insertPersonalMemoryItems(params: {
  userId: string;
  candidates: MemoryCandidate[];
  existing: PersonalMemoryRow[];
}): Promise<PersonalMemoryRow[]> {
  const updatedAt = new Date().toISOString();

  const existing = params.existing
    .map((row) => ({
      ...row,
      content: String(row.content ?? "").trim(),
    }))
    .filter((row) => row.content);

  const results: PersonalMemoryRow[] = [];
  const toInsert: Array<{ content: string; pinned: boolean }> = [];

  for (const cand of params.candidates) {
    const content = String(cand.content ?? "").trim();
    if (!content) continue;
    if (looksLikeQuestion(content)) continue;

    // If this is a refinement of an existing memory, update in place instead of inserting a duplicate.
    const match = existing.find((row) => isNearDuplicateMemory(content, row.content));
    if (match) {
      const nextPinned = Boolean(match.pinned) || Boolean(cand.pinned);
      const same = normalizeMemoryText(match.content) === normalizeMemoryText(content);
      if (!same || nextPinned !== Boolean(match.pinned)) {
        const res = await supabaseAdminFetch(
          `/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(
            match.id,
          )}&select=id,content,scope,scope_id,pinned,updated_at`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              content,
              pinned: nextPinned,
              updated_at: updatedAt,
            }),
          },
        );
        if (res.ok) {
          const rows = (await res.json()) as PersonalMemoryRow[];
          const row = rows[0];
          if (row) {
            results.push(row);
            match.content = content;
            match.pinned = nextPinned;
            match.updated_at = updatedAt;
          }
        }
      }
      continue;
    }

    // Avoid inserting near-duplicates within the same batch.
    if (toInsert.some((prev) => isNearDuplicateMemory(content, prev.content))) continue;

    toInsert.push({ content, pinned: Boolean(cand.pinned) });
  }

  if (toInsert.length > 0) {
    const res = await supabaseAdminFetch(
      "/rest/v1/personal_memory_items?select=id,content,scope,scope_id,pinned,updated_at",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(
          toInsert.map((row) => ({
            user_id: params.userId,
            content: row.content,
            scope: "global",
            scope_id: null,
            pinned: row.pinned,
            updated_at: updatedAt,
          })),
        ),
      },
    );
    if (res.ok) {
      const inserted = (await res.json()) as PersonalMemoryRow[];
      results.push(...inserted);
    }
  }

  return results;
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const userId = await requireVerifiedUserId(req);
    const input = await readJson<AgentTurnInput>(req);
    const threadId = sanitizeUuid(input.thread_id);
    const maxTokens = Number.isFinite(input.max_tokens) ? Math.max(1, Math.min(2048, Number(input.max_tokens))) : 1024;
    const wantsStream = Boolean(input.stream);

    const thread = await loadThread(threadId);
    if ((thread.engine_id ?? "").trim() === "community_chat") throw new Error("forbidden");
    if ((thread.owner_id ?? "").trim() !== userId) throw new Error("forbidden");
    const aliasModelId = (thread.model_id ?? "").trim() || "gpt-5.2";

    // Parallelize I/O to reduce time-to-first-token.
    const [
      rowsDescResult,
      builderTierResult,
      memorySettingsResult,
      modelSettingsResult,
      memoryRowsResult,
      contextEntitlementResult,
      communityAgentPromptResult,
      modelRegistryResult,
    ] = await Promise.allSettled([
      loadRecentMessages(threadId, 40),
      loadUserBuilderTier(userId),
      loadUserMemorySettings(userId),
      loadUserModelSettings(userId),
      loadPersonalMemoryItems(userId, 32),
      thread.community_id ? userHasActiveEntitlement({ userId, communityId: thread.community_id }) : Promise.resolve(true),
      thread.community_id
        ? loadCommunityAgentSystemPrompt({ userId, communityId: thread.community_id })
        : Promise.resolve(null),
      loadModelRegistryRow(aliasModelId),
    ]);

    if (rowsDescResult.status !== "fulfilled") throw rowsDescResult.reason;

    const rowsDesc = rowsDescResult.value;
    if (rowsDesc.length === 0) throw new Error("No messages in thread");

    const builderTier: BuilderTier =
      builderTierResult.status === "fulfilled" ? builderTierResult.value : "free";
    const hasPersonalMemoryAccess = builderTier !== "free";

    const platformEnabledRaw = getEnv("ARX_PLATFORM_INFERENCE_ENABLED") || getEnv("OPENROUTER_PLATFORM_ENABLED");
    // Kill switch only: if unset, treat platform inference as enabled for paid tiers.
    const platformEnabled = platformEnabledRaw ? isTruthyEnv(platformEnabledRaw) : true;
    const requestedInferenceSource = normalizeInferenceSource(input.inference_source);

    const modelRegistryRow: ModelRegistryRow | null =
      modelRegistryResult.status === "fulfilled" ? modelRegistryResult.value : null;
    if (modelRegistryRow && !modelRegistryRow.enabled) {
      throw new Error("Model is not available.");
    }

    const byokAllowed = modelRegistryRow?.byok_enabled !== false;
    let providerHint: PlatformProvider | null = null;
    if (modelRegistryRow?.provider) {
      try {
        providerHint = normalizePlatformProvider(modelRegistryRow.provider);
      } catch {
        providerHint = null;
      }
    }

    // Default behavior:
    // - Free: BYOK only.
    // - Paid: use platform-provided inference first (BYOK only on explicit request or when platform is unavailable for this model).
    let inferenceSource: InferenceSource = builderTier !== "free" ? "platform" : "user";
    if (requestedInferenceSource) {
      if (requestedInferenceSource === "platform" && builderTier === "free") {
        throw createApiError(
          "platform_inference_not_allowed",
          "Arx platform inference is not included in your plan.",
          403,
          { model_id: aliasModelId, provider: providerHint, byok_allowed: byokAllowed },
        );
      }
      inferenceSource = requestedInferenceSource;
    }
    let inferenceFallback: InferenceFallback | null = null;

    if (inferenceSource === "platform" && !platformEnabled) {
      const byokKey = providerHint
        ? await readUserProviderKeySecret({ userId, provider: providerHint, reveal: false }).catch(() => ({
            hasKey: false,
            key: null,
          }))
        : { hasKey: false, key: null };
      throw createApiError("platform_inference_disabled", "Arx AI is temporarily unavailable.", 503, {
        model_id: aliasModelId,
        provider: providerHint,
        byok_allowed: byokAllowed,
        has_byok_key: byokKey.hasKey,
      });
    }

    // Model-level gating: avoid silently falling back to BYOK (which can spend user credits).
    if (inferenceSource === "platform" && modelRegistryRow?.platform_enabled === false) {
      const byokKey = providerHint
        ? await readUserProviderKeySecret({ userId, provider: providerHint, reveal: false }).catch(() => ({
            hasKey: false,
            key: null,
          }))
        : { hasKey: false, key: null };
      throw createApiError("platform_inference_not_allowed", "Arx AI isn't available for this model.", 403, {
        model_id: aliasModelId,
        provider: providerHint,
        byok_allowed: byokAllowed,
        has_byok_key: byokKey.hasKey,
      });
    }

    if (inferenceSource === "user" && modelRegistryRow?.byok_enabled === false) {
      throw createApiError("byok_inference_not_allowed", "BYOK is not available for this model.", 403, {
        model_id: aliasModelId,
      });
    }

    const memorySettings: UserMemorySettingsRow =
      memorySettingsResult.status === "fulfilled"
        ? memorySettingsResult.value
        : { memory_mode: "off", remember_intent_enabled: true };

    if (!hasPersonalMemoryAccess) {
      memorySettings.memory_mode = "off";
    }

    const modelSettings: UserModelSettingsRow =
      modelSettingsResult.status === "fulfilled"
        ? modelSettingsResult.value
        : { system_prompt: "" };

    const memoryRows: PersonalMemoryRow[] = hasPersonalMemoryAccess
      ? memoryRowsResult.status === "fulfilled"
        ? memoryRowsResult.value
        : []
      : [];

    const hasCommunityContextEntitlement: boolean =
      contextEntitlementResult.status === "fulfilled" ? Boolean(contextEntitlementResult.value) : false;
    const contextCommunityId: string | null = hasCommunityContextEntitlement ? (thread.community_id ?? null) : null;

    const latest = rowsDesc[0];
    if (latest.role !== "user") {
      if (wantsStream) {
        const s = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encodeSse("done", { ok: true, status: "noop", thread_id: threadId }));
            controller.close();
          },
        });
        return new Response(s, {
          status: 200,
          headers: { ...headers, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" },
        });
      }
      return jsonResponse({ ok: true, status: "noop" }, { status: 200, headers });
    }

    const replyToId = latest.id;
    const allowUpdate = input.mode === "regenerate";
    const runId = allowUpdate ? `agent_web_regen:${replyToId}:${Date.now()}` : `agent_web:${replyToId}`;

    if (!allowUpdate) {
      const existing = await loadAssistantReplyId(threadId, replyToId);
      if (existing) {
        if (wantsStream) {
          const s = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encodeSse("done", { ok: true, status: "noop", thread_id: threadId }));
              controller.close();
            },
          });
          return new Response(s, {
            status: 200,
            headers: { ...headers, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" },
          });
        }
        return jsonResponse({ ok: true, status: "noop" }, { status: 200, headers });
      }
    }

    // Rate limits (defense in depth): always per-user; optionally also per-IP.
    const retryAfterSeconds = 60;
    const userRlAllowed = await edgeRateLimitAllowKey({
      key: `agent_turn:user:${userId}`,
      windowSeconds: 60,
      limit: inferenceSource === "platform" ? 20 : 60,
    });
    if (!userRlAllowed) {
      throw createApiError("rate_limited", "Too many requests. Try again soon.", 429, {
        retry_after_seconds: retryAfterSeconds,
      });
    }

    const ipRlAllowed = await edgeRateLimitAllow({
      req,
      key: inferenceSource === "platform" ? "agent_turn_platform" : "agent_turn",
      windowSeconds: 60,
      limit: inferenceSource === "platform" ? 120 : 240,
    });
    if (!ipRlAllowed) {
      throw createApiError("rate_limited", "Too many requests. Try again soon.", 429, {
        retry_after_seconds: retryAfterSeconds,
      });
    }

    let platformRemaining: number | null = null;
    const platformMaxTokensRaw =
      getEnv("ARX_PLATFORM_INFERENCE_MAX_TOKENS") || getEnv("OPENROUTER_PLATFORM_MAX_TOKENS");
    const platformMaxTokens = Number.isFinite(Number(platformMaxTokensRaw))
      ? Math.max(64, Math.min(1024, Math.floor(Number(platformMaxTokensRaw))))
      : 512;

    let platformModel: PlatformModelRef | null = null;
    let platformProviderKey: string | null = null;
    let platformOpenAiCompatibleBaseUrl: string | null = null;

    let byokModel: PlatformModelRef | null = null;
    let byokProviderKey: string | null = null;
    let byokOpenAiCompatibleBaseUrl: string | null = null;

    if (inferenceSource === "platform") {
      let providerHint: PlatformProvider | null = null;
      if (modelRegistryRow?.provider) {
        try {
          providerHint = normalizePlatformProvider(modelRegistryRow.provider);
        } catch {
          providerHint = null;
        }
      }

      try {
        platformModel = await resolvePlatformModelForAliasOrRegistry(aliasModelId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isPlatformModelRoutingMisconfiguredMessage(message)) {
          const provider = providerHint;
          const byokKey = provider
            ? await readUserProviderKeySecret({ userId, provider, reveal: false }).catch(() => ({ hasKey: false, key: null }))
            : { hasKey: false, key: null };
          throw createApiError(
            "platform_inference_misconfigured",
            "Arx AI isn't configured yet for this model.",
            503,
            {
              model_id: aliasModelId,
              provider: provider ?? null,
              byok_allowed: byokAllowed,
              has_byok_key: byokKey.hasKey,
              misconfig: "model_routing",
            },
          );
        }
        throw error;
      }
      switch (platformModel.provider) {
        case "openai": {
          platformProviderKey = getEnv("OPENAI_API_KEY");
          platformOpenAiCompatibleBaseUrl = "https://api.openai.com/v1";
          if (!platformProviderKey) {
            const byokKey = await readUserProviderKeySecret({ userId, provider: "openai", reveal: false }).catch(() => ({
              hasKey: false,
              key: null,
            }));
            throw createApiError("platform_inference_misconfigured", "Arx AI isn't configured yet for OpenAI.", 503, {
              model_id: aliasModelId,
              provider: "openai",
              byok_allowed: byokAllowed,
              has_byok_key: byokKey.hasKey,
              misconfig: "missing_secret",
              missing_secret: "OPENAI_API_KEY",
            });
          }
          break;
        }
        case "x-ai": {
          platformProviderKey = getEnv("XAI_API_KEY");
          platformOpenAiCompatibleBaseUrl = "https://api.x.ai/v1";
          if (!platformProviderKey) {
            const byokKey = await readUserProviderKeySecret({ userId, provider: "x-ai", reveal: false }).catch(() => ({
              hasKey: false,
              key: null,
            }));
            throw createApiError("platform_inference_misconfigured", "Arx AI isn't configured yet for xAI.", 503, {
              model_id: aliasModelId,
              provider: "x-ai",
              byok_allowed: byokAllowed,
              has_byok_key: byokKey.hasKey,
              misconfig: "missing_secret",
              missing_secret: "XAI_API_KEY",
            });
          }
          break;
        }
        case "anthropic": {
          platformProviderKey = getEnv("ANTHROPIC_API_KEY");
          if (!platformProviderKey) {
            const byokKey = await readUserProviderKeySecret({ userId, provider: "anthropic", reveal: false }).catch(() => ({
              hasKey: false,
              key: null,
            }));
            throw createApiError("platform_inference_misconfigured", "Arx AI isn't configured yet for Anthropic.", 503, {
              model_id: aliasModelId,
              provider: "anthropic",
              byok_allowed: byokAllowed,
              has_byok_key: byokKey.hasKey,
              misconfig: "missing_secret",
              missing_secret: "ANTHROPIC_API_KEY",
            });
          }
          break;
        }
        case "google": {
          platformProviderKey = getEnv("GOOGLE_API_KEY");
          if (!platformProviderKey) {
            const byokKey = await readUserProviderKeySecret({ userId, provider: "google", reveal: false }).catch(() => ({
              hasKey: false,
              key: null,
            }));
            throw createApiError("platform_inference_misconfigured", "Arx AI isn't configured yet for Google.", 503, {
              model_id: aliasModelId,
              provider: "google",
              byok_allowed: byokAllowed,
              has_byok_key: byokKey.hasKey,
              misconfig: "missing_secret",
              missing_secret: "GOOGLE_API_KEY",
            });
          }
          break;
        }
        default:
          throw new Error("Unsupported platform model provider");
      }
      try {
        platformRemaining = await consumePlatformInferenceStandard(userId, 1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isPlatformQuotaExceededErrorMessage(message)) {
          const byokKey = await readUserProviderKeySecret({
            userId,
            provider: platformModel.provider,
            reveal: false,
          }).catch(() => ({ hasKey: false, key: null }));
          return jsonResponse(
            {
              ok: false,
              code: "platform_inference_quota_exceeded",
              provider: platformModel.provider,
              has_byok_key: byokKey.hasKey,
              byok_allowed: byokAllowed,
              model_id: aliasModelId,
              message: "You've used your Arx AI quota for this month.",
            },
            { status: 403, headers },
          );
        } else {
          throw error;
        }
      }
    }

    if (inferenceSource === "user") {
      byokModel = await resolveByokModelForAliasOrRegistry(aliasModelId);
      const keyRow = await readUserProviderKeySecret({
        userId,
        provider: byokModel.provider,
        reveal: true,
      });
      const key = (keyRow.key ?? "").trim();
      if (!key) {
        throw new Error(`Missing ${formatProviderLabel(byokModel.provider)} API key. Add it in Settings → Models.`);
      }
      byokProviderKey = key;

      if (byokModel.provider === "openai") byokOpenAiCompatibleBaseUrl = "https://api.openai.com/v1";
      if (byokModel.provider === "x-ai") byokOpenAiCompatibleBaseUrl = "https://api.x.ai/v1";
    }

    const latestUserText = extractTextFromContentJson(latest.content_json);
    let priorAssistantText = "";
    for (let i = 1; i < rowsDesc.length; i++) {
      const row = rowsDesc[i];
      if (row?.role !== "assistant") continue;
      const text = extractTextFromContentJson(row.content_json);
      if (text.trim()) {
        priorAssistantText = text;
        break;
      }
    }

    const [resolvedModelResult, historyRowsResult] = await Promise.allSettled([
      Promise.resolve(inferenceSource === "platform" ? platformModel!.ref : byokModel!.ref),
      loadHistorySnippets({
        userId,
        query: latestUserText,
        excludeThreadId: threadId,
        limit: 4,
      }),
    ]);

    if (resolvedModelResult.status !== "fulfilled") throw resolvedModelResult.reason;
    const resolvedModelId = resolvedModelResult.value;

    const historyRows: HistorySnippetRow[] = historyRowsResult.status === "fulfilled" ? historyRowsResult.value : [];

    const memoryExtractorModelId = inferenceSource === "platform" ? platformModel!.model : byokModel!.model;

    const shouldExtractMemory =
      memorySettings.memory_mode === "suggest" || memorySettings.memory_mode === "auto"
        ? shouldAttemptMemoryExtraction({
            userText: latestUserText,
            priorAssistantText,
            existingMemory: memoryRows,
          })
        : false;

    const memoryCandidatesPromise: Promise<MemoryCandidate[]> = shouldExtractMemory
      ? inferenceSource === "platform"
        ? (async () => {
            switch (platformModel!.provider) {
              case "openai":
                return extractMemoryCandidatesViaOpenAi({
                  openaiKey: platformProviderKey!,
                  model: memoryExtractorModelId,
                  userText: latestUserText,
                  priorAssistantText,
                });
              case "x-ai":
                return extractMemoryCandidatesViaOpenAi({
                  openaiKey: platformProviderKey!,
                  baseUrl: platformOpenAiCompatibleBaseUrl!,
                  model: memoryExtractorModelId,
                  userText: latestUserText,
                  priorAssistantText,
                });
              case "anthropic":
                return extractMemoryCandidatesViaAnthropic({
                  apiKey: platformProviderKey!,
                  model: memoryExtractorModelId,
                  userText: latestUserText,
                  priorAssistantText,
                });
              case "google":
                return extractMemoryCandidatesViaGoogle({
                  apiKey: platformProviderKey!,
                  model: memoryExtractorModelId,
                  userText: latestUserText,
                  priorAssistantText,
                });
              default:
                return [];
            }
          })().catch(() => [])
        : (async () => {
            switch (byokModel!.provider) {
              case "openai":
                return extractMemoryCandidatesViaOpenAi({
                  openaiKey: byokProviderKey!,
                  model: memoryExtractorModelId,
                  userText: latestUserText,
                  priorAssistantText,
                });
              case "x-ai":
                return extractMemoryCandidatesViaOpenAi({
                  openaiKey: byokProviderKey!,
                  baseUrl: byokOpenAiCompatibleBaseUrl!,
                  model: memoryExtractorModelId,
                  userText: latestUserText,
                  priorAssistantText,
                });
              case "anthropic":
                return extractMemoryCandidatesViaAnthropic({
                  apiKey: byokProviderKey!,
                  model: memoryExtractorModelId,
                  userText: latestUserText,
                  priorAssistantText,
                });
              case "google":
                return extractMemoryCandidatesViaGoogle({
                  apiKey: byokProviderKey!,
                  model: memoryExtractorModelId,
                  userText: latestUserText,
                  priorAssistantText,
                });
              default:
                return [];
            }
          })().catch(() => [])
      : Promise.resolve([]);

    const selectedMemory = selectPersonalMemoryForPrompt(memoryRows);
    const memoryPrompt = buildPersonalMemorySystemPrompt(selectedMemory);
    const memoryUsed = selectedMemory.map((item) => ({
      id: item.id,
      content: truncateUtf8(item.content, 800),
      scope: item.scope,
      scope_id: item.scope_id,
      pinned: Boolean(item.pinned),
      updated_at: item.updated_at,
    }));

    const historyPrompt = buildHistorySystemPrompt(historyRows);
    const historyUsed = historyRows.map((row) => ({
      thread_id: row.thread_id,
      message_id: row.message_id,
      created_at: row.created_at,
      snippet: truncateUtf8(row.snippet, 280),
    }));

    const history = [...rowsDesc].reverse();
    const messages: OpenRouterChatMessage[] = [];
    const systemPrompt = String(modelSettings.system_prompt ?? "").trim();
    messages.push({
      role: "system",
      content: systemPrompt ? truncateUtf8(systemPrompt, 6000) : "You are a helpful assistant.",
    });
    const communityAgentPrompt =
      contextCommunityId && communityAgentPromptResult.status === "fulfilled" ? communityAgentPromptResult.value : null;
    if (communityAgentPrompt?.systemPrompt) {
      messages.push({ role: "system", content: truncateUtf8(communityAgentPrompt.systemPrompt, 6000) });
    }
    if (memoryPrompt) {
      messages.push({ role: "system", content: memoryPrompt });
    }
    if (historyPrompt) {
      messages.push({ role: "system", content: historyPrompt });
    }
    for (const row of history) {
      const content = extractTextFromContentJson(row.content_json);
      if (!content.trim()) continue;
      if (row.role === "user" || row.role === "assistant" || row.role === "system") {
        messages.push({
          role: row.role,
          content: inferenceSource === "platform" ? truncateUtf8(content, 2000) : content,
        });
      }
    }

    if (!wantsStream) {
      const requested = maxTokens;
      const effectiveMaxTokens = inferenceSource === "platform" ? Math.min(requested, platformMaxTokens) : requested;
      const { text, usage } =
        inferenceSource === "platform"
          ? await (async () => {
              switch (platformModel!.provider) {
                case "openai":
                  return openAiChatCompletion(platformProviderKey!, platformModel!.model, messages, effectiveMaxTokens);
                case "x-ai":
                  return openAiCompatibleChatCompletion({
                    apiKey: platformProviderKey!,
                    baseUrl: platformOpenAiCompatibleBaseUrl!,
                    model: platformModel!.model,
                    messages,
                    maxTokens: effectiveMaxTokens,
                  });
                case "anthropic":
                  return anthropicChatCompletion({
                    apiKey: platformProviderKey!,
                    model: platformModel!.model,
                    messages,
                    maxTokens: effectiveMaxTokens,
                    stream: false,
                  });
                case "google":
                  return googleGenerateContent({
                    apiKey: platformProviderKey!,
                    model: platformModel!.model,
                    messages,
                    maxTokens: effectiveMaxTokens,
                  });
                default:
                  throw new Error("Unsupported platform model provider");
              }
            })()
          : await (async () => {
              switch (byokModel!.provider) {
                case "openai":
                  return openAiChatCompletion(byokProviderKey!, byokModel!.model, messages, effectiveMaxTokens);
                case "x-ai":
                  return openAiCompatibleChatCompletion({
                    apiKey: byokProviderKey!,
                    baseUrl: byokOpenAiCompatibleBaseUrl!,
                    model: byokModel!.model,
                    messages,
                    maxTokens: effectiveMaxTokens,
                  });
                case "anthropic":
                  return anthropicChatCompletion({
                    apiKey: byokProviderKey!,
                    model: byokModel!.model,
                    messages,
                    maxTokens: effectiveMaxTokens,
                    stream: false,
                  });
                case "google":
                  return googleGenerateContent({
                    apiKey: byokProviderKey!,
                    model: byokModel!.model,
                    messages,
                    maxTokens: effectiveMaxTokens,
                  });
                default:
                  throw new Error("Unsupported BYOK model provider");
              }
            })();

      const memoryCandidates = await memoryCandidatesPromise;

      let memoryAdded: PersonalMemoryRow[] = [];
      if (memorySettings.memory_mode === "auto" && memoryCandidates.length > 0) {
        try {
          memoryAdded = await insertPersonalMemoryItems({ userId, candidates: memoryCandidates, existing: memoryRows });
        } catch {
          memoryAdded = [];
        }
      }

      const meta: Record<string, unknown> = {};
      if (contextCommunityId) meta.context_community_id = contextCommunityId;
      meta.inference_source = inferenceSource;
      if (inferenceFallback) meta.inference_fallback = inferenceFallback;
      if (communityAgentPrompt?.draftId) meta.community_agent_draft_id = communityAgentPrompt.draftId;
      if (inferenceSource === "platform") {
        meta.platform_standard_remaining = platformRemaining;
        meta.platform_provider = platformModel!.provider;
        meta.platform_model = platformModel!.model;
      } else {
        meta.byok_provider = byokModel!.provider;
        meta.byok_model = byokModel!.model;
      }
      if (usage && typeof usage === "object") {
        if (inferenceSource === "platform") meta.platform_usage = usage;
        else meta.byok_usage = usage;
      }
      if (memoryUsed.length > 0) meta.memory_used = memoryUsed;
      if (historyUsed.length > 0) meta.history_used = historyUsed;
      if (memorySettings.memory_mode === "suggest" && memoryCandidates.length > 0) meta.memory_suggestions = memoryCandidates;
      if (memoryAdded.length > 0) meta.memory_added = memoryAdded;

      const result = await writeAssistantReply({
        threadId,
        replyToId,
        contentText: text,
        modelId: aliasModelId,
        openrouterModelId: resolvedModelId,
        runId,
        meta: Object.keys(meta).length > 0 ? meta : null,
        allowUpdate,
      });
      return jsonResponse(
        {
          ok: true,
          status: result.status,
          thread_id: threadId,
          reply_to_id: replyToId,
          run_id: runId,
          inference_source: inferenceSource,
          inference_fallback: inferenceFallback,
          platform_standard_remaining: platformRemaining,
          memory_used: memoryUsed,
          history_used: historyUsed,
          memory_suggestions: memorySettings.memory_mode === "suggest" ? memoryCandidates : [],
          memory_added: memoryAdded,
        },
        { status: 200, headers },
      );
    }

    const streamHeaders = {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: string, data: unknown) => controller.enqueue(encodeSse(event, data));
        try {
          emit("start", {
            ok: true,
            thread_id: threadId,
            reply_to_id: replyToId,
            run_id: runId,
            engine_id: "agent_web",
            model_id: aliasModelId,
            resolved_model_id: resolvedModelId,
            inference_source: inferenceSource,
            inference_fallback: inferenceFallback,
            platform_standard_remaining: platformRemaining,
            memory_used: memoryUsed,
            history_used: historyUsed,
          });

          const requested = maxTokens;
          const effectiveMaxTokens = inferenceSource === "platform" ? Math.min(requested, platformMaxTokens) : requested;
          let fullContent = "";
          let usage: unknown | null = null;

	          if (inferenceSource === "platform") {
	            switch (platformModel!.provider) {
	              case "openai": {
	                const url = `${platformOpenAiCompatibleBaseUrl!.replace(/\/+$/, "")}/chat/completions`;
	                const streamingResponse = await fetch(url, {
	                  method: "POST",
	                  headers: {
	                    Authorization: `Bearer ${platformProviderKey!}`,
	                    "Content-Type": "application/json",
	                  },
	                  body: JSON.stringify({
	                    model: platformModel!.model,
	                    messages,
	                    max_completion_tokens: effectiveMaxTokens,
	                    stream: true,
	                  }),
	                });
	                if (!streamingResponse.ok) {
	                  const body = await streamingResponse.text();
	                  throw new Error(`Platform model error ${streamingResponse.status}: ${body}`);
	                }
	                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: OpenRouterStreamChunk | null = null;
                    try {
                      parsed = JSON.parse(raw) as OpenRouterStreamChunk;
                    } catch {
                      return;
                    }
                    if (parsed?.usage && typeof parsed.usage === "object") usage = parsed.usage;
                    const delta = extractStreamDelta(parsed);
                    if (!delta) return;
                    fullContent += delta;
                    emit("delta", { delta, full_content: fullContent });
                  },
	                });
	                break;
	              }
	              case "x-ai": {
	                const url = `${platformOpenAiCompatibleBaseUrl!.replace(/\/+$/, "")}/chat/completions`;
	                const streamingResponse = await fetch(url, {
	                  method: "POST",
	                  headers: {
	                    Authorization: `Bearer ${platformProviderKey!}`,
	                    "Content-Type": "application/json",
	                  },
	                  body: JSON.stringify({
	                    model: platformModel!.model,
	                    messages,
	                    max_tokens: effectiveMaxTokens,
	                    stream: true,
	                  }),
	                });
	                if (!streamingResponse.ok) {
	                  const body = await streamingResponse.text();
	                  throw new Error(`Platform model error ${streamingResponse.status}: ${body}`);
	                }
	                const reader = streamingResponse.body?.getReader();
	                if (!reader) throw new Error("Missing model stream");

	                await consumeSseEvents({
	                  reader,
	                  onData: (raw) => {
	                    if (raw === "[DONE]") return true;
	                    let parsed: OpenRouterStreamChunk | null = null;
	                    try {
	                      parsed = JSON.parse(raw) as OpenRouterStreamChunk;
	                    } catch {
	                      return;
	                    }
	                    if (parsed?.usage && typeof parsed.usage === "object") usage = parsed.usage;
	                    const delta = extractStreamDelta(parsed);
	                    if (!delta) return;
	                    fullContent += delta;
	                    emit("delta", { delta, full_content: fullContent });
	                  },
	                });
	                break;
	              }
	              case "anthropic": {
	                const { system, messages: anthropicMessages } = toAnthropicSystemAndMessages(messages);
	                const streamingResponse = await fetch("https://api.anthropic.com/v1/messages", {
	                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-api-key": platformProviderKey!,
                    "anthropic-version": getEnv("ANTHROPIC_VERSION") || "2023-06-01",
                  },
                  body: JSON.stringify({
                    model: platformModel!.model,
                    max_tokens: effectiveMaxTokens,
                    stream: true,
                    ...(system ? { system } : {}),
                    messages: anthropicMessages,
                  }),
                });
                if (!streamingResponse.ok) {
                  const body = await streamingResponse.text();
                  throw new Error(`Anthropic error ${streamingResponse.status}: ${body}`);
                }
                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: Record<string, unknown> | null = null;
                    try {
                      parsed = JSON.parse(raw) as Record<string, unknown>;
                    } catch {
                      return;
                    }
                    if (parsed && typeof parsed.usage === "object" && parsed.usage) usage = parsed.usage;
                    const type = String(parsed?.type ?? "").trim();
                    if (type === "message_stop") return true;
                    if (type === "error") {
                      const err = parsed?.error;
                      const msg =
                        err && typeof err === "object" && typeof (err as any).message === "string"
                          ? String((err as any).message)
                          : "Anthropic stream error";
                      throw new Error(msg);
                    }
                    if (type !== "content_block_delta") return;
                    const deltaObj = parsed?.delta as any;
                    const deltaText = typeof deltaObj?.text === "string" ? String(deltaObj.text) : "";
                    if (!deltaText) return;
                    fullContent += deltaText;
                    emit("delta", { delta: deltaText, full_content: fullContent });
                  },
                });
                break;
              }
              case "google": {
                const { system, contents } = toGeminiSystemAndContents(messages);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
                  platformModel!.model,
                )}:streamGenerateContent?alt=sse`;
                const streamingResponse = await fetch(url, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": platformProviderKey!,
                  },
                  body: JSON.stringify({
                    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
                    contents,
                    generationConfig: { maxOutputTokens: effectiveMaxTokens },
                  }),
                });
                if (!streamingResponse.ok) {
                  const body = await streamingResponse.text();
                  throw new Error(`Google error ${streamingResponse.status}: ${body}`);
                }
                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: GeminiResponse | null = null;
                    try {
                      parsed = JSON.parse(raw) as GeminiResponse;
                    } catch {
                      return;
                    }
                    if (parsed?.usageMetadata && typeof parsed.usageMetadata === "object") usage = parsed.usageMetadata;
                    const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
                    const nextText = parts
                      .map((p) => (typeof p?.text === "string" ? p.text : ""))
                      .join("")
                      .trim();
                    if (!nextText) return;
                    if (nextText.startsWith(fullContent)) {
                      const delta = nextText.slice(fullContent.length);
                      if (!delta) return;
                      fullContent = nextText;
                      emit("delta", { delta, full_content: fullContent });
                      return;
                    }
                    // Fallback: emit the entire nextText if the stream is non-monotonic.
                    fullContent = nextText;
                    emit("delta", { delta: nextText, full_content: fullContent });
                  },
                });
                break;
              }
              default:
	                throw new Error("Unsupported platform model provider");
	            }
	          } else {
	            switch (byokModel!.provider) {
	              case "openai": {
	                const url = `${byokOpenAiCompatibleBaseUrl!.replace(/\/+$/, "")}/chat/completions`;
	                const streamingResponse = await fetch(url, {
	                  method: "POST",
	                  headers: {
	                    Authorization: `Bearer ${byokProviderKey!}`,
	                    "Content-Type": "application/json",
	                  },
	                  body: JSON.stringify({
	                    model: byokModel!.model,
	                    messages,
	                    max_completion_tokens: effectiveMaxTokens,
	                    stream: true,
	                  }),
	                });
	                if (!streamingResponse.ok) {
	                  const body = await streamingResponse.text();
	                  throw new Error(`BYOK model error ${streamingResponse.status}: ${body}`);
	                }
	                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: OpenRouterStreamChunk | null = null;
                    try {
                      parsed = JSON.parse(raw) as OpenRouterStreamChunk;
                    } catch {
                      return;
                    }
                    if (parsed?.usage && typeof parsed.usage === "object") usage = parsed.usage;
                    const delta = extractStreamDelta(parsed);
                    if (!delta) return;
                    fullContent += delta;
                    emit("delta", { delta, full_content: fullContent });
                  },
	                });
	                break;
	              }
	              case "x-ai": {
	                const url = `${byokOpenAiCompatibleBaseUrl!.replace(/\/+$/, "")}/chat/completions`;
	                const streamingResponse = await fetch(url, {
	                  method: "POST",
	                  headers: {
	                    Authorization: `Bearer ${byokProviderKey!}`,
	                    "Content-Type": "application/json",
	                  },
	                  body: JSON.stringify({
	                    model: byokModel!.model,
	                    messages,
	                    max_tokens: effectiveMaxTokens,
	                    stream: true,
	                  }),
	                });
	                if (!streamingResponse.ok) {
	                  const body = await streamingResponse.text();
	                  throw new Error(`BYOK model error ${streamingResponse.status}: ${body}`);
	                }
	                const reader = streamingResponse.body?.getReader();
	                if (!reader) throw new Error("Missing model stream");

	                await consumeSseEvents({
	                  reader,
	                  onData: (raw) => {
	                    if (raw === "[DONE]") return true;
	                    let parsed: OpenRouterStreamChunk | null = null;
	                    try {
	                      parsed = JSON.parse(raw) as OpenRouterStreamChunk;
	                    } catch {
	                      return;
	                    }
	                    if (parsed?.usage && typeof parsed.usage === "object") usage = parsed.usage;
	                    const delta = extractStreamDelta(parsed);
	                    if (!delta) return;
	                    fullContent += delta;
	                    emit("delta", { delta, full_content: fullContent });
	                  },
	                });
	                break;
	              }
	              case "anthropic": {
	                const { system, messages: anthropicMessages } = toAnthropicSystemAndMessages(messages);
	                const streamingResponse = await fetch("https://api.anthropic.com/v1/messages", {
	                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-api-key": byokProviderKey!,
                    "anthropic-version": getEnv("ANTHROPIC_VERSION") || "2023-06-01",
                  },
                  body: JSON.stringify({
                    model: byokModel!.model,
                    max_tokens: effectiveMaxTokens,
                    stream: true,
                    ...(system ? { system } : {}),
                    messages: anthropicMessages,
                  }),
                });
                if (!streamingResponse.ok) {
                  const body = await streamingResponse.text();
                  throw new Error(`Anthropic error ${streamingResponse.status}: ${body}`);
                }
                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: Record<string, unknown> | null = null;
                    try {
                      parsed = JSON.parse(raw) as Record<string, unknown>;
                    } catch {
                      return;
                    }
                    if (parsed && typeof parsed.usage === "object" && parsed.usage) usage = parsed.usage;
                    const type = String(parsed?.type ?? "").trim();
                    if (type === "message_stop") return true;
                    if (type === "error") {
                      const err = parsed?.error;
                      const msg =
                        err && typeof err === "object" && typeof (err as any).message === "string"
                          ? String((err as any).message)
                          : "Anthropic stream error";
                      throw new Error(msg);
                    }
                    if (type !== "content_block_delta") return;
                    const deltaObj = parsed?.delta as any;
                    const deltaText = typeof deltaObj?.text === "string" ? String(deltaObj.text) : "";
                    if (!deltaText) return;
                    fullContent += deltaText;
                    emit("delta", { delta: deltaText, full_content: fullContent });
                  },
                });
                break;
              }
              case "google": {
                const { system, contents } = toGeminiSystemAndContents(messages);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
                  byokModel!.model,
                )}:streamGenerateContent?alt=sse`;
                const streamingResponse = await fetch(url, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": byokProviderKey!,
                  },
                  body: JSON.stringify({
                    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
                    contents,
                    generationConfig: { maxOutputTokens: effectiveMaxTokens },
                  }),
                });
                if (!streamingResponse.ok) {
                  const body = await streamingResponse.text();
                  throw new Error(`Google error ${streamingResponse.status}: ${body}`);
                }
                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: GeminiResponse | null = null;
                    try {
                      parsed = JSON.parse(raw) as GeminiResponse;
                    } catch {
                      return;
                    }
                    if (parsed?.usageMetadata && typeof parsed.usageMetadata === "object") usage = parsed.usageMetadata;
                    const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
                    const nextText = parts
                      .map((p) => (typeof p?.text === "string" ? p.text : ""))
                      .join("")
                      .trim();
                    if (!nextText) return;
                    if (nextText.startsWith(fullContent)) {
                      const delta = nextText.slice(fullContent.length);
                      if (!delta) return;
                      fullContent = nextText;
                      emit("delta", { delta, full_content: fullContent });
                      return;
                    }
                    // Fallback: emit the entire nextText if the stream is non-monotonic.
                    fullContent = nextText;
                    emit("delta", { delta: nextText, full_content: fullContent });
                  },
                });
                break;
              }
              default:
                throw new Error("Unsupported BYOK model provider");
            }
          }

	          const finalText = fullContent.trim();
	          if (!finalText) throw new Error("Model returned an empty response");

            const memoryCandidates = await memoryCandidatesPromise;

            let memoryAdded: PersonalMemoryRow[] = [];
            if (memorySettings.memory_mode === "auto" && memoryCandidates.length > 0) {
              try {
                memoryAdded = await insertPersonalMemoryItems({ userId, candidates: memoryCandidates, existing: memoryRows });
              } catch {
                memoryAdded = [];
              }
            }

            const meta: Record<string, unknown> = {};
            if (contextCommunityId) meta.context_community_id = contextCommunityId;
            meta.inference_source = inferenceSource;
            if (inferenceFallback) meta.inference_fallback = inferenceFallback;
            if (communityAgentPrompt?.draftId) meta.community_agent_draft_id = communityAgentPrompt.draftId;
            if (inferenceSource === "platform") {
              meta.platform_standard_remaining = platformRemaining;
              meta.platform_provider = platformModel!.provider;
              meta.platform_model = platformModel!.model;
            } else {
              meta.byok_provider = byokModel!.provider;
              meta.byok_model = byokModel!.model;
            }
            if (usage && typeof usage === "object") {
              if (inferenceSource === "platform") meta.platform_usage = usage;
              else meta.byok_usage = usage;
            }
            if (memoryUsed.length > 0) meta.memory_used = memoryUsed;
            if (historyUsed.length > 0) meta.history_used = historyUsed;
            if (memorySettings.memory_mode === "suggest" && memoryCandidates.length > 0) meta.memory_suggestions = memoryCandidates;
            if (memoryAdded.length > 0) meta.memory_added = memoryAdded;

	          const result = await writeAssistantReply({
	            threadId,
	            replyToId,
	            contentText: finalText,
	            modelId: aliasModelId,
	            openrouterModelId: resolvedModelId,
	            runId,
              meta: Object.keys(meta).length > 0 ? meta : null,
	            allowUpdate,
	          });

            emit("done", {
              ok: true,
              status: result.status,
              thread_id: threadId,
              reply_to_id: replyToId,
              run_id: runId,
              inference_source: inferenceSource,
              inference_fallback: inferenceFallback,
              platform_standard_remaining: platformRemaining,
              memory_used: memoryUsed,
              history_used: historyUsed,
              memory_suggestions: memorySettings.memory_mode === "suggest" ? memoryCandidates : [],
              memory_added: memoryAdded,
	          });
	          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit("error", { ok: false, error: message });
          controller.close();
        }
      },
    });

    return new Response(stream, { status: 200, headers: streamHeaders });
  } catch (error) {
    if (isApiError(error)) {
      const details = (error.details ?? {}) as Record<string, unknown>;
      const retryAfter =
        typeof details.retry_after_seconds === "number" && Number.isFinite(details.retry_after_seconds)
          ? Math.max(0, Math.floor(details.retry_after_seconds))
          : null;
      return jsonResponse(
        {
          ok: false,
          code: error.code,
          error: error.code,
          message: error.message,
          ...details,
        },
        {
          status: error.status,
          headers: retryAfter ? { ...headers, "Retry-After": String(retryAfter) } : headers,
        },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "forbidden" ? 403 : message === "rate_limited" ? 429 : 400;
    return jsonResponse({ ok: false, error: message }, { status, headers });
  }
});
