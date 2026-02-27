import { extractBearerToken } from "./auth.ts";
import { consumeSseEvents } from "./sse.ts";
import { getSupabaseAdmin } from "./supabase_admin.ts";

export type InferenceMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type InferenceLaneResult = {
  assistantText: string;
  engineId: string;
  modelId: string;
  lane: "public" | "platform_fallback";
  sandboxId: null;
};

type ApiErrorFactory = (code: string, message: string, status: number) => Error;

export async function executePublicLane(params: {
  modelId: string;
  messages: InferenceMessage[];
  createApiError: ApiErrorFactory;
}): Promise<InferenceLaneResult> {
  const admin = getSupabaseAdmin();
  const response = await fetch(`${admin.url}/functions/v1/public_turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: params.modelId,
      stream: false,
      messages: params.messages,
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw params.createApiError("public_turn_failed", bodyText || "Public turn failed.", response.status);
  }
  const payload = JSON.parse(bodyText) as {
    ok?: boolean;
    content?: unknown;
    model_id?: unknown;
    engine_id?: unknown;
    error?: unknown;
    message?: unknown;
  };
  if (!payload?.ok) {
    throw params.createApiError(
      "public_turn_failed",
      String(payload?.message ?? payload?.error ?? "Public turn failed."),
      502,
    );
  }
  const assistantText = String(payload.content ?? "").trim();
  if (!assistantText) throw params.createApiError("empty_response", "Model returned an empty response.", 502);
  return {
    assistantText,
    engineId: String(payload.engine_id ?? "public_turn"),
    modelId: String(payload.model_id ?? params.modelId),
    lane: "public",
    sandboxId: null,
  };
}

function extractPlatformDeltaFromSseData(rawData: string): string {
  const trimmed = String(rawData ?? "").trim();
  if (!trimmed || trimmed === "[DONE]") return "";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const choice0 = Array.isArray(parsed.choices) ? (parsed.choices[0] as Record<string, unknown> | undefined) : undefined;
    const delta = choice0 && typeof choice0.delta === "object" && choice0.delta
      ? (choice0.delta as Record<string, unknown>)
      : null;
    const deltaContent = typeof delta?.content === "string" ? delta.content : "";
    if (deltaContent) return deltaContent;
    const text = typeof choice0?.text === "string" ? choice0.text : "";
    if (text) return text;
    const message = choice0 && typeof choice0.message === "object" && choice0.message
      ? (choice0.message as Record<string, unknown>)
      : null;
    const messageContent = typeof message?.content === "string" ? message.content : "";
    if (messageContent) return messageContent;
    const anthropicDelta = parsed.delta && typeof parsed.delta === "object"
      ? (parsed.delta as Record<string, unknown>)
      : null;
    const anthropicText = typeof anthropicDelta?.text === "string" ? anthropicDelta.text : "";
    if (anthropicText) return anthropicText;
    return "";
  } catch {
    return "";
  }
}

export async function executePlatformFallbackLane(params: {
  request: Request;
  modelId: string;
  messages: InferenceMessage[];
  maxTokens: number | null;
  createApiError: ApiErrorFactory;
}): Promise<InferenceLaneResult> {
  const admin = getSupabaseAdmin();
  const token = extractBearerToken(params.request);
  const response = await fetch(`${admin.url}/functions/v1/platform_agent_infer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model_id: params.modelId,
      request: {
        model: params.modelId,
        messages: params.messages,
        stream: true,
        ...(typeof params.maxTokens === "number" && Number.isFinite(params.maxTokens)
          ? { max_tokens: params.maxTokens }
          : null),
      },
    }),
  });
  if (!response.ok) {
    const body = (await response.text()).trim();
    throw params.createApiError(
      "platform_fallback_failed",
      body || "Platform inference failed.",
      response.status,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw params.createApiError("platform_fallback_failed", "Missing platform stream.", 502);
  }

  let fullContent = "";
  await consumeSseEvents({
    reader,
    onData: (raw) => {
      const delta = extractPlatformDeltaFromSseData(raw);
      if (delta) fullContent += delta;
      return false;
    },
  });
  const assistantText = fullContent.trim();
  if (!assistantText) {
    throw params.createApiError("empty_response", "Platform model returned an empty response.", 502);
  }
  return {
    assistantText,
    engineId: "platform_agent_infer",
    modelId: params.modelId,
    lane: "platform_fallback",
    sandboxId: null,
  };
}
