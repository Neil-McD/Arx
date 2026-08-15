import {
  isComputerUseObservationMessage,
  type NativeToolAwareMessage,
  type NativeToolInputContentPart,
} from "./nativeToolProtocol.ts";
import { estimateRuntimeMessageInputTokens } from "./runtimeInputBudget.ts";

export const CONTEXT_WINDOW_EXCEEDED_CODE = "context_window_exceeded";
export const CONTEXT_WINDOW_EXCEEDED_MESSAGE =
  "This conversation exceeded the selected model's context window.";
export const RUNTIME_CONTEXT_PROJECTION_VERSION = 1 as const;

const COMPACTION_CHARS_PER_TOKEN = 4;
const RECENT_TOOL_RESULT_TOKEN_BUDGET = 4_096;
const OLDER_TOOL_RESULT_TOKEN_BUDGET = 512;
const OLDER_MEDIA_MARKER = "[Older image omitted from model context]";

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
  imageInputTokens?: number,
): number {
  return estimateRuntimeMessageInputTokens(
    messages,
    imageInputTokens,
  ).estimatedTokens;
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
      return JSON.stringify({ ...envelope, output: compactedOutput });
    }
  } catch {
    // Some provider-compatible tools return plain text rather than the canonical envelope.
  }
  return compactTextForProviderContext(content, maxTokens);
}

function compactOlderMedia(
  content: NativeToolInputContentPart[],
): NativeToolInputContentPart[] {
  let replacedImage = false;
  const projected = content.flatMap((part): NativeToolInputContentPart[] => {
    if (part.type !== "image") return [part];
    if (replacedImage) return [];
    replacedImage = true;
    return [{ type: "text", text: OLDER_MEDIA_MARKER }];
  });
  return projected.length > 0
    ? projected
    : [{ type: "text", text: OLDER_MEDIA_MARKER }];
}

function indexRanges(indexes: readonly number[]): Array<{ start: number; end: number }> {
  if (indexes.length === 0) return [];
  const sorted = [...indexes].sort((left, right) => left - right);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = sorted[0]!;
  let end = start;
  for (const index of sorted.slice(1)) {
    if (index === end + 1) {
      end = index;
      continue;
    }
    ranges.push({ start, end });
    start = index;
    end = index;
  }
  ranges.push({ start, end });
  return ranges;
}

function conversationSegments(params: {
  messages: readonly NativeToolAwareMessage[];
  beforeIndex: number;
}): number[][] {
  const segments: number[][] = [];
  let active: number[] = [];
  for (let index = 0; index < params.beforeIndex; index += 1) {
    const message = params.messages[index]!;
    if (message.role === "system") continue;
    if (
      message.role === "user" &&
      !isComputerUseObservationMessage(message) &&
      active.length > 0
    ) {
      segments.push(active);
      active = [];
    }
    active.push(index);
  }
  if (active.length > 0) segments.push(active);
  return segments;
}

export type ProviderContextProjection = {
  version: typeof RUNTIME_CONTEXT_PROJECTION_VERSION;
  messages: NativeToolAwareMessage[];
  changed: boolean;
  fitsTarget: boolean;
  targetInputTokens: number;
  compactedMessageIndexes: number[];
  includedRanges: Array<{ start: number; end: number }>;
  omittedRanges: Array<{ start: number; end: number }>;
  originalEstimatedTokens: number;
  projectedEstimatedTokens: number;
};

export type RuntimeContextProjectionEvidence = {
  version: typeof RUNTIME_CONTEXT_PROJECTION_VERSION;
  sequence: number;
  attempt: number;
  trigger: "preflight_overflow" | "provider_overflow";
  projection_digest: string;
  target_input_tokens: number;
  original_estimated_tokens: number;
  projected_estimated_tokens: number;
  compacted_message_indexes: number[];
  included_ranges: Array<{ start: number; end: number }>;
  omitted_ranges: Array<{ start: number; end: number }>;
  durable_transcript_preserved: true;
};

