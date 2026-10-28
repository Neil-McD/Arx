import type { FounderProviderRequestUsage } from "./founderInference";
import type { RetrievalToolName } from "./retrievalTools";

export type NativeToolChoice<TToolName extends string = string> =
  | "auto"
  | "none"
  | {
      type: "function";
      name: TToolName;
    };

export type NativeToolInputContentPart =
  | {
      type: "text";
      text: string;
      source?: "computer_use_observation";
    }
  | {
      type: "image";
      imageUrl: string;
      source?: "computer_use_observation";
    };

export type NativeToolAwareMessage =
  | {
      role: "system";
      content: string;
    }
  | {
      role: "user";
      content: string | NativeToolInputContentPart[];
    }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
      // Provider-opaque reasoning items (e.g. ChatGPT encrypted reasoning) that
      // preceded this assistant output. Re-sent verbatim ahead of the message so
      // the model resumes its chain of thought instead of re-deriving it.
      reasoningItems?: Array<Record<string, unknown>>;
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

export function extractTextFromNativeToolMessageContent(
  content: string | NativeToolInputContentPart[] | null | undefined,
): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is Extract<NativeToolInputContentPart, { type: "text" }> =>
      Boolean(part && part.type === "text"),
    )
    .map((part) => String(part.text ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export type NativeToolAssistantMessage = Extract<NativeToolAwareMessage, { role: "assistant" }>;

export type NativeToolCallRequest<TToolName extends string = RetrievalToolName> = {
  providerCallId: string;
  toolName: TToolName;
  arguments: Record<string, unknown>;
};

export type NativeToolAwareCompletionSuccess<TToolName extends string = RetrievalToolName> =
  | {
      ok: true;
      type: "assistant";
      assistantText: string;
      promptTokens: number | null;
      completionTokens: number | null;
      resolvedModelId: string | null;
      providerRequestUsage?: FounderProviderRequestUsage;
    }
  | {
      ok: true;
      type: "tool_call";
      providerCallId: string;
      toolName: TToolName;
      arguments: Record<string, unknown>;
      assistantToolCallMessage: NativeToolAssistantMessage;
      promptTokens: number | null;
      completionTokens: number | null;
      resolvedModelId: string | null;
      providerRequestUsage?: FounderProviderRequestUsage;
    }
  | {
      ok: true;
      type: "tool_calls";
      toolCalls: NativeToolCallRequest<TToolName>[];
      assistantToolCallMessage: NativeToolAssistantMessage;
      promptTokens: number | null;
      completionTokens: number | null;
      resolvedModelId: string | null;
      providerRequestUsage?: FounderProviderRequestUsage;
    };

export function buildAssistantToolCallsMessage(params: {
  content: string | null;
  toolCalls: Array<{
    providerCallId: string;
    toolName: string;
    rawArguments: string;
  }>;
}): NativeToolAssistantMessage {
  return {
    role: "assistant",
    content: typeof params.content === "string" && params.content.trim() ? params.content : null,
    tool_calls: params.toolCalls.map((toolCall) => ({
      id: toolCall.providerCallId,
      type: "function",
      function: {
        name: toolCall.toolName,
        arguments: toolCall.rawArguments,
      },
    })),
  };
}

export function buildAssistantToolCallMessage(params: {
  content: string | null;
  providerCallId: string;
  toolName: string;
  rawArguments: string;
}): NativeToolAssistantMessage {
  return buildAssistantToolCallsMessage({
    content: params.content,
    toolCalls: [
      {
        providerCallId: params.providerCallId,
        toolName: params.toolName,
        rawArguments: params.rawArguments,
      },
    ],
  });
}

export function getNativeToolCompletionToolCalls<TToolName extends string>(
  completion: NativeToolAwareCompletionSuccess<TToolName>,
): NativeToolCallRequest<TToolName>[] {
  if (completion.type === "tool_call") {
    return [
      {
        providerCallId: completion.providerCallId,
        toolName: completion.toolName,
        arguments: completion.arguments,
      },
    ];
  }
  if (completion.type === "tool_calls") return completion.toolCalls;
  return [];
}

export function findFirstUnadmittedNativeToolCall<TToolName extends string>(params: {
  completion: NativeToolAwareCompletionSuccess<TToolName>;
  admittedToolNames: readonly TToolName[];
}): NativeToolCallRequest<TToolName> | null {
  const admittedToolNames = new Set<TToolName>(params.admittedToolNames);
  return (
    getNativeToolCompletionToolCalls(params.completion).find(
      (toolCall) => !admittedToolNames.has(toolCall.toolName),
    ) ?? null
  );
}

export function parseNativeToolArguments(params: {
  rawArguments: string;
  malformedMessage: string;
}): Record<string, unknown> {
  try {
    const decoded = JSON.parse(params.rawArguments) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error("tool arguments must be an object");
    }
    return decoded as Record<string, unknown>;
  } catch {
    throw new Error(params.malformedMessage);
  }
}

export function isComputerUseObservationMessage(
  message: NativeToolAwareMessage,
): message is Extract<NativeToolAwareMessage, { role: "user" }> {
  if (message.role !== "user" || !Array.isArray(message.content) || message.content.length === 0) {
    return false;
  }
  return message.content.every((part) => part?.source === "computer_use_observation");
}
