import type { RetrievalToolName } from "./retrievalTools";

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
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

export type NativeToolAssistantMessage = Extract<NativeToolAwareMessage, { role: "assistant" }>;

export type NativeToolAwareCompletionSuccess<TToolName extends string = RetrievalToolName> =
  | {
      ok: true;
      type: "assistant";
      assistantText: string;
      promptTokens: number | null;
      completionTokens: number | null;
      resolvedModelId: string | null;
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
    };

export function buildAssistantToolCallMessage(params: {
  content: string | null;
  providerCallId: string;
  toolName: string;
  rawArguments: string;
}): NativeToolAssistantMessage {
  return {
    role: "assistant",
    content: typeof params.content === "string" && params.content.trim() ? params.content : null,
    tool_calls: [
      {
        id: params.providerCallId,
        type: "function",
        function: {
          name: params.toolName,
          arguments: params.rawArguments,
        },
      },
    ],
  };
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

export function buildToolObservationMessage(params: {
  summaryText: string;
  imageUrl: string;
}): Extract<NativeToolAwareMessage, { role: "user" }> {
  const summaryText = String(params.summaryText ?? "").trim();
  const imageUrl = String(params.imageUrl ?? "").trim();
  if (!summaryText) {
    throw new Error("tool_observation_summary_required");
  }
  if (!imageUrl) {
    throw new Error("tool_observation_image_required");
  }
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: summaryText,
        source: "computer_use_observation",
      },
      {
        type: "image",
        imageUrl,
        source: "computer_use_observation",
      },
    ],
  };
}

export function isComputerUseObservationMessage(
  message: NativeToolAwareMessage,
): message is Extract<NativeToolAwareMessage, { role: "user" }> {
  if (message.role !== "user" || !Array.isArray(message.content) || message.content.length === 0) {
    return false;
  }
  return message.content.every((part) => part?.source === "computer_use_observation");
}
