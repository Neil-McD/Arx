import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { sanitizeUserFacingAssistantText } from "./communityUserFacingOutputSanitizer";
import type { PaidUsageBillingMode } from "./paidUsageBilling";
import type { PaidToolKind } from "./workspaceCredits";

export type InferenceIssueModalState = {
  reason:
    | "quota"
    | "workspace_credits"
    | "plan"
    | "provider_connection_required"
    | "misconfigured"
    | "disabled"
    | "unavailable";
  threadId: string;
  mode: "respond" | "regenerate";
  message: string | null;
  toolKind?: PaidToolKind | null;
  requiredCredits?: number | null;
  paidUsageBillingMode?: PaidUsageBillingMode | null;
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
  streamTelemetry?: {
    startedAtMs?: number;
    sseStartedAtMs?: number;
    firstDeltaReceivedAtMs?: number;
    lastDeltaReceivedAtMs?: number;
    firstDisplayPaintAtMs?: number;
    lastDisplayPaintAtMs?: number;
    targetChars?: number;
    displayedChars?: number;
    pendingChars?: number;
    fastPaint?: boolean;
  };
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
    project_id?: string | null;
    community_id?: string | null;
    context_version?: number | null;
  } | null;
  fetchCloudPublic: (url: string, init?: RequestInit) => Promise<Response>;
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

export type RunPublicTurnParams<ThreadMessageT extends PublicTurnThreadMessage> = {
  modelId: string;
  threadId: string;
  runIdHint: string;
  messages: ThreadMessageT[];
  systemPrompt?: string | null;
};

export type RunAgentTurnParams = {
  preferredModelId: string;
  mode?: "respond" | "regenerate";
  runIdHint: string;
  userMessageKey?: string;
  systemPrompt?: string | null;
  inferenceSource?: "free" | "user_key" | "chatgpt";
  requestedFundingSource: "demo_public" | "user_key" | "user_chatgpt";
  requestedAgenticTools?: boolean;
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

export function buildGuestInferenceIssue(reason: GuestInferenceIssueReason): GuestInferenceIssue {
  if (reason === "rate_limited") {
    return {
      reason,
      cta: "sign_in",
      fullMessage:
        "Preview is busy right now. Sign in to unlock more models, use your ChatGPT Plus / Pro access on Polynet, and discover communities, agents, and apps across the network.",
      shortMessage:
        "Preview is busy right now. Sign in to continue.",
    };
  }
  return {
    reason,
    cta: "sign_in",
    fullMessage:
      "Preview is unavailable right now. Sign in to unlock more models, use your ChatGPT Plus / Pro access on Polynet, and discover communities, agents, and apps across the network.",
    shortMessage:
      "Preview is unavailable right now. Sign in to continue.",
  };
}

export function normalizeGuestInferenceError(message: string): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Failed to run model.";
  const lower = raw.toLowerCase();
  if (
    lower.includes("no endpoints found matching your data policy") ||
    (lower.includes("free model publication") && lower.includes("privacy"))
  ) {
    return "Preview is unavailable because the OpenRouter key blocks free models. Enable Free model publication in OpenRouter privacy settings, or map preview models to non-free models.";
  }
  return raw;
}

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
    | "workspace_credits"
    | "plan"
    | "provider_connection_required"
    | "misconfigured"
    | "disabled"
    | "unavailable"
    | string,
): InferenceIssueModalState["reason"] {
  if (category === "quota") return "quota";
  if (category === "workspace_credits") return "workspace_credits";
  if (category === "plan") return "plan";
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
