import type { NativeToolAwareMessage } from "./nativeToolProtocol";
import { estimateRuntimeMessageInputTokens } from "./runtimeInputBudget.ts";

export const CONTEXT_WINDOW_EXCEEDED_CODE = "context_window_exceeded";
export const CONTEXT_WINDOW_EXCEEDED_MESSAGE =
  "This conversation exceeded the selected model's context window.";

const COMPACTION_CHARS_PER_TOKEN = 4;
const RECENT_TOOL_RESULT_TOKEN_BUDGET = 4_096;
const OLDER_TOOL_RESULT_TOKEN_BUDGET = 512;

function normalizeSignal(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const CONTEXT_WINDOW_ERROR_CODES = new Set([
  "context_length_exceeded",
  "context_window_exceeded",
  "prompt_too_long",
  "input_too_long",
]);

export function isProviderContextWindowExceeded(params: {
  status?: number | null;
  code?: unknown;
  message?: unknown;
}): boolean {
  const code = normalizeSignal(params.code);
  if (CONTEXT_WINDOW_ERROR_CODES.has(code)) return true;

  const status = Number(params.status);
  if (![400, 413, 422].includes(status)) return false;

  const message = String(params.message ?? "").trim().toLowerCase();
  if (!message) return false;
  const normalizedMessage = normalizeSignal(message);
  if (
    [...CONTEXT_WINDOW_ERROR_CODES].some((knownCode) =>
      normalizedMessage.includes(knownCode),
    )
  ) {
    return true;
  }
  return (
    /context (length|window).*(exceed|maximum|too (large|long))/.test(message) ||
    /(exceed|maximum|too (large|long)).*context (length|window)/.test(message) ||
    /(prompt|input).*(too long|too many tokens|token limit)/.test(message) ||
    /too many tokens.*(prompt|input|context)/.test(message)
  );
}

export function estimateNativeToolTranscriptTokens(
  messages: readonly NativeToolAwareMessage[],
): number {
  return estimateRuntimeMessageInputTokens(messages).estimatedTokens;
}

function compactTextForProviderContext(value: string, maxTokens: number): string {
  const maxCharacters = Math.max(256, maxTokens * COMPACTION_CHARS_PER_TOKEN);
  if (value.length <= maxCharacters) return value;
  const omittedCharacters = value.length - maxCharacters;
  const marker = `\n...[Polynet compacted ${omittedCharacters} older tool-result characters for model context]...\n`;
  const availableCharacters = Math.max(64, maxCharacters - marker.length);
  const headCharacters = Math.floor(availableCharacters * 0.75);
  const tailCharacters = availableCharacters - headCharacters;
  return `${value.slice(0, headCharacters)}${marker}${value.slice(-tailCharacters)}`;
}

function compactToolResultContent(content: string, maxTokens: number): string {
  try {
    const envelope = JSON.parse(content) as Record<string, unknown>;
    if (
      envelope &&
      typeof envelope === "object" &&
      !Array.isArray(envelope) &&
      typeof envelope.output === "string"
    ) {
      const compactedOutput = compactTextForProviderContext(
        envelope.output,
        maxTokens,
      );
      if (compactedOutput === envelope.output) return content;
      return JSON.stringify({
        ...envelope,
        output: compactedOutput,
      });
    }
  } catch {
    // Some provider-compatible tools return plain text rather than the canonical envelope.
  }
  return compactTextForProviderContext(content, maxTokens);
}

export type ProviderContextProjection = {
  messages: NativeToolAwareMessage[];
  compactedToolResults: number;
  originalEstimatedTokens: number;
  projectedEstimatedTokens: number;
};

export function compactProviderTranscriptForContextRetry(
  messages: readonly NativeToolAwareMessage[],
): ProviderContextProjection {
  let latestToolResultIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "tool") {
      latestToolResultIndex = index;
      break;
    }
  }
  let compactedToolResults = 0;
  const projectedMessages = messages.map((message, index): NativeToolAwareMessage => {
    if (message.role !== "tool") return message;
    const maxTokens =
      index === latestToolResultIndex
        ? RECENT_TOOL_RESULT_TOKEN_BUDGET
        : OLDER_TOOL_RESULT_TOKEN_BUDGET;
    const compactedContent = compactToolResultContent(message.content, maxTokens);
    if (compactedContent === message.content) return message;
    compactedToolResults += 1;
    return {
      ...message,
      content: compactedContent,
    };
  });
  return {
    messages: projectedMessages,
    compactedToolResults,
    originalEstimatedTokens: estimateNativeToolTranscriptTokens(messages),
    projectedEstimatedTokens: estimateNativeToolTranscriptTokens(projectedMessages),
  };
}
