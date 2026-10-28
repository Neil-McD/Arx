import { internal } from "./_generated/api";
import { runOpenAiCompletion } from "./httpRuntimeSupport";
import {
  buildRuntimeRunPersistenceHelpers,
  type SseResponseEvent,
  buildRuntimeTurnSuccessResponder,
  type SseResponseFn,
  type SseResponseSource,
  type SseResponseStreamWriter,
} from "./httpRuntimeTurnState";
import { executeChatToolsAgentLoop } from "./runtimeAgentLoop";
import { appendRuntimeContextIntegrityCheckBestEffort } from "./runtimeContextIntegrity";
import {
  USER_CANCELLED_RUNTIME_CODE,
  isRuntimeRunCancelledError,
  runAbortableWithRuntimeCancellation,
  throwIfRuntimeRunCancelled,
} from "./runtimeCancellation";
import {
  COMMUNITY_AGENT_LIMIT_REACHED_CODE,
  PLATFORM_HOME_COMMUNITY_AGENT_LIMIT_REACHED,
  formatPlatformHomeMemberLimitMessage,
  type CommunityInferenceSurface,
  type FounderProviderRequestUsage,
} from "../shared/founderInference";
import { createFounderInferenceUsageTotals, founderProviderRequests, observeFounderProviderResult } from "./founderInferenceUsage";
import { assertPaidLuna6ProviderHeadroom, founderInferenceBudgetFailureCode } from "./founderInferenceBudget";
import {
  isRecoverableRuntimeKernelStopReason,
} from "../shared/runtimeKernelTypes";
import {
  buildRuntimeTurnContextSnapshot,
  renderRuntimeTurnContextForFailureFinalizer,
  type RuntimeTurnContextSnapshotV1,
  type RuntimeTurnContextPacket,
} from "../shared/runtimeTurnContextPacket";
import {
  type RuntimeTurnEnvelopeV1,
} from "../shared/runtimeTurnEnvelope";
import type {
  CommunityLensAuthority,
} from "../shared/communityLensAuthority";
import {
  buildRuntimeFailureFinalAnswer,
} from "../shared/runtimeFailureFinalizer";
import {
  loadRuntimeTurnContextPacketForRun,
} from "./runtimeTurnContext";
import {
  RequireAuthenticatedActor,
  resolveAuthenticatedRuntimeTurn,
  RuntimeTurnInput,
} from "./runtimeTurnResolution";
import { extractTextFromNativeToolMessageContent } from "../shared/nativeToolProtocol";
import {
  ensureRuntimeRunStarted,
  lookupExistingRuntimeReplay,
  persistRuntimeAssistantMessage,
  persistRuntimeUserMessage,
  resolveRuntimeRunContinuation,
} from "./runtimeTurnPersistence";
import { resolvePolynetRuntimeEngine } from "../shared/runtimeEngine";
import {
  buildPolynetHarnessToolPolicyReceipt,
  resolvePolynetHarnessToolPolicy,
} from "../shared/harnessToolPolicy";
import { logStructuredError } from "./errorLogging";
import {
  claimCommunityInferenceFundingSession,
  failCommunityInferenceFundingSession,
  markCommunityInferenceFundingSessionProviderStarted,
  providerFailureIsKnownPreSpend,
  settleCommunityInferenceFundingSession,
  type CommunityInferenceFundingSession,
} from "./founderInferenceRuntime";
import type { RuntimeProviderContextAttestationV1 } from "../shared/runtimeProviderContextAttestation";

export type {
  SseResponseEvent,
  SseResponseFn,
  SseResponseSource,
  SseResponseStreamWriter,
} from "./httpRuntimeTurnState";

function resolveCommunityFundingClaimFailure(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const rawCode = error instanceof Error ? error.message : String(error ?? "");
  if (rawCode === PLATFORM_HOME_COMMUNITY_AGENT_LIMIT_REACHED) {
    return {
      status: 429,
      code: COMMUNITY_AGENT_LIMIT_REACHED_CODE,
      message: formatPlatformHomeMemberLimitMessage(Date.now()),
    };
  }
  if (rawCode === "founder_usage_exhausted") {
    return {
      status: 403,
      code: "community_ai_usage_exhausted",
      message:
        "This community has used its included AI allowance for the current billing cycle.",
    };
  }
  if (
    rawCode === "founder_inference_actor_rate_limited" ||
    rawCode === "founder_inference_community_rate_limited"
  ) {
    return {
      status: 429,
      code: "rate_limited",
      message: "Community AI is busy. Try again shortly.",
    };
  }
  if (
    rawCode === "inference_receipt_in_progress" ||
    rawCode === "inference_receipt_already_settled" ||
    rawCode === "founder_inference_receipt_conflict"
  ) {
    return {
      status: 409,
      code: "thread_run_in_progress",
      message: "This community AI turn is already being processed.",
    };
  }
  if (
    rawCode === "founder_plan_required" ||
    rawCode === "founder_subscription_inactive" ||
    rawCode === "founder_subscription_ambiguous" ||
    rawCode === "founder_subscription_owner_mismatch" ||
    rawCode === "funding_authority_changed"
  ) {
    return {
      status: 403,
      code: "community_ai_unavailable",
      message:
        "Community AI is currently unavailable. The community owner can restore it from Billing.",
    };
  }
  return {
    status: 503,
    code: "community_inference_accounting_unavailable",
    message: "Community AI accounting is temporarily unavailable. Try again shortly.",
  };
}
export type { RequireAuthenticatedActor } from "./runtimeTurnResolution";

type RuntimeCompletionSuccess = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

type RuntimeCompletionFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

function buildCommunityLensAuthorityReceipt(
  authority: CommunityLensAuthority | null | undefined,
) {
  if (!authority) return null;
  return {
    relation: authority.relation,
    effective_role: authority.effectiveRole,
    community_resource_lane: authority.communityResourceLane.lane,
    can_manage: authority.canManage,
    can_moderate: authority.canModerate,
    can_manage_resources: authority.canManageResources,
    can_review_join_requests: authority.canReviewJoinRequests,
  };
}

function openAiModelIdFromRef(modelRef: string): string | null {
  const trimmed = String(modelRef ?? "").trim();
  if (!trimmed.toLowerCase().startsWith("openai/")) return null;
  const modelId = trimmed.slice("openai/".length).trim();
  return modelId || null;
}

function isRuntimeCompletionFailure(
  completion: RuntimeCompletionSuccess | RuntimeCompletionFailure,
): completion is RuntimeCompletionFailure {
  return "ok" in completion && completion.ok === false;
}

function emitBufferedAssistantText(params: {
  content: string;
  emitDelta: (delta: string) => void;
  chunkSize?: number;
}): void {
  const content = String(params.content ?? "");
  if (!content) return;
  const chunkSize = Math.max(1, Math.floor(params.chunkSize ?? 320));
  for (let index = 0; index < content.length; index += chunkSize) {
    params.emitDelta(content.slice(index, index + chunkSize));
  }
}

function buildAdaptiveFailureFinalizationMessages(params: {
  runtimeTurnContext: RuntimeTurnContextPacket;
}): Array<{ role: "system" | "user"; content: string }> {
  const userContent = [
    "Current runtime turn context:",
    renderRuntimeTurnContextForFailureFinalizer(params.runtimeTurnContext),
  ].join("\n");
  return [
    {
      role: "system",
      content: [
        "You are writing the final user-facing response after an agent runtime stopped before a normal final answer.",
        "Do not output a fixed ledger template. Answer the user's latest message directly and naturally.",
        "Use the evidence provided, but separate verified facts from unknowns.",
        "Keep it concise. Usually 2-5 short paragraphs or a few bullets.",
        "Do not mention hidden implementation names unless they help the user debug.",
      ].join("\n"),
    },
    {
      role: "user",
      content: userContent,
    },
  ];
}

