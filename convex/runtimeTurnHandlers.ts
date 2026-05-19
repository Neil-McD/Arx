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
import { executeChatToolsAgentLoop } from "./httpDaytona";
import {
  buildCodexHarnessExecutorEventPayload,
  buildCodexHarnessRouteEventPayload,
  isCodexHarnessExecutorEnabled,
  isCodexHarnessExperimentEnabled,
  resolveCodexHarnessExecutorDecision,
  resolveCodexHarnessProbeMode,
  resolveCodexHarnessRoute,
} from "../shared/codexHarnessRoute.ts";
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
  isRecoverableRuntimeKernelStopReason,
} from "../shared/runtimeKernelTypes";
import {
  buildRuntimeTurnContextSnapshot,
  renderRuntimeTurnContextForFailureFinalizer,
  type RuntimeTurnContextSnapshotV1,
  type RuntimeTurnContextPacket,
} from "../shared/runtimeTurnContextPacket";
import {
  buildRuntimeFailureFinalAnswer,
  hasConnectedAppFailureEvidence,
} from "../shared/runtimeFailureFinalizer";
import { loadRuntimeTurnContextPacketForRun } from "./runtimeTurnContext";
import {
  PublicTurnInput,
  RequireAuthenticatedActor,
  resolveAuthenticatedRuntimeTurn,
  RuntimeTurnInput,
} from "./runtimeTurnResolution";
import {
  ensureRuntimeRunStarted,
  lookupExistingRuntimeReplay,
  persistRuntimeAssistantMessage,
  persistRuntimeUserMessage,
} from "./runtimeTurnPersistence";
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

type RuntimeRunEventInput = {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
};

type CodexHarnessShadowEvidence = {
  route: Record<string, unknown> | null;
  executor: Record<string, unknown> | null;
  shadowCompleted: Record<string, unknown> | null;
  shadowReadiness: Record<string, unknown> | null;
};

function createCodexHarnessShadowEvidence(): CodexHarnessShadowEvidence {
  return {
    route: null,
    executor: null,
    shadowCompleted: null,
    shadowReadiness: null,
  };
}

function captureCodexHarnessShadowEvidence(
  evidence: CodexHarnessShadowEvidence,
  event: RuntimeRunEventInput,
): void {
  if (!event.eventType.startsWith("codex_harness_")) return;
  switch (event.eventType) {
    case "codex_harness_route_resolved":
      evidence.route = event.payload;
      return;
    case "codex_harness_executor_resolved":
      evidence.executor = event.payload;
      return;
    case "codex_harness_shadow_completed":
      evidence.shadowCompleted = event.payload;
      return;
    case "codex_harness_shadow_readiness":
      evidence.shadowReadiness = event.payload;
      return;
    default:
      return;
  }
}

