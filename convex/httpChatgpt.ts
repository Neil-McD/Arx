import {
  buildAssistantToolCallMessage,
  parseNativeToolArguments,
  type NativeToolAwareCompletionSuccess,
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
  runChatgptResponsesRequest,
  type ChatgptCompletionFailure,
  type ChatgptFunctionTool,
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

export async function runChatgptNativeToolCompletion(params: {
  ctx: any;
  userId: string;
  modelId: string;
  messages: ChatgptToolAwareMessage[];
  maxTokens: number;
  tools: ChatgptFunctionTool[];
}): Promise<ChatgptNativeToolCompletionSuccess | ChatgptCompletionFailure> {
  const response = await runChatgptResponsesRequest(params);
  if (!("ok" in response) || response.ok === false) return response;

  if (response.parsed.functionCall) {
    let parsedArguments: Record<string, unknown>;
    try {
      parsedArguments = parseNativeToolArguments({
        rawArguments: response.parsed.functionCall.arguments,
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
    return {
      ok: true,
      type: "tool_call",
      providerCallId: response.parsed.functionCall.callId,
      toolName: response.parsed.functionCall.name,
      arguments: parsedArguments,
      assistantToolCallMessage: buildAssistantToolCallMessage({
        content: response.parsed.text.trim() || null,
        providerCallId: response.parsed.functionCall.callId,
        toolName: response.parsed.functionCall.name,
        rawArguments: response.parsed.functionCall.arguments,
      }),
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
  ChatgptNativeToolCompletionSuccess,
  ChatgptResponsesParseResult,
  ChatgptToolAwareMessage,
  RuntimeChatgptMessage,
  StoredChatgptAuthV1,
};
