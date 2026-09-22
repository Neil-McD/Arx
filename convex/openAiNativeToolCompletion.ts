import type { FounderProviderRequestUsage } from "../shared/founderInference";
import {
  buildAssistantToolCallsMessage,
  parseNativeToolArguments,
  type NativeToolAwareCompletionSuccess,
  type NativeToolAwareMessage,
  type NativeToolInputContentPart,
  type NativeToolChoice,
} from "../shared/nativeToolProtocol";
import {
  NativeProviderToolCallParseError,
  parseNativeProviderFunctionCallItem,
} from "../shared/nativeToolProviderParsers";
import {
  CONTEXT_WINDOW_EXCEEDED_CODE,
  CONTEXT_WINDOW_EXCEEDED_MESSAGE,
  isProviderContextWindowExceeded,
} from "../shared/providerContextWindow";

type OpenAiResponsesFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown> | boolean;
  strict: boolean;
};

type OpenAiResponsesParseResult = {
  text: string;
  modelId: string | null;
  providerRequestUsage?: FounderProviderRequestUsage;
  functionCalls: Array<{
    callId: string;
    name: string;
    arguments: string;
  }>;
  promptTokens: number | null;
  completionTokens: number | null;
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

export function normalizeMessagesForResponsesApi(messages: NativeToolAwareMessage[]): {
  instructions: string | null;
  inputItems: unknown[];
} {
  const instructionsParts: string[] = [];
  const inputItems: unknown[] = [];

  const mapUserContentParts = (parts: NativeToolInputContentPart[]): unknown[] => {
    const mapped: unknown[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text") {
        const text = String(part.text ?? "").trim();
        if (!text) continue;
        mapped.push({
          type: "input_text",
          text,
        });
        continue;
      }
      if (part.type === "image") {
        const imageUrl = String(part.imageUrl ?? "").trim();
        if (!imageUrl) continue;
        mapped.push({
          type: "input_image",
          image_url: imageUrl,
        });
      }
    }
    return mapped;
  };

  for (const message of messages) {
    const role = String(message.role ?? "").trim().toLowerCase();

    if (role === "system") {
      const content = String(message.content ?? "").trim();
      if (!content) continue;
      instructionsParts.push(content);
      continue;
    }

    if (role === "user") {
      const rawContent = (message as Extract<NativeToolAwareMessage, { role: "user" }>).content;
      const contentParts = Array.isArray(rawContent)
        ? mapUserContentParts(rawContent)
        : (() => {
            const text = String(rawContent ?? "").trim();
            if (!text) return [];
            return [{ type: "input_text", text }];
          })();
      if (contentParts.length === 0) continue;
      inputItems.push({
        type: "message",
        role: "user",
        content: contentParts,
      });
      continue;
    }

    if (role === "assistant") {
      const assistantMessage = message as Extract<NativeToolAwareMessage, { role: "assistant" }>;
      const content = String(assistantMessage.content ?? "").trim();
      if (content) {
        inputItems.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: content }],
        });
      }
      if (Array.isArray(assistantMessage.tool_calls)) {
        for (const toolCall of assistantMessage.tool_calls) {
          const callId = String(toolCall?.id ?? "").trim();
          const toolName = String(toolCall?.function?.name ?? "").trim();
          const toolArguments = String(toolCall?.function?.arguments ?? "").trim();
          if (!callId || !toolName || !toolArguments) {
            throw new Error("assistant_tool_call_incomplete");
          }
          inputItems.push({
            type: "function_call",
            call_id: callId,
            name: toolName,
            arguments: toolArguments,
          });
        }
      }
      continue;
    }

    if (role === "tool") {
      const toolMessage = message as Extract<NativeToolAwareMessage, { role: "tool" }>;
      const callId = String(toolMessage.tool_call_id ?? "").trim();
      const content = String(toolMessage.content ?? "").trim();
      if (!callId || !content) throw new Error("tool_result_incomplete");
      inputItems.push({
        type: "function_call_output",
        call_id: callId,
        output: content,
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

function extractMessageTextFromOutputItem(item: Record<string, any>): string {
  if (!Array.isArray(item.content)) return "";
  let text = "";
  for (const part of item.content) {
    if (!part || typeof part !== "object") continue;
    if (part.type !== "output_text" && part.type !== "input_text") continue;
    if (typeof part.text === "string" && part.text) text += part.text;
  }
  return text;
}

function parseTokenUsage(payload: Record<string, any>): {
  promptTokens: number | null;
  completionTokens: number | null;
} {
  const usage = payload?.usage && typeof payload.usage === "object" ? payload.usage : null;
  const promptTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.inputTokens ?? usage?.promptTokens;
  const completionTokens = usage?.output_tokens ?? usage?.completion_tokens ?? usage?.outputTokens ?? usage?.completionTokens;
  return {
    promptTokens: Number.isSafeInteger(promptTokens) && promptTokens >= 0 ? promptTokens : null,
    completionTokens: Number.isSafeInteger(completionTokens) && completionTokens >= 0 ? completionTokens : null,
  };
}

export function parseFounderProviderRequestUsage(payload: Record<string, any>): FounderProviderRequestUsage | undefined {
  const usage = parseTokenUsage(payload);
  const cached = payload.usage?.input_tokens_details?.cached_tokens;
  const writes = payload.usage?.input_tokens_details?.cache_write_tokens;
  if (usage.promptTokens === null || usage.completionTokens === null
      || !Number.isSafeInteger(cached) || cached < 0 || !Number.isSafeInteger(writes) || writes < 0
      || cached + writes > usage.promptTokens || typeof payload.id !== "string" || !payload.id
      || typeof payload.model !== "string" || payload.service_tier !== "default") return undefined;
  return { requestId: payload.id, modelId: payload.model, serviceTier: payload.service_tier,
    promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
    cachedInputTokens: cached, cacheWriteTokens: writes };
}

function parseOpenAiResponsesPayload(payload: Record<string, any>): OpenAiResponsesParseResult {
  const outputItems = Array.isArray(payload?.output) ? payload.output : [];
  const modelId =
    (typeof payload?.model === "string" && payload.model.trim()) ||
    (typeof payload?.response?.model === "string" && payload.response.model.trim()) ||
    null;
  const tokenUsage = parseTokenUsage(payload);

  const functionCalls: OpenAiResponsesParseResult["functionCalls"] = [];
  let text = typeof payload?.output_text === "string" ? payload.output_text : "";

  for (const item of outputItems) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "function_call") {
      functionCalls.push(
        parseNativeProviderFunctionCallItem({
          item,
          providerName: "OpenAI",
        }),
      );
      continue;
    }
    if (!text && item.type === "message") {
      text = extractMessageTextFromOutputItem(item);
    }
  }

  return {
    text,
    modelId,
    providerRequestUsage: parseFounderProviderRequestUsage(payload),
    functionCalls,
    promptTokens: tokenUsage.promptTokens,
    completionTokens: tokenUsage.completionTokens,
  };
}

export async function runOpenAiNativeToolCompletion(params: {
  modelId: string;
  messages: NativeToolAwareMessage[];
  maxTokens: number;
  tools: OpenAiResponsesFunctionTool[];
  apiKeyOverride?: string | null;
  parallelToolCalls?: boolean;
  toolChoice?: NativeToolChoice;
  signal?: AbortSignal;
}): Promise<
  | NativeToolAwareCompletionSuccess<string>
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      pendingToolCallId?: string;
      pendingToolName?: string;
    }