function readRuntimePayloadString(payload: Record<string, unknown> | null, field: string): string | null {
  const raw = payload?.[field];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readRuntimePayloadBoolean(payload: Record<string, unknown> | null, field: string): boolean {
  return payload?.[field] === true;
}

function readRuntimePayloadNumber(payload: Record<string, unknown> | null, field: string): number | null {
  const parsed = Number(payload?.[field]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function appendCodexHarnessShadowComparisonBestEffort(params: {
  runId: string;
  visibleContent: string;
  evidence: CodexHarnessShadowEvidence;
  appendRunEvent: (event: RuntimeRunEventInput) => Promise<unknown>;
}): Promise<void> {
  const shadow = params.evidence.shadowCompleted;
  if (!shadow) return;
  const shadowOutputSha256 = readRuntimePayloadString(shadow, "output_sha256");
  if (!shadowOutputSha256) return;
  try {
    const visibleContent = String(params.visibleContent ?? "");
    const visibleAnswerSha256 = await sha256Hex(visibleContent);
    const visibleAnswerChars = visibleContent.length;
    const shadowOutputChars = readRuntimePayloadNumber(shadow, "output_chars");
    const shadowReady = readRuntimePayloadBoolean(params.evidence.shadowReadiness, "ready");
    const exactHashMatch = visibleAnswerSha256 === shadowOutputSha256;
    await params.appendRunEvent({
      eventType: "codex_harness_shadow_comparison",
      eventKey: `${params.runId}:codex_harness_shadow_comparison:1`,
      payload: {
        run_id: params.runId,
        status: "compared",
        comparison_policy: "hash_and_length_only",
        visible_answer_engine: "current_harness",
        candidate_engine: "codex_app_server",
        route_selected: readRuntimePayloadBoolean(params.evidence.route, "selected"),
        executor_selected: readRuntimePayloadBoolean(params.evidence.executor, "selected"),
        shadow_ready: shadowReady,
        shadow_completed: readRuntimePayloadBoolean(shadow, "completed"),
        thread_id_present: readRuntimePayloadBoolean(shadow, "thread_id_present"),
        turn_id_present: readRuntimePayloadBoolean(shadow, "turn_id_present"),
        visible_answer_chars: visibleAnswerChars,
        visible_answer_sha256: visibleAnswerSha256,
        shadow_output_chars: shadowOutputChars,
        shadow_output_sha256: shadowOutputSha256,
        exact_hash_match: exactHashMatch,
        length_delta:
          shadowOutputChars == null ? null : visibleAnswerChars - shadowOutputChars,
      },
    });
  } catch {
    // Best-effort comparison telemetry must never affect the visible answer path.
  }
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
    const codexPrimaryCanaryRequested = input.codex_primary_canary === true;
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
      engineId: "runtime_turn",
      executionMode: runtimeExecutionMode,
      sandboxMode: runtimeSandboxMode,
      contractName:
        runtimeExecutionMode === "agentic"
          ? "capability_composed_tools_v1"
          : "capability_composed_chat_v1",
      contractVersion: "v1",
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
      appendRunEvent: appendRunEventRaw,
      finishRunBestEffort: finishRunBestEffortRaw,
      touchRunHeartbeatBestEffort,
    } = buildRuntimeRunPersistenceHelpers({
      ctx,
      userId: actor.dbUserId,
      threadId: String(ownedThread._id),
      runId,
    });
    const codexHarnessShadowEvidence = createCodexHarnessShadowEvidence();
    const appendRunEvent = async (event: RuntimeRunEventInput): Promise<unknown> => {
      captureCodexHarnessShadowEvidence(codexHarnessShadowEvidence, event);
      return await appendRunEventRaw(event);
    };
    const persistContextSnapshotBestEffort = async (phase: "started" | "active" | "finished"): Promise<void> => {
      try {
        const nowMs = Date.now();
        const loadedContext = await loadRuntimeTurnContextPacketForRun({
          ctx,
          ownerId: actor.dbUserId,
          threadId: ownedThread._id,
          projectId: runtimeProjectId,
          runId,
          latestUserText,
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
            runId,
            latestUserText,
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
    let runtimeHarnessIdForAttribution: string | null =
      runtimeExecutionMode === "agentic" ? null : "polynet_native";
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
      runtimeHarnessIdOverride?: string | null;
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
          runId,
          latestUserText,
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
          inferenceSource:
            params.inferenceSourceOverride ?? resolvedInferenceSource,
          lane,
          inferenceLaneFallbacks:
            params.inferenceLaneFallbacksOverride ?? inferenceLaneFallbacks,
          runId,
          content: finalAnswer.content,
          runtimeHarnessId:
            params.runtimeHarnessIdOverride ??
            runtimeHarnessIdForAttribution ??
            "polynet_native",
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
        capability_families: resolvedRuntimeCapabilityFamilies,
        harness_profile: resolvedRuntimeHarnessProfile,
      },
    });
    await appendRunEvent({
      eventType: "tool_policy_resolved",
      eventKey: `${runId}:tool_policy_resolved:1`,
      payload: {
        run_id: runId,
        allowed_tool_names: allowedToolNames,
        capability_families: resolvedRuntimeCapabilityFamilies,
        harness_profile: resolvedRuntimeHarnessProfile,
      },
    });
    const codexHarnessRoute = resolveCodexHarnessRoute({
      experimentEnabled: isCodexHarnessExperimentEnabled(),
      runtimeExecutionMode,
      inferenceSource,
      projectId: runtimeProjectId,
      allowedToolNames,
    });
    if (codexHarnessRoute.experimentEnabled) {
      const codexHarnessProbeMode = resolveCodexHarnessProbeMode();
      const codexHarnessExecutorDecision = resolveCodexHarnessExecutorDecision({
        route: codexHarnessRoute,
        executorEnabled: isCodexHarnessExecutorEnabled(),
        runtimeExecutionMode,
        stream,
        probeMode: codexHarnessProbeMode,
      });
      await appendRunEvent({
        eventType: "codex_harness_route_resolved",
        eventKey: `${runId}:codex_harness_route_resolved:1`,
        payload: buildCodexHarnessRouteEventPayload({
          runId,
          route: codexHarnessRoute,
          probeMode: codexHarnessProbeMode,
        }),
      });
      await appendRunEvent({
        eventType: "codex_harness_executor_resolved",
        eventKey: `${runId}:codex_harness_executor_resolved:1`,
        payload: buildCodexHarnessExecutorEventPayload({
          runId,
          decision: codexHarnessExecutorDecision,
          probeMode: codexHarnessProbeMode,
        }),
      });
    }
    if (runtimeExecutionMode === "agentic") {
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
              stream,
              maxTokens,
              runId,
              communityId: runtimeCommunityId,
              communityName: runtimeCommunityName,
              communitySlug: runtimeCommunitySlug,
              communityOneLiner: runtimeCommunityOneLiner,
              communityAbout: runtimeCommunityAbout,
              communitySystemPrompt: runtimeCommunitySystemPrompt,
              agentName: runtimeAgentProfile.agentName,
              agentSoul: runtimeAgentProfile.agentSoul,
              threadWorkingState: ownedThread.workingState ?? null,
              allowedToolNames,
              codexPrimaryCanary: codexPrimaryCanaryRequested,
              apiKeyOverride: providerApiKeyOverride,
              appendRunEvent: streamAppendRunEvent,
              touchRunHeartbeat: touchRunHeartbeatBestEffort,
            });
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
                runtimeHarnessId: runtimeHarnessIdForAttribution ?? "polynet_native",
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
          stream,
          maxTokens,
          runId,
          communityId: runtimeCommunityId,
          communityName: runtimeCommunityName,
          communitySlug: runtimeCommunitySlug,
          communityOneLiner: runtimeCommunityOneLiner,
          communityAbout: runtimeCommunityAbout,
          communitySystemPrompt: runtimeCommunitySystemPrompt,
          agentName: runtimeAgentProfile.agentName,
          agentSoul: runtimeAgentProfile.agentSoul,
          threadWorkingState: ownedThread.workingState ?? null,
          allowedToolNames,
          codexPrimaryCanary: codexPrimaryCanaryRequested,
          apiKeyOverride: providerApiKeyOverride,
          appendRunEvent: async (event): Promise<void> => {
            await appendRunEvent(event);
            await refreshActiveContextSnapshotAfterEventBestEffort(event.eventType);
          },
          touchRunHeartbeat: touchRunHeartbeatBestEffort,
        });
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
      runtimeHarnessIdForAttribution =
        typeof loopResult.runtimeHarnessId === "string" && loopResult.runtimeHarnessId.trim()
          ? loopResult.runtimeHarnessId.trim()
          : "polynet_native";
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
            runtimeHarnessId: runtimeHarnessIdForAttribution,
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
          run_id: runId,
        });
      }
      content = loopResult.assistantText;
      promptTokens = loopResult.promptTokens;
      completionTokens = loopResult.completionTokens;
    } else {
      const now = new Date();
      const runtimeTimeZone = "UTC";
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
                runtimeHarnessId: runtimeHarnessIdForAttribution ?? "polynet_native",
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

    await appendCodexHarnessShadowComparisonBestEffort({
      runId,
      visibleContent: content,
      evidence: codexHarnessShadowEvidence,
      appendRunEvent,
    });

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
            runtimeHarnessId: runtimeHarnessIdForAttribution ?? "polynet_native",
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
      runtimeHarnessId: runtimeHarnessIdForAttribution ?? "polynet_native",
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
