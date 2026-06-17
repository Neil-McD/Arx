import { getFreshChatgptAuthForUser } from "./chatgptAuth";
import type {
  NativeToolAwareMessage,
  NativeToolInputContentPart,
} from "../shared/nativeToolProtocol";
import { parseNativeProviderFunctionCallItem } from "../shared/nativeToolProviderParsers";

const CHATGPT_CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const CHATGPT_CODEX_ORIGINATOR = "codex_cli_rs";
const CHATGPT_CODEX_USER_AGENT = "codex_cli_rs/0.0.0 (PolyNet cloud; Convex; web)";
const CHATGPT_CODEX_INSTALLATION_ID = "6e344508-6ff4-44b0-a158-ef6b596b66f2";
const CHATGPT_CODEX_RETRY_DELAY_MS = 250;

export type RuntimeChatgptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatgptFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown> | boolean;
  strict: boolean;
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
  functionCalls: Array<{
    callId: string;
    name: string;
    arguments: string;
  }>;
};

export type ChatgptCodexRequestMetadata = {
  userId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  installationId?: string | null;
};

type ChatgptReasoningSummaryLevel = "auto" | "concise" | "detailed";
type ChatgptReasoningEffort = "low" | "medium" | "high";
const DEFAULT_CHATGPT_REASONING_SUMMARY_LEVEL: ChatgptReasoningSummaryLevel = "auto";
const DEFAULT_CHATGPT_REASONING_EFFORT: ChatgptReasoningEffort = "medium";

