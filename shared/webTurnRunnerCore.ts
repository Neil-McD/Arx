import type { Dispatch, SetStateAction } from "react";
import { sanitizeUserFacingAssistantText } from "./communityUserFacingOutputSanitizer";
import type { RuntimeInvocationSurface } from "./runtimeInvocationSurface";
import type { CommunityAgentSurfaceContextV1 } from "./communityAgentSurfaceContext";

export type InferenceIssueModalState = {
  reason:
    | "quota"
    | "provider_connection_required"
    | "misconfigured"
    | "disabled"
    | "unavailable";
  threadId: string;
  mode: "respond" | "regenerate";
  message: string | null;
  code?: string | null;
};

export type WebStreamingMeta<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> = {
  engine_id: string;
  model_id: string | null;
  inference_source?: string | null;
  memory_used?: MemoryUsedItemT[];
  history_used?: HistoryUsedItemT[];
  community_evidence_used?: CommunityEvidenceUsedT | null;
};

export type ThreadStreamingRuntimeEvent = {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  created_at: string;
};

export type ThreadStreamingState<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> = {
  runId: string | null;
  meta: WebStreamingMeta<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> | null;
  content: string | null;
  streamTransport?: "sse" | "recovery";
  runtimeEvents?: ThreadStreamingRuntimeEvent[];
  lastRuntimeEventSeq?: number;
};

export type UseWebTurnRunnerControllerArgs<
  SessionT,
  MemoryUsedItemT,
  HistoryUsedItemT,
  CommunityEvidenceUsedT,
> = {
  activeThreadId: string | null;
  session: SessionT | null;
  threadStreamingStateById: Record<string, ThreadStreamingState<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT>>;
  getCloudRuntimeBaseUrl: () => string | null;
  getThreadById?: (threadId: string) => {
    id: string;
    title?: string | null;
    model_id?: string | null;
    community_id?: string | null;
    context_version?: number | null;
  } | null;
  fetchAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;

  extractTextFromContentJson: (value: unknown) => string;
  parseMemoryUsedArray: (value: unknown) => MemoryUsedItemT[];
  parseHistoryUsedArray: (value: unknown) => HistoryUsedItemT[];
  extractCommunityEvidenceUsedV1: (value: unknown) => CommunityEvidenceUsedT | null;

  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;
  loadThreads: (session: SessionT) => Promise<void>;
  showMemoryToastMessage: (message: string) => void;
  setThreadErrorForThread: (
    threadId: string | null,
    value: string | null | ((prev: string | null) => string | null),
  ) => void;

  setInferenceIssueModal: Dispatch<SetStateAction<InferenceIssueModalState | null>>;
  setThreadSendingStateById: Dispatch<SetStateAction<Record<string, boolean>>>;
  setThreadStreamingStateById: Dispatch<
    SetStateAction<Record<string, ThreadStreamingState<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT>>>
  >;
  setRuntimeEventsByRunId: Dispatch<SetStateAction<Record<string, ThreadStreamingRuntimeEvent[]>>>;
};

export type PublicTurnThreadMessage = {
  role: "user" | "assistant" | "system";
  content_json: unknown;
};

export type RunAgentTurnParams = {
  preferredModelId: string;
  mode?: "respond" | "regenerate";
  runIdHint: string;
  userMessageKey?: string;
  systemPrompt?: string | null;
  inferenceSource?: "free" | "user_key" | "chatgpt";
  invocationSurface: RuntimeInvocationSurface;
  surfaceContext?: CommunityAgentSurfaceContextV1 | null;
  requestedFundingSource:
    | "demo_public"
    | "user_key"
    | "user_chatgpt"
    | "platform"
    | "auto";
  requestedAgenticTools: true;
  onStreamStart?: (params: { runId: string | null }) => void;
  replyToId?: string;
  messages?: PublicTurnThreadMessage[];
  suppressStreamingUi?: boolean;
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

export type GuestInferenceIssueReason = "rate_limited" | "misconfigured" | "unavailable";

export type GuestInferenceIssue = {
  reason: GuestInferenceIssueReason;
  cta: "sign_in";
  fullMessage: string;
  shortMessage: string;
};

export function buildPublicTurnMessages<ThreadMessageT extends PublicTurnThreadMessage>(params: {
  messages: ThreadMessageT[];
  systemPrompt?: string | null;
  extractTextFromContentJson: (value: unknown) => string;
}): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const threadMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  const systemPrompt = String(params.systemPrompt ?? "").trim();
  if (systemPrompt) {
    threadMessages.push({
      role: "system",
      content: systemPrompt,
    });
  }
  for (const msg of params.messages) {
    if (!msg) continue;
    const role = msg.role;
    if (role !== "user" && role !== "assistant" && role !== "system") continue;
    const content = params.extractTextFromContentJson(msg.content_json).trim();
    if (!content) continue;
    threadMessages.push({ role, content });
  }
  return threadMessages;
}

export function mapInferenceIssueReason(
  category:
    | "quota"
    | "provider_connection_required"
    | "misconfigured"
    | "disabled"
    | "unavailable"
    | string,
): InferenceIssueModalState["reason"] {
  if (category === "quota") return "quota";
  if (category === "provider_connection_required") return "provider_connection_required";
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
