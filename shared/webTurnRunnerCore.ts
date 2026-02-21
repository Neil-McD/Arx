import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { prependCommunityPreludeMessages } from "./communityLaneMessageBuilder";
import { sanitizeUserFacingAssistantText } from "./communityUserFacingOutputSanitizer.mjs";

export type PlatformQuotaModalState = {
  reason: "quota" | "plan" | "misconfigured" | "disabled" | "unavailable";
  threadId: string;
  mode: "respond" | "regenerate";
  message: string | null;
};

type WebStreamingMeta<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> = {
  engine_id: string;
  model_id: string | null;
  inference_source?: string | null;
  memory_used?: MemoryUsedItemT[];
  history_used?: HistoryUsedItemT[];
  community_evidence_used?: CommunityEvidenceUsedT | null;
};

export type UseWebTurnRunnerControllerArgs<
  SessionT,
  MemoryUsedItemT,
  HistoryUsedItemT,
  CommunityEvidenceUsedT,
> = {
  getSupabaseUrl: () => string | null;
  fetchWithSupabasePublic: (url: string, init?: RequestInit) => Promise<Response>;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;

  extractTextFromContentJson: (value: unknown) => string;
  parseMemoryUsedArray: (value: unknown) => MemoryUsedItemT[];
  parseHistoryUsedArray: (value: unknown) => HistoryUsedItemT[];
  extractCommunityEvidenceUsedV1: (value: unknown) => CommunityEvidenceUsedT | null;

  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;
  loadThreads: (session: SessionT) => Promise<void>;
  showMemoryToastMessage: (message: string) => void;

  setPlatformQuotaModal: Dispatch<SetStateAction<PlatformQuotaModalState | null>>;
  setStreamingContent: Dispatch<SetStateAction<string | null>>;
  setStreamingThreadId: Dispatch<SetStateAction<string | null>>;
  setStreamingRunId: Dispatch<SetStateAction<string | null>>;
  setStreamingMeta: Dispatch<
    SetStateAction<WebStreamingMeta<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> | null>
  >;

  streamingContentRef: MutableRefObject<string | null>;
  streamingRafRef: MutableRefObject<number | null>;
  streamingAbortRef: MutableRefObject<AbortController | null>;
  streamingUserCancelledRef: MutableRefObject<boolean>;
};

export type PublicTurnThreadMessage = {
  role: "user" | "assistant" | "system";
  content_json: unknown;
};

export type RunPublicTurnParams<ThreadMessageT extends PublicTurnThreadMessage> = {
  modelId: string;
  threadId: string;
  runIdHint: string;
  messages: ThreadMessageT[];
  systemPrompt?: string | null;
  communityEvidenceUserMessage?: string | null;
};

export type RunAgentTurnParams = {
  preferredModelId: string;
  mode?: "respond" | "regenerate";
  runIdHint: string;
  inferenceSource?: "platform" | "user";
  replyToId?: string;
};

export type CreateThreadMessageParams = {
  id?: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content_json: unknown;
  engine_id?: string | null;
  model_id?: string | null;
  run_id?: string | null;
};

export type CreateAssistantMessageParams = {
  threadId: string;
  text: string;
  engineId?: string | null;
  modelId?: string | null;
  runId?: string | null;
  inferenceSource?: string | null;
  communityEvidenceUsedV1?: unknown;
  communityContextDiagnostics?: Record<string, unknown> | null;
};

export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

export function normalizeGuestInferenceError(message: string): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Failed to run model.";
  const lower = raw.toLowerCase();
  if (
    lower.includes("no endpoints found matching your data policy") ||
    (lower.includes("free model publication") && lower.includes("privacy"))
  ) {
    return "Guest chat is unavailable because the OpenRouter key blocks free guest models. Enable Free model publication in OpenRouter privacy settings, or map guest models to non-free models.";
  }
  return raw;
}

