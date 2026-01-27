import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { getEnv } from "../_shared/env.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";

type OpenRouterTurnInput = {
  thread_id: string;
  max_tokens?: number;
  stream?: boolean;
  mode?: "respond" | "regenerate";
};

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

type PersonalMemoryRow = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  updated_at: string;
};

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
  memoryUsed: Array<Pick<PersonalMemoryRow, "id" | "content" | "scope" | "scope_id" | "pinned" | "updated_at">>;
}): Promise<{ inserted: boolean }> {
  const contentJson: Record<string, unknown> = { text: params.contentText };
  if (params.memoryUsed.length > 0) {
    contentJson.meta = {
      memory_used: params.memoryUsed,
    };
  }
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
  memoryUsed: Array<Pick<PersonalMemoryRow, "id" | "content" | "scope" | "scope_id" | "pinned" | "updated_at">>;
}): Promise<void> {
  const contentJson: Record<string, unknown> = { text: params.contentText };
  if (params.memoryUsed.length > 0) {
    contentJson.meta = {
      memory_used: params.memoryUsed,
    };
  }
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
  memoryUsed: Array<Pick<PersonalMemoryRow, "id" | "content" | "scope" | "scope_id" | "pinned" | "updated_at">>;
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
        memoryUsed: params.memoryUsed,
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
        memoryUsed: params.memoryUsed,
      });
      return { status: "updated" };
    }
  }
  return { status: "duplicate" };
}

async function loadUserOpenRouterKey(userId: string): Promise<string> {
  // Prefer per-user BYO keys stored in cloud.
  const res = await supabaseAdminFetch("/rest/v1/rpc/read_user_provider_key_secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId, p_provider: "openrouter", p_reveal: true }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ api_key: string | null }>;
  const rowKey = String(rows[0]?.api_key ?? "").trim();
  if (rowKey) return rowKey;

  // Fallback: platform key (optional).
  const fallback = getEnv("OPENROUTER_API_KEY");
  if (fallback) return fallback;

  throw new Error("Missing OpenRouter key. Add it in Settings → Models.");
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

    const rowsDesc = await loadRecentMessages(threadId, 50);
    if (rowsDesc.length === 0) throw new Error("No messages in thread");

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
    const openrouterKey = await loadUserOpenRouterKey(userId);

    const aliasModelId = (thread.model_id ?? "").trim() || "gpt-5.2";
    const resolvedModelId = await resolveOpenRouterModelId(aliasModelId, openrouterKey);

    const memoryRows = await loadPersonalMemoryItems(userId, 64);
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

    const history = [...rowsDesc].reverse();
    const messages: OpenRouterChatMessage[] = [];
    messages.push({ role: "system", content: "You are a helpful assistant." });
    if (memoryPrompt) {
      messages.push({ role: "system", content: memoryPrompt });
    }
    for (const row of history) {
      const content = extractTextFromContentJson(row.content_json);
      if (!content.trim()) continue;
      if (row.role === "user" || row.role === "assistant" || row.role === "system") {
        messages.push({ role: row.role, content });
      }
    }

    if (!wantsStream) {
      const { text } = await openRouterChatCompletion(openrouterKey, resolvedModelId, messages, maxTokens);
      const result = await writeAssistantReply({
        threadId,
        replyToId,
        contentText: text,
        modelId: aliasModelId,
        openrouterModelId: resolvedModelId,
        runId,
        memoryUsed,
        allowUpdate,
      });
      return jsonResponse(
        {
          ok: true,
          status: result.status,
          thread_id: threadId,
          reply_to_id: replyToId,
          run_id: runId,
          memory_used: memoryUsed,
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
            memory_used: memoryUsed,
          });

          const streamingResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "X-Title": "Arx",
            },
            body: JSON.stringify({
              model: resolvedModelId,
              messages,
              max_tokens: maxTokens,
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

          const result = await writeAssistantReply({
            threadId,
            replyToId,
            contentText: finalText,
            modelId: aliasModelId,
            openrouterModelId: resolvedModelId,
            runId,
            memoryUsed,
            allowUpdate,
          });

          emit("done", {
            ok: true,
            status: result.status,
            thread_id: threadId,
            reply_to_id: replyToId,
            run_id: runId,
            memory_used: memoryUsed,
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
    const status = message === "forbidden" ? 403 : 400;
    return jsonResponse({ ok: false, error: message }, { status, headers });
  }
});
