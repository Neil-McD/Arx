import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { getEnv } from "../_shared/env.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";

type OpenRouterTurnInput = {
  thread_id: string;
  max_tokens?: number;
  stream?: boolean;
  mode?: "respond" | "regenerate";
};

function isTruthyEnv(value: string): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
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

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getBearerToken(req: Request): string {
  const header = (req.headers.get("Authorization") ?? "").trim();
  const [kind, token] = header.split(/\s+/);
  if (!kind || kind.toLowerCase() !== "bearer" || !token) throw new Error("Missing bearer token");
  return token;
}

function getVerifiedJwtSub(token: string): string {
  // `verify_jwt=true` means only verified JWTs reach this function.
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid JWT");
  const payloadJson = new TextDecoder().decode(base64UrlToBytes(parts[1]));
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;
  const sub = String(payload.sub ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(sub)) throw new Error("Invalid JWT subject");
  return sub;
}

type ThreadRow = {
  id: string;
  owner_id: string;
  engine_id: string;
  model_id: string | null;
  community_id: string | null;
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

type OpenRouterKeySource = "user" | "platform";
type OpenRouterKeyResult = { key: string; source: OpenRouterKeySource };

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

type OpenRouterModel = { id: string; name?: string | null };
type OpenRouterModelsResponse = { data: OpenRouterModel[] };

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const out = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return out;
}

type AliasDef = {
  alias: string;
  keywords: string[];
  preferred_provider?: string;
};

const ALIASES: AliasDef[] = [
  { alias: "gpt-5.1", keywords: ["gpt", "5.1"], preferred_provider: "openai" },
  { alias: "gpt-5.2", keywords: ["gpt", "5.2"], preferred_provider: "openai" },
  { alias: "sonnet-4.5", keywords: ["sonnet", "4.5"], preferred_provider: "anthropic" },
  { alias: "opus-4.5", keywords: ["opus", "4.5"], preferred_provider: "anthropic" },
  { alias: "gemini-3-flash", keywords: ["gemini", "3", "flash"], preferred_provider: "google" },
  { alias: "gemini-3-pro", keywords: ["gemini", "3", "pro"], preferred_provider: "google" },
  { alias: "grok-4.1", keywords: ["grok", "4.1"], preferred_provider: "x-ai" },
];

function providerWeight(provider: string): number {
  switch (provider) {
    case "openai":
      return 0;
    case "anthropic":
      return 1;
    case "google":
      return 2;
    case "x-ai":
      return 3;
    default:
      return 9;
  }
}

function providerPrefix(id: string): string | null {
  const idx = id.indexOf("/");
  return idx > 0 ? id.slice(0, idx) : null;
}

let openRouterAliasCache: { fetchedAt: number; keyHash: string; map: Record<string, string> } | null = null;