export function buildRuntimeContextProjectionEvidence(params: {
  sequence: number;
  trigger: RuntimeContextProjectionEvidence["trigger"];
  digest: string;
  projection: Omit<ProviderContextProjection, "messages">;
}): RuntimeContextProjectionEvidence {
  return {
    version: params.projection.version,
    sequence: Math.max(1, Math.floor(params.sequence)),
    attempt: Math.max(1, Math.floor(params.sequence)),
    trigger: params.trigger,
    projection_digest: params.digest,
    target_input_tokens: params.projection.targetInputTokens,
    original_estimated_tokens: params.projection.originalEstimatedTokens,
    projected_estimated_tokens: params.projection.projectedEstimatedTokens,
    compacted_message_indexes: [...params.projection.compactedMessageIndexes],
    included_ranges: params.projection.includedRanges.map((range) => ({ ...range })),
    omitted_ranges: params.projection.omittedRanges.map((range) => ({ ...range })),
    durable_transcript_preserved: true,
  };
}

/**
 * Builds a provider-only view of an immutable runtime transcript. System
 * instructions and the current user episode are protected. Older complete
 * conversational segments may be omitted, while tool protocol pairs remain
 * atomic because omission happens only at segment boundaries.
 */
export function projectProviderContextToBudget(params: {
  messages: readonly NativeToolAwareMessage[];
  targetInputTokens: number;
  imageInputTokens?: number;
}): ProviderContextProjection {
  const sourceMessages = params.messages;
  const targetInputTokens = Math.max(0, Math.floor(params.targetInputTokens));
  const originalEstimatedTokens = estimateNativeToolTranscriptTokens(
    sourceMessages,
    params.imageInputTokens,
  );
  let currentEpisodeStart = 0;
  for (let index = sourceMessages.length - 1; index >= 0; index -= 1) {
    const message = sourceMessages[index]!;
    if (message.role === "user" && !isComputerUseObservationMessage(message)) {
      currentEpisodeStart = index;
      break;
    }
  }
  const lastOlderToolResultIndex = sourceMessages.reduce(
    (latest, message, index) =>
      index < currentEpisodeStart && message.role === "tool" ? index : latest,
    -1,
  );

  const compactedMessageIndexes: number[] = [];
  const projectedByIndex = sourceMessages.map(
    (message, index): NativeToolAwareMessage => {
      if (index < currentEpisodeStart && message.role === "tool") {
        const compactedContent = compactToolResultContent(
          message.content,
          index === lastOlderToolResultIndex
            ? RECENT_TOOL_RESULT_TOKEN_BUDGET
            : OLDER_TOOL_RESULT_TOKEN_BUDGET,
        );
        if (compactedContent !== message.content) {
          compactedMessageIndexes.push(index);
          return { ...message, content: compactedContent };
        }
      }
      if (
        index < currentEpisodeStart &&
        message.role === "user" &&
        Array.isArray(message.content) &&
        message.content.some((part) => part.type === "image")
      ) {
        compactedMessageIndexes.push(index);
        return { ...message, content: compactOlderMedia(message.content) };
      }
      return message;
    },
  );

  const included = new Set(sourceMessages.map((_message, index) => index));
  const buildMessages = (): NativeToolAwareMessage[] =>
    [...included]
      .sort((left, right) => left - right)
      .map((index) => projectedByIndex[index]!);

  let projectedMessages = buildMessages();
  let projectedEstimatedTokens = estimateNativeToolTranscriptTokens(
    projectedMessages,
    params.imageInputTokens,
  );
  if (projectedEstimatedTokens > targetInputTokens) {
    for (const segment of conversationSegments({
      messages: sourceMessages,
      beforeIndex: currentEpisodeStart,
    })) {
      for (const index of segment) included.delete(index);
      projectedMessages = buildMessages();
      projectedEstimatedTokens = estimateNativeToolTranscriptTokens(
        projectedMessages,
        params.imageInputTokens,
      );
      if (projectedEstimatedTokens <= targetInputTokens) break;
    }
  }

  const includedIndexes = [...included].sort((left, right) => left - right);
  const omittedIndexes = sourceMessages
    .map((_message, index) => index)
    .filter((index) => !included.has(index));
  const effectiveCompactedIndexes = compactedMessageIndexes.filter((index) =>
    included.has(index),
  );

  return {
    version: RUNTIME_CONTEXT_PROJECTION_VERSION,
    messages: projectedMessages,
    changed: omittedIndexes.length > 0 || effectiveCompactedIndexes.length > 0,
    fitsTarget: projectedEstimatedTokens <= targetInputTokens,
    targetInputTokens,
    compactedMessageIndexes: effectiveCompactedIndexes,
    includedRanges: indexRanges(includedIndexes),
    omittedRanges: indexRanges(omittedIndexes),
    originalEstimatedTokens,
    projectedEstimatedTokens,
  };
}
