import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { getEnv, isTruthyEnv } from "../_shared/env.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { consumeSseEvents, encodeSse } from "../_shared/sse.ts";

type PublicRole = "user" | "assistant" | "system";
type PublicChatMessage = { role: PublicRole; content: string };

type PublicTurnInput = {
  model_id?: string;
  messages?: PublicChatMessage[];
  stream?: boolean;
  max_tokens?: number;
};

type OpenRouterStreamChunk = {
  choices?: Array<{
    delta?: { content?: string | null } | null;
    message?: { content?: string | null } | null;
    text?: string | null;
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

type OpenRouterErrorEnvelope = {
  error?:
    | {
        message?: string;
        code?: string | number;
      }
    | string;
  message?: string;
  code?: string | number;
};

async function readJsonBounded<T>(req: Request, maxChars = 256_000): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  if (text.length > maxChars) throw new Error("request_too_large");
  return JSON.parse(text) as T;
}

function extractStreamDelta(chunk: OpenRouterStreamChunk): string {
  const choice = chunk.choices?.[0];
  const fromDelta = choice?.delta && typeof choice.delta.content === "string" ? choice.delta.content : null;
  const fromText = typeof choice?.text === "string" ? choice.text : null;
  const fromMessage = choice?.message && typeof choice.message.content === "string" ? choice.message.content : null;
  return (fromDelta ?? fromText ?? fromMessage ?? "").toString();
}

function normalizePublicModelMap(): Record<string, string> {
  const raw = getEnv("ARX_PUBLIC_MODEL_MAP_JSON");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value !== "string") continue;
        const id = String(key ?? "").trim();
        const ref = value.trim();
        if (!id || !ref) continue;
        out[id] = ref;
      }
      return out;
    } catch {
      return {};
    }
  }

  // Safe default: two free OpenRouter models (override with ARX_PUBLIC_MODEL_MAP_JSON).
  return {
    "gpt-oss-120b-free": "openai/gpt-oss-120b:free",
    "deepseek-r1-free": "deepseek/r1-0528:free",
  };
}

function sanitizeMessages(raw: unknown): PublicChatMessage[] {
  const input = Array.isArray(raw) ? (raw as unknown[]) : [];
  const out: PublicChatMessage[] = [];
  for (const msg of input) {
    if (!msg || typeof msg !== "object") continue;
    const roleRaw = (msg as { role?: unknown }).role;
    const role = (typeof roleRaw === "string" ? roleRaw.trim().toLowerCase() : "") as PublicRole;
    if (role !== "user" && role !== "assistant" && role !== "system") continue;
    const contentRaw = (msg as { content?: unknown }).content;
    const content = typeof contentRaw === "string" ? contentRaw : "";
    const trimmed = content.trim();
    if (!trimmed) continue;
    out.push({ role, content: trimmed });
  }
  // Keep the tail of the conversation.
  return out.slice(-40);
}

function clampMaxTokens(input: unknown, cap: number): number {
  const raw = Number(input);
  const requested = Number.isFinite(raw) ? Math.floor(raw) : cap;
  return Math.max(64, Math.min(cap, requested));
}

function openrouterHeaders(req: Request, apiKey: string): Record<string, string> {
  const origin = (req.headers.get("origin") ?? "").trim();
  const referer = origin || getEnv("ARX_OPENROUTER_REFERER") || "https://arx.app";
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": referer,
    "X-Title": "Arx",
  };
}

function parseOpenRouterError(rawBody: string): { message: string; code: string } {
  const raw = (rawBody ?? "").trim();
  if (!raw) return { message: "", code: "" };
  try {
    const parsed = JSON.parse(raw) as OpenRouterErrorEnvelope;
    const err = parsed?.error;
    const nestedMessage =
      err && typeof err === "object" && typeof err.message === "string" ? err.message.trim() : "";
    const nestedCode =
      err && typeof err === "object" && (typeof err.code === "string" || typeof err.code === "number")
        ? String(err.code)
        : "";
    const inlineMessage = typeof err === "string" ? err.trim() : "";
    const topMessage = typeof parsed?.message === "string" ? parsed.message.trim() : "";
    const topCode = typeof parsed?.code === "string" || typeof parsed?.code === "number" ? String(parsed.code) : "";
    return {
      message: nestedMessage || topMessage || inlineMessage || raw,
      code: nestedCode || topCode,
    };
  } catch {
    return { message: raw, code: "" };
  }
}

function isOpenRouterFreeModelPolicyError(message: string): boolean {
  const lower = (message ?? "").toLowerCase();
  if (!lower) return false;
  if (lower.includes("no endpoints found matching your data policy")) return true;
  return lower.includes("free model publication") && lower.includes("privacy");
}

