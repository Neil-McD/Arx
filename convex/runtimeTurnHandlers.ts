import {
  runChatgptCompletion,
  runChatgptStreamingCompletion,
} from "./httpChatgpt";
import { internal } from "./_generated/api";
import { loadPublicModelMap } from "./httpInferenceConfig";
import {
  normalizeMaxTokens,
  normalizeMessages,
  runOpenAiCompletion,
  runOpenRouterCompletion,
  runOpenRouterStreamingCompletion,
} from "./httpRuntimeSupport";
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
  composePlatformChatRuntimeSystemPrompt,
} from "../shared/runtimePrompt";
import {
  buildCodexHarnessToolPolicyReceipt,
  resolveCodexHarnessToolPolicy,
} from "../shared/harnessToolPolicy";
import {
  buildRuntimeCodexPromptProjection,
} from "../shared/runtimeCodexPromptProjection";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  isRecoverableRuntimeKernelStopReason,
} from "../shared/runtimeKernelTypes";
import {
  buildRuntimeTurnContextSnapshot,
  renderRuntimeTurnContextForFailureFinalizer,
  type RuntimeTurnContextSnapshotV1,
  type RuntimeTurnContextPacket,
} from "../shared/runtimeTurnContextPacket";
import {
  buildRuntimeTurnEnvelope,
  type RuntimeTurnEnvelopeV1,
} from "../shared/runtimeTurnEnvelope";
import {
  buildRuntimeFailureFinalAnswer,
  hasConnectedAppFailureEvidence,
} from "../shared/runtimeFailureFinalizer";
import {
  loadRuntimeProjectContext,
  loadRuntimeTurnContextPacketForRun,
} from "./runtimeTurnContext";
import {
  PublicTurnInput,
  RequireAuthenticatedActor,
  resolveAuthenticatedRuntimeTurn,
  RuntimeTurnInput,
} from "./runtimeTurnResolution";
import {
  RUNTIME_ENGINE_CODEX,
} from "../shared/runtimeEngine";
import {
  POLYNET_CODEX_WORKER_CONTRACT_NAME,
  POLYNET_CODEX_WORKER_CONTRACT_VERSION,
  POLYNET_CODEX_WORKER_ENGINE_ID,
  cancelPolynetCodexWorkerTurn,
  steerPolynetCodexWorkerTurn,
  streamPolynetCodexWorkerTurn,
  type PolynetCodexWorkerResolvedTarget,
} from "./polynetCodexWorkerBridge";
import { getFreshChatgptAuthForUser } from "./chatgptAuth";
import {
  isPolynetCodexWorkerRunTokenFailure,
  mintPolynetCodexWorkerRunTokenSet,
} from "./polynetCodexWorkerRunToken";
import {
  buildPolynetCodexRuntimeWorkspaceComputeBillingContext,
  refundPolynetCodexRuntimeWorkspaceComputeBestEffort,
  reservePolynetCodexRuntimeWorkspaceCompute,
  settlePolynetCodexRuntimeWorkspaceComputeBestEffort,
  type PolynetCodexRuntimeWorkspaceComputeReservation,
} from "./polynetCodexRuntimeAccounting";
import {
  ensureRuntimeRunStarted,
  lookupExistingRuntimeReplay,
  persistRuntimeAssistantMessage,
  persistRuntimeUserMessage,
} from "./runtimeTurnPersistence";
import { normalizeRuntimeSkillResolution } from "./runtimeHarnessShaping";
import { createRuntimeReasoningSummaryEmitter } from "./runtimeReasoningSummaryEvents";
import { logStructuredError } from "./errorLogging";

export type {
  SseResponseEvent,
  SseResponseFn,
  SseResponseSource,
  SseResponseStreamWriter,
} from "./httpRuntimeTurnState";
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

function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readRuntimeEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function readConvexSiteUrl(): string | null {
  const siteUrl = readRuntimeEnv("CONVEX_SITE_URL").replace(/\/+$/, "");
  return siteUrl || null;
}

function buildPolynetCodexWorkerIngestTarget(): {
  url: string;
  token: string;
} | null {
  const siteUrl = readConvexSiteUrl();
  const token = readRuntimeEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
  if (!siteUrl || !token) return null;
  return {
    url: `${siteUrl}/runtime/polynet_codex_worker_ingest`,
    token,
  };
}

function buildPolynetCodexWorkerToolTarget(): string | null {
  const siteUrl = readConvexSiteUrl();
  if (!siteUrl) return null;
  return `${siteUrl}/runtime/polynet_codex_worker_tool`;
}