export function buildPublicTurnMessages<ThreadMessageT extends PublicTurnThreadMessage>(params: {
  messages: ThreadMessageT[];
  systemPrompt?: string | null;
  communityEvidenceUserMessage?: string | null;
  extractTextFromContentJson: (value: unknown) => string;
}): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const threadMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  for (const msg of params.messages) {
    if (!msg) continue;
    const role = msg.role;
    if (role !== "user" && role !== "assistant" && role !== "system") continue;
    const content = params.extractTextFromContentJson(msg.content_json).trim();
    if (!content) continue;
    threadMessages.push({ role, content });
  }
  return prependCommunityPreludeMessages({
    messages: threadMessages,
    systemPrompt: params.systemPrompt,
    communityEvidenceUserMessage: params.communityEvidenceUserMessage,
  });
}

export function mapPlatformFailureReason(
  category: "quota" | "misconfigured" | "disabled" | "plan" | string,
): PlatformQuotaModalState["reason"] {
  if (category === "quota") return "quota";
  if (category === "plan") return "plan";
  if (category === "misconfigured") return "misconfigured";
  if (category === "disabled") return "disabled";
  return "unavailable";
}

export function buildAssistantTextMessagePayload(params: CreateAssistantMessageParams): {
  content_json: unknown;
  engine_id: string | null;
  model_id: string | null;
  run_id: string | null;
} {
  const modelId = (params.modelId ?? "").trim();
  const inferenceSource = (params.inferenceSource ?? "").trim();
  const safeText = sanitizeUserFacingAssistantText({
    text: params.text,
    blockedIds: [params.threadId, params.runId ?? null],
  });
  const rawCommunityEvidenceUsed = params.communityEvidenceUsedV1;
  const hasCommunityEvidenceUsed =
    rawCommunityEvidenceUsed !== null && rawCommunityEvidenceUsed !== undefined;
  const communityContextDiagnostics = params.communityContextDiagnostics ?? null;
  const hasCommunityContextDiagnostics =
    Boolean(communityContextDiagnostics) &&
    typeof communityContextDiagnostics === "object" &&
    !Array.isArray(communityContextDiagnostics);
  const meta =
    modelId || inferenceSource || hasCommunityEvidenceUsed || hasCommunityContextDiagnostics
      ? {
          ...(modelId ? { model_id: modelId } : null),
          ...(inferenceSource ? { inference_source: inferenceSource } : null),
          ...(hasCommunityEvidenceUsed ? { community_evidence_used_v1: rawCommunityEvidenceUsed } : null),
          ...(hasCommunityContextDiagnostics ? { community_context_diagnostics: communityContextDiagnostics } : null),
        }
      : null;

  return {
    content_json: {
      text: safeText,
      ...(meta ? { meta } : null),
    },
    engine_id: (params.engineId ?? "").trim() || null,
    model_id: modelId || null,
    run_id: (params.runId ?? "").trim() || null,
  };
}

type StreamingResetArgs<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> = {
  streamingRafRef: MutableRefObject<number | null>;
  streamingAbortRef: MutableRefObject<AbortController | null>;
  streamingContentRef: MutableRefObject<string | null>;
  streamingUserCancelledRef: MutableRefObject<boolean>;
  setStreamingContent: Dispatch<SetStateAction<string | null>>;
  setStreamingThreadId: Dispatch<SetStateAction<string | null>>;
  setStreamingRunId: Dispatch<SetStateAction<string | null>>;
  setStreamingMeta: Dispatch<
    SetStateAction<WebStreamingMeta<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> | null>
  >;
};

export function resetStreamingState<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT>(
  args: StreamingResetArgs<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT>,
): void {
  if (args.streamingRafRef.current) {
    window.cancelAnimationFrame(args.streamingRafRef.current);
    args.streamingRafRef.current = null;
  }
  args.streamingAbortRef.current = null;
  args.streamingContentRef.current = null;
  args.setStreamingContent(null);
  args.setStreamingThreadId(null);
  args.setStreamingRunId(null);
  args.setStreamingMeta(null);
  args.streamingUserCancelledRef.current = false;
}