async function fetchOpenRouterAliasMap(openrouterKey: string): Promise<Record<string, string>> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${openrouterKey}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenRouter models error ${res.status}: ${text}`);
  const parsed = JSON.parse(text) as OpenRouterModelsResponse;

  const candidates = new Map<string, Array<[number, number, number, string]>>();
  for (const def of ALIASES) candidates.set(def.alias, []);

  for (const model of parsed.data ?? []) {
    const id = String(model.id ?? "");
    if (!id.includes("/")) continue;

    const idLower = id.toLowerCase();
    const nameLower = String(model.name ?? "").toLowerCase();
    const provider = providerPrefix(idLower);

    for (const def of ALIASES) {
      let score: number | null = null;
      if (idLower === def.alias || idLower.endsWith(`/${def.alias}`)) {
        score = 0;
      } else if (nameLower && def.keywords.every((k) => nameLower.includes(k))) {
        score = 1;
      } else if (idLower.endsWith(def.alias)) {
        score = 2;
      }
      if (score === null) continue;

      const prefMismatch =
        def.preferred_provider && provider
          ? provider === def.preferred_provider
            ? 0
            : 1
          : 0;
      const weight = providerWeight(provider ?? "");
      candidates.get(def.alias)!.push([score, prefMismatch, weight, id]);
    }
  }

  const map: Record<string, string> = {};
  for (const def of ALIASES) {
    const list = candidates.get(def.alias) ?? [];
    list.sort((a, b) => {
      for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
      }
      return a[3].localeCompare(b[3]);
    });
    const best = list[0]?.[3];
    if (best && best.includes("/")) map[def.alias] = best;
  }
  return map;
}

async function resolveOpenRouterModelId(modelId: string, openrouterKey: string): Promise<string> {
  const cleaned = (modelId ?? "").trim();
  if (!cleaned) throw new Error("Missing model_id");
  if (cleaned.includes("/")) return cleaned;

  const now = Date.now();
  const ttlMs = 60 * 60 * 1000;
  const keyHash = await sha256Hex(openrouterKey);
  if (
    !openRouterAliasCache ||
    openRouterAliasCache.keyHash !== keyHash ||
    now - openRouterAliasCache.fetchedAt > ttlMs
  ) {
    const map = await fetchOpenRouterAliasMap(openrouterKey);
    openRouterAliasCache = { fetchedAt: now, keyHash, map };
  }

  const resolved = openRouterAliasCache.map[cleaned];
  if (!resolved) throw new Error(`Model '${cleaned}' is not available for this OpenRouter key`);
  return resolved;
}

type OpenRouterChatMessage = { role: "system" | "user" | "assistant"; content: string };

type OpenRouterChatCompletion = {
  id?: string;
  choices?: Array<{ message?: { role?: string; content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

async function openRouterChatCompletion(
  openrouterKey: string,
  model: string,
  messages: OpenRouterChatMessage[],
  maxTokens: number,
): Promise<{ text: string; usage?: OpenRouterChatCompletion["usage"] }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
      "X-Title": "Arx",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${text}`);
  const parsed = JSON.parse(text) as OpenRouterChatCompletion;
  const out = String(parsed.choices?.[0]?.message?.content ?? "").trim();
  if (!out) throw new Error("OpenRouter returned an empty response");
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
        engine_id: "openrouter_web",
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
        engine_id: "openrouter_web",
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

