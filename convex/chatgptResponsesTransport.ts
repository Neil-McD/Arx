import { getFreshChatgptAuthForUser } from "./chatgptAuth";
import type { NativeToolAwareMessage } from "../shared/nativeToolProtocol";

const CHATGPT_CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";

export type RuntimeChatgptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatgptFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown> | boolean;
  strict: true;
};

export type ChatgptToolAwareMessage = NativeToolAwareMessage;

export type ChatgptCompletionFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  contentType?: string | null;
  bodyPreview?: string | null;
  upstreamRequestId?: string | null;
  cfRay?: string | null;
};

export type ChatgptResponsesParseResult = {
  text: string;
  modelId: string | null;
  functionCall:
    | {
        callId: string;
        name: string;
        arguments: string;
      }
    | null;
};

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

function normalizeChatgptResponsesRequest(params: {
  modelId: string;
  messages: Array<RuntimeChatgptMessage | ChatgptToolAwareMessage>;
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

    if (role === "system") {
      const content = String((message as RuntimeChatgptMessage).content ?? "").trim();
      if (!content) continue;
      totalChars += content.length;
      if (totalChars > 250_000) throw new Error("messages_exceed_size_budget");
      instructionsParts.push(content);
      continue;
    }
    if (role === "user") {
      const content = String((message as RuntimeChatgptMessage).content ?? "").trim();
      if (!content) continue;
      totalChars += content.length;
      if (totalChars > 250_000) throw new Error("messages_exceed_size_budget");
      inputItems.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: content }],
      });
      continue;
    }
    if (role === "assistant") {
      const assistantMessage = message as Extract<ChatgptToolAwareMessage, { role: "assistant" }>;
      const content = String(assistantMessage.content ?? "").trim();
      if (content) {
        totalChars += content.length;
        if (totalChars > 250_000) throw new Error("messages_exceed_size_budget");
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
          totalChars += toolArguments.length;
          if (totalChars > 250_000) throw new Error("messages_exceed_size_budget");
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
      const toolMessage = message as Extract<ChatgptToolAwareMessage, { role: "tool" }>;
      const callId = String(toolMessage.tool_call_id ?? "").trim();
      const content = String(toolMessage.content ?? "").trim();
      if (!callId || !content) throw new Error("tool_result_incomplete");
      totalChars += content.length;
      if (totalChars > 250_000) throw new Error("messages_exceed_size_budget");
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

function parseChatgptResponsesBytes(bytes: Uint8Array, contentType: string): ChatgptResponsesParseResult {
  const body = new TextDecoder().decode(bytes);
  const ssePayloads = extractSseDataPayloads(body);
  if (looksLikeSsePayload(body, contentType) || ssePayloads.length > 0) {
    let text = "";
    let sawDelta = false;
    let sawDoneText = false;
    let modelId: string | null = null;
    let functionCall: ChatgptResponsesParseResult["functionCall"] = null;

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

      if (kind === "response.output_item.done") {
        const item = parsed?.item;
        if (!item || typeof item !== "object") continue;
        if (item.type === "function_call") {
          const callId = typeof item.call_id === "string" ? item.call_id.trim() : "";
          const name = typeof item.name === "string" ? item.name.trim() : "";
          const argumentsText = typeof item.arguments === "string" ? item.arguments.trim() : "";
          if (callId && name && argumentsText) {
            functionCall = {
              callId,
              name,
              arguments: argumentsText,
            };
          }
          continue;
        }
        if (sawDelta || sawDoneText || item.type !== "message") continue;
        const doneText = extractMessageTextFromOutputItem(item);
        if (doneText.trim()) {
          sawDoneText = true;
          text += doneText;
        }
      }
    }

    return { text, modelId, functionCall };
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
  const outputItems = Array.isArray(parsed?.output) ? parsed.output : [];
  let functionCall: ChatgptResponsesParseResult["functionCall"] = null;
  let text = typeof parsed?.output_text === "string" ? parsed.output_text : "";
  for (const item of outputItems) {
    if (!item || typeof item !== "object") continue;
    if (!functionCall && item.type === "function_call") {
      const callId = typeof item.call_id === "string" ? item.call_id.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const argumentsText = typeof item.arguments === "string" ? item.arguments.trim() : "";
      if (callId && name && argumentsText) {
        functionCall = {
          callId,
          name,
          arguments: argumentsText,
        };
      }
      continue;
    }
    if (!text && item.type === "message") {
      text = extractMessageTextFromOutputItem(item);
    }
  }
  return { text, modelId, functionCall };
}

export async function runChatgptResponsesRequest(params: {
  ctx: any;
  userId: string;
  modelId: string;
  messages: Array<RuntimeChatgptMessage | ChatgptToolAwareMessage>;
  maxTokens: number;
  tools?: ChatgptFunctionTool[];
}): Promise<
  | {
      ok: true;
      parsed: ChatgptResponsesParseResult;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | ChatgptCompletionFailure
> {
  let requestBytes: Uint8Array;
  try {
    const normalized = normalizeChatgptResponsesRequest({
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
    if (Array.isArray(params.tools) && params.tools.length > 0) {
      requestBody.tools = params.tools;
      requestBody.parallel_tool_calls = false;
      requestBody.tool_choice = "auto";
    }
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
      return {
        ok: true,
        parsed: parseChatgptResponsesBytes(body, contentType),
        promptTokens: null,
        completionTokens: null,
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