function normalizeHeaderValue(value: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOutboundHeaderValue(value: string | null | undefined, maxLength = 180): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\r\n]/g, " ")
    .replace(/[^\t\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function stableTinyHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function fallbackCodexScopedId(kind: "session" | "thread", metadata?: ChatgptCodexRequestMetadata | null): string {
  const basis =
    normalizeOutboundHeaderValue(metadata?.threadId) ||
    normalizeOutboundHeaderValue(metadata?.sessionId) ||
    normalizeOutboundHeaderValue(metadata?.userId) ||
    "anonymous";
  return `polynet-${kind}-${stableTinyHash(`${kind}:${basis}`)}`;
}

export function buildChatgptCodexRequestHeaders(params: {
  auth: { accessToken: string; accountId?: string | null };
  requestMetadata?: ChatgptCodexRequestMetadata | null;
}): Headers {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${params.auth.accessToken}`);
  headers.set("User-Agent", CHATGPT_CODEX_USER_AGENT);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "text/event-stream");
  headers.set("originator", CHATGPT_CODEX_ORIGINATOR);
  headers.set(
    "session-id",
    normalizeOutboundHeaderValue(params.requestMetadata?.sessionId) ||
      fallbackCodexScopedId("session", params.requestMetadata),
  );
  headers.set(
    "thread-id",
    normalizeOutboundHeaderValue(params.requestMetadata?.threadId) ||
      fallbackCodexScopedId("thread", params.requestMetadata),
  );
  const accountId = normalizeOutboundHeaderValue(params.auth.accountId);
  if (accountId) headers.set("ChatGPT-Account-Id", accountId);
  return headers;
}

function buildChatgptCodexClientMetadata(metadata?: ChatgptCodexRequestMetadata | null): Record<string, unknown> {
  return {
    "x-codex-installation-id":
      normalizeOutboundHeaderValue(metadata?.installationId, 120) || CHATGPT_CODEX_INSTALLATION_ID,
  };
}

function getHeaderValue(response: Response | null | undefined, name: string): string | null {
  const headers = (response as { headers?: unknown } | null | undefined)?.headers as
    | { get?: (name: string) => string | null }
    | undefined;
  if (!headers || typeof headers.get !== "function") return null;
  try {
    return headers.get(name);
  } catch {
    return null;
  }
}

function buildBodyPreview(bytes: Uint8Array): string | null {
  try {
    const decoded = new TextDecoder().decode(bytes).replace(/\s+/g, " ").trim();
    return decoded ? decoded.slice(0, 800) : null;
  } catch {
    return null;
  }
}

type ChatgptCodexHttpFailure = ChatgptCompletionFailure & {
  retryWithFreshAuth: boolean;
};

function failureWithoutRetryFlag(failure: ChatgptCodexHttpFailure): ChatgptCompletionFailure {
  return {
    ok: false,
    status: failure.status,
    code: failure.code,
    message: failure.message,
    contentType: failure.contentType,
    bodyPreview: failure.bodyPreview,
    upstreamRequestId: failure.upstreamRequestId,
    cfRay: failure.cfRay,
  };
}

function looksLikeUsageLimitFailure(status: number, bodyPreview: string | null): boolean {
  const body = String(bodyPreview ?? "").toLowerCase();
  return (
    status === 429 ||
    body.includes("usage_limit") ||
    body.includes("usage limit") ||
    body.includes("rate_limit") ||
    body.includes("rate limit") ||
    body.includes("quota") ||
    body.includes("too many requests")
  );
}

function looksLikeUnsupportedModelFailure(bodyPreview: string | null): boolean {
  const body = String(bodyPreview ?? "").toLowerCase();
  if (!body) return false;
  return (
    (body.includes("model") && body.includes("not supported")) ||
    (body.includes("model") && body.includes("unsupported")) ||
    (body.includes("model") && body.includes("not found")) ||
    (body.includes("model") && body.includes("does not exist")) ||
    body.includes("not supported when using codex")
  );
}

export function classifyChatgptCodexHttpFailure(params: {
  status: number;
  contentType?: string | null;
  bodyPreview?: string | null;
  upstreamRequestId?: string | null;
  cfRay?: string | null;
}): ChatgptCodexHttpFailure {
  const status = params.status >= 400 && params.status < 600 ? params.status : 502;
  const detail = params.bodyPreview ?? "";
  const genericMessage = detail
    ? `ChatGPT inference failed (HTTP ${params.status}): ${detail}`
    : `ChatGPT inference failed (HTTP ${params.status}).`;

  if (status === 401 || status === 403) {
    return {
      ok: false,
      status,
      code: "provider_connection_required",
      message: "Reconnect ChatGPT and retry.",
      contentType: params.contentType ?? null,
      bodyPreview: params.bodyPreview ?? null,
      upstreamRequestId: params.upstreamRequestId ?? null,
      cfRay: params.cfRay ?? null,
      retryWithFreshAuth: true,
    };
  }

  if (looksLikeUsageLimitFailure(status, params.bodyPreview ?? null)) {
    return {
      ok: false,
      status: 429,
      code: "provider_usage_limit",
      message: "ChatGPT/Codex usage limit reached. Retry after the account limit resets.",
      contentType: params.contentType ?? null,
      bodyPreview: params.bodyPreview ?? null,
      upstreamRequestId: params.upstreamRequestId ?? null,
      cfRay: params.cfRay ?? null,
      retryWithFreshAuth: false,
    };
  }

  if (looksLikeUnsupportedModelFailure(params.bodyPreview ?? null)) {
    return {
      ok: false,
      status,
      code: "provider_model_unavailable",
      message: "The selected ChatGPT/Codex model is unavailable for this account.",
      contentType: params.contentType ?? null,
      bodyPreview: params.bodyPreview ?? null,
      upstreamRequestId: params.upstreamRequestId ?? null,
      cfRay: params.cfRay ?? null,
      retryWithFreshAuth: false,
    };
  }

  return {
    ok: false,
    status,
    code: "provider_error",
    message: genericMessage,
    contentType: params.contentType ?? null,
    bodyPreview: params.bodyPreview ?? null,
    upstreamRequestId: params.upstreamRequestId ?? null,
    cfRay: params.cfRay ?? null,
    retryWithFreshAuth: params.status === 404 || params.status >= 500,
  };
}

function waitForChatgptCodexRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, CHATGPT_CODEX_RETRY_DELAY_MS));
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
  const MAX_REQUEST_CONTENT_CHARS = 250_000;
  const modelId = String(params.modelId ?? "").trim();
  if (!modelId) throw new Error("model_id_required");
  if (modelId.length > 128) throw new Error("model_id_too_long");
  if (!Array.isArray(params.messages) || params.messages.length === 0) throw new Error("messages_required");
  if (params.messages.length > 80) throw new Error("messages_exceed_max_count");

  const instructionsParts: string[] = [];
  const inputItems: unknown[] = [];
  let totalChars = 0;

  const addToBudget = (value: string) => {
    totalChars += value.length;
    if (totalChars > MAX_REQUEST_CONTENT_CHARS) {
      throw new Error("messages_exceed_size_budget");
    }
  };

  const mapUserContentParts = (parts: NativeToolInputContentPart[]): unknown[] => {
    const mapped: unknown[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text") {
        const text = String(part.text ?? "").trim();
        if (!text) continue;
        addToBudget(text);
        mapped.push({
          type: "input_text",
          text,
        });
        continue;
      }
      if (part.type === "image") {
        const imageUrl = String(part.imageUrl ?? "").trim();
        if (!imageUrl) continue;
        addToBudget(imageUrl);
        mapped.push({
          type: "input_image",
          image_url: imageUrl,
        });
      }
    }
    return mapped;
  };

  for (const message of params.messages) {
    const role = String(message.role ?? "").trim().toLowerCase();

    if (role === "system") {
      const content = String((message as RuntimeChatgptMessage).content ?? "").trim();
      if (!content) continue;
      addToBudget(content);
      instructionsParts.push(content);
      continue;
    }
    if (role === "user") {
      const rawContent = (message as Extract<ChatgptToolAwareMessage, { role: "user" }>).content;
      const contentParts = Array.isArray(rawContent)
        ? mapUserContentParts(rawContent)
        : (() => {
            const text = String(rawContent ?? "").trim();
            if (!text) return [];
            addToBudget(text);
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
      const assistantMessage = message as Extract<ChatgptToolAwareMessage, { role: "assistant" }>;
      const content = String(assistantMessage.content ?? "").trim();
      if (content) {
        addToBudget(content);
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
          addToBudget(toolArguments);
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
      addToBudget(content);
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

export function buildChatgptCodexRequestPayload(params: {
  modelId: string;
  messages: Array<RuntimeChatgptMessage | ChatgptToolAwareMessage>;
  maxTokens: number;
  tools?: ChatgptFunctionTool[];
  parallelToolCalls?: boolean;
  reasoningSummary?: ChatgptReasoningSummaryLevel | null;
  reasoningEffort?: ChatgptReasoningEffort | null;
  requestMetadata?: ChatgptCodexRequestMetadata | null;
}): Record<string, unknown> {
  const normalized = normalizeChatgptResponsesRequest({
    modelId: params.modelId,
    messages: params.messages,
  });
  const requestBody: Record<string, unknown> = {
    model: params.modelId,
    store: false,
    stream: true,
    input: normalized.inputItems,
    client_metadata: buildChatgptCodexClientMetadata(params.requestMetadata),
  };
  if (Number.isFinite(params.maxTokens) && params.maxTokens > 0) {
    requestBody.max_output_tokens = Math.floor(params.maxTokens);
  }
  if (normalized.instructions) requestBody.instructions = normalized.instructions;
  if (Array.isArray(params.tools) && params.tools.length > 0) {
    requestBody.tools = params.tools;
    requestBody.parallel_tool_calls = params.parallelToolCalls === true;
    requestBody.tool_choice = "auto";
  }
  if (params.reasoningSummary) {
    requestBody.reasoning = {
      effort: params.reasoningEffort ?? DEFAULT_CHATGPT_REASONING_EFFORT,
      summary: params.reasoningSummary,
    };
    requestBody.include = ["reasoning.encrypted_content"];
  }
  return requestBody;
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
    const functionCalls: ChatgptResponsesParseResult["functionCalls"] = [];

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
          functionCalls.push(
            parseNativeProviderFunctionCallItem({
              item,
              providerName: "ChatGPT",
            }),
          );
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

    return { text, modelId, functionCalls };
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
  const functionCalls: ChatgptResponsesParseResult["functionCalls"] = [];
  let text = typeof parsed?.output_text === "string" ? parsed.output_text : "";
  for (const item of outputItems) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "function_call") {
      functionCalls.push(
        parseNativeProviderFunctionCallItem({
          item,
          providerName: "ChatGPT",
        }),
      );
      continue;
    }
    if (!text && item.type === "message") {
      text = extractMessageTextFromOutputItem(item);
    }
  }
  return { text, modelId, functionCalls };
}

export async function runChatgptResponsesRequest(params: {
  ctx: any;
  userId: string;
  modelId: string;
  messages: Array<RuntimeChatgptMessage | ChatgptToolAwareMessage>;
  maxTokens: number;
  tools?: ChatgptFunctionTool[];
  parallelToolCalls?: boolean;
  signal?: AbortSignal;
  reasoningSummary?: ChatgptReasoningSummaryLevel | null;
  reasoningEffort?: ChatgptReasoningEffort | null;
  requestMetadata?: ChatgptCodexRequestMetadata | null;
}): Promise<
  | {
      ok: true;
      parsed: ChatgptResponsesParseResult;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | ChatgptCompletionFailure
> {
  const requestMetadata: ChatgptCodexRequestMetadata = {
    ...params.requestMetadata,
    userId: params.userId,
  };
  let requestBodyText: string;
  try {
    requestBodyText = JSON.stringify(buildChatgptCodexRequestPayload({
      modelId: params.modelId,
      messages: params.messages,
      maxTokens: params.maxTokens,
      tools: params.tools,
      parallelToolCalls: params.parallelToolCalls,
      reasoningSummary: params.reasoningSummary,
      reasoningEffort: params.reasoningEffort,
      requestMetadata,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 400,
      code: "invalid_chatgpt_request",
      message: message || "Invalid ChatGPT request.",
    };
  }

  let firstFailure: ChatgptCompletionFailure | null = null;
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
      const headers = buildChatgptCodexRequestHeaders({
        auth,
        requestMetadata,
      });
      response = await fetch(CHATGPT_CODEX_RESPONSES_URL, {
        method: "POST",
        headers,
        body: requestBodyText,
        signal: params.signal,
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

    const contentType = String(getHeaderValue(response, "content-type") ?? "");
    const body = new Uint8Array(await response.arrayBuffer());
    const upstreamRequestId =
      normalizeHeaderValue(getHeaderValue(response, "x-request-id")) ||
      normalizeHeaderValue(getHeaderValue(response, "openai-request-id")) ||
      normalizeHeaderValue(getHeaderValue(response, "x-openai-request-id"));
    const cfRay = normalizeHeaderValue(getHeaderValue(response, "cf-ray"));
    const bodyPreview = buildBodyPreview(body);
    if (!response.ok) {
      const failure = classifyChatgptCodexHttpFailure({
        status: response.status,
        contentType: contentType || null,
        bodyPreview,
        upstreamRequestId,
        cfRay,
      });
      if (attempt === 0 && failure.retryWithFreshAuth) {
        firstFailure = failureWithoutRetryFlag(failure);
        await waitForChatgptCodexRetry();
        continue;
      }
      return firstFailure || failureWithoutRetryFlag(failure);
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
        firstFailure = {
          ok: false,
          status: 502,
          code: "provider_invalid_response",
          message: message || "ChatGPT inference failed.",
          contentType: contentType || null,
          bodyPreview,
          upstreamRequestId,
          cfRay,
        };
        await waitForChatgptCodexRetry();
        continue;
      }
      return {
        ok: false,
        status: 502,
        code: "provider_invalid_response",
        message: firstFailure?.message || message || "ChatGPT inference failed.",
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

export async function runChatgptResponsesStreamingRequest(params: {
  ctx: any;
  userId: string;
  modelId: string;
  messages: Array<RuntimeChatgptMessage | ChatgptToolAwareMessage>;
  maxTokens: number;
  tools?: ChatgptFunctionTool[];
  onDelta?: (delta: string) => void;
  parallelToolCalls?: boolean;
  onReasoningSummaryTextDelta?: (params: { delta: string; summaryIndex: number }) => Promise<void> | void;
  onReasoningSummaryPartAdded?: (params: { summaryIndex: number }) => Promise<void> | void;
  signal?: AbortSignal;
  reasoningSummary?: ChatgptReasoningSummaryLevel | null;
  reasoningEffort?: ChatgptReasoningEffort | null;
  requestMetadata?: ChatgptCodexRequestMetadata | null;
}): Promise<
  | {
      ok: true;
      parsed: ChatgptResponsesParseResult;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | ChatgptCompletionFailure
> {
  const requestMetadata: ChatgptCodexRequestMetadata = {
    ...params.requestMetadata,
    userId: params.userId,
  };
  let requestBodyText: string;
  try {
    requestBodyText = JSON.stringify(buildChatgptCodexRequestPayload({
      modelId: params.modelId,
      messages: params.messages,
      maxTokens: params.maxTokens,
      tools: params.tools,
      parallelToolCalls: params.parallelToolCalls,
      reasoningSummary: params.reasoningSummary,
      reasoningEffort: params.reasoningEffort,
      requestMetadata,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 400,
      code: "invalid_chatgpt_request",
      message: message || "Invalid ChatGPT request.",
    };
  }

  let firstFailure: ChatgptCompletionFailure | null = null;
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
      const headers = buildChatgptCodexRequestHeaders({
        auth,
        requestMetadata,
      });
      response = await fetch(CHATGPT_CODEX_RESPONSES_URL, {
        method: "POST",
        headers,
        body: requestBodyText,
        signal: params.signal,
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

    const contentType = String(getHeaderValue(response, "content-type") ?? "");
    const upstreamRequestId =
      normalizeHeaderValue(getHeaderValue(response, "x-request-id")) ||
      normalizeHeaderValue(getHeaderValue(response, "openai-request-id")) ||
      normalizeHeaderValue(getHeaderValue(response, "x-openai-request-id"));
    const cfRay = normalizeHeaderValue(getHeaderValue(response, "cf-ray"));

    if (!response.ok) {
      const body = new Uint8Array(await response.arrayBuffer());
      const bodyPreview = buildBodyPreview(body);
      const failure = classifyChatgptCodexHttpFailure({
        status: response.status,
        contentType: contentType || null,
        bodyPreview,
        upstreamRequestId,
        cfRay,
      });
      if (attempt === 0 && failure.retryWithFreshAuth) {
        firstFailure = failureWithoutRetryFlag(failure);
        await waitForChatgptCodexRetry();
        continue;
      }
      return firstFailure || failureWithoutRetryFlag(failure);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        ok: false,
        status: 502,
        code: "provider_invalid_response",
        message: "ChatGPT returned no streaming body.",
        contentType: contentType || null,
        bodyPreview: null,
        upstreamRequestId,
        cfRay,
      };
    }

    let emittedAnyDelta = false;
    try {
      const decoder = new TextDecoder();
      let buffer = "";
      let dataBuffer = "";
      let text = "";
      let sawDelta = false;
      let sawDoneText = false;
      let modelId: string | null = null;
      const functionCalls: ChatgptResponsesParseResult["functionCalls"] = [];
      let doneSeen = false;
      const flushEvent = async (): Promise<Error | null> => {
        const raw = dataBuffer.trim();
        dataBuffer = "";
        if (!raw) return null;
        if (raw === "[DONE]") {
          doneSeen = true;
          return null;
        }

        let parsed: Record<string, any>;
        try {
          parsed = JSON.parse(raw) as Record<string, any>;
        } catch {
          return new Error("ChatGPT returned invalid JSON");
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
          return new Error(message);
        }

        if (kind === "response.output_text.delta") {
          const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
          if (delta) {
            emittedAnyDelta = true;
            sawDelta = true;
            text += delta;
            params.onDelta?.(delta);
          }
          return null;
        }

        if (kind === "response.reasoning_summary_part.added") {
          const summaryIndex = Number(parsed?.summary_index);
          if (Number.isFinite(summaryIndex)) {
            await params.onReasoningSummaryPartAdded?.({
              summaryIndex: Math.max(0, Math.floor(summaryIndex)),
            });
          }
          return null;
        }

        if (kind === "response.reasoning_summary_text.delta") {
          const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
          const summaryIndex = Number(parsed?.summary_index);
          if (delta && Number.isFinite(summaryIndex)) {
            await params.onReasoningSummaryTextDelta?.({
              delta,
              summaryIndex: Math.max(0, Math.floor(summaryIndex)),
            });
          }
          return null;
        }

        if (kind === "response.output_text.done" && !sawDelta && !sawDoneText) {
          const doneText = typeof parsed?.text === "string" ? parsed.text : "";
          if (doneText.trim()) {
            emittedAnyDelta = true;
            sawDoneText = true;
            text += doneText;
            params.onDelta?.(doneText);
          }
          return null;
        }

        if (kind === "response.output_item.done") {
          const item = parsed?.item;
          if (!item || typeof item !== "object") return null;
          if (item.type === "function_call") {
            functionCalls.push(
              parseNativeProviderFunctionCallItem({
                item,
                providerName: "ChatGPT",
              }),
            );
            return null;
          }
          if (!sawDelta && !sawDoneText && item.type === "message") {
            const doneText = extractMessageTextFromOutputItem(item);
            if (doneText.trim()) {
              emittedAnyDelta = true;
              sawDoneText = true;
              text += doneText;
              params.onDelta?.(doneText);
            }
          }
        }
        return null;
      };

      while (!doneSeen) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (true) {
          const idx = buffer.indexOf("\n");
          if (idx < 0) break;
          let line = buffer.slice(0, idx);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          buffer = buffer.slice(idx + 1);
          if (line.startsWith("data:")) {
            dataBuffer += line.slice(5).trim();
            continue;
          }
          if (line === "") {
            const error = await flushEvent();
            if (error) throw error;
          }
        }
      }
      const trailingError = await flushEvent();
      if (trailingError) throw trailingError;
      return {
        ok: true,
        parsed: { text, modelId, functionCalls },
        promptTokens: null,
        completionTokens: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 0 && !emittedAnyDelta) {
        firstFailure = {
          ok: false,
          status: 502,
          code: "provider_invalid_response",
          message: message || "ChatGPT inference failed.",
          contentType: contentType || null,
          bodyPreview: null,
          upstreamRequestId,
          cfRay,
        };
        await waitForChatgptCodexRetry();
        continue;
      }
      return {
        ok: false,
        status: 502,
        code: "provider_invalid_response",
        message: firstFailure?.message || message || "ChatGPT inference failed.",
        contentType: contentType || null,
        bodyPreview: null,
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

export { DEFAULT_CHATGPT_REASONING_EFFORT, DEFAULT_CHATGPT_REASONING_SUMMARY_LEVEL };
