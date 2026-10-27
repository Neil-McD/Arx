
type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string;
};
type RuntimeTurnInputLike = {
  message?: {
    text?: string | null;
  } | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
};
type ProviderCompletionSuccess = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
};
type ProviderCompletionFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
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

function normalizeMessages(raw: unknown): InferenceMessage[] {
  const rows = Array.isArray(raw) ? raw : [];
  const out: InferenceMessage[] = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const roleRaw = String((entry as Record<string, unknown>).role ?? "")
      .trim()
      .toLowerCase();
    const role: InferenceRole | null =
      roleRaw === "user" || roleRaw === "assistant" || roleRaw === "system" ? (roleRaw as InferenceRole) : null;
    if (!role) continue;
    const content = String((entry as Record<string, unknown>).content ?? "").trim();
    if (!content) continue;
    out.push({ role, content });
  }
  return out.slice(-60);
}

function parseProviderError(rawBody: string): { message: string; code: string } {
  const raw = (rawBody ?? "").trim();
  if (!raw) return { message: "", code: "" };
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: unknown; code?: unknown } | string;
      message?: unknown;
      code?: unknown;
    };
    const nestedMessage =
      parsed?.error && typeof parsed.error === "object" && typeof parsed.error.message === "string"
        ? parsed.error.message.trim()
        : "";
    const nestedCode =
      parsed?.error && typeof parsed.error === "object" && (typeof parsed.error.code === "string" || typeof parsed.error.code === "number")
        ? String(parsed.error.code)
        : "";
    const topMessage = typeof parsed?.message === "string" ? parsed.message.trim() : "";
    const topCode = typeof parsed?.code === "string" || typeof parsed?.code === "number" ? String(parsed.code) : "";
    const inlineError = typeof parsed?.error === "string" ? parsed.error.trim() : "";
    return {
      message: nestedMessage || topMessage || inlineError || raw,
      code: nestedCode || topCode,
    };
  } catch {
    return { message: raw, code: "" };
  }
}

export function normalizeMaxTokens(raw: unknown, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(64, Math.min(4096, Math.floor(value)));
}

function normalizeOpenAiMessagesForResponses(messages: InferenceMessage[]): {
  instructions: string | null;
  input: unknown[];
} {
  const instructions: string[] = [];
  const input: unknown[] = [];
  for (const message of messages) {
    const content = String(message.content ?? "").trim();
    if (!content) continue;
    if (message.role === "system") {
      instructions.push(content);
      continue;
    }
    input.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: [
        {
          type: message.role === "assistant" ? "output_text" : "input_text",
          text: content,
        },
      ],
    });
  }
  return {
    instructions: instructions.length > 0 ? instructions.join("\n\n") : null,
    input,
  };
}

function parseOpenAiResponsesText(payload: Record<string, any>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const outputItems = Array.isArray(payload.output) ? payload.output : [];
  let text = "";
  for (const item of outputItems) {
    if (!item || typeof item !== "object" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "output_text" && typeof part.text === "string") text += part.text;
    }
  }
  return text.trim();
}

function parseOpenAiUsage(payload: Record<string, any>): {
  promptTokens: number | null;
  completionTokens: number | null;
} {
  const usage = payload?.usage && typeof payload.usage === "object" ? payload.usage : null;
  const promptTokens = Number(usage?.input_tokens ?? usage?.prompt_tokens);
  const completionTokens = Number(usage?.output_tokens ?? usage?.completion_tokens);
  return {
    promptTokens: Number.isFinite(promptTokens) ? Math.floor(promptTokens) : null,
    completionTokens: Number.isFinite(completionTokens) ? Math.floor(completionTokens) : null,
  };
}

export async function runOpenAiCompletion(params: {
  req: Request;
  modelId: string;
  messages: InferenceMessage[];
  maxTokens: number;
  apiKeyOverride?: string | null;
  signal?: AbortSignal;
}): Promise<ProviderCompletionSuccess | ProviderCompletionFailure> {
  const apiKey = String(params.apiKeyOverride ?? "").trim() || readEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      code: "provider_inference_misconfigured",
      message: params.apiKeyOverride ? "User OpenAI API key is unavailable." : "OPENAI_API_KEY is not configured.",
    };
  }
  const normalized = normalizeOpenAiMessagesForResponses(params.messages);
  if (normalized.input.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "At least one user or assistant message is required.",
    };
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: params.signal,
      body: JSON.stringify({
        model: params.modelId,
        input: normalized.input,
        ...(normalized.instructions ? { instructions: normalized.instructions } : null),
        max_output_tokens: params.maxTokens,
      }),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      code: "provider_inference_unavailable",
      message: "OpenAI inference is temporarily unavailable.",
    };
  }

  const raw = await response.text();
  if (!response.ok) {
    const parsed = parseProviderError(raw);
    return {
      ok: false,
      status: response.status,
      code:
        response.status === 401 || response.status === 403
          ? "provider_inference_misconfigured"
          : response.status === 429
            ? "rate_limited"
            : parsed.code || "provider_inference_error",
      message: parsed.message || `OpenAI error (${response.status})`,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, any>;
    const tokenUsage = parseOpenAiUsage(parsed);
    return {
      content: parseOpenAiResponsesText(parsed),
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
    };
  } catch {
    return {
      ok: false,
      status: 502,
      code: "provider_inference_error",
      message: "OpenAI returned invalid JSON.",
    };
  }
}

export function asRuntimeMessages(input: RuntimeTurnInputLike): InferenceMessage[] {
  const fromList = normalizeMessages(input.messages);
  if (fromList.length > 0) return fromList;
  const text = String(input.message?.text ?? "").trim();
  if (!text) return [];
  return [{ role: "user", content: text }];
}

export function extractTextFromContentJson(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text : typeof record.content === "string" ? record.content : "";
    return String(text ?? "").trim();
  }
  return "";
}

export function extractInferenceSourceFromContentJson(
  value: unknown,
  fallback: "free" | "platform" | "user_key" | "chatgpt",
): "free" | "platform" | "user_key" | "chatgpt" {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const meta = record.meta;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const raw = String((meta as Record<string, unknown>).inference_source ?? "").trim().toLowerCase();
      if (raw === "free" || raw === "platform" || raw === "user_key" || raw === "chatgpt") return raw;
    }
  }
  return fallback;
}