function openRouterFreeModelPolicyHint(): string {
  return "OpenRouter is connected, but privacy settings block free guest models. In OpenRouter Settings -> Privacy, enable Free model publication, or configure ARX_PUBLIC_MODEL_MAP_JSON to non-free models.";
}

function buildOpenRouterBody(params: {
  resolvedModelId: string;
  messages: PublicChatMessage[];
  maxTokens: number;
  stream: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.resolvedModelId,
    messages: params.messages,
    max_tokens: params.maxTokens,
    stream: params.stream,
  };
  // Free models require permissive data policy on OpenRouter.
  if (params.resolvedModelId.toLowerCase().includes(":free")) {
    body.provider = { data_collection: "allow" };
  }
  return body;
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "public_turn", windowSeconds: 60, limit: 20 });
    if (!allowed) {
      return jsonResponse({ ok: false, error: "rate_limited", code: "rate_limited" }, { status: 429, headers });
    }

    const input = await readJsonBounded<PublicTurnInput>(req);
    const wantsStream = input.stream !== false;
    const modelMap = normalizePublicModelMap();
    const allowedIds = Object.keys(modelMap);
    if (allowedIds.length === 0) throw new Error("public_models_not_configured");

    const aliasModelId = String(input.model_id ?? "").trim() || allowedIds[0]!;
    const resolvedModelId = modelMap[aliasModelId];
    if (!resolvedModelId) {
      return jsonResponse(
        { ok: false, error: "model_not_allowed", code: "model_not_allowed", model_id: aliasModelId },
        { status: 403, headers },
      );
    }

    const messages = sanitizeMessages(input.messages);
    if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
      return jsonResponse({ ok: false, error: "no_user_message", code: "no_user_message" }, { status: 400, headers });
    }

    const apiKey = getEnv("OPENROUTER_API_KEY");
    if (!apiKey) {
      return jsonResponse(
        { ok: false, error: "platform_inference_misconfigured", code: "platform_inference_misconfigured" },
        { status: 503, headers },
      );
    }

    const maxTokensCap = 2048;
    const maxTokens = clampMaxTokens(input.max_tokens, maxTokensCap);

    const openrouterUrl = "https://openrouter.ai/api/v1/chat/completions";
    if (!wantsStream) {
      const requestBody = buildOpenRouterBody({
        resolvedModelId,
        messages,
        maxTokens,
        stream: false,
      });
      const res = await fetch(openrouterUrl, {
        method: "POST",
        headers: openrouterHeaders(req, apiKey),
        body: JSON.stringify(requestBody),
      });
      const text = await res.text();
      if (!res.ok) {
        const parsed = parseOpenRouterError(text);
        if (isOpenRouterFreeModelPolicyError(parsed.message)) {
          return jsonResponse(
            {
              ok: false,
              error: "platform_inference_misconfigured",
              code: "platform_inference_misconfigured",
              message: openRouterFreeModelPolicyHint(),
              model_id: aliasModelId,
              resolved_model_id: resolvedModelId,
            },
            { status: 503, headers },
          );
        }
        const details = parsed.message || text;
        throw new Error(`OpenRouter error ${res.status}: ${details}`);
      }
      const parsed = JSON.parse(text) as any;
      const content = String(parsed?.choices?.[0]?.message?.content ?? "").trim();
      return jsonResponse(
        {
          ok: true,
          model_id: aliasModelId,
          resolved_model_id: resolvedModelId,
          engine_id: "public_openrouter",
          content,
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

    const runId = `public:${crypto.randomUUID()}`;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: string, data: unknown) => controller.enqueue(encodeSse(event, data));
        try {
          const requestBody = buildOpenRouterBody({
            resolvedModelId,
            messages,
            maxTokens,
            stream: true,
          });
          const res = await fetch(openrouterUrl, {
            method: "POST",
            headers: openrouterHeaders(req, apiKey),
            body: JSON.stringify(requestBody),
          });
          if (!res.ok) {
            const body = await res.text();
            const parsed = parseOpenRouterError(body);
            if (isOpenRouterFreeModelPolicyError(parsed.message)) {
              throw new Error(openRouterFreeModelPolicyHint());
            }
            const details = parsed.message || body;
            throw new Error(`OpenRouter error ${res.status}: ${details}`);
          }
          const reader = res.body?.getReader();
          if (!reader) throw new Error("Missing model stream");

          emit("start", {
            ok: true,
            run_id: runId,
            engine_id: "public_openrouter",
            model_id: aliasModelId,
            resolved_model_id: resolvedModelId,
          });

          let fullContent = "";
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
              const delta = extractStreamDelta(parsed);
              if (!delta) return;
              fullContent += delta;
              emit("delta", { delta });
            },
          });

          emit("done", { ok: true, run_id: runId, full_content: fullContent });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit("error", { ok: false, error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { status: 200, headers: streamHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});