async function loadUserOpenRouterKey(userId: string): Promise<OpenRouterKeyResult> {
  // Prefer per-user BYO keys stored in cloud.
  const res = await supabaseAdminFetch("/rest/v1/rpc/read_user_provider_key_secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId, p_provider: "openrouter", p_reveal: true }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ api_key: string | null }>;
  const rowKey = String(rows[0]?.api_key ?? "").trim();
  if (rowKey) return { key: rowKey, source: "user" };

  // Fallback: platform key (optional).
  const platformEnabled = isTruthyEnv(getEnv("OPENROUTER_PLATFORM_ENABLED"));
  const fallback = getEnv("OPENROUTER_API_KEY");
  if (platformEnabled && fallback) return { key: fallback, source: "platform" };

  throw new Error("Missing OpenRouter key. Add it in Settings → Models.");
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

async function extractMemoryCandidates(params: {
  openrouterKey: string;
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

  const { text } = await openRouterChatCompletion(params.openrouterKey, params.model, prompt, 220);
  const parsed = safeJsonParseArray(text);
  if (!parsed) return [];
  return normalizeMemoryCandidates(parsed);
}

async function chooseMemoryExtractionModel(params: {
  openrouterKey: string;
  aliasModelId: string;
  resolvedModelId: string;
}): Promise<string> {
  // Keep memory extraction fast:
  // - Prefer a cheap/fast model if we already warmed the OpenRouter alias cache (i.e. when user picked an alias).
  // - Otherwise, avoid extra /models fetches and just use the already-resolved model.
  if (!params.aliasModelId.includes("/")) {
    try {
      return await resolveOpenRouterModelId("gemini-3-flash", params.openrouterKey);
    } catch {
      // Fall through.
    }
  }
  return params.resolvedModelId;
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
    const token = getBearerToken(req);
    const userId = getVerifiedJwtSub(token);
    const input = await readJson<OpenRouterTurnInput>(req);
    const threadId = sanitizeUuid(input.thread_id);
    const maxTokens = Number.isFinite(input.max_tokens) ? Math.max(1, Math.min(2048, Number(input.max_tokens))) : 1024;
    const wantsStream = Boolean(input.stream);

    const thread = await loadThread(threadId);
    if ((thread.engine_id ?? "").trim() === "community_chat") throw new Error("forbidden");
    if ((thread.owner_id ?? "").trim() !== userId) throw new Error("forbidden");

    // Parallelize I/O to reduce time-to-first-token.
    const [
      rowsDescResult,
      openrouterKeyResult,
      builderTierResult,
      memorySettingsResult,
      modelSettingsResult,
      memoryRowsResult,
    ] = await Promise.allSettled([
      loadRecentMessages(threadId, 40),
      loadUserOpenRouterKey(userId),
      loadUserBuilderTier(userId),
      loadUserMemorySettings(userId),
      loadUserModelSettings(userId),
      loadPersonalMemoryItems(userId, 32),
    ]);

    if (rowsDescResult.status !== "fulfilled") throw rowsDescResult.reason;
    if (openrouterKeyResult.status !== "fulfilled") throw openrouterKeyResult.reason;

    const rowsDesc = rowsDescResult.value;
    if (rowsDesc.length === 0) throw new Error("No messages in thread");

    const openrouterKey = openrouterKeyResult.value;

    const builderTier: BuilderTier =
      builderTierResult.status === "fulfilled" ? builderTierResult.value : "free";
    const hasPersonalMemoryAccess = builderTier !== "free";

    if (openrouterKey.source === "platform" && builderTier === "free") {
      throw new Error("Missing OpenRouter key. Add it in Settings → Models.");
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
    const runId = allowUpdate ? `openrouter_web_regen:${replyToId}:${Date.now()}` : `openrouter_web:${replyToId}`;

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
    const userRlAllowed = await edgeRateLimitAllowKey({
      key: `openrouter_turn:user:${userId}`,
      windowSeconds: 60,
      limit: openrouterKey.source === "platform" ? 20 : 60,
    });
    if (!userRlAllowed) throw new Error("rate_limited");

    const ipRlAllowed = await edgeRateLimitAllow({
      req,
      key: openrouterKey.source === "platform" ? "openrouter_turn_platform" : "openrouter_turn",
      windowSeconds: 60,
      limit: openrouterKey.source === "platform" ? 120 : 240,
    });
    if (!ipRlAllowed) throw new Error("rate_limited");

    let platformRemaining: number | null = null;
    const platformModelId = getEnv("OPENROUTER_PLATFORM_MODEL_ID");
    const platformMaxTokensRaw = getEnv("OPENROUTER_PLATFORM_MAX_TOKENS");
    const platformMaxTokens = Number.isFinite(Number(platformMaxTokensRaw))
      ? Math.max(64, Math.min(1024, Math.floor(Number(platformMaxTokensRaw))))
      : 512;

    if (openrouterKey.source === "platform") {
      if (!platformModelId || !platformModelId.includes("/")) {
        throw new Error("Missing env var: OPENROUTER_PLATFORM_MODEL_ID");
      }
      platformRemaining = await consumePlatformInferenceStandard(userId, 1);
    }

    const aliasModelId = (thread.model_id ?? "").trim() || "gpt-5.2";
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
      openrouterKey.source === "platform" ? Promise.resolve(platformModelId) : resolveOpenRouterModelId(aliasModelId, openrouterKey.key),
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

    const memoryExtractorModelId =
      openrouterKey.source === "platform"
        ? resolvedModelId
        : await chooseMemoryExtractionModel({
            openrouterKey: openrouterKey.key,
            aliasModelId,
            resolvedModelId,
          });

    const shouldExtractMemory =
      memorySettings.memory_mode === "suggest" || memorySettings.memory_mode === "auto"
        ? shouldAttemptMemoryExtraction({
            userText: latestUserText,
            priorAssistantText,
            existingMemory: memoryRows,
          })
        : false;

    const memoryCandidatesPromise: Promise<MemoryCandidate[]> = shouldExtractMemory
      ? extractMemoryCandidates({
          openrouterKey: openrouterKey.key,
          model: memoryExtractorModelId,
          userText: latestUserText,
          priorAssistantText,
        }).catch(() => [])
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
          content: openrouterKey.source === "platform" ? truncateUtf8(content, 2000) : content,
        });
      }
    }

    if (!wantsStream) {
      const requested = maxTokens;
      const effectiveMaxTokens = openrouterKey.source === "platform" ? Math.min(requested, platformMaxTokens) : requested;
      const { text, usage } = await openRouterChatCompletion(openrouterKey.key, resolvedModelId, messages, effectiveMaxTokens);

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
      meta.inference_source = openrouterKey.source;
      if (openrouterKey.source === "platform") {
        meta.platform_standard_remaining = platformRemaining;
      }
      if (usage && typeof usage === "object") meta.openrouter_usage = usage;
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
          inference_source: openrouterKey.source,
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
	            engine_id: "openrouter_web",
	            model_id: aliasModelId,
	            resolved_model_id: resolvedModelId,
              inference_source: openrouterKey.source,
              platform_standard_remaining: platformRemaining,
	            memory_used: memoryUsed,
              history_used: historyUsed,
	          });

          const requested = maxTokens;
          const effectiveMaxTokens = openrouterKey.source === "platform" ? Math.min(requested, platformMaxTokens) : requested;

          const streamingResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey.key}`,
              "Content-Type": "application/json",
              "X-Title": "Arx",
            },
            body: JSON.stringify({
              model: resolvedModelId,
              messages,
              max_tokens: effectiveMaxTokens,
              stream: true,
            }),
          });
          if (!streamingResponse.ok) throw new Error(`OpenRouter error ${streamingResponse.status}: ${await streamingResponse.text()}`);
          const reader = streamingResponse.body?.getReader();
          if (!reader) throw new Error("Missing OpenRouter stream");

          const decoder = new TextDecoder();
          let lineBuffer = "";
          let dataBuffer = "";
          let fullContent = "";
          let done = false;
          let usage: OpenRouterStreamChunk["usage"] | null = null;

          const flushData = () => {
            const raw = dataBuffer.trim();
            dataBuffer = "";
            if (!raw) return;
            if (raw === "[DONE]") {
              done = true;
              return;
            }
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
          };

          while (!done) {
            const { value, done: streamDone } = await reader.read();
            if (streamDone) break;
            lineBuffer += decoder.decode(value, { stream: true });
            while (true) {
              const idx = lineBuffer.indexOf("\n");
              if (idx < 0) break;
              let line = lineBuffer.slice(0, idx);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              lineBuffer = lineBuffer.slice(idx + 1);
              if (line === "") {
                flushData();
                continue;
              }
              if (line.startsWith("data:")) {
                dataBuffer += line.slice(5).trim();
              }
            }
          }
          flushData();

	          const finalText = fullContent.trim();
	          if (!finalText) throw new Error("OpenRouter returned an empty response");

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
            meta.inference_source = openrouterKey.source;
            if (openrouterKey.source === "platform") {
              meta.platform_standard_remaining = platformRemaining;
            }
            if (usage && typeof usage === "object") meta.openrouter_usage = usage;
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
              inference_source: openrouterKey.source,
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
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "forbidden" ? 403 : message === "rate_limited" ? 429 : 400;
    return jsonResponse({ ok: false, error: message }, { status, headers });
  }
});