function normalizeAdaptiveFailureAnswer(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (/^run stopped before completing\.?/i.test(normalized)) return null;
  return normalized.length > 2400
    ? `${normalized.slice(0, 2399).trimEnd()}…`
    : normalized;
}

export type JsonResponseFn = (
  req: Request,
  status: number,
  payload: unknown,
) => Response;

function mapPersistedRuntimeEventRow(value: unknown): {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  created_at: string;
} | null {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!row) return null;
  const id = String(row._id ?? "").trim();
  const runId = String(row.runId ?? "").trim();
  const eventType = String(row.eventType ?? "").trim();
  if (!id || !runId || !eventType) return null;
  const seq = Number(row.seq);
  const createdAtMs = Number(row.createdAt);
  return {
    id,
    run_id: runId,
    seq: Number.isFinite(seq) ? Math.max(0, Math.floor(seq)) : 0,
    event_type: eventType,
    payload: row.payload ?? null,
    created_at: new Date(
      Number.isFinite(createdAtMs) ? Math.floor(createdAtMs) : Date.now(),
    ).toISOString(),
  };
}

export async function handleRuntimeTurnRequest(args: {
  ctx: any;
  req: Request;
  jsonResponse: JsonResponseFn;
  sseResponse: SseResponseFn;
  requireAuthenticatedActor: RequireAuthenticatedActor;
}): Promise<Response> {
  const { ctx, req, jsonResponse, sseResponse, requireAuthenticatedActor } =
    args;
  const requestId = crypto.randomUUID();
  let runtimeTurnStage = "request";
  const withRuntimeHeaders = (response: Response): Response => {
    response.headers.set("x-arx-request-id", requestId);
    response.headers.set("x-arx-runtime-stage", runtimeTurnStage);
    return response;
  };
  const runtimeJsonResponse = (
    status: number,
    payload: Record<string, unknown>,
  ): Response =>
    withRuntimeHeaders(
      jsonResponse(req, status, {
        request_id: requestId,
        stage: runtimeTurnStage,
        ...payload,
      }),
    );
  const mapRuntimeSseEvent = (entry: SseResponseEvent): SseResponseEvent => ({
    event: entry.event,
    data: {
      request_id: requestId,
      stage:
        typeof entry.data?.stage === "string" && entry.data.stage.trim()
          ? entry.data.stage
          : entry.event === "start"
            ? "start"
            : entry.event === "delta"
              ? "streaming"
              : entry.event === "done"
                ? "done"
                : runtimeTurnStage,
      ...entry.data,
    },
  });
  const runtimeSseResponse = (source: SseResponseSource): Response =>
    withRuntimeHeaders(
      sseResponse(
        req,
        Array.isArray(source)
          ? source.map(mapRuntimeSseEvent)
          : (writer: SseResponseStreamWriter) =>
              source({
                send(entry) {
                  writer.send(mapRuntimeSseEvent(entry));
                },
                close() {
                  writer.close();
                },
              }),
      ),
    );
  let startedRunId: string | null = null;
  let runtimeTurnLogContext: Record<string, unknown> = {};
  let finishRunBestEffort:
    | ((params: {
        status: "ok" | "error" | "cancelled";
        reason?: string;
        errorCode?: string;
        errorMessage?: string;
        contextSnapshot?: RuntimeTurnContextSnapshotV1 | null;
      }) => Promise<void>)
    | null = null;

  let input: RuntimeTurnInput;
  try {
    input = (await req.json()) as RuntimeTurnInput;
  } catch {
    return runtimeJsonResponse(400, {
      ok: false,
      code: "invalid_request",
      error: "invalid_request",
      message: "Invalid JSON payload.",
    });
  }

  runtimeTurnStage = "auth";
  try {
    const resolved = await resolveAuthenticatedRuntimeTurn({
      ctx,
      req,
      input,
      requireAuthenticatedActor,
      setStage: (stage) => {
        runtimeTurnStage = stage;
      },
      fail: runtimeJsonResponse,
      requestId,
    });
    if (!resolved.ok) return resolved.response;
    const {
      actor,
      threadKey,
      ownedThread,
      conversationMessages,
      persistedConversationHistory,
      requestedModelId: resolvedRequestedModelId,
      lane,
      modelRef: resolvedModelRef,
      maxTokens,
      stream,
      inferenceSource,
      requestedRuntimeEngine,
      runtimeCommunityId,
      runtimeCommunityName,
      runtimeCommunitySlug,
      runtimeCommunityOneLiner,
      runtimeCommunityAbout,
      runtimeCommunityChannels,
      runtimeCommunitySystemPrompt,
      runtimeCommunityLensAuthority,
      allowedToolNames,
      resolvedRuntimeCapabilityFamilies,
      resolvedRuntimeHarnessProfile,
      invocationSurface,
      communityAgentSurfaceContext,
      communityInferenceAdmission,
    } = resolved.value;
    const runId =
      String(input.idempotency_key ?? "").trim() ||
      `convex_runtime:${crypto.randomUUID()}`;
    let requestedModelId = resolvedRequestedModelId;
    let modelRef = resolvedModelRef;
    if (invocationSurface === "member_agent_dock" && runtimeCommunityId && communityInferenceAdmission?.ok) {
      const existingRun = await ctx.runQuery(
        (internal as any).threads.getRuntimeRunByOwnerRunIdInternal,
        { ownerId: actor.dbUserId, runId },
      ) as { threadId?: unknown; modelId?: string } | null;
      requestedModelId = await ctx.runQuery(
        (internal as any).founderInference.resolveCommunityInferenceModelInternal,
        { communityId: runtimeCommunityId, surface: "member_agent_dock", receiptKey: `member_agent_dock:${runId}` },
      ) as string;
      if (existingRun && (String(existingRun.threadId) !== String(ownedThread._id)
        || existingRun.modelId !== requestedModelId)) {
        return runtimeJsonResponse(409, { ok: false, code: "runtime_run_model_changed",
          error: "runtime_run_model_changed",
          message: "This run cannot resume with a different model. Start a new turn." });
      }
      modelRef = `openai/${requestedModelId}`;
    }
    startedRunId = runId;
    runtimeTurnStage = "run_start";
    const explicitUserMessageKey = String(input.user_message_key ?? "").trim();
    const userMessageKeyForRun =
      explicitUserMessageKey || `user:${threadKey}:${runId}`;
    const assistantMessageKeyForRun = `assistant:${threadKey}:${runId}`;
    const latestUserContent = conversationMessages[conversationMessages.length - 1]?.content;
    const latestUserText =
      extractTextFromNativeToolMessageContent(latestUserContent) ||
      (Array.isArray(latestUserContent) && latestUserContent.some((part) => part.type === "image")
        ? "[Image attached]"
        : "");
    const runtimeCommunityContextVersion = Number.isFinite(Number(ownedThread.contextVersion ?? 0))
      ? Math.max(0, Math.floor(Number(ownedThread.contextVersion ?? 0)))
      : 0;
    const persistVisibleUserMessage = true;
    const persistVisibleAssistantMessage = true;
    const runVisibility = "user_visible";
    const runStartedAt = Date.now();
    const runtimeEngineResolution = resolvePolynetRuntimeEngine({
      requestedRuntimeEngine,
    });
    const runtimeEngineId = runtimeEngineResolution.engineId;
    runtimeTurnLogContext = {
      runId,
      threadId: String(ownedThread._id),
      threadKey,
      userId: actor.dbUserId,
      communityId: runtimeCommunityId ?? undefined,
      requestedModelId,
      lane,
      inferenceSource,
      requestedRuntimeEngine: runtimeEngineResolution.requestedRuntimeEngine ?? undefined,
      resolvedRuntimeEngine: runtimeEngineResolution.resolvedRuntimeEngine,
      executionMode: "agentic",
      capabilityFamilies: resolvedRuntimeCapabilityFamilies,
      harnessProfile: resolvedRuntimeHarnessProfile,
      invocationSurface,
    };
    const runStartArgs: Record<string, unknown> = {
      ownerId: actor.dbUserId,
      threadId: ownedThread._id,
      runId,
      lane,
      visibility: runVisibility,
      communityId: runtimeCommunityId ? (runtimeCommunityId as any) : undefined,
      communityContextVersion: runtimeCommunityId ? runtimeCommunityContextVersion : undefined,
      modelId: requestedModelId,
      engineId: runtimeEngineId,
      runtimeEngineRequested: runtimeEngineResolution.requestedRuntimeEngine ?? undefined,
      runtimeEngineResolved: runtimeEngineResolution.resolvedRuntimeEngine,
      runtimeEngineSource: runtimeEngineResolution.runtimeEngineSource,
      executionMode: "agentic",
      contractName: "capability_composed_tools_v1",
      contractVersion: "v1",
      harnessProfile: resolvedRuntimeHarnessProfile,
      harnessProfileSource: "runtime_capability_resolution_v1",
      capabilityFamilies: resolvedRuntimeCapabilityFamilies,
      latestUserText,
      startedAt: runStartedAt,
      nowMs: runStartedAt,
    };
    const successResponse = buildRuntimeTurnSuccessResponder({
      req,
      stream,
      runId,
      requestId,
      lane,
      requestedModelId,
      jsonResponse: (_req, status, payload) =>
        runtimeJsonResponse(status, payload as Record<string, unknown>),
      sseResponse: (_req, events) => runtimeSseResponse(events),
    });
    const runStart = await ensureRuntimeRunStarted({
      ctx,
      ownerId: actor.dbUserId,
      threadId: ownedThread._id,
      runStartArgs,
      fail: runtimeJsonResponse,
    });
    if (!runStart.ok) {
      return runStart.response;
    }
    const runContinuation = await resolveRuntimeRunContinuation({
      runStatus: runStart.runStatus,
      ctx,
      ownerId: actor.dbUserId,
      threadId: ownedThread._id,
      assistantMessageKeyForRun,
      userMessageKeyForRun,
      inferenceSource,
      replayVisibleMessages:
        persistVisibleUserMessage && persistVisibleAssistantMessage,
    });
    if (runContinuation.kind === "replay") {
      return successResponse(runContinuation.replay);
    }
    if (runContinuation.kind === "not_resumable") {
      return runtimeJsonResponse(409, {
        ok: false,
        code: "runtime_run_not_resumable",
        error: "runtime_run_not_resumable",
        message:
          "This run has already finished and cannot be resumed. Retry to start a new run.",
        run_id: runId,
        run_status: runContinuation.runStatus,
      });
    }

    const {
      appendRunEvent,
      finishRunBestEffort: finishRunBestEffortRaw,
      touchRunHeartbeatBestEffort,
    } = buildRuntimeRunPersistenceHelpers({
      ctx,
      userId: actor.dbUserId,
      threadId: String(ownedThread._id),
      runId,
    });
    const recordInitialProviderContextAttestation = async (
      attestation: RuntimeProviderContextAttestationV1,
    ): Promise<{ ok: boolean; errorCode?: string | null }> => {
      const result = await ctx.runMutation(
        (internal as any).threads
          .recordRuntimeProviderContextAttestationInternal as any,
        {
          ownerId: actor.dbUserId,
          threadId: ownedThread._id,
          runId,
          attestation,
          nowMs: Date.now(),
        },
      );
      return {
        ok: result?.ok === true,
        errorCode:
          typeof result?.errorCode === "string" ? result.errorCode : null,
      };
    };
    const appendContextIntegrityCheckBestEffortForRun = async (): Promise<void> => {
      await appendRuntimeContextIntegrityCheckBestEffort({
        ctx,
        ownerId: actor.dbUserId,
        runId,
        appendRunEvent,
      });
    };
    let runtimeTurnEnvelopeForRun: RuntimeTurnEnvelopeV1 | null = null;
    const persistContextSnapshotBestEffort = async (
      phase: "started" | "active" | "finished",
      runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null,
    ): Promise<void> => {
      if (runtimeTurnEnvelope) runtimeTurnEnvelopeForRun = runtimeTurnEnvelope;
      try {
        const nowMs = Date.now();
        const loadedContext = await loadRuntimeTurnContextPacketForRun({
          ctx,
          ownerId: actor.dbUserId,
          threadId: ownedThread._id,
          runId,
          latestUserText,
          runtimeTurnEnvelope: runtimeTurnEnvelopeForRun,
          threadWorkingState: ownedThread.workingState ?? null,
          summarizeCurrentRunEvents: phase !== "started",
          runtimeStop: null,
        });
        await ctx.runMutation(
          (internal as any).threads.setCloudRuntimeRunContextSnapshotInternal as any,
          {
            ownerId: actor.dbUserId,
            threadId: ownedThread._id,
            runId,
            phase,
            snapshot: buildRuntimeTurnContextSnapshot({
              packet: loadedContext.packet,
              capturedAt: nowMs,
            }),
            nowMs,
          },
        );
      } catch {
        // Best-effort audit snapshot; prompt/runtime execution should not depend on it.
      }
    };
    let activeSnapshotEventCount = 0;
    let activeSnapshotUpdatedAt = 0;
    const refreshActiveContextSnapshotAfterEventBestEffort = async (eventType: string): Promise<void> => {
      if (
        eventType !== "tool_call_finished" &&
        eventType !== "runtime_diagnostics_detected"
      ) {
        return;
      }
      activeSnapshotEventCount += 1;
      const nowMs = Date.now();
      if (
        activeSnapshotUpdatedAt > 0 &&
        nowMs - activeSnapshotUpdatedAt < 1500 &&
        activeSnapshotEventCount < 3
      ) {
        return;
      }
      activeSnapshotEventCount = 0;
      activeSnapshotUpdatedAt = nowMs;
      await persistContextSnapshotBestEffort("active");
    };
    type FinishRunBestEffortParams = Parameters<typeof finishRunBestEffortRaw>[0];
    const finishRunBestEffortForRun = async (
      params: FinishRunBestEffortParams,
    ): Promise<void> => {
      let contextSnapshot = params.contextSnapshot ?? null;
      if (!contextSnapshot) {
        try {
          const loadedContext = await loadRuntimeTurnContextPacketForRun({
            ctx,
            ownerId: actor.dbUserId,
            threadId: ownedThread._id,
            runId,
            latestUserText,
            runtimeTurnEnvelope: runtimeTurnEnvelopeForRun,
            threadWorkingState: ownedThread.workingState ?? null,
            summarizeCurrentRunEvents: params.status !== "ok",
            runtimeStop:
              params.status === "ok"
                ? null
                : {
                    status: params.status,
                    reason: params.reason ?? null,
                    errorCode: params.errorCode ?? null,
                    errorMessage: params.errorMessage ?? null,
                  },
          });
          contextSnapshot = buildRuntimeTurnContextSnapshot({
            packet: loadedContext.packet,
            capturedAt: Date.now(),
          });
        } catch {
          contextSnapshot = null;
        }
      }
      await finishRunBestEffortRaw({
        ...params,
        contextSnapshot,
      });
    };
    finishRunBestEffort = finishRunBestEffortForRun;
    await persistContextSnapshotBestEffort("started");
    const finishCancelledRun = async (): Promise<void> => {
      await finishRunBestEffortForRun({
        status: "cancelled",
        reason: USER_CANCELLED_RUNTIME_CODE,
        errorCode: USER_CANCELLED_RUNTIME_CODE,
        errorMessage: "Run cancelled by user.",
      });
    };
    const throwIfRunCancelled = async (): Promise<void> => {
      await throwIfRuntimeRunCancelled({
        ctx,
        ownerId: actor.dbUserId,
        runId,
      });
    };
    runtimeTurnStage = "idempotency_lookup";
    if (persistVisibleUserMessage && persistVisibleAssistantMessage) {
      const existingReplay = await lookupExistingRuntimeReplay({
        ctx,
        ownerId: actor.dbUserId,
        threadId: ownedThread._id,
        assistantMessageKeyForRun,
        userMessageKeyForRun,
        inferenceSource,
      });
      if (existingReplay) {
        await finishRunBestEffortForRun({
          status: "ok",
          reason: "idempotent_replay",
        });
        return successResponse(existingReplay);
      }
    }

    let userMessageId: string | null = null;
    let userMessageKey: string | null = null;
    let userMessageSeq: number | null = null;
    if (persistVisibleUserMessage) {
      try {
        ({ userMessageId, userMessageKey, userMessageSeq } =
          await persistRuntimeUserMessage({
            ctx,
            ownerId: actor.dbUserId,
            threadId: ownedThread._id,
            messageKey: userMessageKeyForRun,
            requestedModelId,
            runId,
            latestUserText,
          }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await finishRunBestEffortForRun({
          status: "error",
          reason: "user_message_persist_failed",
          errorCode: "user_message_persist_failed",
          errorMessage: message || "Failed to persist user message.",
        });
        return jsonResponse(req, 500, {
          ok: false,
          code: "user_message_persist_failed",
          error: "user_message_persist_failed",
          message: message || "Failed to persist user message.",
          run_id: runId,
        });
      }
    }

    let content = "";
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let resolvedInferenceSource = inferenceSource;
    let inferenceLaneFallbacks: Array<{
      from: "chatgpt" | "platform" | "public";
      to: "chatgpt" | "platform" | "public";
      reason: string;
    }> | null = null;
    const persistPartialAssistantMessageBestEffort = async (params: {
      content: string;
      status: "error" | "cancelled";
      reason?: string;
      errorCode?: string;
      errorMessage?: string;
      markPartialRun?: boolean;
      inferenceSourceOverride?: "free" | "platform" | "user_key" | "chatgpt";
      inferenceLaneFallbacksOverride?: Array<{
        from: "chatgpt" | "platform" | "public";
        to: "chatgpt" | "platform" | "public";
        reason: string;
      }> | null;
    }): Promise<{
      assistantMessageId: string | null;
      assistantMessageKey: string | null;
      assistantMessageSeq: number | null;
      content: string;
    } | null> => {
      if (!persistVisibleAssistantMessage) return null;
      const hasPartialContent = String(params.content ?? "").trim().length > 0;
      let failureContextPacket: RuntimeTurnContextPacket | null = null;
      let adaptiveFinalizerContent: string | null = null;
      if (!hasPartialContent) {
        const loadedFailureContext = await loadRuntimeTurnContextPacketForRun({
          ctx,
          ownerId: actor.dbUserId,
          threadId: ownedThread._id,
          runId,
          latestUserText,
          runtimeTurnEnvelope: runtimeTurnEnvelopeForRun,
          threadWorkingState: ownedThread.workingState ?? null,
          summarizeCurrentRunEvents: true,
          runtimeStop: {
            status: params.status,
            reason: params.reason ?? null,
            errorCode: params.errorCode ?? null,
            errorMessage: params.errorMessage ?? null,
          },
        });
        failureContextPacket = loadedFailureContext.packet;
        // A paid community run cannot issue an unmetered follow-up provider call.
        if (params.status === "error" && !(communityInferenceAdmission?.ok && requestedModelId === "gpt-6-luna")) {
          try {
            const finalizationMessages = buildAdaptiveFailureFinalizationMessages({
              runtimeTurnContext: failureContextPacket,
            });
            const finalizationMaxTokens = 700;
            const openAiFinalizerModelId = openAiModelIdFromRef(modelRef);
            const completion = await runAbortableWithRuntimeCancellation({
              ctx,
              ownerId: actor.dbUserId,
              runId,
              touchHeartbeat: touchRunHeartbeatBestEffort,
              operation: async (signal) => {
                // The founder-funded OpenAI model writes the fallback answer.
                if (!openAiFinalizerModelId) {
                  return {
                    ok: false as const,
                    status: 503,
                    code: "finalizer_model_unavailable",
                    message: "The community model is not an OpenAI model.",
                  };
                }
                return await runOpenAiCompletion({
                  req,
                  modelId: openAiFinalizerModelId,
                  messages: finalizationMessages,
                  maxTokens: finalizationMaxTokens,
                  signal,
                });
              },
            });
            if (!isRuntimeCompletionFailure(completion)) {
              adaptiveFinalizerContent = normalizeAdaptiveFailureAnswer(
                completion.content,
              );
            }
          } catch {
            adaptiveFinalizerContent = null;
          }
        }
      }
      const finalAnswer = buildRuntimeFailureFinalAnswer({
        partialContent: adaptiveFinalizerContent ?? params.content,
        runtimeTurnContext: failureContextPacket,
        status: params.status,
        reason: params.reason ?? null,
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
      });
      try {
        const persisted = await persistRuntimeAssistantMessage({
          ctx,
          ownerId: actor.dbUserId,
          threadId: ownedThread._id,
          messageKey: assistantMessageKeyForRun,
          requestedModelId,
          inferenceSource:
            params.inferenceSourceOverride ?? resolvedInferenceSource,
          lane,
          inferenceLaneFallbacks:
            params.inferenceLaneFallbacksOverride ?? inferenceLaneFallbacks,
          runId,
          content: finalAnswer.content,
          partialRun:
            params.markPartialRun === false
              ? null
              : {
                  status: params.status,
                  reason: params.reason ?? null,
                  errorCode: params.errorCode ?? null,
                  errorMessage: params.errorMessage ?? null,
                },
        });
        return {
          ...persisted,
          content: finalAnswer.content,
        };
      } catch {
        return null;
      }
    };
    const communityInferenceSurface: CommunityInferenceSurface | null =
      invocationSurface === "member_agent_dock" ? invocationSurface : null;
    let communityFundingProviderStarted = false;
    const communityFundingUsage = createFounderInferenceUsageTotals(requestedModelId);
    const claimCommunityFundingSession = async (): Promise<CommunityInferenceFundingSession | null> => {
      if (!communityInferenceSurface) return null;
      if (!runtimeCommunityId || !communityInferenceAdmission?.ok) {
        throw new Error("community_inference_funding_authority_missing");
      }
      return await claimCommunityInferenceFundingSession({
        ctx,
        communityId: runtimeCommunityId,
        actorUserId: actor.dbUserId,
        surface: communityInferenceSurface,
        receiptKey: `${communityInferenceSurface}:${runId}`,
        sourceRunId: `runtime:${runId}`,
        admission: communityInferenceAdmission,
      });
    };
    const markCommunityFundingProviderStarted = async (
      session: CommunityInferenceFundingSession | null,
    ): Promise<void> => {
      if (!session || communityFundingProviderStarted) return;
      if (session.modelId !== requestedModelId) {
        throw new Error("founder_inference_model_changed_before_start");
      }
      await markCommunityInferenceFundingSessionProviderStarted({ ctx, session });
      communityFundingProviderStarted = true;
    };
    const observeCommunityFundingProviderResult = (result: {
      ok: boolean;
      code: string | null;
      promptTokens: number | null;
      completionTokens: number | null;
      providerRequestUsage?: FounderProviderRequestUsage;
    }): void => {
      if (!communityInferenceSurface) return;
      if (!communityFundingProviderStarted) {
        communityFundingUsage.complete = false;
        return;
      }
      observeFounderProviderResult(communityFundingUsage, result,
        !result.ok && providerFailureIsKnownPreSpend(result.code ?? "provider_error"));
    };
    const failUnhandledCommunityFundingSession = async (
      session: CommunityInferenceFundingSession | null,
      failureCode: string,
    ): Promise<void> => {
      if (!session) return;
      await failCommunityInferenceFundingSession({
        ctx,
        session,
        promptTokens: communityFundingUsage.promptTokens,
        completionTokens: communityFundingUsage.completionTokens,
        providerRequests: founderProviderRequests(communityFundingUsage),
        usageComplete: communityFundingProviderStarted
          ? communityFundingUsage.complete
          : true,
        failureCode,
        disposition: communityFundingProviderStarted ? "indeterminate" : "failed",
      });
    };
    const finalizeCommunityFundingForLoopResult = async (params: {
      session: CommunityInferenceFundingSession | null;
      result: {
        ok: boolean;
        code?: string;
      };
      outcomeCode?: string;
    }): Promise<void> => {
      if (!params.session) return;
      if (!communityInferenceSurface) {
        throw new Error("community_inference_surface_missing");
      }
      if (params.result.ok) {
        if (!communityFundingProviderStarted) {
          await failCommunityInferenceFundingSession({
            ctx,
            session: params.session,
            promptTokens: 0,
            completionTokens: 0,
            usageComplete: true,
            failureCode: `${communityInferenceSurface}_provider_not_started`,
            disposition: "failed",
          });
          throw new Error(`${communityInferenceSurface}_provider_not_started`);
        }
        await settleCommunityInferenceFundingSession({
          ctx,
          session: params.session,
          promptTokens: communityFundingUsage.promptTokens,
          completionTokens: communityFundingUsage.completionTokens,
          providerRequests: founderProviderRequests(communityFundingUsage),
          usageComplete: communityFundingUsage.complete,
          outcomeCode:
            params.outcomeCode ?? `${communityInferenceSurface}_completed`,
        });
        return;
      }
      const failureCode = String(
        params.result.code ?? `${communityInferenceSurface}_inference_failed`,
      ).trim();
      await failCommunityInferenceFundingSession({
        ctx,
        session: params.session,
        promptTokens: communityFundingUsage.promptTokens,
        completionTokens: communityFundingUsage.completionTokens,
        providerRequests: founderProviderRequests(communityFundingUsage),
        usageComplete: communityFundingProviderStarted
          ? communityFundingUsage.complete
          : true,
        failureCode,
        disposition: !communityFundingProviderStarted || providerFailureIsKnownPreSpend(failureCode)
          ? "failed"
          : "indeterminate",
      });
    };
    const polynetAllowedToolNamesForRun = allowedToolNames;
    await appendRunEvent({
      eventType: "runtime_context_resolved",
      eventKey: `${runId}:runtime_context_resolved:1`,
      payload: {
        run_id: runId,
        thread_id: String(ownedThread._id),
        community_id: runtimeCommunityId ?? null,
        community_context_version: runtimeCommunityId ? runtimeCommunityContextVersion : null,
        community_lens_authority:
          buildCommunityLensAuthorityReceipt(runtimeCommunityLensAuthority),
        runtime_engine_requested:
          runtimeEngineResolution.requestedRuntimeEngine ?? null,
        runtime_engine_resolved: runtimeEngineResolution.resolvedRuntimeEngine,
        runtime_engine_source: runtimeEngineResolution.runtimeEngineSource,
        engine_id: runtimeEngineId,
        capability_families: resolvedRuntimeCapabilityFamilies,
        harness_profile: resolvedRuntimeHarnessProfile,
        invocation_surface: invocationSurface,
        member_agent_surface_context: communityAgentSurfaceContext,
      },
    });
    await appendRunEvent({
      eventType: "runtime_engine_resolved",
      eventKey: `${runId}:runtime_engine_resolved:1`,
      payload: {
        run_id: runId,
        runtime_engine_requested:
          runtimeEngineResolution.requestedRuntimeEngine ?? null,
        runtime_engine_resolved: runtimeEngineResolution.resolvedRuntimeEngine,
        runtime_engine_source: runtimeEngineResolution.runtimeEngineSource,
        engine_id: runtimeEngineId,
      },
    });
    const polynetHarnessToolPolicy = resolvePolynetHarnessToolPolicy({
      allowedToolNames: polynetAllowedToolNamesForRun,
    });
    await appendRunEvent({
      eventType: "tool_policy_resolved",
      eventKey: `${runId}:tool_policy_resolved:1`,
      payload: {
        run_id: runId,
        ...buildPolynetHarnessToolPolicyReceipt(polynetHarnessToolPolicy),
        policy_scope: "active_harness",
        allowed_tool_names: polynetHarnessToolPolicy.fixedRuntimeToolNames,
        capability_families: resolvedRuntimeCapabilityFamilies,
        harness_profile: resolvedRuntimeHarnessProfile,
        invocation_surface: invocationSurface,
        member_agent_surface_context: communityAgentSurfaceContext,
      },
    });
    if (stream) {
      return runtimeSseResponse(async (writer) => {
        let streamedContent = "";
        let streamedPromptTokens: number | null = null;
        let streamedCompletionTokens: number | null = null;
        let streamedInferenceSource = resolvedInferenceSource;
        let streamedInferenceLaneFallbacks = inferenceLaneFallbacks;
        let assistantMessageId: string | null = null;
        let assistantMessageKey: string | null = null;
        let assistantMessageSeq: number | null = null;

        const emitDelta = (delta: string) => {
          if (!delta) return;
          streamedContent += delta;
          writer.send({
            event: "delta",
            data: {
              delta,
            },
          });
        };
        let liveCompletionIndex: number | null = null;
        const emitLiveAssistantDelta = (delta: string, completionIndex: number) => {
          if (completionIndex === liveCompletionIndex) {
            emitDelta(delta);
            return;
          }
          const text = delta.trimStart();
          if (!text) return;
          // A later model turn after tool calls: keep its text apart from the preamble.
          if (streamedContent) emitDelta("\n\n");
          liveCompletionIndex = completionIndex;
          emitDelta(text);
        };

        const streamAppendRunEvent = async (event: {
          eventType: string;
          eventKey?: string;
          payload: Record<string, unknown>;
        }): Promise<void> => {
          const created = await appendRunEvent(event);
          await refreshActiveContextSnapshotAfterEventBestEffort(event.eventType);
          const mapped = mapPersistedRuntimeEventRow(created);
          if (!mapped) return;
          writer.send({
            event: "runtime_event",
            data: mapped,
          });
        };
        writer.send({
          event: "start",
          data: {
            run_id: runId,
            lane,
            engine_id: "runtime_convex",
            model_id: requestedModelId,
            inference_source: streamedInferenceSource,
            inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
          },
        });
        runtimeTurnStage = "agent_loop";
        let loopResult;
        let communityFundingSession: CommunityInferenceFundingSession | null = null;
        try {
          loopResult = await executeChatToolsAgentLoop({
            ctx,
            req,
            userId: actor.dbUserId,
            threadId: String(ownedThread._id),
            authSubject: actor.authSubject,
            requestedModelId,
            inferenceSource,
            modelRef,
            messages: conversationMessages,
            persistedConversationHistory,
            maxTokens,
            runId,
            communityId: runtimeCommunityId,
            communityName: runtimeCommunityName,
            communitySlug: runtimeCommunitySlug,
            communityOneLiner: runtimeCommunityOneLiner,
            communityAbout: runtimeCommunityAbout,
            communityChannels: runtimeCommunityChannels,
            communitySystemPrompt: runtimeCommunitySystemPrompt,
            communityLensAuthority: runtimeCommunityLensAuthority,
            communityContextVersion: runtimeCommunityId
              ? runtimeCommunityContextVersion
              : null,
            threadWorkingState: ownedThread.workingState ?? null,
            allowedToolNames: polynetAllowedToolNamesForRun,
            invocationSurface,
            communityAgentSurfaceContext,
            appendRunEvent: streamAppendRunEvent,
            refreshRuntimeContextSnapshot: async (
              phase: "started" | "active" = "active",
              runtimeTurnEnvelope: RuntimeTurnEnvelopeV1 | null = null,
            ): Promise<void> => {
              await persistContextSnapshotBestEffort(phase, runtimeTurnEnvelope);
            },
            touchRunHeartbeat: touchRunHeartbeatBestEffort,
            recordInitialProviderContextAttestation,
            beforeProviderRequest: async (): Promise<void> => {
              if (!communityFundingSession) {
                communityFundingSession = await claimCommunityFundingSession();
              }
              if (communityFundingSession) assertPaidLuna6ProviderHeadroom({
                session: communityFundingSession, usage: communityFundingUsage, maxOutputTokens: maxTokens,
              });
              await markCommunityFundingProviderStarted(communityFundingSession);
            },
            observeProviderResult: observeCommunityFundingProviderResult,
            onAssistantTextDelta: emitLiveAssistantDelta,
          });
          await appendContextIntegrityCheckBestEffortForRun();
        } catch (error) {
          if (communityFundingSession) {
            try {
              await failUnhandledCommunityFundingSession(
                communityFundingSession,
                founderInferenceBudgetFailureCode(error) ?? "community_inference_loop_unhandled",
              );
            } catch {
              // Preserve the original runtime failure; the receipt remains fail-closed.
            }
          }
          if (!communityFundingSession && communityInferenceSurface) {
            const failure = resolveCommunityFundingClaimFailure(error);
            await finishRunBestEffortForRun({
              status: "error",
              reason: failure.code,
              errorCode: failure.code,
              errorMessage: failure.message,
            });
            writer.send({
              event: "error",
              data: {
                code: failure.code,
                error: failure.message,
                message: failure.message,
                status: failure.status,
              },
            });
            return;
          }
          if (isRuntimeRunCancelledError(error)) {
            await persistPartialAssistantMessageBestEffort({
              content: streamedContent,
              status: "cancelled",
              reason: USER_CANCELLED_RUNTIME_CODE,
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: "Run cancelled by user.",
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishCancelledRun();
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          await persistPartialAssistantMessageBestEffort({
            // Streamed text is at most a preamble; a failed turn gets the runtime-stop answer.
            content: "",
            status: "error",
            reason: "agent_loop_unhandled",
            errorCode: "agent_loop_unhandled",
            errorMessage: message || "Agent loop failed unexpectedly.",
            inferenceSourceOverride: streamedInferenceSource,
            inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
          });
          await finishRunBestEffortForRun({
            status: "error",
            reason: "agent_loop_unhandled",
            errorCode: "agent_loop_unhandled",
            errorMessage: message || "Agent loop failed unexpectedly.",
          });
          writer.send({
            event: "error",
            data: {
              error: message || "Agent loop failed unexpectedly.",
            },
          });
          return;
        }
        try {
          await finalizeCommunityFundingForLoopResult({
            session: communityFundingSession,
            result: loopResult,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await finishRunBestEffortForRun({
            status: "error",
            reason: "community_inference_settlement_failed",
            errorCode: "community_inference_settlement_failed",
            errorMessage: message || "Community inference accounting could not be finalized.",
          });
          writer.send({
            event: "error",
            data: {
              code: "community_inference_settlement_failed",
              error: "Community AI could not finalize this turn.",
              message: "Community AI could not finalize this turn.",
              status: 503,
            },
          });
          return;
        }
        if (!loopResult.ok) {
          if (loopResult.code === USER_CANCELLED_RUNTIME_CODE) {
            await persistPartialAssistantMessageBestEffort({
              content: streamedContent,
              status: "cancelled",
              reason: USER_CANCELLED_RUNTIME_CODE,
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: "Run cancelled by user.",
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishCancelledRun();
            return;
          }
          const recoverableLoopStop = isRecoverableRuntimeKernelStopReason(
            loopResult.code,
          );
          const partialAssistant =
            await persistPartialAssistantMessageBestEffort({
              // Streamed text is at most a preamble; a failed turn gets the runtime-stop answer.
              content: "",
              status: "error",
              reason: loopResult.code,
              errorCode: loopResult.code,
              errorMessage: loopResult.message,
              markPartialRun: !recoverableLoopStop,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
          if (recoverableLoopStop) {
            if (persistVisibleAssistantMessage && !partialAssistant) {
              const persistMessage = "Failed to persist assistant message.";
              await finishRunBestEffortForRun({
                status: "error",
                reason: "assistant_message_persist_failed",
                errorCode: "assistant_message_persist_failed",
                errorMessage: persistMessage,
              });
              writer.send({
                event: "error",
                data: {
                  code: "assistant_message_persist_failed",
                  error: persistMessage,
                  message: persistMessage,
                  status: 500,
                },
              });
              return;
            }
            const fallbackFinalAnswer = buildRuntimeFailureFinalAnswer({
              partialContent: "",
              status: "error",
              reason: loopResult.code,
              errorCode: loopResult.code,
              errorMessage: loopResult.message,
            });
            const finalContent =
              partialAssistant?.content ?? fallbackFinalAnswer.content;
            if (!streamedContent && finalContent) {
              emitBufferedAssistantText({
                content: finalContent,
                emitDelta,
              });
            }
            await finishRunBestEffortForRun({
              status: "ok",
              reason: loopResult.code,
              errorCode: loopResult.code,
              errorMessage: loopResult.message,
            });
            writer.send({
              event: "done",
              data: {
                run_id: runId,
                lane,
                engine_id: "runtime_convex",
                model_id: requestedModelId,
                inference_source: streamedInferenceSource,
                inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
                // Replaces any streamed preamble on the client, as on success.
                full_content: finalContent,
                prompt_tokens: streamedPromptTokens,
                completion_tokens: streamedCompletionTokens,
                user_message_id: userMessageId,
                user_message_key: userMessageKey,
                user_message_seq: userMessageSeq,
                assistant_message_id:
                  partialAssistant?.assistantMessageId ?? null,
                assistant_message_key:
                  partialAssistant?.assistantMessageKey ?? null,
                assistant_message_seq:
                  partialAssistant?.assistantMessageSeq ?? null,
              },
            });
            return;
          }
          await finishRunBestEffortForRun({
            status: "error",
            reason: loopResult.code,
            errorCode: loopResult.code,
            errorMessage: loopResult.message,
          });
          writer.send({
            event: "error",
            data: {
              code: loopResult.code,
              error: loopResult.message,
              message: loopResult.message,
              status: loopResult.status,
            },
          });
          return;
        }
        runtimeTurnStage = "assistant_emit";
        streamedPromptTokens = loopResult.promptTokens;
        streamedCompletionTokens = loopResult.completionTokens;
        const finalAssistantText = loopResult.assistantText;
        if (finalAssistantText.startsWith(streamedContent)) {
          emitBufferedAssistantText({
            content: finalAssistantText.slice(streamedContent.length),
            emitDelta,
          });
        }
        // The reply is the final model turn. Any streamed preamble is replaced:
        // `done` carries full_content and the stored message is the final text.
        streamedContent = finalAssistantText;

        runtimeTurnStage = "assistant_persist";
        if (persistVisibleAssistantMessage) {
          try {
            await throwIfRunCancelled();
            ({
              assistantMessageId,
              assistantMessageKey,
              assistantMessageSeq,
            } = await persistRuntimeAssistantMessage({
              ctx,
              ownerId: actor.dbUserId,
              threadId: ownedThread._id,
              messageKey: assistantMessageKeyForRun,
              requestedModelId,
              inferenceSource: streamedInferenceSource,
              lane,
              inferenceLaneFallbacks: streamedInferenceLaneFallbacks,
              runId,
              content: streamedContent,
            }));
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              await persistPartialAssistantMessageBestEffort({
                content: streamedContent,
                status: "cancelled",
                reason: USER_CANCELLED_RUNTIME_CODE,
                errorCode: USER_CANCELLED_RUNTIME_CODE,
                errorMessage: "Run cancelled by user.",
                inferenceSourceOverride: streamedInferenceSource,
                inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
              });
              await finishCancelledRun();
              return;
            }
            const message =
              error instanceof Error ? error.message : String(error);
            await finishRunBestEffortForRun({
              status: "error",
              reason: "assistant_message_persist_failed",
              errorCode: "assistant_message_persist_failed",
              errorMessage: message || "Failed to persist assistant message.",
            });
            writer.send({
              event: "error",
              data: {
                error: message || "Failed to persist assistant message.",
              },
            });
            return;
          }
        }

        try {
          await throwIfRunCancelled();
        } catch (error) {
          if (isRuntimeRunCancelledError(error)) {
            await persistPartialAssistantMessageBestEffort({
              content: streamedContent,
              status: "cancelled",
              reason: USER_CANCELLED_RUNTIME_CODE,
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: "Run cancelled by user.",
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishCancelledRun();
            return;
          }
          throw error;
        }
        await finishRunBestEffortForRun({
          status: "ok",
        });
        writer.send({
          event: "done",
          data: {
            run_id: runId,
            lane,
            engine_id: "runtime_convex",
            model_id: requestedModelId,
            inference_source: streamedInferenceSource,
            inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
            full_content: streamedContent,
            prompt_tokens: streamedPromptTokens,
            completion_tokens: streamedCompletionTokens,
            user_message_id: userMessageId,
            user_message_key: userMessageKey,
            user_message_seq: userMessageSeq,
            assistant_message_id: assistantMessageId,
            assistant_message_key: assistantMessageKey,
            assistant_message_seq: assistantMessageSeq,
          },
        });
      });
    }
    runtimeTurnStage = "agent_loop";
    let loopResult;
    let communityFundingSession: CommunityInferenceFundingSession | null = null;
    try {
      loopResult = await executeChatToolsAgentLoop({
        ctx,
        req,
        userId: actor.dbUserId,
        threadId: String(ownedThread._id),
        authSubject: actor.authSubject,
        requestedModelId,
        inferenceSource,
        modelRef,
        messages: conversationMessages,
        persistedConversationHistory,
        maxTokens,
        runId,
        communityId: runtimeCommunityId,
        communityName: runtimeCommunityName,
        communitySlug: runtimeCommunitySlug,
        communityOneLiner: runtimeCommunityOneLiner,
        communityAbout: runtimeCommunityAbout,
            communityChannels: runtimeCommunityChannels,
        communitySystemPrompt: runtimeCommunitySystemPrompt,
        communityLensAuthority: runtimeCommunityLensAuthority,
        communityContextVersion: runtimeCommunityId
          ? runtimeCommunityContextVersion
          : null,
        threadWorkingState: ownedThread.workingState ?? null,
        allowedToolNames: polynetAllowedToolNamesForRun,
        invocationSurface,
        communityAgentSurfaceContext,
        appendRunEvent: async (event): Promise<void> => {
          await appendRunEvent(event);
          await refreshActiveContextSnapshotAfterEventBestEffort(event.eventType);
        },
        refreshRuntimeContextSnapshot: async (
          phase: "started" | "active" = "active",
          runtimeTurnEnvelope: RuntimeTurnEnvelopeV1 | null = null,
        ): Promise<void> => {
          await persistContextSnapshotBestEffort(phase, runtimeTurnEnvelope);
        },
        touchRunHeartbeat: touchRunHeartbeatBestEffort,
        recordInitialProviderContextAttestation,
        beforeProviderRequest: async (): Promise<void> => {
          if (!communityFundingSession) {
            communityFundingSession = await claimCommunityFundingSession();
          }
          if (communityFundingSession) assertPaidLuna6ProviderHeadroom({
            session: communityFundingSession, usage: communityFundingUsage, maxOutputTokens: maxTokens,
          });
          await markCommunityFundingProviderStarted(communityFundingSession);
        },
        observeProviderResult: observeCommunityFundingProviderResult,
      });
      await appendContextIntegrityCheckBestEffortForRun();
    } catch (error) {
      if (communityFundingSession) {
        try {
          await failUnhandledCommunityFundingSession(
            communityFundingSession,
            founderInferenceBudgetFailureCode(error) ?? "community_inference_loop_unhandled",
          );
        } catch {
          // Preserve the original runtime failure; the receipt remains fail-closed.
        }
      }
      if (!communityFundingSession && communityInferenceSurface) {
        const failure = resolveCommunityFundingClaimFailure(error);
        await finishRunBestEffortForRun({
          status: "error",
          reason: failure.code,
          errorCode: failure.code,
          errorMessage: failure.message,
        });
        return runtimeJsonResponse(failure.status, {
          ok: false,
          code: failure.code,
          error: failure.code,
          message: failure.message,
          run_id: runId,
        });
      }
      if (isRuntimeRunCancelledError(error)) {
        await persistPartialAssistantMessageBestEffort({
          content,
          status: "cancelled",
          reason: USER_CANCELLED_RUNTIME_CODE,
          errorCode: USER_CANCELLED_RUNTIME_CODE,
          errorMessage: "Run cancelled by user.",
        });
        await finishCancelledRun();
        return runtimeJsonResponse(409, {
          ok: false,
          code: USER_CANCELLED_RUNTIME_CODE,
          error: USER_CANCELLED_RUNTIME_CODE,
          message: "Run cancelled by user.",
          run_id: runId,
        });
      }
      const message = error instanceof Error ? error.message : String(error);
      await persistPartialAssistantMessageBestEffort({
        content,
        status: "error",
        reason: "agent_loop_unhandled",
        errorCode: "agent_loop_unhandled",
        errorMessage: message || "Agent loop failed unexpectedly.",
      });
      await finishRunBestEffortForRun({
        status: "error",
        reason: "agent_loop_unhandled",
        errorCode: "agent_loop_unhandled",
        errorMessage: message || "Agent loop failed unexpectedly.",
      });
      return runtimeJsonResponse(500, {
        ok: false,
        code: "agent_loop_unhandled",
        error: "agent_loop_unhandled",
        message: message || "Agent loop failed unexpectedly.",
        run_id: runId,
      });
    }
    try {
      await finalizeCommunityFundingForLoopResult({
        session: communityFundingSession,
        result: loopResult,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishRunBestEffortForRun({
        status: "error",
        reason: "community_inference_settlement_failed",
        errorCode: "community_inference_settlement_failed",
        errorMessage: message || "Community inference accounting could not be finalized.",
      });
      return runtimeJsonResponse(503, {
        ok: false,
        code: "community_inference_settlement_failed",
        error: "community_inference_settlement_failed",
        message: "Community AI could not finalize this turn.",
        run_id: runId,
      });
    }
    if (!loopResult.ok) {
      if (loopResult.code === USER_CANCELLED_RUNTIME_CODE) {
        await persistPartialAssistantMessageBestEffort({
          content,
          status: "cancelled",
          reason: USER_CANCELLED_RUNTIME_CODE,
          errorCode: USER_CANCELLED_RUNTIME_CODE,
          errorMessage: "Run cancelled by user.",
        });
        await finishCancelledRun();
        return runtimeJsonResponse(409, {
          ok: false,
          code: USER_CANCELLED_RUNTIME_CODE,
          error: USER_CANCELLED_RUNTIME_CODE,
          message: "Run cancelled by user.",
          run_id: runId,
        });
      }
      const recoverableLoopStop = isRecoverableRuntimeKernelStopReason(
        loopResult.code,
      );
      const partialAssistant = await persistPartialAssistantMessageBestEffort({
        content,
        status: "error",
        reason: loopResult.code,
        errorCode: loopResult.code,
        errorMessage: loopResult.message,
        markPartialRun: !recoverableLoopStop,
      });
      if (recoverableLoopStop) {
        if (persistVisibleAssistantMessage && !partialAssistant) {
          const persistMessage = "Failed to persist assistant message.";
          await finishRunBestEffortForRun({
            status: "error",
            reason: "assistant_message_persist_failed",
            errorCode: "assistant_message_persist_failed",
            errorMessage: persistMessage,
          });
          return runtimeJsonResponse(500, {
            ok: false,
            code: "assistant_message_persist_failed",
            error: "assistant_message_persist_failed",
            message: persistMessage,
            run_id: runId,
          });
        }
        await finishRunBestEffortForRun({
          status: "ok",
          reason: loopResult.code,
          errorCode: loopResult.code,
          errorMessage: loopResult.message,
        });
        const fallbackFinalAnswer = buildRuntimeFailureFinalAnswer({
          partialContent: content,
          status: "error",
          reason: loopResult.code,
          errorCode: loopResult.code,
          errorMessage: loopResult.message,
        });
        return successResponse({
          content: partialAssistant?.content ?? fallbackFinalAnswer.content,
          promptTokens,
          completionTokens,
          resolvedInferenceSource,
          inferenceLaneFallbacks,
          userMessageId,
          userMessageKey,
          userMessageSeq,
          assistantMessageId: partialAssistant?.assistantMessageId ?? null,
          assistantMessageKey: partialAssistant?.assistantMessageKey ?? null,
          assistantMessageSeq: partialAssistant?.assistantMessageSeq ?? null,
        });
      }
      await finishRunBestEffortForRun({
        status: "error",
        reason: loopResult.code,
        errorCode: loopResult.code,
        errorMessage: loopResult.message,
      });
      return runtimeJsonResponse(loopResult.status, {
        ok: false,
        code: loopResult.code,
        error: loopResult.code,
        message: loopResult.message,
        run_id: runId,
      });
    }
    content = loopResult.assistantText;
    promptTokens = loopResult.promptTokens;
    completionTokens = loopResult.completionTokens;
    runtimeTurnStage = "assistant_persist";
    let assistantMessageId: string | null = null;
    let assistantMessageKey: string | null = null;
    let assistantMessageSeq: number | null = null;
    if (persistVisibleAssistantMessage) {
      try {
        await throwIfRunCancelled();
        ({ assistantMessageId, assistantMessageKey, assistantMessageSeq } =
          await persistRuntimeAssistantMessage({
            ctx,
            ownerId: actor.dbUserId,
            threadId: ownedThread._id,
            messageKey: assistantMessageKeyForRun,
            requestedModelId,
            inferenceSource: resolvedInferenceSource,
            lane,
            inferenceLaneFallbacks,
            runId,
            content,
          }));
      } catch (error) {
        if (isRuntimeRunCancelledError(error)) {
          await persistPartialAssistantMessageBestEffort({
            content,
            status: "cancelled",
            reason: USER_CANCELLED_RUNTIME_CODE,
            errorCode: USER_CANCELLED_RUNTIME_CODE,
            errorMessage: "Run cancelled by user.",
          });
          await finishCancelledRun();
          return runtimeJsonResponse(409, {
            ok: false,
            code: USER_CANCELLED_RUNTIME_CODE,
            error: USER_CANCELLED_RUNTIME_CODE,
            message: "Run cancelled by user.",
            run_id: runId,
          });
        }
        const message = error instanceof Error ? error.message : String(error);
        await finishRunBestEffortForRun({
          status: "error",
          reason: "assistant_message_persist_failed",
          errorCode: "assistant_message_persist_failed",
          errorMessage: message || "Failed to persist assistant message.",
        });
        return runtimeJsonResponse(500, {
          ok: false,
          code: "assistant_message_persist_failed",
          error: "assistant_message_persist_failed",
          message: message || "Failed to persist assistant message.",
          run_id: runId,
        });
      }
    }

    try {
      await throwIfRunCancelled();
    } catch (error) {
      if (isRuntimeRunCancelledError(error)) {
        await persistPartialAssistantMessageBestEffort({
          content,
          status: "cancelled",
          reason: USER_CANCELLED_RUNTIME_CODE,
          errorCode: USER_CANCELLED_RUNTIME_CODE,
          errorMessage: "Run cancelled by user.",
        });
        await finishCancelledRun();
        return runtimeJsonResponse(409, {
          ok: false,
          code: USER_CANCELLED_RUNTIME_CODE,
          error: USER_CANCELLED_RUNTIME_CODE,
          message: "Run cancelled by user.",
          run_id: runId,
        });
      }
      throw error;
    }

    await finishRunBestEffortForRun({
      status: "ok",
    });
    return successResponse({
      content,
      promptTokens,
      completionTokens,
      resolvedInferenceSource,
      inferenceLaneFallbacks,
      userMessageId,
      userMessageKey,
      userMessageSeq,
      assistantMessageId,
      assistantMessageKey,
      assistantMessageSeq,
    });
  } catch (error) {
    if (isRuntimeRunCancelledError(error)) {
      if (finishRunBestEffort) {
        await finishRunBestEffort({
          status: "cancelled",
          reason: USER_CANCELLED_RUNTIME_CODE,
          errorCode: USER_CANCELLED_RUNTIME_CODE,
          errorMessage: "Run cancelled by user.",
        });
      }
      return runtimeJsonResponse(409, {
        ok: false,
        code: USER_CANCELLED_RUNTIME_CODE,
        error: USER_CANCELLED_RUNTIME_CODE,
        message: "Run cancelled by user.",
        ...(startedRunId ? { run_id: startedRunId } : null),
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (finishRunBestEffort) {
      await finishRunBestEffort({
        status: "error",
        reason: "runtime_turn_unhandled",
        errorCode: "runtime_turn_unhandled",
        errorMessage: message || "Runtime turn failed unexpectedly.",
      });
    }
    logStructuredError("runtime_turn_unhandled", {
      error,
      requestId,
      stage: runtimeTurnStage,
      ...runtimeTurnLogContext,
    });
    return runtimeJsonResponse(500, {
      ok: false,
      code: "runtime_turn_unhandled",
      error: "runtime_turn_unhandled",
      message: `runtime_turn_unhandled: ${
        message || "Runtime turn failed unexpectedly."
      }`,
      ...(startedRunId ? { run_id: startedRunId } : null),
    });
  }
}
