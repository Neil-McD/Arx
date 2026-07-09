import {
  buildAssistantToolCallsMessage,
  parseNativeToolArguments,
  type NativeToolAwareCompletionSuccess,
  type NativeToolChoice,
} from "../shared/nativeToolProtocol";
import {
  buildChatgptAuthorizeUrl,
  exchangeChatgptCodeForTokens,
  extractChatgptAccountIdFromToken,
  generateChatgptPkce,
  generateChatgptState,
  getFreshChatgptAuthForUser,
  isWebChatgptSpikeEnabled,
  type StoredChatgptAuthV1,
} from "./chatgptAuth";
import {
  DEFAULT_CHATGPT_REASONING_EFFORT,
  DEFAULT_CHATGPT_REASONING_SUMMARY_LEVEL,
  runChatgptResponsesRequest,
  runChatgptResponsesStreamingRequest,
  type ChatgptCodexRequestMetadata,
  type ChatgptCompletionFailure,
  type ChatgptFunctionTool,
  type ChatgptTransportRetryPolicy,
  type ChatgptResponsesParseResult,
  type ChatgptToolAwareMessage,
  type RuntimeChatgptMessage,
} from "./chatgptResponsesTransport";

type ChatgptCompletionSuccess = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
  resolvedModelId: string | null;
};

type ChatgptNativeToolCompletionSuccess = NativeToolAwareCompletionSuccess<string>;

export async function runChatgptCompletion(params: {
  ctx: any;
  userId: string;
  modelId: string;
  messages: RuntimeChatgptMessage[];
  maxTokens: number;
  requestMetadata?: ChatgptCodexRequestMetadata | null;
  signal?: AbortSignal;
}): Promise<ChatgptCompletionSuccess | ChatgptCompletionFailure> {
  const response = await runChatgptResponsesRequest(params);
  if (!("ok" in response) || response.ok === false) return response;
  const text = response.parsed.text.trim();
  if (!text) {
    return {
      ok: false,
      status: 502,
      code: "provider_empty_response",
      message: "ChatGPT returned an empty response.",
    };
  }
  return {
    content: text,
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    resolvedModelId: response.parsed.modelId,
  };
}

export async function runChatgptStreamingCompletion(params: {
  ctx: any;
  userId: string;
  modelId: string;
  messages: Array<RuntimeChatgptMessage | ChatgptToolAwareMessage>;
  maxTokens: number;
  onDelta?: (delta: string) => void;
  onReasoningSummaryTextDelta?: (params: { delta: string; summaryIndex: number }) => Promise<void> | void;
  onReasoningSummaryPartAdded?: (params: { summaryIndex: number }) => Promise<void> | void;
  requestMetadata?: ChatgptCodexRequestMetadata | null;
  signal?: AbortSignal;
}): Promise<ChatgptCompletionSuccess | ChatgptCompletionFailure> {
  const response = await runChatgptResponsesStreamingRequest({
    ...params,
    reasoningEffort: DEFAULT_CHATGPT_REASONING_EFFORT,
    reasoningSummary: DEFAULT_CHATGPT_REASONING_SUMMARY_LEVEL,
  });
  if (!("ok" in response) || response.ok === false) return response;
  if (response.parsed.functionCalls.length > 0) {
    return {
      ok: false,
      status: 502,
      code: "invalid_model_output",
      message: "ChatGPT returned an unexpected tool call.",
    };
  }
  const text = response.parsed.text.trim();
  if (!text) {
    return {
      ok: false,
      status: 502,
      code: "provider_empty_response",
      message: "ChatGPT returned an empty response.",
    };
  }
  return {
    content: text,
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    resolvedModelId: response.parsed.modelId,
  };
}

export async function runChatgptNativeToolCompletion(params: {
  ctx: any;
  userId: string;
  modelId: string;
  messages: ChatgptToolAwareMessage[];
  maxTokens: number;
  tools: ChatgptFunctionTool[];
  parallelToolCalls?: boolean;
  toolChoice?: NativeToolChoice;
  onReasoningSummaryTextDelta?: (params: { delta: string; summaryIndex: number }) => Promise<void> | void;
  onReasoningSummaryPartAdded?: (params: { summaryIndex: number }) => Promise<void> | void;
  requestMetadata?: ChatgptCodexRequestMetadata | null;
  signal?: AbortSignal;
  retryPolicy?: ChatgptTransportRetryPolicy;
  // Opt-in: attach captured reasoning items to the assistant tool-call message
  // so subsequent turns re-send them and the model keeps its chain of thought.
  // Off by default: long many-step loops could push the request size budget.
  carryReasoningItems?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
}): Promise<ChatgptNativeToolCompletionSuccess | ChatgptCompletionFailure> {
  const response = await runChatgptResponsesStreamingRequest({
    ...params,
    reasoningEffort: params.reasoningEffort ?? DEFAULT_CHATGPT_REASONING_EFFORT,
    reasoningSummary: DEFAULT_CHATGPT_REASONING_SUMMARY_LEVEL,
  });
  if (!("ok" in response) || response.ok === false) return response;

  if (response.parsed.functionCalls.length > 0) {
    const parsedToolCalls: Array<{
      callId: string;
      name: string;
      rawArguments: string;
      parsedArguments: Record<string, unknown>;
    }> = [];
    for (const functionCall of response.parsed.functionCalls) {
      let parsedArguments: Record<string, unknown>;
      try {
        parsedArguments = parseNativeToolArguments({
          rawArguments: functionCall.arguments,
          malformedMessage: "ChatGPT returned malformed tool arguments.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "ChatGPT returned malformed tool arguments.";
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
      content: response.parsed.text.trim() || null,
      toolCalls: parsedToolCalls.map((toolCall) => ({
        providerCallId: toolCall.callId,
        toolName: toolCall.name,
        rawArguments: toolCall.rawArguments,
      })),
    });
    if (params.carryReasoningItems && response.parsed.reasoningItems.length > 0) {
      assistantToolCallMessage.reasoningItems = response.parsed.reasoningItems;
    }
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
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        resolvedModelId: response.parsed.modelId,
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
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      resolvedModelId: response.parsed.modelId,
    };
  }

  return {
    ok: true,
    type: "assistant",
    assistantText: response.parsed.text.trim(),
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    resolvedModelId: response.parsed.modelId,
  };
}

export {
  buildChatgptAuthorizeUrl,
  exchangeChatgptCodeForTokens,
  extractChatgptAccountIdFromToken,
  generateChatgptPkce,
  generateChatgptState,
  getFreshChatgptAuthForUser,
  isWebChatgptSpikeEnabled,
};

export type {
  ChatgptCompletionFailure,
  ChatgptFunctionTool,
  ChatgptCodexRequestMetadata,
  ChatgptNativeToolCompletionSuccess,
  ChatgptResponsesParseResult,
  ChatgptToolAwareMessage,
  RuntimeChatgptMessage,
  StoredChatgptAuthV1,
};
