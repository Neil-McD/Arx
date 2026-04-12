import {
  buildAssistantToolCallMessage,
  parseNativeToolArguments,
  type NativeToolAwareCompletionSuccess,
  type NativeToolAwareMessage,
} from "../shared/nativeToolProtocol";
import type { RetrievalToolName } from "../shared/retrievalTools";
import { parseOpenRouterError } from "./httpRuntimeSupport";

type OpenAiCompatibleFunctionTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown> | boolean;
    strict: true;
  };
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

function normalizeOpenAiToolCallName(raw: unknown): RetrievalToolName | null {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "list_dir" || normalized === "read") return normalized;
  return null;
}

export async function runOpenRouterNativeToolCompletion(params: {
  modelRef: string;
  messages: NativeToolAwareMessage[];
  maxTokens: number;
  tools: OpenAiCompatibleFunctionTool[];
  apiKeyOverride?: string | null;
  signal?: AbortSignal;
}): Promise<
  | NativeToolAwareCompletionSuccess<RetrievalToolName>
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      pendingToolCallId?: string;
      pendingToolName?: string;
    }
> {
  const apiKey = String(params.apiKeyOverride ?? "").trim() || readEnv("OPENROUTER_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      code: "provider_inference_misconfigured",
      message: params.apiKeyOverride ? "User provider key is unavailable." : "OPENROUTER_API_KEY is not configured.",
    };
  }

  const referer = readEnv("ARX_OPENROUTER_REFERER") || "https://arx.app";
  const requestBody: Record<string, unknown> = {
    model: params.modelRef,
    messages: params.messages,
    max_tokens: params.maxTokens,
    stream: false,
    tools: params.tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
  };
  if (params.modelRef.toLowerCase().includes(":free")) {
    requestBody.provider = { data_collection: "allow" };
  }

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": "Arx",
      },
      signal: params.signal,
      body: JSON.stringify(requestBody),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      code: "provider_inference_unavailable",
      message: "Inference provider is temporarily unavailable.",
    };
  }

  const raw = await response.text();
  if (!response.ok) {
    const parsed = parseOpenRouterError(raw);
    const messageLower = String(parsed.message ?? "").toLowerCase();
    const isFreeModel = params.modelRef.toLowerCase().includes(":free");
    let code = parsed.code || "provider_inference_error";
    let message = parsed.message || `OpenRouter error (${response.status})`;
    if (response.status === 429) {
      code = "rate_limited";
      message = isFreeModel
        ? "Free model is temporarily saturated. Retry in a moment."
        : "Provider is rate limiting requests. Retry in a moment.";
    } else if (
      response.status === 402 ||
      messageLower.includes("quota") ||
      messageLower.includes("credit") ||
      messageLower.includes("insufficient")
    ) {
      code = "provider_inference_quota_exceeded";
    } else if (response.status === 401 || response.status === 403) {
      code = "provider_inference_misconfigured";
    }
    return {
      ok: false,
      status: response.status,
      code,
      message,
    };
  }

  try {
    const parsed = JSON.parse(raw) as {
      choices?: Array<{
        message?: {
          content?: unknown;
          tool_calls?: Array<{
            id?: unknown;
            function?: {
              name?: unknown;
              arguments?: unknown;
            };
          }>;
        };
      }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };
    const message = parsed?.choices?.[0]?.message;
    const promptTokens = Number(parsed?.usage?.prompt_tokens);
    const completionTokens = Number(parsed?.usage?.completion_tokens);
    const toolCall = Array.isArray(message?.tool_calls) ? message.tool_calls[0] : null;
    if (toolCall) {
      const toolName = normalizeOpenAiToolCallName(toolCall.function?.name);
      const providerCallId = String(toolCall.id ?? "").trim();
      const rawArguments = String(toolCall.function?.arguments ?? "").trim();
      if (!toolName || !providerCallId || !rawArguments) {
        return {
          ok: false,
          status: 502,
          code: "invalid_model_output",
          message: "Provider returned an invalid native tool call.",
        };
      }

      let parsedArguments: Record<string, unknown>;
      try {
        parsedArguments = parseNativeToolArguments({
          rawArguments,
          malformedMessage: "Provider returned malformed tool arguments.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Provider returned malformed tool arguments.";
        return {
          ok: false,
          status: 502,
          code: "invalid_model_output",
          message,
        };
      }

      return {
        ok: true,
        type: "tool_call",
        providerCallId,
        toolName,
        arguments: parsedArguments,
        assistantToolCallMessage: buildAssistantToolCallMessage({
          content: typeof message?.content === "string" ? message.content : null,
          providerCallId,
          toolName,
          rawArguments,
        }),
        promptTokens: Number.isFinite(promptTokens) ? Math.floor(promptTokens) : null,
        completionTokens: Number.isFinite(completionTokens) ? Math.floor(completionTokens) : null,
        resolvedModelId: null,
      };
    }

    const content = String(message?.content ?? "").trim();
    return {
      ok: true,
      type: "assistant",
      assistantText: content,
      promptTokens: Number.isFinite(promptTokens) ? Math.floor(promptTokens) : null,
      completionTokens: Number.isFinite(completionTokens) ? Math.floor(completionTokens) : null,
      resolvedModelId: null,
    };
  } catch {
    return {
      ok: false,
      status: 502,
      code: "provider_inference_error",
      message: "OpenRouter returned invalid JSON.",
    };
  }
}