async function loadUserAgentProfileForRuntime(
  ctx: any,
  userId: string,
): Promise<{ agentName: string | null; agentSoul: string | null }> {
  try {
    const row = (await ctx.runQuery(internal.settings.getUserAgentSoulInternal as any, {
      userId: userId as any,
    })) as { agent_name?: unknown; agent_soul?: unknown } | null;
    const agentName = String(row?.agent_name ?? "").trim();
    const agentSoul = String(row?.agent_soul ?? "").trim();
    return {
      agentName: agentName || null,
      agentSoul: agentSoul || null,
    };
  } catch {
    return {
      agentName: null,
      agentSoul: null,
    };
  }
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
        "If a dev server or background terminal is running but render evidence says the preview is blank, explicitly distinguish server/process health from app render health.",
        "Do not claim the app is working just because an iframe or server loaded.",
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

export async function handlePublicTurnRequest(args: {
  req: Request;
  jsonResponse: JsonResponseFn;
  sseResponse: SseResponseFn;
}): Promise<Response> {
  const { req, jsonResponse, sseResponse } = args;
  let input: PublicTurnInput;
  try {
    input = (await req.json()) as PublicTurnInput;
  } catch {
    return jsonResponse(req, 400, {
      ok: false,
      code: "invalid_request",
      error: "invalid_request",
      message: "Invalid JSON payload.",
    });
  }

  const publicMap = loadPublicModelMap();
  const modelId =
    String(input.model_id ?? "").trim() ||
    Object.keys(publicMap)[0] ||
    "gpt-oss-120b-free";
  const modelRef = publicMap[modelId];
  if (!modelRef) {
    return jsonResponse(req, 403, {
      ok: false,
      code: "model_not_allowed",
      error: "model_not_allowed",
      message: "Requested guest model is not allowed.",
      model_id: modelId,
    });
  }

  const messages = normalizeMessages(input.messages);
  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    return jsonResponse(req, 400, {
      ok: false,
      code: "no_user_message",
      error: "no_user_message",
      message: "A trailing user message is required.",
    });
  }

  const maxTokens = normalizeMaxTokens(input.max_tokens, 2048);
  const runId =
    String(
      (input as { idempotency_key?: unknown }).idempotency_key ?? "",
    ).trim() || `convex_runtime:${crypto.randomUUID()}`;
  const stream = input.stream !== false;
  if (stream) {
    return sseResponse(req, async (writer) => {
      writer.send({
        event: "start",
        data: {
          run_id: runId,
          lane: "public",
          engine_id: "public_convex",
          model_id: modelId,
          inference_source: "free",
        },
      });
      const completion = await runOpenRouterStreamingCompletion({
        req,
        modelRef,
        messages,
        maxTokens,
        onDelta: (delta) => {
          writer.send({
            event: "delta",
            data: {
              delta,
            },
          });
        },
      });
      if (isRuntimeCompletionFailure(completion)) {
        writer.send({
          event: "error",
          data: {
            error: completion.message,
          },
        });
        writer.close();
        return;
      }
      writer.send({
        event: "done",
        data: {
          run_id: runId,
          lane: "public",
          engine_id: "public_convex",
          model_id: modelId,
          inference_source: "free",
          full_content: completion.content,
          prompt_tokens: completion.promptTokens,
          completion_tokens: completion.completionTokens,
        },
      });
    });
  }

  const completion = await runOpenRouterCompletion({
    req,
    modelRef,
    messages,
    maxTokens,
  });
  if (isRuntimeCompletionFailure(completion)) {
    return jsonResponse(req, completion.status, {
      ok: false,
      code: completion.code,
      error: completion.code,
      message: completion.message,
    });
  }

  const content = completion.content;
  const promptTokens = completion.promptTokens;
  const completionTokens = completion.completionTokens;
  return jsonResponse(req, 200, {
    ok: true,
    run_id: runId,
    lane: "public",
    engine_id: "public_convex",
    model_id: modelId,
    inference_source: "free",
    content,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
  });
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
      requestedModelId,
      lane,
      modelRef,
      maxTokens,
      stream,
      inferenceSource,
      providerApiKeyOverride,
      runtimeEngine,
      runtimeEngineFallbackReason,
      codexWorkerBridgeConfigured,
      runtimeCommunityId,
      runtimeCommunityName,
      runtimeCommunitySlug,
      runtimeCommunityOneLiner,
      runtimeCommunityAbout,
      runtimeCommunitySystemPrompt,
      runtimeProjectId,
      runtimeSandboxMode,
      allowedToolNames,
      resolvedRuntimeCapabilityFamilies,
      resolvedRuntimeHarnessProfile,
      runtimeExecutionMode,
    } = resolved.value;
    const runtimeAgentProfile = await loadUserAgentProfileForRuntime(ctx, actor.dbUserId);
    const runId =
      String(input.idempotency_key ?? "").trim() ||
      `convex_runtime:${crypto.randomUUID()}`;
    startedRunId = runId;
    runtimeTurnStage = "run_start";
    const explicitUserMessageKey = String(input.user_message_key ?? "").trim();
    const userMessageKeyForRun =
      explicitUserMessageKey || `user:${threadKey}:${runId}`;
    const assistantMessageKeyForRun = `assistant:${threadKey}:${runId}`;
    const latestUserText = String(
      conversationMessages[conversationMessages.length - 1]?.content ?? "",
    ).trim();
    const runtimeCommunityContextVersion = Number.isFinite(Number(ownedThread.contextVersion ?? 0))
      ? Math.max(0, Math.floor(Number(ownedThread.contextVersion ?? 0)))
      : 0;
    const chatgptCodexRequestMetadata = {
      sessionId: String(ownedThread._id),
      threadId: String(ownedThread._id),
    };
    const runtimeEngineId =
      runtimeEngine === RUNTIME_ENGINE_CODEX
        ? POLYNET_CODEX_WORKER_ENGINE_ID
        : "runtime_turn";
    const runtimeContractName =
      runtimeEngine === RUNTIME_ENGINE_CODEX
        ? POLYNET_CODEX_WORKER_CONTRACT_NAME
        : runtimeExecutionMode === "agentic"
          ? "capability_composed_tools_v1"
          : "capability_composed_chat_v1";
    const runtimeContractVersion =
      runtimeEngine === RUNTIME_ENGINE_CODEX
        ? POLYNET_CODEX_WORKER_CONTRACT_VERSION
        : "v1";
    const persistVisibleUserMessage = true;
    const persistVisibleAssistantMessage = true;
    const runVisibility = "user_visible";
    const runStartedAt = Date.now();
    runtimeTurnLogContext = {
      runId,
      threadId: String(ownedThread._id),
      threadKey,
      userId: actor.dbUserId,
      projectId: runtimeProjectId ?? undefined,
      communityId: runtimeCommunityId ?? undefined,
      requestedModelId,
      lane,
      inferenceSource,
      runtimeEngine,
      runtimeEngineFallbackReason,
      codexWorkerBridgeConfigured,
      engineId: runtimeEngineId,
      contractName: runtimeContractName,
      contractVersion: runtimeContractVersion,
      executionMode: runtimeExecutionMode,
      capabilityFamilies: resolvedRuntimeCapabilityFamilies,
      harnessProfile: resolvedRuntimeHarnessProfile,
    };
    const runStartArgs: Record<string, unknown> = {
      ownerId: actor.dbUserId,
      threadId: ownedThread._id,
      runId,
      lane,
      visibility: runVisibility,
      projectId: runtimeProjectId ?? undefined,
      communityId: runtimeCommunityId ? (runtimeCommunityId as any) : undefined,
      communityContextVersion: runtimeCommunityId ? runtimeCommunityContextVersion : undefined,
      modelId: requestedModelId,
      engineId: runtimeEngineId,
      runtimeEngine,
      executionMode: runtimeExecutionMode,
      sandboxMode: runtimeSandboxMode,
      contractName: runtimeContractName,
      contractVersion: runtimeContractVersion,
      harnessProfile: resolvedRuntimeHarnessProfile,
      harnessProfileSource: "runtime_capability_resolution_v1",
      capabilityFamilies: resolvedRuntimeCapabilityFamilies,
      latestUserText,
      startedAt: runStartedAt,
      nowMs: runStartedAt,
    };
    const runStart = await ensureRuntimeRunStarted({
      ctx,
      ownerId: actor.dbUserId,
      threadId: ownedThread._id,
      runStartArgs,
      fail: runtimeJsonResponse,
    });
    if (!runStart.ok) return runStart.response;

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
          projectId: runtimeProjectId,
          authSubject: actor.authSubject,
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
        eventType !== "runtime_diagnostics_detected" &&
        eventType !== "workspace_terminal_status" &&
        eventType !== "workspace_preview_observed"
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
    let polynetCodexWorkerLeaseAcquired = false;
    let polynetCodexWorkerLeaseReleased = false;
    const releasePolynetCodexWorkerLeaseBestEffort = async (
      reason: string,
    ): Promise<void> => {
      if (!polynetCodexWorkerLeaseAcquired || polynetCodexWorkerLeaseReleased) return;
      polynetCodexWorkerLeaseReleased = true;
      try {
        await ctx.runMutation(
          (internal as any).polynetCodexWorkerAdmission
            .releasePolynetCodexWorkerLease as any,
          {
            ownerId: actor.dbUserId,
            runId,
            reason,
          },
        );
      } catch {
        // Lease TTL is the final backstop; do not fail terminal run finalization.
      }
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
            projectId: runtimeProjectId,
            authSubject: actor.authSubject,
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
      try {
        await finishRunBestEffortRaw({
          ...params,
          contextSnapshot,
        });
      } finally {
        await releasePolynetCodexWorkerLeaseBestEffort(
          params.status === "ok"
            ? "completed"
            : params.status === "cancelled"
              ? "cancelled"
              : params.errorCode || params.reason || "error",
        );
      }
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
    const successResponse = buildRuntimeTurnSuccessResponder({
      req,
      stream,
      runId,
      requestId,
      lane,
      runtimeEngine,
      requestedModelId,
      jsonResponse: (_req, status, payload) =>
        runtimeJsonResponse(status, payload as Record<string, unknown>),
      sseResponse: (_req, events) => runtimeSseResponse(events),
    });

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
      engineIdOverride?: string | null;
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
          projectId: runtimeProjectId,
          authSubject: actor.authSubject,
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
        if (
          params.status === "error" &&
          !hasConnectedAppFailureEvidence(failureContextPacket)
        ) {
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
              operation: async (signal) => {
                if (inferenceSource === "chatgpt") {
                  return await runChatgptCompletion({
                    ctx,
                    userId: actor.dbUserId,
                    modelId: requestedModelId,
                    messages: finalizationMessages,
                    maxTokens: finalizationMaxTokens,
                    requestMetadata: chatgptCodexRequestMetadata,
                    signal,
                  });
                }
                if (inferenceSource === "user_key" && openAiFinalizerModelId) {
                  return await runOpenAiCompletion({
                    req,
                    modelId: openAiFinalizerModelId,
                    messages: finalizationMessages,
                    maxTokens: finalizationMaxTokens,
                    apiKeyOverride: providerApiKeyOverride,
                    signal,
                  });
                }
                return await runOpenRouterCompletion({
                  req,
                  modelRef,
                  messages: finalizationMessages,
                  maxTokens: finalizationMaxTokens,
                  apiKeyOverride: providerApiKeyOverride,
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
          engineId: params.engineIdOverride,
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
    await appendRunEvent({
      eventType: "runtime_context_resolved",
      eventKey: `${runId}:runtime_context_resolved:1`,
      payload: {
        run_id: runId,
        thread_id: String(ownedThread._id),
        project_id: runtimeProjectId ?? null,
        community_id: runtimeCommunityId ?? null,
        community_context_version: runtimeCommunityId ? runtimeCommunityContextVersion : null,
        runtime_engine: runtimeEngine,
        runtime_engine_fallback_reason: runtimeEngineFallbackReason,
        codex_worker_bridge_configured: codexWorkerBridgeConfigured,
        capability_families: resolvedRuntimeCapabilityFamilies,
        harness_profile: resolvedRuntimeHarnessProfile,
      },
    });
    await appendRunEvent({
      eventType: "tool_policy_resolved",
      eventKey: `${runId}:tool_policy_resolved:1`,
      payload: {
        run_id: runId,
        runtime_engine: runtimeEngine,
        allowed_tool_names: allowedToolNames,
        capability_families: resolvedRuntimeCapabilityFamilies,
        harness_profile: resolvedRuntimeHarnessProfile,
      },
    });
    if (runtimeEngine === RUNTIME_ENGINE_CODEX) {
      if (!stream || runtimeExecutionMode !== "agentic" || inferenceSource !== "chatgpt") {
        const code = "polynet_codex_worker_requires_streaming_chatgpt_agentic";
        const message =
          "Codex runtime requires streaming, agentic workspace tools, and a connected ChatGPT account.";
        await finishRunBestEffortForRun({
          status: "error",
          reason: code,
          errorCode: code,
          errorMessage: message,
        });
        return runtimeJsonResponse(400, {
          ok: false,
          code,
          error: code,
          message,
          run_id: runId,
          runtime_engine: runtimeEngine,
        });
      }

      return runtimeSseResponse(async (writer) => {
        let streamedContent = "";
        let streamedInferenceSource = resolvedInferenceSource;
        let streamedInferenceLaneFallbacks = inferenceLaneFallbacks;
        let assistantMessageId: string | null = null;
        let assistantMessageKey: string | null = null;
        let assistantMessageSeq: number | null = null;

        const emitWorkerDelta = (data: Record<string, unknown>) => {
          const full =
            typeof data.full_content === "string" ? data.full_content : null;
          const delta = typeof data.delta === "string" ? data.delta : "";
          if (full !== null) streamedContent = full;
          else if (delta) streamedContent += delta;
          writer.send({
            event: "delta",
            data: {
              ...data,
              run_id: runId,
              engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
              model_id: requestedModelId,
            },
          });
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

        const failWorkerTurn = async (params: {
          status: number;
          code: string;
          message: string;
          data?: Record<string, unknown>;
        }): Promise<void> => {
          await persistPartialAssistantMessageBestEffort({
            content: streamedContent,
            status: "error",
            reason: params.code,
            errorCode: params.code,
            errorMessage: params.message,
            engineIdOverride: POLYNET_CODEX_WORKER_ENGINE_ID,
            inferenceSourceOverride: streamedInferenceSource,
            inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
          });
          await finishRunBestEffortForRun({
            status: "error",
            reason: params.code,
            errorCode: params.code,
            errorMessage: params.message,
          });
          writer.send({
            event: "error",
            data: {
              code: params.code,
              error: params.message,
              message: params.message,
              status: params.status,
              ...(params.data ?? {}),
            },
          });
        };

        writer.send({
          event: "start",
          data: {
            run_id: runId,
            lane,
            engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
            model_id: requestedModelId,
            inference_source: streamedInferenceSource,
            inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
          },
        });

        await streamAppendRunEvent({
          eventType: "polynet_codex_worker_bridge_started",
          eventKey: `${runId}:polynet_codex_worker_bridge_started:1`,
          payload: {
            run_id: runId,
            runtime_engine: runtimeEngine,
            engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
            contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
            contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
            model_id: requestedModelId,
            daytona_runtime: true,
          },
        });

        runtimeTurnStage = "polynet_codex_worker";
        const workerChatgptAuth = await getFreshChatgptAuthForUser({
          ctx,
          userId: String(actor.dbUserId),
        });
        const workerChatgptAccountId = String(workerChatgptAuth?.accountId ?? "").trim();
        if (!workerChatgptAuth?.accessToken || !workerChatgptAccountId) {
          await failWorkerTurn({
            status: 403,
            code: "provider_connection_required",
            message: "Connect ChatGPT to run Codex turns with your own account.",
            data: { cta: "connect_provider" },
          });
          return;
        }

        const leaseAcquireResult = (await ctx.runMutation(
          (internal as any).polynetCodexWorkerAdmission
            .tryAcquirePolynetCodexWorkerLease as any,
          {
            ownerId: actor.dbUserId,
            threadId: ownedThread._id,
            runId,
            ...(runtimeProjectId ? { projectId: runtimeProjectId } : {}),
          },
        )) as {
          ok: boolean;
          status?: number;
          code?: string;
          message?: string;
          leaseId?: string;
          expiresAt?: number;
          counts?: Record<string, unknown>;
          limits?: Record<string, unknown>;
        };
        if (!leaseAcquireResult.ok) {
          await failWorkerTurn({
            status: leaseAcquireResult.status ?? 429,
            code:
              String(leaseAcquireResult.code ?? "").trim() ||
              "codex_runtime_capacity_unavailable",
            message:
              String(leaseAcquireResult.message ?? "").trim() ||
              "Codex runtime capacity is unavailable.",
            data: {
              counts: leaseAcquireResult.counts ?? null,
              limits: leaseAcquireResult.limits ?? null,
            },
          });
          return;
        }
        polynetCodexWorkerLeaseAcquired = true;
        await streamAppendRunEvent({
          eventType: "polynet_codex_worker_capacity_admitted",
          eventKey: `${runId}:polynet_codex_worker_capacity_admitted:1`,
          payload: {
            run_id: runId,
            lease_id: leaseAcquireResult.leaseId ?? null,
            lease_expires_at: leaseAcquireResult.expiresAt ?? null,
            counts: leaseAcquireResult.counts ?? null,
            limits: leaseAcquireResult.limits ?? null,
          },
        });

        const now = new Date();
        const runtimeTimeZone = "UTC";
        const codexSkillResolution = normalizeRuntimeSkillResolution(
          await ctx.runQuery(
            internal.runtimeSkillResolution.resolveRuntimeSkillSelectionInternal as any,
            {
              userId: actor.dbUserId as any,
              authSubject: actor.authSubject,
              communityId: runtimeCommunityId ? (runtimeCommunityId as any) : undefined,
              messages: conversationMessages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
            },
          ),
        );
        const codexCommunityResourceLane =
          codexSkillResolution.community_resource_lane;
        const codexHarnessPolicy = resolveCodexHarnessToolPolicy({
          polynetPlatformToolProjection: {
            hasCommunity: Boolean(runtimeCommunityId),
            communityResourceLane: codexCommunityResourceLane,
            canModerateCommunity: allowedToolNames.includes("community_write"),
            canManageCommunity: false,
            canManageResources: codexCommunityResourceLane.can_use_resource_builder,
          },
          workspaceServeAvailable: true,
          computerAdaptersAvailable: true,
        });
        await streamAppendRunEvent({
          eventType: "codex_harness_policy_resolved",
          eventKey: `${runId}:codex_harness_policy_resolved:1`,
          payload: {
            run_id: runId,
            runtime_engine: runtimeEngine,
            community_resource_lane: codexCommunityResourceLane,
            policy: buildCodexHarnessToolPolicyReceipt(codexHarnessPolicy),
          },
        });

        const codexRuntimeTurnEnvelope = buildRuntimeTurnEnvelope({
          latestUserText,
          threadWorkingState: ownedThread.workingState ?? null,
          threadId: String(ownedThread._id),
          communityId: runtimeCommunityId,
          projectId: runtimeProjectId,
          communityResourceLane: codexCommunityResourceLane,
          allowedToolNames: codexHarnessPolicy.polynetPlatformToolNames,
        });
        runtimeTurnEnvelopeForRun = codexRuntimeTurnEnvelope;
        await persistContextSnapshotBestEffort("active", codexRuntimeTurnEnvelope);

        const codexRuntimeContext = (
          await loadRuntimeTurnContextPacketForRun({
            ctx,
            ownerId: actor.dbUserId,
            threadId: ownedThread._id,
            projectId: runtimeProjectId,
            authSubject: actor.authSubject,
            runId,
            latestUserText,
            runtimeTurnEnvelope: codexRuntimeTurnEnvelope,
            threadWorkingState: ownedThread.workingState ?? null,
            summarizeCurrentRunEvents: true,
            runtimeStop: null,
          })
        ).packet;
        const codexProjectContext = codexRuntimeContext.projectContext ?? null;
        const workerTurnInputs = buildRuntimeCodexPromptProjection({
          loopBudget: DEFAULT_RUNTIME_KERNEL_BUDGET,
          allowedToolNames: codexHarnessPolicy.polynetPlatformToolNames,
          communityResourceLane: codexCommunityResourceLane,
          harnessName: "chat_tools",
          communityId: runtimeCommunityId,
          communityName: runtimeCommunityName,
          communitySlug: runtimeCommunitySlug,
          communityOneLiner: runtimeCommunityOneLiner,
          communityAbout: runtimeCommunityAbout,
          communitySystemPrompt: runtimeCommunitySystemPrompt,
          agentName: runtimeAgentProfile.agentName,
          agentSoul: runtimeAgentProfile.agentSoul,
          projectLabel: codexProjectContext?.label ?? null,
          projectDescription: codexProjectContext?.description ?? null,
          runtimeTurnContext: codexRuntimeContext,
          currentDateTimeIso: now.toISOString(),
          currentDateLabel: new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: runtimeTimeZone,
          }).format(now),
          currentTimeZone: runtimeTimeZone,
          conversationMessages,
          latestUserText,
        });
        await streamAppendRunEvent({
          eventType: "polynet_codex_worker_instructions_resolved",
          eventKey: `${runId}:polynet_codex_worker_instructions_resolved:1`,
          payload: {
            run_id: runId,
            agent_name_rendered: workerTurnInputs.receipt.agentNameRendered,
            agent_soul_rendered: workerTurnInputs.receipt.agentSoulRendered,
            runtime_prompt_chars: workerTurnInputs.receipt.runtimePromptChars,
            runtime_prompt_section_ids: workerTurnInputs.receipt.runtimePromptSectionIds,
            rendered_runtime_prompt_section_ids:
              workerTurnInputs.receipt.renderedRuntimePromptSectionIds,
            omitted_runtime_prompt_section_ids:
              workerTurnInputs.receipt.omittedRuntimePromptSectionIds,
            developer_instruction_chars: workerTurnInputs.receipt.developerInstructionChars,
            prompt_chars: workerTurnInputs.receipt.promptChars,
          },
        });

        const workerIngestTarget = buildPolynetCodexWorkerIngestTarget();
        if (!workerIngestTarget) {
          await failWorkerTurn({
            status: 503,
            code: "polynet_codex_worker_ingest_unconfigured",
            message: "PolyNet Codex worker ingest is not configured.",
          });
          return;
        }
        const workerPlatformTools = codexHarnessPolicy.polynetPlatformTools;
        const workerRuntimeToolBridgeRequired = true;
        const workerToolTarget =
          workerPlatformTools.length > 0 || workerRuntimeToolBridgeRequired
            ? buildPolynetCodexWorkerToolTarget()
            : null;
        if (workerRuntimeToolBridgeRequired && !workerToolTarget) {
          await failWorkerTurn({
            status: 503,
            code: "polynet_codex_worker_tool_bridge_unconfigured",
            message: "PolyNet Codex worker tool bridge is not configured.",
          });
          return;
        }
        await streamAppendRunEvent({
          eventType: "polynet_codex_worker_tools_projected",
          eventKey: `${runId}:polynet_codex_worker_tools_projected:1`,
          payload: {
            run_id: runId,
            tool_bridge_configured: Boolean(workerToolTarget),
            runtime_tool_names: codexHarnessPolicy.runtimeAdapterToolNames,
            platform_tool_count: workerPlatformTools.length,
            platform_tool_names: workerPlatformTools.map((tool) => tool.name),
            platform_tool_policies: workerPlatformTools.map((tool) => ({
              tool_name: tool.name,
              billing_policy: tool.billing_policy,
              risk_level: tool.risk_level,
              required_community_resource_lane:
                tool.required_community_resource_lane,
              required_community_authority: tool.required_community_authority,
            })),
          },
        });

        const mintedWorkerRunTokens = await mintPolynetCodexWorkerRunTokenSet({
          ownerId: String(actor.dbUserId),
          threadId: String(ownedThread._id),
          runId,
          includeTool: Boolean(workerToolTarget),
        });
        if (isPolynetCodexWorkerRunTokenFailure(mintedWorkerRunTokens)) {
          await failWorkerTurn({
            status: mintedWorkerRunTokens.status,
            code: mintedWorkerRunTokens.code,
            message: mintedWorkerRunTokens.message,
          });
          return;
        }
        const workerRunTokens = mintedWorkerRunTokens.tokens;

        let codexRuntimeWorkspaceComputeReservation:
          PolynetCodexRuntimeWorkspaceComputeReservation | null = null;
        const codexRuntimeWorkspaceComputeReservationResult =
          await reservePolynetCodexRuntimeWorkspaceCompute({
            ctx,
            userId: actor.dbUserId,
            communityId: runtimeCommunityId ? (runtimeCommunityId as any) : undefined,
            projectId: runtimeProjectId ? (runtimeProjectId as any) : undefined,
            runId,
          });
        if (!codexRuntimeWorkspaceComputeReservationResult.ok) {
          await failWorkerTurn({
            status: codexRuntimeWorkspaceComputeReservationResult.status,
            code: codexRuntimeWorkspaceComputeReservationResult.code,
            message: codexRuntimeWorkspaceComputeReservationResult.message,
            data: codexRuntimeWorkspaceComputeReservationResult.details,
          });
          return;
        }
        codexRuntimeWorkspaceComputeReservation =
          codexRuntimeWorkspaceComputeReservationResult.reservation;
        await streamAppendRunEvent({
          eventType: "polynet_codex_runtime_workspace_compute_reserved",
          eventKey: `${runId}:polynet_codex_runtime_workspace_compute_reserved:1`,
          payload: {
            run_id: runId,
            credit_key: codexRuntimeWorkspaceComputeReservation.creditKey,
            reserved_credits:
              codexRuntimeWorkspaceComputeReservation.reservedCredits,
            reserved_at: codexRuntimeWorkspaceComputeReservation.reservedAt,
            expires_at: codexRuntimeWorkspaceComputeReservation.expiresAt,
            reserve_duration_seconds:
              codexRuntimeWorkspaceComputeReservation.reserveDurationSeconds,
            provider: "daytona",
            harness: "codex",
            billing_product: "workspace_compute",
          },
        });

        let workerMachineId: string | null = null;
        let workerResolvedTarget: PolynetCodexWorkerResolvedTarget | null = null;
        try {
          await streamAppendRunEvent({
            eventType: "daytona_codex_runtime_target_resolve_started",
            eventKey: `${runId}:daytona_codex_runtime_target_resolve_started:1`,
            payload: {
              run_id: runId,
              provider: "daytona",
              transport: "daytona_direct",
            },
          });
          const resolved = (await ctx.runAction(
            (internal as any).daytonaCodexRuntimeTargetActions
              .ensureDaytonaCodexRuntimeTargetInternal as any,
            {
              ownerId: actor.dbUserId,
              threadId: ownedThread._id,
              runId,
              ...(runtimeProjectId ? { projectId: runtimeProjectId } : {}),
            },
          )) as {
            targetId?: unknown;
            sandboxId?: unknown;
            workerUrl?: unknown;
            authToken?: unknown;
            signedPreviewExpiresAt?: unknown;
            lifecycleMode?: unknown;
            providerEphemeral?: unknown;
            workerPort?: unknown;
            timing?: unknown;
          };
          workerResolvedTarget = {
            provider: "daytona",
            targetId: String(resolved.targetId ?? ""),
            sandboxId: String(resolved.sandboxId ?? "") || null,
            workerUrl: String(resolved.workerUrl ?? ""),
            authToken: String(resolved.authToken ?? ""),
            signedPreviewExpiresAt:
              typeof resolved.signedPreviewExpiresAt === "number"
                ? resolved.signedPreviewExpiresAt
                : null,
          };
          workerMachineId = workerResolvedTarget.sandboxId;
          await streamAppendRunEvent({
            eventType: "daytona_codex_runtime_target_ready",
            eventKey: `${runId}:daytona_codex_runtime_target_ready:1`,
            payload: {
              run_id: runId,
              provider: "daytona",
              transport: "daytona_direct",
              target_id: workerResolvedTarget.targetId,
              sandbox_id: workerResolvedTarget.sandboxId,
              lifecycle_mode: String(resolved.lifecycleMode ?? "").trim() || null,
              provider_ephemeral:
                typeof resolved.providerEphemeral === "boolean"
                  ? resolved.providerEphemeral
                  : null,
              worker_port: readPositiveNumber(resolved.workerPort),
              signed_preview_expires_at:
                workerResolvedTarget.signedPreviewExpiresAt ?? null,
              timing: resolved.timing ?? null,
            },
          });
        } catch (error) {
          const targetFailureMessage =
            error instanceof Error
              ? error.message
              : "Daytona Codex runtime target failed.";
          await refundPolynetCodexRuntimeWorkspaceComputeBestEffort({
            ctx,
            reservation: codexRuntimeWorkspaceComputeReservation,
            failureReason: "daytona_codex_runtime_target_failed",
          });
          await failWorkerTurn({
            status: 503,
            code: "daytona_codex_runtime_target_failed",
            message: targetFailureMessage,
            data: { provider: "daytona" },
          });
          return;
        }

        let workerCancelFired = false;
        let workerSteeredCount = 0;
        let workerWatcherBusy = false;
        const workerCancelWatcher = setInterval(() => {
          void (async () => {
            if (workerCancelFired || workerWatcherBusy) return;
            workerWatcherBusy = true;
            try {
              const row = (await ctx.runQuery(
                (internal as any).threads.getRuntimeRunByOwnerRunIdInternal as any,
                { ownerId: actor.dbUserId, runId },
              )) as {
                status?: unknown;
                pendingUserSteering?: Array<{ text?: unknown }>;
              } | null;
              if (!row) return;
              if (String(row.status ?? "") === "cancelled") {
                workerCancelFired = true;
                clearInterval(workerCancelWatcher);
                await cancelPolynetCodexWorkerTurn({
                  runId,
                  machineId: workerMachineId,
                  target: workerResolvedTarget,
                });
                return;
              }
              const steering = Array.isArray(row.pendingUserSteering)
                ? row.pendingUserSteering
                : [];
              while (workerSteeredCount < steering.length) {
                const entry = steering[workerSteeredCount];
                const text = String(entry?.text ?? "").trim();
                if (!text) {
                  workerSteeredCount += 1;
                  continue;
                }
                const delivery = await steerPolynetCodexWorkerTurn({
                  runId,
                  machineId: workerMachineId,
                  text,
                  target: workerResolvedTarget,
                });
                if (delivery.ok || delivery.status === 409) {
                  workerSteeredCount += 1;
                  continue;
                }
                break;
              }
            } catch {
              // Best effort; the worker turn timeout is the backstop.
            } finally {
              workerWatcherBusy = false;
            }
          })();
        }, 3_000);

        const workerActivePreviewPorts = new Set<number>();
        let workerTurnStarted = false;
        let workerTurnStartedAtMs = 0;
        const workerStreamRequestedAtMs = Date.now();
        let workerResult;
        try {
          workerResult = await streamPolynetCodexWorkerTurn({
            runId,
            prompt: workerTurnInputs.prompt,
            developerInstructions: workerTurnInputs.developerInstructions,
            model: requestedModelId,
            sandboxName: null,
            destroyAfterRun: true,
            chatgptAuth: {
              accessToken: workerChatgptAuth.accessToken,
              accountId: workerChatgptAccountId,
              planType: null,
            },
            ingest: {
              ...workerIngestTarget,
              run_token: workerRunTokens.ingest,
              tool_run_token: workerRunTokens.tool,
              tool_url: workerToolTarget,
              context: {
                owner_id: String(actor.dbUserId),
                auth_subject: actor.authSubject ?? null,
                thread_id: String(ownedThread._id),
                run_id: runId,
                assistant_message_key: assistantMessageKeyForRun,
                model_id: requestedModelId,
                lane,
                inference_source: streamedInferenceSource,
                daytona_runtime_target: {
                  target_id: workerResolvedTarget.targetId,
                  sandbox_id: workerResolvedTarget.sandboxId,
                  signed_preview_expires_at:
                    workerResolvedTarget.signedPreviewExpiresAt,
                },
                workspace_compute_billing:
                  buildPolynetCodexRuntimeWorkspaceComputeBillingContext(
                    codexRuntimeWorkspaceComputeReservation,
                  ),
              },
            },
            platformTools: workerPlatformTools,
            target: workerResolvedTarget,
            onEvent: async (event) => {
              if (event.event === "start") {
                workerTurnStarted = true;
                if (!workerTurnStartedAtMs) workerTurnStartedAtMs = Date.now();
                const machineId = String(event.data.machine_id ?? "").trim();
                if (machineId) workerMachineId = machineId;
                return;
              }
              if (event.event === "delta") {
                emitWorkerDelta(event.data);
                return;
              }
              if (event.event === "runtime_event") {
                workerTurnStarted = true;
                if (!workerTurnStartedAtMs) workerTurnStartedAtMs = Date.now();
                const workerEventType = String(event.data.event_type ?? "").trim();
                if (!workerEventType) return;
                const workerSeqRaw = Number(event.data.seq);
                const workerSeq = Number.isFinite(workerSeqRaw)
                  ? Math.max(0, Math.floor(workerSeqRaw))
                  : 0;
                const workerPayload =
                  event.data.payload &&
                  typeof event.data.payload === "object" &&
                  !Array.isArray(event.data.payload)
                    ? (event.data.payload as Record<string, unknown>)
                    : {};
                if (workerEventType === "workspace_preview_ready") {
                  const previewPort = Number(workerPayload.port);
                  if (Number.isFinite(previewPort) && previewPort > 0) {
                    workerActivePreviewPorts.add(Math.floor(previewPort));
                  }
                }
                await streamAppendRunEvent({
                  eventType: workerEventType,
                  eventKey: `${runId}:polynet_codex_worker:${workerSeq}:${workerEventType}`,
                  payload: {
                    ...workerPayload,
                    run_id: runId,
                    engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
                    worker_event_id: event.data.id ?? null,
                    worker_event_seq: workerSeq,
                    worker_event_type: workerEventType,
                    worker_event_created_at: event.data.created_at ?? null,
                  },
                });
                return;
              }
              if (event.event === "run_model_finished" || event.event === "run_finalized") {
                writer.send({
                  event: event.event,
                  data: {
                    ...event.data,
                    run_id: runId,
                    engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
                    model_id: requestedModelId,
                  },
                });
              }
            },
          });
        } finally {
          clearInterval(workerCancelWatcher);
        }

        if (
          !workerResult.ok &&
          (workerResult.code === "polynet_codex_worker_stream_failed" ||
            workerResult.code === "polynet_codex_worker_unreachable")
        ) {
          try {
            await cancelPolynetCodexWorkerTurn({
              runId,
              machineId: workerMachineId,
              target: workerResolvedTarget,
            });
          } catch {
            // Best effort; the worker turn timeout is the backstop.
          }
        }
        streamedContent = workerResult.assistantText || streamedContent;
        const workerTerminalReason = workerResult.ok
          ? "completed"
          : workerCancelFired || workerResult.code === USER_CANCELLED_RUNTIME_CODE
            ? "cancelled"
            : workerResult.code || "polynet_codex_worker_turn_failed";
        const workerFallbackDurationMs =
          workerTurnStarted && workerTurnStartedAtMs > 0
            ? Math.max(1, Date.now() - workerTurnStartedAtMs)
            : !workerResult.ok &&
                workerResult.code === "polynet_codex_worker_stream_failed"
              ? Date.now() - workerStreamRequestedAtMs
              : null;
        const workspaceComputeSettlement =
          await settlePolynetCodexRuntimeWorkspaceComputeBestEffort({
            ctx,
            reservation: codexRuntimeWorkspaceComputeReservation,
            timing: workerResult.timing,
            fallbackDurationMs: workerFallbackDurationMs,
            terminalReason: workerTerminalReason,
            targetId: workerResolvedTarget?.targetId ?? null,
            sandboxId: workerResolvedTarget?.sandboxId ?? null,
            workerMachineId,
          });
        if (workspaceComputeSettlement) {
          await streamAppendRunEvent({
            eventType: workspaceComputeSettlement.ok
              ? "polynet_codex_runtime_workspace_compute_settled"
              : "polynet_codex_runtime_workspace_compute_settlement_failed",
            eventKey: `${runId}:polynet_codex_runtime_workspace_compute_settlement:1`,
            payload: {
              run_id: runId,
              credit_key: codexRuntimeWorkspaceComputeReservation.creditKey,
              outcome: workspaceComputeSettlement.outcome,
              duration_seconds: workspaceComputeSettlement.durationSeconds,
              credits_settled: workspaceComputeSettlement.creditsSettled,
              raw_vendor_cost_usd: workspaceComputeSettlement.rawVendorCostUsd,
              provider: "daytona",
              harness: "codex",
              billing_product: "workspace_compute",
              terminal_reason: workerTerminalReason,
              ...(workspaceComputeSettlement.ok
                ? {}
                : { message: workspaceComputeSettlement.message }),
            },
          });
        }

        if (workerResolvedTarget) {
          const teardownReason = workerResult.ok ? "turn_finished" : "turn_failed";
          try {
            await ctx.runMutation(
              (internal as any).daytonaCodexRuntimeTargets
                .releaseDaytonaCodexRuntimeTargetInternal as any,
              {
                ownerId: actor.dbUserId,
                runId,
                reason: teardownReason,
                activePreviewPorts: Array.from(workerActivePreviewPorts),
              },
            );
          } catch {
            // Daytona auto-stop/delete is the runtime cleanup backstop.
          }
          try {
            await streamAppendRunEvent({
              eventType: "daytona_codex_runtime_provider_teardown_started",
              eventKey: `${runId}:daytona_codex_runtime_provider_teardown_started:1`,
              payload: {
                run_id: runId,
                provider: "daytona",
                transport: "daytona_direct",
                target_id: workerResolvedTarget.targetId,
                sandbox_id: workerResolvedTarget.sandboxId,
                reason: teardownReason,
                cleanup_mode: "scheduled",
              },
            });
            await ctx.scheduler.runAfter(
              0,
              (internal as any).daytonaCodexRuntimeTargetActions
                .teardownAndRecordDaytonaCodexRuntimeTargetInternal as any,
              {
                ownerId: actor.dbUserId,
                runId,
                reason: teardownReason,
              },
            );
          } catch {
            // Best effort; provider retention policy is the cleanup backstop.
          }
        }

        if (!workerResult.ok) {
          const workerCancelled =
            workerCancelFired || workerResult.code === USER_CANCELLED_RUNTIME_CODE;
          if (workerCancelled) {
            await persistPartialAssistantMessageBestEffort({
              content: streamedContent,
              status: "cancelled",
              reason: USER_CANCELLED_RUNTIME_CODE,
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: "Run cancelled by user.",
              engineIdOverride: POLYNET_CODEX_WORKER_ENGINE_ID,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishCancelledRun();
            return;
          }
          await failWorkerTurn({
            status: workerResult.status,
            code: workerResult.code,
            message: workerResult.message,
          });
          return;
        }

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
              engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
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
                engineIdOverride: POLYNET_CODEX_WORKER_ENGINE_ID,
                inferenceSourceOverride: streamedInferenceSource,
                inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
              });
              await finishCancelledRun();
              return;
            }
            const message = error instanceof Error ? error.message : String(error);
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
              engineIdOverride: POLYNET_CODEX_WORKER_ENGINE_ID,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishCancelledRun();
            return;
          }
          throw error;
        }
        await finishRunBestEffortForRun({ status: "ok" });
        writer.send({
          event: "done",
          data: {
            run_id: runId,
            lane,
            engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
            model_id: requestedModelId,
            inference_source: streamedInferenceSource,
            inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
            full_content: streamedContent,
            prompt_tokens: null,
            completion_tokens: null,
            user_message_id: userMessageId,
            user_message_key: userMessageKey,
            user_message_seq: userMessageSeq,
            assistant_message_id: assistantMessageId,
            assistant_message_key: assistantMessageKey,
            assistant_message_seq: assistantMessageSeq,
          },
        });
      });
    } else if (runtimeExecutionMode === "agentic") {
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
              runtime_engine: runtimeEngine,
              engine_id: "runtime_convex",
              model_id: requestedModelId,
              inference_source: streamedInferenceSource,
              inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
            },
          });
          runtimeTurnStage = "agent_loop";
          let loopResult;
          try {
            loopResult = await executeChatToolsAgentLoop({
              ctx,
              req,
              userId: actor.dbUserId,
              threadId: String(ownedThread._id),
              authSubject: actor.authSubject,
              projectId: runtimeProjectId,
              requestedModelId,
              inferenceSource,
              modelRef,
              messages: conversationMessages,
              maxTokens,
              runId,
              communityId: runtimeCommunityId,
              communityName: runtimeCommunityName,
              communitySlug: runtimeCommunitySlug,
              communityOneLiner: runtimeCommunityOneLiner,
              communityAbout: runtimeCommunityAbout,
              communitySystemPrompt: runtimeCommunitySystemPrompt,
              communityContextVersion: runtimeCommunityId
                ? runtimeCommunityContextVersion
                : null,
              agentName: runtimeAgentProfile.agentName,
              agentSoul: runtimeAgentProfile.agentSoul,
              threadWorkingState: ownedThread.workingState ?? null,
              allowedToolNames,
              apiKeyOverride: providerApiKeyOverride,
              appendRunEvent: streamAppendRunEvent,
              refreshRuntimeContextSnapshot: async (
                phase: "started" | "active" = "active",
                runtimeTurnEnvelope: RuntimeTurnEnvelopeV1 | null = null,
              ): Promise<void> => {
                await persistContextSnapshotBestEffort(phase, runtimeTurnEnvelope);
              },
              touchRunHeartbeat: touchRunHeartbeatBestEffort,
            });
            await appendContextIntegrityCheckBestEffortForRun();
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
            const message = error instanceof Error ? error.message : String(error);
            await persistPartialAssistantMessageBestEffort({
              content: streamedContent,
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
                content: streamedContent,
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
                partialContent: streamedContent,
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
                  runtime_engine: runtimeEngine,
                  engine_id: "runtime_convex",
                  model_id: requestedModelId,
                  inference_source: streamedInferenceSource,
                  inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
                  full_content: streamedContent || finalContent,
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
                tool_kind: loopResult.toolKind ?? null,
                required_credits: loopResult.requiredCredits ?? null,
                paid_usage_billing_mode: loopResult.paidUsageBillingMode ?? null,
              },
            });
            return;
          }
          runtimeTurnStage = "assistant_emit";
          streamedPromptTokens = loopResult.promptTokens;
          streamedCompletionTokens = loopResult.completionTokens;
          emitBufferedAssistantText({
            content: loopResult.assistantText,
            emitDelta,
          });

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
              runtime_engine: runtimeEngine,
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
      try {
        loopResult = await executeChatToolsAgentLoop({
          ctx,
          req,
          userId: actor.dbUserId,
          threadId: String(ownedThread._id),
          authSubject: actor.authSubject,
          projectId: runtimeProjectId,
          requestedModelId,
          inferenceSource,
          modelRef,
          messages: conversationMessages,
          maxTokens,
          runId,
          communityId: runtimeCommunityId,
          communityName: runtimeCommunityName,
          communitySlug: runtimeCommunitySlug,
          communityOneLiner: runtimeCommunityOneLiner,
          communityAbout: runtimeCommunityAbout,
          communitySystemPrompt: runtimeCommunitySystemPrompt,
          communityContextVersion: runtimeCommunityId
            ? runtimeCommunityContextVersion
            : null,
          agentName: runtimeAgentProfile.agentName,
          agentSoul: runtimeAgentProfile.agentSoul,
          threadWorkingState: ownedThread.workingState ?? null,
          allowedToolNames,
          apiKeyOverride: providerApiKeyOverride,
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
        });
        await appendContextIntegrityCheckBestEffortForRun();
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
          tool_kind: loopResult.toolKind ?? null,
          required_credits: loopResult.requiredCredits ?? null,
          paid_usage_billing_mode: loopResult.paidUsageBillingMode ?? null,
          run_id: runId,
        });
      }
      content = loopResult.assistantText;
      promptTokens = loopResult.promptTokens;
      completionTokens = loopResult.completionTokens;
    } else {
      const now = new Date();
      const runtimeTimeZone = "UTC";
      const runtimeProjectContext = await loadRuntimeProjectContext({
        ctx,
        projectId: runtimeProjectId,
        authSubject: actor.authSubject,
      });
      const authenticatedScopedSystemPrompt =
        composePlatformChatRuntimeSystemPrompt({
          communityId: runtimeCommunityId,
          communityName: runtimeCommunityName,
          communitySlug: runtimeCommunitySlug,
          communityOneLiner: runtimeCommunityOneLiner,
          communityAbout: runtimeCommunityAbout,
          communitySystemPrompt: runtimeCommunitySystemPrompt,
          agentName: runtimeAgentProfile.agentName,
          agentSoul: runtimeAgentProfile.agentSoul,
          projectContext: runtimeProjectContext,
          currentDateTimeIso: now.toISOString(),
          currentDateLabel: new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: runtimeTimeZone,
          }).format(now),
          currentTimeZone: runtimeTimeZone,
        });
      const chatMessages = [
        { role: "system" as const, content: authenticatedScopedSystemPrompt },
        ...conversationMessages,
      ];
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

          writer.send({
            event: "start",
            data: {
              run_id: runId,
              lane,
              runtime_engine: runtimeEngine,
              engine_id: "runtime_convex",
              model_id: requestedModelId,
              inference_source: streamedInferenceSource,
              inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
            },
          });
          const streamAppendRunEvent = async (event: {
            eventType: string;
            eventKey?: string;
            payload: Record<string, unknown>;
          }): Promise<void> => {
            const created = await appendRunEvent(event);
            const mapped = mapPersistedRuntimeEventRow(created);
            if (!mapped) return;
            writer.send({
              event: "runtime_event",
              data: mapped,
            });
          };
          const reasoningSummaryEmitter = createRuntimeReasoningSummaryEmitter({
            runId,
            summaryStreamId: `${runId}:assistant_completion:0`,
            appendRunEvent: streamAppendRunEvent,
          });

          let completion:
            | Awaited<ReturnType<typeof runChatgptStreamingCompletion>>
            | Awaited<ReturnType<typeof runOpenAiCompletion>>
            | Awaited<ReturnType<typeof runOpenRouterStreamingCompletion>>;
          try {
            if (inferenceSource === "chatgpt") {
              runtimeTurnStage = "chatgpt_completion";
              completion = await runAbortableWithRuntimeCancellation({
                ctx,
                ownerId: actor.dbUserId,
                runId,
                operation: async (signal) =>
                  await runChatgptStreamingCompletion({
                    ctx,
                    userId: actor.dbUserId,
                    modelId: requestedModelId,
                    messages: chatMessages,
                    maxTokens,
                    onDelta: emitDelta,
                    requestMetadata: chatgptCodexRequestMetadata,
                    onReasoningSummaryPartAdded: ({ summaryIndex }) =>
                      reasoningSummaryEmitter.onPartAdded(summaryIndex),
                    onReasoningSummaryTextDelta: ({ delta, summaryIndex }) =>
                      reasoningSummaryEmitter.onTextDelta(delta, summaryIndex),
                    signal,
                  }),
              });
            } else if (inferenceSource === "user_key" && openAiModelIdFromRef(modelRef)) {
              runtimeTurnStage = "openai_completion";
              completion = await runAbortableWithRuntimeCancellation({
                ctx,
                ownerId: actor.dbUserId,
                runId,
                operation: async (signal) =>
                  await runOpenAiCompletion({
                    req,
                    modelId: openAiModelIdFromRef(modelRef) || requestedModelId,
                    messages: chatMessages,
                    maxTokens,
                    apiKeyOverride: providerApiKeyOverride,
                    signal,
                  }),
              });
              if (!isRuntimeCompletionFailure(completion) && completion.content) {
                emitDelta(completion.content);
              }
            } else {
              runtimeTurnStage = "openrouter_completion";
              completion = await runAbortableWithRuntimeCancellation({
                ctx,
                ownerId: actor.dbUserId,
                runId,
                operation: async (signal) =>
                  await runOpenRouterStreamingCompletion({
                    req,
                    modelRef,
                    messages: chatMessages,
                    maxTokens,
                    apiKeyOverride: providerApiKeyOverride,
                    onDelta: emitDelta,
                    signal,
                  }),
              });
            }
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
            const message = error instanceof Error ? error.message : String(error);
            await persistPartialAssistantMessageBestEffort({
              content: streamedContent,
              status: "error",
              reason: "runtime_completion_unhandled",
              errorCode: "runtime_completion_unhandled",
              errorMessage: message || "Runtime completion failed unexpectedly.",
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishRunBestEffortForRun({
              status: "error",
              reason: "runtime_completion_unhandled",
              errorCode: "runtime_completion_unhandled",
              errorMessage: message || "Runtime completion failed unexpectedly.",
            });
            writer.send({
              event: "error",
              data: {
                error: message || "Runtime completion failed unexpectedly.",
              },
            });
            return;
          }

          if (isRuntimeCompletionFailure(completion)) {
            await persistPartialAssistantMessageBestEffort({
              content: streamedContent,
              status: "error",
              reason: completion.code,
              errorCode: completion.code,
              errorMessage: completion.message,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishRunBestEffortForRun({
              status: "error",
              reason: completion.code,
              errorCode: completion.code,
              errorMessage: completion.message,
            });
            writer.send({
              event: "error",
              data: {
                error: completion.message,
              },
            });
            return;
          }

          streamedContent = completion.content;
          streamedPromptTokens = completion.promptTokens;
          streamedCompletionTokens = completion.completionTokens;

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
              runtime_engine: runtimeEngine,
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
      let completion:
        | Awaited<ReturnType<typeof runChatgptCompletion>>
        | Awaited<ReturnType<typeof runOpenAiCompletion>>
        | Awaited<ReturnType<typeof runOpenRouterCompletion>>;
      try {
        if (inferenceSource === "chatgpt") {
          runtimeTurnStage = "chatgpt_completion";
          completion = await runAbortableWithRuntimeCancellation({
            ctx,
            ownerId: actor.dbUserId,
            runId,
            operation: async (signal) =>
              await runChatgptCompletion({
                ctx,
                userId: actor.dbUserId,
                modelId: requestedModelId,
                messages: chatMessages,
                maxTokens,
                requestMetadata: chatgptCodexRequestMetadata,
                signal,
              }),
          });
        } else if (inferenceSource === "user_key" && openAiModelIdFromRef(modelRef)) {
          runtimeTurnStage = "openai_completion";
          completion = await runAbortableWithRuntimeCancellation({
            ctx,
            ownerId: actor.dbUserId,
            runId,
            operation: async (signal) =>
              await runOpenAiCompletion({
                req,
                modelId: openAiModelIdFromRef(modelRef) || requestedModelId,
                messages: chatMessages,
                maxTokens,
                apiKeyOverride: providerApiKeyOverride,
                signal,
              }),
          });
        } else {
          runtimeTurnStage = "openrouter_completion";
          completion = await runAbortableWithRuntimeCancellation({
            ctx,
            ownerId: actor.dbUserId,
            runId,
            operation: async (signal) =>
              await runOpenRouterCompletion({
                req,
                modelRef,
                messages: chatMessages,
                maxTokens,
                apiKeyOverride: providerApiKeyOverride,
                signal,
              }),
          });
        }
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
        await persistPartialAssistantMessageBestEffort({
          content,
          status: "error",
          reason: "runtime_completion_unhandled",
          errorCode: "runtime_completion_unhandled",
          errorMessage: message || "Runtime completion failed unexpectedly.",
        });
        await finishRunBestEffortForRun({
          status: "error",
          reason: "runtime_completion_unhandled",
          errorCode: "runtime_completion_unhandled",
          errorMessage: message || "Runtime completion failed unexpectedly.",
        });
        return runtimeJsonResponse(500, {
          ok: false,
          code: "runtime_completion_unhandled",
          error: "runtime_completion_unhandled",
          message: message || "Runtime completion failed unexpectedly.",
          run_id: runId,
        });
      }
      if (isRuntimeCompletionFailure(completion)) {
        await persistPartialAssistantMessageBestEffort({
          content,
          status: "error",
          reason: completion.code,
          errorCode: completion.code,
          errorMessage: completion.message,
        });
        await finishRunBestEffortForRun({
          status: "error",
          reason: completion.code,
          errorCode: completion.code,
          errorMessage: completion.message,
        });
        return runtimeJsonResponse(completion.status, {
          ok: false,
          code: completion.code,
          error: completion.code,
          message: completion.message,
        });
      }
      content = completion.content;
      promptTokens = completion.promptTokens;
      completionTokens = completion.completionTokens;
    }

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