> {
  const apiKey = String(params.apiKeyOverride ?? "").trim() || readEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      code: "provider_inference_misconfigured",
      message: params.apiKeyOverride ? "User provider key is unavailable." : "OPENAI_API_KEY is not configured.",
    };
  }

  let requestBody: Record<string, unknown>;
  try {
    const normalized = normalizeMessagesForResponsesApi(params.messages);
    requestBody = {
      model: params.modelId,
      store: false,
      input: normalized.inputItems,
      max_output_tokens: params.maxTokens,
      tools: params.tools,
      tool_choice: params.toolChoice ?? "auto",
      parallel_tool_calls: params.parallelToolCalls === true,
    };
    if (params.modelId === "gpt-6-luna") {
      requestBody.service_tier = "default";
      requestBody.reasoning = { effort: "low" };
    }
    if (normalized.instructions) requestBody.instructions = normalized.instructions;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 400,
      code: "invalid_openai_request",
      message: message || "Invalid OpenAI request.",
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
      body: JSON.stringify(requestBody),
      signal: params.signal,
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
  let parsed: Record<string, any> | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, any>) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      (typeof parsed?.error?.message === "string" && parsed.error.message.trim()) ||
      `OpenAI error (${response.status})`;
    const messageLower = message.toLowerCase();
    let code = "provider_inference_error";
    if (
      isProviderContextWindowExceeded({
        status: response.status,
        code: parsed?.error?.code,
        message,
      })
    ) {
      code = CONTEXT_WINDOW_EXCEEDED_CODE;
    } else if (response.status === 429) {
      code = "rate_limited";
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
      message:
        code === CONTEXT_WINDOW_EXCEEDED_CODE
          ? CONTEXT_WINDOW_EXCEEDED_MESSAGE
          : message,
    };
  }

  if (!parsed) {
    return {
      ok: false,
      status: 502,
      code: "provider_inference_error",
      message: "OpenAI returned invalid JSON.",
    };
  }

  try {
    const result = parseOpenAiResponsesPayload(parsed);
    if (result.functionCalls.length > 0) {
      const parsedToolCalls: Array<{
        callId: string;
        name: string;
        rawArguments: string;
        parsedArguments: Record<string, unknown>;
      }> = [];
      for (const functionCall of result.functionCalls) {
        let parsedArguments: Record<string, unknown>;
        try {
          parsedArguments = parseNativeToolArguments({
            rawArguments: functionCall.arguments,
            malformedMessage: "OpenAI returned malformed tool arguments.",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "OpenAI returned malformed tool arguments.";
          return {
            ok: false,
            status: 502,
            code: "invalid_model_output",
            message,
          };
        }
        parsedToolCalls.push({
          callId: functionCall.callId,
          name: functionCall.name,
          rawArguments: functionCall.arguments,
          parsedArguments,
        });
      }

      const assistantToolCallMessage = buildAssistantToolCallsMessage({
        content: result.text.trim() || null,
        toolCalls: parsedToolCalls.map((toolCall) => ({
          providerCallId: toolCall.callId,
          toolName: toolCall.name,
          rawArguments: toolCall.rawArguments,
        })),
      });
      if (parsedToolCalls.length > 1) {
        return {
          ok: true,
          type: "tool_calls",
          toolCalls: parsedToolCalls.map((toolCall) => ({
            providerCallId: toolCall.callId,
            toolName: toolCall.name,
            arguments: toolCall.parsedArguments,
          })),
          assistantToolCallMessage,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          resolvedModelId: result.modelId,
          providerRequestUsage: result.providerRequestUsage,
        };
      }
      const toolCall = parsedToolCalls[0]!;
      return {
        ok: true,
        type: "tool_call",
        providerCallId: toolCall.callId,
        toolName: toolCall.name,
        arguments: toolCall.parsedArguments,
        assistantToolCallMessage,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        resolvedModelId: result.modelId,
          providerRequestUsage: result.providerRequestUsage,
      };
    }

    return {
      ok: true,
      type: "assistant",
      assistantText: result.text.trim(),
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      resolvedModelId: result.modelId,
          providerRequestUsage: result.providerRequestUsage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI returned an invalid response.";
    return {
      ok: false,
      status: 502,
      code:
        error instanceof NativeProviderToolCallParseError
          ? "invalid_model_output"
          : "provider_inference_error",
      message,
    };
  }
}
