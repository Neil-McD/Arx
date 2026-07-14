import {
  runChatgptCompletion,
  runChatgptStreamingCompletion,
} from "./httpChatgpt";
import { api, internal } from "./_generated/api";
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
  shouldRecordCommunityOnboardingAgentTurn,
} from "../shared/runtimeInvocationSurface";
import {
  isRecoverableRuntimeKernelStopReason,
} from "../shared/runtimeKernelTypes";
import {
  buildRuntimeTurnContextPacket,
  buildRuntimeTurnContextSnapshot,
  renderRuntimeTurnContextForFailureFinalizer,
  type RuntimeTurnContextSnapshotV1,
  type RuntimeTurnContextPacket,
} from "../shared/runtimeTurnContextPacket";
import {
  buildRuntimeTurnEnvelope,
  type RuntimeTurnEnvelopeV1,
} from "../shared/runtimeTurnEnvelope";
import type {
  CommunityLensAuthority,
} from "../shared/communityLensAuthority";
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
  ensureRuntimeRunStarted,
  lookupExistingRuntimeReplay,
  persistRuntimeAssistantMessage,
  persistRuntimeUserMessage,
} from "./runtimeTurnPersistence";
import {
  buildPolynetCodexWorkerTurnInputs,
  cancelPolynetCodexWorkerTurn,
  POLYNET_CODEX_WORKER_CONTRACT_NAME,
  POLYNET_CODEX_WORKER_CONTRACT_VERSION,
  POLYNET_CODEX_WORKER_ENGINE_ID,
  resolvePolynetRuntimeEngine,
  steerPolynetCodexWorkerTurn,
  streamPolynetCodexWorkerTurn,
  type PolynetCodexWorkerResolvedTarget,
} from "./polynetCodexWorkerBridge";
import { getFreshChatgptAuthForUser } from "./chatgptAuth";
import { buildPolynetCodexWorkerIngestTarget } from "./polynetCodexWorkerIngest";
import { buildPolynetCodexWorkerToolTarget } from "./polynetCodexWorkerTool";
import { mintPolynetCodexWorkerRunTokenSet } from "./polynetCodexWorkerRunToken";
import {
  buildCodexHarnessToolPolicyReceipt,
  buildPolynetHarnessToolPolicyReceipt,
  POLYNET_HARNESS_DAYTONA_PREVIEW_TOOL_NAMES,
  POLYNET_HARNESS_DAYTONA_WORKSPACE_TOOL_NAMES,
  POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES,
  resolveCodexHarnessToolPolicy,
  resolvePolynetHarnessToolPolicy,
} from "../shared/harnessToolPolicy";
import {
  buildMcpHarnessProjection,
  type CodexMcpHarnessBridgeTool,
  type McpHarnessProjection,
  type McpHarnessRuntimeMountedTool,
} from "../shared/mcpHarnessProjection";
import {
  normalizeRuntimeMountedUserPlatformAppTools,
  type RuntimeMountedUserPlatformAppTool,
} from "./runtimeHarnessShaping";
import {
  type RetrievalToolName,
} from "../shared/retrievalTools";
import { reservePaidToolCredits } from "./paidToolCreditReservation";
import {
  settleReservedCreditsBestEffort,
  settleReservedCreditsStrict,
} from "./workspaceCreditSettlement";
import {
  creditsToUsd,
  DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
  estimateDaytonaWorkspaceComputeVendorCostUsd,
  PAID_TOOL_PRICING_VERSION,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  priceDaytonaWorkspaceComputeCredits,
} from "../shared/workspaceCredits";
import {
  POLYNET_CODEX_WORKER_ACTIVE_RUN_WINDOW_MS,
} from "../shared/polynetCodexWorkerLimits";
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

type RuntimeSubstrateResolution = {
  provider: "daytona" | "project_workspace" | "none";
  status:
    | "required_for_codex"
    | "polynet_daytona_runtime"
    | "polynet_harness_isolated"
    | "legacy_project_workspace";
  targetId: string | null;
  runId: string | null;
  sandboxId: string | null;
  workspaceRoot: string | null;
  activePreviewPorts: number[];
  previewLeaseActive: boolean;
  polyNetWorkspaceToolsSuppressed: boolean;
  suppressedToolNames: RetrievalToolName[];
};

const POLYNET_DEFERRED_RUNTIME_TOOL_NAMES = new Set<RetrievalToolName>([
  ...POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES,
]);
const POLYNET_DAYTONA_RUNTIME_TOOL_NAME_SET = new Set<RetrievalToolName>([
  ...POLYNET_HARNESS_DAYTONA_WORKSPACE_TOOL_NAMES,
  ...POLYNET_HARNESS_DAYTONA_PREVIEW_TOOL_NAMES,
]);

function isolatePolynetHarnessToolNames(params: {
  allowedToolNames: readonly RetrievalToolName[];
}): { allowedToolNames: RetrievalToolName[]; suppressedToolNames: RetrievalToolName[] } {
  const allowedToolNames: RetrievalToolName[] = [];
  const suppressedToolNames: RetrievalToolName[] = [];
  for (const toolName of params.allowedToolNames) {
    if (POLYNET_DEFERRED_RUNTIME_TOOL_NAMES.has(toolName)) {
      suppressedToolNames.push(toolName);
    } else {
      allowedToolNames.push(toolName);
    }
  }
  return { allowedToolNames, suppressedToolNames };
}

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

type CodexMcpBridgeProjectionReceipt = {
  status: "ok" | "error";
  bridge_tool_count: number;
  bridge_tool_names: string[];
  runtime_tool_names: string[];
  app_count: number;
  live_app_count: number;
  bridge_app_count: number;
  live_bridge_app_names: string[];
  app_summaries: Array<{
    app_identity_key: string;
    app_name: string;
    catalog_app_id: string | null;
    live_for_current_user: boolean;
    source_label: string;
    effective_tool_count: number;
    bridge_tool_count: number;
    bridge_tool_names: string[];
    executable_bridge_tool_count: number;
    setup_needed: boolean;
    setup_reason: string | null;
  }>;
  setup_needed_app_count: number;
  executable: boolean;
  executable_bridge_tool_count: number;
  credential_boundary: "server_only";
  source_labels: string[];
  error_code?: "codex_mcp_bridge_projection_failed";
};

function mapRuntimeMountedUserPlatformAppToolToMcpHarnessTool(
  tool: RuntimeMountedUserPlatformAppTool,
): McpHarnessRuntimeMountedTool {
  return {
    scope: "user",
    mount_id: tool.user_platform_app_mount_id,
    runtime_tool_name: `me__${tool.namespaced_tool_name}`,
    developer_app_id: tool.developer_app_id,
    catalog_app_id: tool.catalog_app_id,
    app_name: tool.app_name,
    endpoint_url: tool.endpoint_url,
    auth_type: tool.auth_type,
    tool_name: tool.tool_name,
    namespaced_tool_name: tool.namespaced_tool_name,
    description: tool.description,
    input_schema: tool.input_schema,
    risk_level: tool.risk_level,
  };
}

function buildCodexMcpBridgeProjectionReceipt(
  projection: McpHarnessProjection,
): CodexMcpBridgeProjectionReceipt {
  const sourceLabels = new Set<string>();
  const setupHintsByAppIdentityKey = new Map(
    projection.setupPacketHints.map((hint) => [hint.app_identity_key, hint]),
  );
  const bridgeToolsByAppIdentityKey = new Map<
    string,
    { bridgeToolNames: string[]; executableBridgeToolCount: number }
  >();
  for (const tool of projection.codexBridgeTools) {
    const entry =
      bridgeToolsByAppIdentityKey.get(tool.app_identity_key) ??
      { bridgeToolNames: [], executableBridgeToolCount: 0 };
    entry.bridgeToolNames.push(tool.bridge_tool_name);
    if (tool.risk_level === "read") entry.executableBridgeToolCount += 1;
    bridgeToolsByAppIdentityKey.set(tool.app_identity_key, entry);
  }
  const appSummaries = projection.capabilities.map((capability) => {
    const bridgeTools =
      bridgeToolsByAppIdentityKey.get(capability.app_identity_key) ??
      { bridgeToolNames: [], executableBridgeToolCount: 0 };
    const setupHint = setupHintsByAppIdentityKey.get(
      capability.app_identity_key,
    );
    return {
      app_identity_key: capability.app_identity_key,
      app_name: capability.app_name,
      catalog_app_id: capability.catalog_app_id,
      live_for_current_user: capability.live_for_current_user,
      source_label: capability.source_label,
      effective_tool_count: capability.effective_tool_count,
      bridge_tool_count: capability.codex_bridge_tool_count,
      bridge_tool_names: [...bridgeTools.bridgeToolNames].sort(),
      executable_bridge_tool_count: bridgeTools.executableBridgeToolCount,
      setup_needed: Boolean(setupHint),
      setup_reason: setupHint?.setup_reason ?? null,
    };
  });
  for (const capability of projection.capabilities) {
    sourceLabels.add(capability.source_label);
  }
  return {
    status: "ok",
    bridge_tool_count: projection.codexBridgeTools.length,
    bridge_tool_names: projection.codexBridgeTools.map(
      (tool) => tool.bridge_tool_name,
    ),
    runtime_tool_names: projection.codexBridgeTools.map(
      (tool) => tool.runtime_tool_name,
    ),
    app_count: projection.capabilities.length,
    live_app_count: projection.capabilities.filter(
      (capability) => capability.live_for_current_user,
    ).length,
    bridge_app_count: appSummaries.filter(
      (summary) => summary.bridge_tool_count > 0,
    ).length,
    live_bridge_app_names: appSummaries
      .filter((summary) => summary.bridge_tool_count > 0)
      .map((summary) => summary.app_name)
      .sort(),
    app_summaries: appSummaries,
    setup_needed_app_count: projection.setupPacketHints.length,
    executable: projection.codexBridgeTools.some((tool) => tool.risk_level === "read"),
    executable_bridge_tool_count: projection.codexBridgeTools.filter(
      (tool) => tool.risk_level === "read",
    ).length,
    credential_boundary: "server_only",
    source_labels: [...sourceLabels].sort(),
  };
}

function buildFailedCodexMcpBridgeProjectionReceipt(): CodexMcpBridgeProjectionReceipt {
  return {
    status: "error",
    bridge_tool_count: 0,
    bridge_tool_names: [],
    runtime_tool_names: [],
    app_count: 0,
    live_app_count: 0,
    bridge_app_count: 0,
    live_bridge_app_names: [],
    app_summaries: [],
    setup_needed_app_count: 0,
    executable: false,
    executable_bridge_tool_count: 0,
    credential_boundary: "server_only",
    source_labels: [],
    error_code: "codex_mcp_bridge_projection_failed",
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

function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
      runtimeAccountPlan,
      requestedRuntimeEngine,
      providerApiKeyOverride,
      runtimeCommunityId,
      runtimeCommunityName,
      runtimeCommunitySlug,
      runtimeCommunityOneLiner,
      runtimeCommunityAbout,
      runtimeCommunitySystemPrompt,
      runtimeCommunityLensAuthority,
      runtimeProjectId,
      runtimeSandboxMode,
      allowedToolNames,
      resolvedRuntimeCapabilityFamilies,
      resolvedRuntimeHarnessProfile,
      runtimeExecutionMode: resolvedRuntimeExecutionMode,
      invocationSurface,
      memberAgentSurfaceContext,
    } = resolved.value;
    const runId =
      String(input.idempotency_key ?? "").trim() ||
      `convex_runtime:${crypto.randomUUID()}`;
    const recordCommunityOnboardingAgentDockTurnBestEffort = async (): Promise<void> => {
      // Preview uses the builder's real personal agent, but it must not mutate
      // an unrelated live onboarding session the builder may also own.
      if (input.suppress_onboarding_progress === true) return;
      if (!shouldRecordCommunityOnboardingAgentTurn({
        invocationSurface,
        surfaceKind: memberAgentSurfaceContext?.kind ?? null,
        hasCommunityId: Boolean(runtimeCommunityId),
      })) {
        return;
      }
      try {
        await ctx.runMutation(
          (internal as any).communityOnboarding.recordPersonalAgentDockTurnInternal as any,
          {
            userId: actor.dbUserId,
            communityId: runtimeCommunityId,
            occurredAt: Date.now(),
          },
        );
      } catch {
        // Onboarding progress must never make an otherwise successful personal
        // agent turn fail. A later successful dock turn retries idempotently.
      }
    };
    const runtimeExecutionMode: "agentic" | "chat" = resolvedRuntimeExecutionMode;
    const runtimeAgentProfile = await loadUserAgentProfileForRuntime(ctx, actor.dbUserId);
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
    const persistVisibleUserMessage = true;
    const persistVisibleAssistantMessage = true;
    const runVisibility = "user_visible";
    const runStartedAt = Date.now();
    const runtimeEngineResolution = resolvePolynetRuntimeEngine({
      requestedRuntimeEngine,
      runtimeExecutionMode,
      stream,
      inferenceSource,
      accountPlan: runtimeAccountPlan,
    });
    if (!runtimeEngineResolution.ok) {
      return runtimeJsonResponse(runtimeEngineResolution.status, {
        ok: false,
        code: runtimeEngineResolution.code,
        error: runtimeEngineResolution.code,
        message: runtimeEngineResolution.message,
        runtime_engine_requested: runtimeEngineResolution.requestedRuntimeEngine,
        runtime_engine_resolved: null,
        disabled_reason: runtimeEngineResolution.disabledReason,
      });
    }
    const usePolynetCodexWorkerBridge =
      runtimeEngineResolution.usePolynetCodexWorkerBridge;
    const runtimeEngineId = runtimeEngineResolution.engineId;
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
      accountPlan: runtimeAccountPlan,
      requestedRuntimeEngine: runtimeEngineResolution.requestedRuntimeEngine ?? undefined,
      resolvedRuntimeEngine: runtimeEngineResolution.resolvedRuntimeEngine,
      executionMode: runtimeExecutionMode,
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
      projectId: runtimeProjectId ?? undefined,
      communityId: runtimeCommunityId ? (runtimeCommunityId as any) : undefined,
      communityContextVersion: runtimeCommunityId ? runtimeCommunityContextVersion : undefined,
      modelId: requestedModelId,
      engineId: runtimeEngineId,
      runtimeEngineRequested: runtimeEngineResolution.requestedRuntimeEngine ?? undefined,
      runtimeEngineResolved: runtimeEngineResolution.resolvedRuntimeEngine,
      runtimeEngineSource: runtimeEngineResolution.runtimeEngineSource,
      executionMode: runtimeExecutionMode,
      sandboxMode: runtimeSandboxMode,
      contractName:
        usePolynetCodexWorkerBridge
          ? POLYNET_CODEX_WORKER_CONTRACT_NAME
          : runtimeExecutionMode === "agentic"
          ? "capability_composed_tools_v1"
          : "capability_composed_chat_v1",
      contractVersion: usePolynetCodexWorkerBridge
        ? POLYNET_CODEX_WORKER_CONTRACT_VERSION
        : "v1",
      harnessProfile: resolvedRuntimeHarnessProfile,
      harnessProfileSource: "runtime_capability_resolution_v1",
      capabilityFamilies: resolvedRuntimeCapabilityFamilies,
      accountPlan: runtimeAccountPlan,
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
    if (!runStart.ok) {
      return runStart.response;
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
    let polynetCodexRuntimeCreditKey: string | null = null;
    let polynetCodexRuntimeCreditsReserved = 0;
    let polynetCodexRuntimeWorkerStartedAtMs: number | null = null;
    let polynetCodexRuntimeWorkerMachineId: string | null = null;
    let polynetCodexRuntimeTimingTotalMs: number | null = null;
    let polynetCodexRuntimeCreditsSettled = false;
    let polynetDaytonaRuntimeCreditKey: string | null = null;
    let polynetDaytonaRuntimeCreditsReserved = 0;
    let polynetDaytonaRuntimeReserveStartedAtMs: number | null = null;
    let polynetDaytonaRuntimeCreditsSettled = false;
    const settlePolynetCodexRuntimeCreditsBestEffort = async (
      terminalReason: string,
    ): Promise<void> => {
      if (!polynetCodexRuntimeCreditKey || polynetCodexRuntimeCreditsSettled) return;
      polynetCodexRuntimeCreditsSettled = true;
      const timingDurationSeconds =
        polynetCodexRuntimeTimingTotalMs !== null
          ? polynetCodexRuntimeTimingTotalMs / 1000
          : null;
      const fallbackDurationSeconds =
        polynetCodexRuntimeWorkerStartedAtMs !== null
          ? Math.max(0, (Date.now() - polynetCodexRuntimeWorkerStartedAtMs) / 1000)
          : null;
      const durationSeconds = Math.max(
        0,
        timingDurationSeconds ?? fallbackDurationSeconds ?? 0,
      );
      if (!(durationSeconds > 0)) {
        await settleReservedCreditsBestEffort({
          ctx,
          creditKey: polynetCodexRuntimeCreditKey,
          status: "refunded",
          failureReason: terminalReason || "workspace_compute_not_started",
          metadata: {
            pricing_version: PAID_TOOL_PRICING_VERSION,
            billing_product: "workspace_compute",
            harness: "codex",
            provider: "daytona",
            pricing_model: "daytona_runtime_seconds_estimate",
            worker_started: false,
            terminal_reason: terminalReason,
          },
        });
        return;
      }

      const rawVendorCostUsd = estimateDaytonaWorkspaceComputeVendorCostUsd({
        durationSeconds,
      });
      const creditsSettled = priceDaytonaWorkspaceComputeCredits({ durationSeconds });
      try {
        await settleReservedCreditsStrict({
          ctx,
          creditKey: polynetCodexRuntimeCreditKey,
          status: "succeeded",
          creditsSettled,
          rawVendorCostUsd,
          metadata: {
            pricing_version: PAID_TOOL_PRICING_VERSION,
            billing_product: "workspace_compute",
            harness: "codex",
            target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
            provider: "daytona",
            pricing_model: "daytona_runtime_seconds_estimate",
            provider_billing_reconciliation: "pending",
            provider_billing_evidence: "estimated_from_runtime_duration",
            daytona_workspace_compute_usd_per_second:
              DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
            duration_seconds: durationSeconds,
            duration_source:
              polynetCodexRuntimeTimingTotalMs !== null
                ? "worker_timing_total_ms"
                : "convex_observed_start_elapsed",
            sandbox_id: polynetCodexRuntimeWorkerMachineId,
            worker_machine_id: polynetCodexRuntimeWorkerMachineId,
            reserved_credits: polynetCodexRuntimeCreditsReserved,
            terminal_reason: terminalReason,
          },
        });
      } catch (error) {
        logStructuredError("polynet_codex_runtime_credit_settlement_failed", {
          error,
          run_id: runId,
          credit_key: polynetCodexRuntimeCreditKey,
          duration_seconds: durationSeconds,
        });
      }
    };
    const settlePolynetDaytonaRuntimeCreditsBestEffort = async (
      terminalReason: string,
    ): Promise<void> => {
      if (!polynetDaytonaRuntimeCreditKey || polynetDaytonaRuntimeCreditsSettled) return;
      polynetDaytonaRuntimeCreditsSettled = true;

      let target: Record<string, unknown> | null = null;
      try {
        target = (await ctx.runQuery(
          (internal as any).daytonaCodexRuntimeTargets
            .getDaytonaCodexRuntimeTargetByRunIdInternal as any,
          {
            ownerId: actor.dbUserId,
            runId,
          },
        )) as Record<string, unknown> | null;
      } catch (error) {
        logStructuredError("polynet_daytona_runtime_target_lookup_failed", {
          error,
          run_id: runId,
          credit_key: polynetDaytonaRuntimeCreditKey,
        });
      }

      const sandboxId = String(target?.sandboxId ?? "").trim();
      const targetId = String(target?._id ?? "").trim();
      const startedAtMs = polynetDaytonaRuntimeReserveStartedAtMs ?? runStartedAt;
      const durationSeconds = Math.max(0, (Date.now() - startedAtMs) / 1000);
      if (!target || !sandboxId || !(durationSeconds > 0)) {
        await settleReservedCreditsBestEffort({
          ctx,
          creditKey: polynetDaytonaRuntimeCreditKey,
          status: "refunded",
          failureReason: target
            ? "daytona_runtime_not_started"
            : "daytona_runtime_target_not_created",
          metadata: {
            pricing_version: PAID_TOOL_PRICING_VERSION,
            billing_product: "workspace_compute",
            harness: "polynet",
            provider: "daytona",
            pricing_model: "daytona_runtime_seconds_estimate",
            runtime_engine: "polynet",
            worker_started: false,
            terminal_reason: terminalReason,
            target_id: targetId || null,
            sandbox_id: sandboxId || null,
          },
        });
        return;
      }

      const rawVendorCostUsd = estimateDaytonaWorkspaceComputeVendorCostUsd({
        durationSeconds,
      });
      const creditsSettled = priceDaytonaWorkspaceComputeCredits({ durationSeconds });
      try {
        await settleReservedCreditsStrict({
          ctx,
          creditKey: polynetDaytonaRuntimeCreditKey,
          status: "succeeded",
          creditsSettled,
          rawVendorCostUsd,
          metadata: {
            pricing_version: PAID_TOOL_PRICING_VERSION,
            billing_product: "workspace_compute",
            harness: "polynet",
            target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
            provider: "daytona",
            runtime_engine: "polynet",
            pricing_model: "daytona_runtime_seconds_estimate",
            provider_billing_reconciliation: "pending",
            provider_billing_evidence: "estimated_from_runtime_duration",
            daytona_workspace_compute_usd_per_second:
              DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
            duration_seconds: durationSeconds,
            duration_source: "convex_observed_run_elapsed",
            target_id: targetId || null,
            sandbox_id: sandboxId,
            reserved_credits: polynetDaytonaRuntimeCreditsReserved,
            terminal_reason: terminalReason,
          },
        });
      } catch (error) {
        logStructuredError("polynet_daytona_runtime_credit_settlement_failed", {
          error,
          run_id: runId,
          credit_key: polynetDaytonaRuntimeCreditKey,
          duration_seconds: durationSeconds,
        });
        return;
      }
      try {
        await appendRunEvent({
          eventType: "polynet_daytona_runtime_credit_settled",
          eventKey: `${runId}:polynet_daytona_runtime_credit_settled:1`,
          payload: {
            run_id: runId,
            credit_key: polynetDaytonaRuntimeCreditKey,
            credits_settled: creditsSettled,
            raw_vendor_cost_usd: rawVendorCostUsd,
            duration_seconds: durationSeconds,
            target_id: targetId || null,
            sandbox_id: sandboxId,
          },
        });
      } catch {
        // Settlement is authoritative; audit event persistence is best effort.
      }
    };
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
        // The lease TTL is the final backstop; terminal run finalization should
        // not fail because release accounting had a transient write failure.
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
        if (params.status === "ok") {
          await recordCommunityOnboardingAgentDockTurnBestEffort();
        }
        await settlePolynetDaytonaRuntimeCreditsBestEffort(
          params.status === "ok"
            ? "completed"
            : params.status === "cancelled"
              ? "cancelled"
              : params.errorCode || params.reason || "error",
        );
        await settlePolynetCodexRuntimeCreditsBestEffort(
          params.status === "ok"
            ? "completed"
            : params.status === "cancelled"
              ? "cancelled"
              : params.errorCode || params.reason || "error",
        );
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
    const polynetToolSurface = isolatePolynetHarnessToolNames({
      allowedToolNames,
    });
    const polynetAllowedToolNamesForRun = polynetToolSurface.allowedToolNames;
    const suppressedPolynetToolNames = polynetToolSurface.suppressedToolNames;
    const polynetDaytonaRuntimeEnabled =
      !usePolynetCodexWorkerBridge &&
      runtimeExecutionMode === "agentic" &&
      polynetAllowedToolNamesForRun.some((toolName) =>
        POLYNET_DAYTONA_RUNTIME_TOOL_NAME_SET.has(toolName),
      );
    if (polynetDaytonaRuntimeEnabled) {
      const reserveDurationSeconds =
        POLYNET_CODEX_WORKER_ACTIVE_RUN_WINDOW_MS / 1000;
      const reserveRawVendorCostUsd = estimateDaytonaWorkspaceComputeVendorCostUsd({
        durationSeconds: reserveDurationSeconds,
      });
      const reserveCredits = priceDaytonaWorkspaceComputeCredits({
        durationSeconds: reserveDurationSeconds,
      });
      const creditKey = `workspace_compute:daytona:${runId}`;
      const reservation = await reservePaidToolCredits({
        ctx,
        creditKey,
        userId: actor.dbUserId,
        projectId: runtimeProjectId ?? undefined,
        runId,
        toolKind: "workspace_tools",
        toolName: "workspace_compute",
        action: "turn",
        vendor: "daytona",
        credits: reserveCredits,
        rawVendorCostUsd: reserveRawVendorCostUsd,
        polynetPriceUsd: creditsToUsd(reserveCredits),
        metadata: {
          pricing_version: PAID_TOOL_PRICING_VERSION,
          billing_product: "workspace_compute",
          harness: "polynet",
          target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
          provider: "daytona",
          runtime_engine: "polynet",
          pricing_model: "daytona_runtime_seconds_estimate",
          provider_billing_reconciliation: "pending",
          provider_billing_evidence: "estimated_from_runtime_duration",
          daytona_workspace_compute_usd_per_second:
            DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
          reserve_duration_seconds: reserveDurationSeconds,
          reserve_raw_vendor_cost_usd: reserveRawVendorCostUsd,
        },
      });
      if (!reservation.ok) {
        const billingMode =
          String(reservation.details.paid_usage_billing_mode ?? "").trim() ||
          "card_preferred";
        await persistPartialAssistantMessageBestEffort({
          content: "",
          status: "error",
          reason: reservation.code,
          errorCode: reservation.code,
          errorMessage: reservation.message,
        });
        await finishRunBestEffortForRun({
          status: "error",
          reason: reservation.code,
          errorCode: reservation.code,
          errorMessage: reservation.message,
        });
        return runtimeJsonResponse(402, {
          ok: false,
          code: reservation.code,
          error: reservation.code,
          message: reservation.message,
          status: 402,
          tool_kind: "workspace_tools",
          required_credits: reserveCredits,
          paid_usage_billing_mode: billingMode,
        });
      }
      polynetDaytonaRuntimeCreditKey = creditKey;
      polynetDaytonaRuntimeCreditsReserved = reserveCredits;
      polynetDaytonaRuntimeReserveStartedAtMs = Date.now();
      await appendRunEvent({
        eventType: "polynet_daytona_runtime_credit_reserved",
        eventKey: `${runId}:polynet_daytona_runtime_credit_reserved:1`,
        payload: {
          run_id: runId,
          credit_key: creditKey,
          reserved_credits: reserveCredits,
          reserve_duration_seconds: reserveDurationSeconds,
          reserve_raw_vendor_cost_usd: reserveRawVendorCostUsd,
        },
      });
    }
    const shouldResolveDaytonaRuntimeSubstrate =
      usePolynetCodexWorkerBridge || polynetDaytonaRuntimeEnabled;
    const activeDaytonaRuntimeSubstrate = shouldResolveDaytonaRuntimeSubstrate
      ? ((await ctx.runQuery(
          (internal as any).daytonaCodexRuntimeTargets
            .getActiveDaytonaCodexRuntimeSubstrateForThreadInternal as any,
          {
            ownerId: actor.dbUserId,
            threadId: ownedThread._id as any,
          },
        )) as {
          provider?: unknown;
          targetId?: unknown;
          runId?: unknown;
          sandboxId?: unknown;
          workspaceRoot?: unknown;
          activePreviewPorts?: unknown;
          previewLeaseActive?: unknown;
        } | null)
      : null;
    const normalizedDaytonaRuntimeSubstrate = {
      provider: "daytona" as const,
      targetId:
        String(activeDaytonaRuntimeSubstrate?.targetId ?? "").trim() || null,
      runId:
        String(activeDaytonaRuntimeSubstrate?.runId ?? "").trim() || runId,
      sandboxId:
        String(activeDaytonaRuntimeSubstrate?.sandboxId ?? "").trim() || null,
      workspaceRoot:
        String(activeDaytonaRuntimeSubstrate?.workspaceRoot ?? "").trim() ||
        null,
      activePreviewPorts: Array.isArray(
        activeDaytonaRuntimeSubstrate?.activePreviewPorts,
      )
        ? activeDaytonaRuntimeSubstrate.activePreviewPorts
            .map((port) => Number(port))
            .filter((port) => Number.isFinite(port) && port > 0)
        : [],
      previewLeaseActive:
        activeDaytonaRuntimeSubstrate?.previewLeaseActive === true,
      previewStartAvailable: polynetAllowedToolNamesForRun.includes("terminal_start"),
    };
    const runtimeSubstrateResolution: RuntimeSubstrateResolution =
      usePolynetCodexWorkerBridge
        ? {
            provider: "daytona",
            status: "required_for_codex",
            targetId: normalizedDaytonaRuntimeSubstrate.targetId,
            runId: normalizedDaytonaRuntimeSubstrate.runId,
            sandboxId: normalizedDaytonaRuntimeSubstrate.sandboxId,
            workspaceRoot: normalizedDaytonaRuntimeSubstrate.workspaceRoot,
            activePreviewPorts: normalizedDaytonaRuntimeSubstrate.activePreviewPorts,
            previewLeaseActive: normalizedDaytonaRuntimeSubstrate.previewLeaseActive,
            polyNetWorkspaceToolsSuppressed: false,
            suppressedToolNames: [],
          }
        : polynetDaytonaRuntimeEnabled
          ? {
              provider: "daytona",
              status: "polynet_daytona_runtime",
              targetId: normalizedDaytonaRuntimeSubstrate.targetId,
              runId: normalizedDaytonaRuntimeSubstrate.runId,
              sandboxId: normalizedDaytonaRuntimeSubstrate.sandboxId,
              workspaceRoot: normalizedDaytonaRuntimeSubstrate.workspaceRoot,
              activePreviewPorts:
                normalizedDaytonaRuntimeSubstrate.activePreviewPorts,
              previewLeaseActive:
                normalizedDaytonaRuntimeSubstrate.previewLeaseActive,
              polyNetWorkspaceToolsSuppressed:
                suppressedPolynetToolNames.length > 0,
              suppressedToolNames: suppressedPolynetToolNames,
            }
        : {
            provider:
              runtimeExecutionMode === "agentic" ? "none" : "project_workspace",
            status:
              runtimeExecutionMode === "agentic"
                ? "polynet_harness_isolated"
                : "legacy_project_workspace",
            targetId: null,
            runId: null,
            sandboxId: null,
            workspaceRoot: null,
            activePreviewPorts: [],
            previewLeaseActive: false,
            polyNetWorkspaceToolsSuppressed:
              suppressedPolynetToolNames.length > 0,
            suppressedToolNames: suppressedPolynetToolNames,
          };
    const activeDaytonaRuntimeSubstrateForPolynetTools =
      polynetDaytonaRuntimeEnabled ? normalizedDaytonaRuntimeSubstrate : null;
    await appendRunEvent({
      eventType: "runtime_substrate_resolved",
      eventKey: `${runId}:runtime_substrate_resolved:1`,
      payload: {
        run_id: runId,
        provider: runtimeSubstrateResolution.provider,
        status: runtimeSubstrateResolution.status,
        target_id: runtimeSubstrateResolution.targetId,
        substrate_run_id: runtimeSubstrateResolution.runId,
        sandbox_id: runtimeSubstrateResolution.sandboxId,
        workspace_root: runtimeSubstrateResolution.workspaceRoot,
        active_preview_ports: runtimeSubstrateResolution.activePreviewPorts,
        preview_lease_active: runtimeSubstrateResolution.previewLeaseActive,
        polynet_workspace_tools_suppressed:
          runtimeSubstrateResolution.polyNetWorkspaceToolsSuppressed,
        suppressed_tool_names: runtimeSubstrateResolution.suppressedToolNames,
        runtime_engine_resolved: runtimeEngineResolution.resolvedRuntimeEngine,
        codex_worker_bridge: usePolynetCodexWorkerBridge,
      },
    });
    await appendRunEvent({
      eventType: "runtime_context_resolved",
      eventKey: `${runId}:runtime_context_resolved:1`,
      payload: {
        run_id: runId,
        thread_id: String(ownedThread._id),
        project_id: runtimeProjectId ?? null,
        community_id: runtimeCommunityId ?? null,
        community_context_version: runtimeCommunityId ? runtimeCommunityContextVersion : null,
        community_lens_authority:
          buildCommunityLensAuthorityReceipt(runtimeCommunityLensAuthority),
        runtime_engine_requested:
          runtimeEngineResolution.requestedRuntimeEngine ?? null,
        runtime_engine_resolved: runtimeEngineResolution.resolvedRuntimeEngine,
        runtime_engine_source: runtimeEngineResolution.runtimeEngineSource,
        engine_id: runtimeEngineId,
        account_plan: runtimeAccountPlan,
        capability_families: resolvedRuntimeCapabilityFamilies,
        harness_profile: resolvedRuntimeHarnessProfile,
        invocation_surface: invocationSurface,
        member_agent_surface_context: memberAgentSurfaceContext,
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
        codex_worker_bridge: usePolynetCodexWorkerBridge,
        disabled_reason: runtimeEngineResolution.disabledReason,
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
        policy_scope: usePolynetCodexWorkerBridge
          ? "polynet_harness_candidate"
          : "active_harness",
        allowed_tool_names: polynetHarnessToolPolicy.fixedRuntimeToolNames,
        capability_families: resolvedRuntimeCapabilityFamilies,
        harness_profile: resolvedRuntimeHarnessProfile,
        invocation_surface: invocationSurface,
        member_agent_surface_context: memberAgentSurfaceContext,
      },
    });
    if (runtimeExecutionMode === "agentic") {
      if (stream && usePolynetCodexWorkerBridge) {
        return runtimeSseResponse(async (writer) => {
          let streamedContent = "";
          let streamedInferenceSource = resolvedInferenceSource;
          let streamedInferenceLaneFallbacks = inferenceLaneFallbacks;
          let assistantMessageId: string | null = null;
          let assistantMessageKey: string | null = null;
          let assistantMessageSeq: number | null = null;

          const emitWorkerDelta = (data: Record<string, unknown>) => {
            const full = typeof data.full_content === "string" ? data.full_content : null;
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
              engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
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
            const authFailureCode = "provider_connection_required";
            const authFailureMessage =
              "Connect ChatGPT to run Codex turns with your own account.";
            await persistPartialAssistantMessageBestEffort({
              content: "",
              status: "error",
              reason: authFailureCode,
              errorCode: authFailureCode,
              errorMessage: authFailureMessage,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishRunBestEffortForRun({
              status: "error",
              reason: authFailureCode,
              errorCode: authFailureCode,
              errorMessage: authFailureMessage,
            });
            writer.send({
              event: "error",
              data: {
                code: authFailureCode,
                error: authFailureMessage,
                message: authFailureMessage,
                status: 403,
                cta: "connect_provider",
              },
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
            const capacityCode =
              String(leaseAcquireResult.code ?? "").trim() ||
              "codex_runtime_capacity_unavailable";
            const capacityMessage =
              String(leaseAcquireResult.message ?? "").trim() ||
              "Codex runtime capacity is unavailable.";
            await persistPartialAssistantMessageBestEffort({
              content: "",
              status: "error",
              reason: capacityCode,
              errorCode: capacityCode,
              errorMessage: capacityMessage,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishRunBestEffortForRun({
              status: "error",
              reason: capacityCode,
              errorCode: capacityCode,
              errorMessage: capacityMessage,
            });
            writer.send({
              event: "error",
              data: {
                code: capacityCode,
                error: capacityMessage,
                message: capacityMessage,
                status: leaseAcquireResult.status ?? 429,
                counts: leaseAcquireResult.counts ?? null,
                limits: leaseAcquireResult.limits ?? null,
              },
            });
            return;
          }
          polynetCodexWorkerLeaseAcquired = true;
          try {
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
          } catch {
            // Admission succeeded; evidence write is not allowed to consume the
            // lease without attempting the turn. Terminal finalization releases it.
          }

          const codexRuntimeReserveDurationSeconds =
            POLYNET_CODEX_WORKER_ACTIVE_RUN_WINDOW_MS / 1000;
          const codexRuntimeReserveRawVendorCostUsd =
            estimateDaytonaWorkspaceComputeVendorCostUsd({
              durationSeconds: codexRuntimeReserveDurationSeconds,
            });
          const codexRuntimeReserveCredits = priceDaytonaWorkspaceComputeCredits({
            durationSeconds: codexRuntimeReserveDurationSeconds,
          });
          const codexRuntimeCreditKey = `workspace_compute:daytona:${runId}`;
          const codexRuntimeReservation = await reservePaidToolCredits({
            ctx,
            creditKey: codexRuntimeCreditKey,
            userId: actor.dbUserId,
            projectId: runtimeProjectId ?? undefined,
            runId,
            toolKind: "workspace_tools",
            toolName: "workspace_compute",
            action: "turn",
            vendor: "daytona",
            credits: codexRuntimeReserveCredits,
            rawVendorCostUsd: codexRuntimeReserveRawVendorCostUsd,
            polynetPriceUsd: creditsToUsd(codexRuntimeReserveCredits),
            metadata: {
              pricing_version: PAID_TOOL_PRICING_VERSION,
              billing_product: "workspace_compute",
              harness: "codex",
              target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
              provider: "daytona",
              pricing_model: "daytona_runtime_seconds_estimate",
              provider_billing_reconciliation: "pending",
              provider_billing_evidence: "estimated_from_runtime_duration",
              daytona_workspace_compute_usd_per_second:
                DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
              reserve_duration_seconds: codexRuntimeReserveDurationSeconds,
              reserve_raw_vendor_cost_usd: codexRuntimeReserveRawVendorCostUsd,
              lease_id: leaseAcquireResult.leaseId ?? null,
              lease_expires_at: leaseAcquireResult.expiresAt ?? null,
            },
          });
          if (!codexRuntimeReservation.ok) {
            const billingMode =
              String(codexRuntimeReservation.details.paid_usage_billing_mode ?? "").trim() ||
              "card_preferred";
            await persistPartialAssistantMessageBestEffort({
              content: "",
              status: "error",
              reason: codexRuntimeReservation.code,
              errorCode: codexRuntimeReservation.code,
              errorMessage: codexRuntimeReservation.message,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishRunBestEffortForRun({
              status: "error",
              reason: codexRuntimeReservation.code,
              errorCode: codexRuntimeReservation.code,
              errorMessage: codexRuntimeReservation.message,
            });
            writer.send({
              event: "error",
              data: {
                code: codexRuntimeReservation.code,
                error: codexRuntimeReservation.message,
                message: codexRuntimeReservation.message,
                status: 402,
                tool_kind: "workspace_tools",
                required_credits: codexRuntimeReserveCredits,
                paid_usage_billing_mode: billingMode,
              },
            });
            return;
          }
          polynetCodexRuntimeCreditKey = codexRuntimeCreditKey;
          polynetCodexRuntimeCreditsReserved = codexRuntimeReserveCredits;
          try {
            await streamAppendRunEvent({
              eventType: "polynet_codex_runtime_credit_reserved",
              eventKey: `${runId}:polynet_codex_runtime_credit_reserved:1`,
              payload: {
                run_id: runId,
                credit_key: codexRuntimeCreditKey,
                reserved_credits: codexRuntimeReserveCredits,
                reserve_duration_seconds: codexRuntimeReserveDurationSeconds,
                reserve_raw_vendor_cost_usd: codexRuntimeReserveRawVendorCostUsd,
              },
            });
          } catch {
            // Reservation is authoritative; audit event write is best-effort.
          }

          if (runtimeProjectId) {
            await streamAppendRunEvent({
              eventType: "workspace_session_skipped",
              eventKey: `${runId}:workspace_session_skipped:daytona_direct`,
              payload: {
                run_id: runId,
                project_id: runtimeProjectId,
                source: "polynet_codex_worker",
                provider: "daytona",
                transport: "daytona_direct",
                reason: "daytona_direct_uses_runtime_workspace",
              },
            });
          }

          const codexPromptGeneratedAt = new Date();
          const codexPromptTimeZone = "UTC";
          const codexPlatformToolProjection = {
            hasCommunity: Boolean(runtimeCommunityId),
            communityResourceLane:
              runtimeCommunityLensAuthority?.communityResourceLane ?? null,
            communityLensAuthority: runtimeCommunityLensAuthority,
          };
          const workerRuntimeToolBridgeRequired = true;
          const codexHarnessToolPolicy = resolveCodexHarnessToolPolicy({
            polynetPlatformToolProjection: codexPlatformToolProjection,
            workspaceServeAvailable: workerRuntimeToolBridgeRequired,
            computerAdaptersAvailable: workerRuntimeToolBridgeRequired,
          });
          const workerPlatformTools = codexHarnessToolPolicy.polynetPlatformTools;
          const codexVisiblePolynetToolNames =
            codexHarnessToolPolicy.polynetPlatformToolNames;
          const codexRuntimeTurnEnvelope = buildRuntimeTurnEnvelope({
            latestUserText,
            threadWorkingState: ownedThread.workingState ?? null,
            threadId: String(ownedThread._id),
            communityId: runtimeCommunityId,
            projectId: runtimeProjectId,
            communityResourceLane: runtimeCommunityLensAuthority?.communityResourceLane ?? null,
            communityLensAuthority: runtimeCommunityLensAuthority,
            allowedToolNames: codexVisiblePolynetToolNames,
            memberAgentSurfaceContext,
          });
          runtimeTurnEnvelopeForRun = codexRuntimeTurnEnvelope;
          let codexRuntimeTurnContext: RuntimeTurnContextPacket;
          try {
            codexRuntimeTurnContext = (
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
                summarizeCurrentRunEvents: false,
                runtimeStop: null,
              })
            ).packet;
          } catch {
            codexRuntimeTurnContext = buildRuntimeTurnContextPacket({
              latestUserText,
              runtimeTurnEnvelope: codexRuntimeTurnEnvelope,
              threadWorkingState: ownedThread.workingState ?? null,
            });
          }
          await persistContextSnapshotBestEffort("started", codexRuntimeTurnEnvelope);
          const workerTurnInputs = buildPolynetCodexWorkerTurnInputs({
            conversationMessages,
            latestUserText,
            communityName: runtimeCommunityName,
            communitySlug: runtimeCommunitySlug,
            communityOneLiner: runtimeCommunityOneLiner,
            communityAbout: runtimeCommunityAbout,
            communitySystemPrompt: runtimeCommunitySystemPrompt,
            communityLensAuthority: runtimeCommunityLensAuthority,
            agentName: runtimeAgentProfile.agentName,
            agentSoul: runtimeAgentProfile.agentSoul,
            runtimeTurnContext: codexRuntimeTurnContext,
            codexVisiblePolynetToolNames,
            accountPlan: runtimeAccountPlan,
            currentDateTimeIso: codexPromptGeneratedAt.toISOString(),
            currentDateLabel: new Intl.DateTimeFormat("en-US", {
              dateStyle: "full",
              timeStyle: "long",
              timeZone: codexPromptTimeZone,
            }).format(codexPromptGeneratedAt),
            currentTimeZone: codexPromptTimeZone,
            invocationSurface,
            memberAgentSurfaceContext,
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
            const ingestFailureCode = "polynet_codex_worker_ingest_unconfigured";
            const ingestFailureMessage =
              "PolyNet Codex worker ingest is not configured.";
            await persistPartialAssistantMessageBestEffort({
              content: "",
              status: "error",
              reason: ingestFailureCode,
              errorCode: ingestFailureCode,
              errorMessage: ingestFailureMessage,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishRunBestEffortForRun({
              status: "error",
              reason: ingestFailureCode,
              errorCode: ingestFailureCode,
              errorMessage: ingestFailureMessage,
            });
            writer.send({
              event: "error",
              data: {
                code: ingestFailureCode,
                error: ingestFailureMessage,
                message: ingestFailureMessage,
                status: 503,
              },
            });
            return;
          }
          let codexMcpBridgeProjectionReceipt =
            buildFailedCodexMcpBridgeProjectionReceipt();
          let workerMcpBridgeTools: CodexMcpHarnessBridgeTool[] = [];
          try {
            const [effectiveMcpApps, mountedTools] = await Promise.all([
              ctx.runQuery(internal.harnessMounts.listEffectiveMcpAppsInternal, {
                userId: actor.dbUserId,
                communityId: runtimeCommunityId
                  ? (runtimeCommunityId as any)
                  : undefined,
              }),
              ctx.runQuery(
                internal.userPlatformAppMounts.listRuntimeUserPlatformMountedToolsInternal,
                {
                  userId: actor.dbUserId,
                },
              ),
            ]);
            const runtimeMountedTools = normalizeRuntimeMountedUserPlatformAppTools(
              mountedTools,
            ).map(mapRuntimeMountedUserPlatformAppToolToMcpHarnessTool);
            const codexMcpBridgeProjection = buildMcpHarnessProjection({
              effectiveApps: Array.isArray(effectiveMcpApps)
                ? (effectiveMcpApps as any)
                : [],
              runtimeMountedTools,
            });
            workerMcpBridgeTools = codexMcpBridgeProjection.codexBridgeTools.filter(
              (tool) => tool.risk_level === "read",
            );
            codexMcpBridgeProjectionReceipt =
              buildCodexMcpBridgeProjectionReceipt(codexMcpBridgeProjection);
          } catch {
            codexMcpBridgeProjectionReceipt =
              buildFailedCodexMcpBridgeProjectionReceipt();
          }
          const workerToolTarget =
            workerPlatformTools.length > 0 ||
            workerRuntimeToolBridgeRequired ||
            workerMcpBridgeTools.length > 0
              ? buildPolynetCodexWorkerToolTarget()
              : null;
          await streamAppendRunEvent({
            eventType: "codex_harness_tool_policy_resolved",
            eventKey: `${runId}:codex_harness_tool_policy_resolved:1`,
            payload: {
              run_id: runId,
              ...buildCodexHarnessToolPolicyReceipt(codexHarnessToolPolicy),
            },
          });
          await streamAppendRunEvent({
            eventType: "codex_mcp_bridge_projection_resolved",
            eventKey: `${runId}:codex_mcp_bridge_projection_resolved:1`,
            payload: {
              run_id: runId,
              ...codexMcpBridgeProjectionReceipt,
            },
          });
          await streamAppendRunEvent({
            eventType: "polynet_codex_worker_tools_projected",
            eventKey: `${runId}:polynet_codex_worker_tools_projected:1`,
            payload: {
              run_id: runId,
              tool_bridge_configured: Boolean(workerToolTarget),
              runtime_tool_names: codexHarnessToolPolicy.runtimeAdapterToolNames,
              platform_tool_count: workerPlatformTools.length,
              platform_tool_names: workerPlatformTools.map((tool) => tool.name),
              mcp_bridge_tool_count: workerMcpBridgeTools.length,
              mcp_bridge_tool_names: workerMcpBridgeTools.map(
                (tool) => tool.bridge_tool_name,
              ),
              platform_tool_policies: workerPlatformTools.map((tool) => ({
                tool_name: tool.name,
                billing_policy: tool.billing_policy,
                risk_level: tool.risk_level,
                required_community_resource_lane:
                  tool.required_community_resource_lane,
                required_community_authority:
                  tool.required_community_authority,
              })),
              community_lens_authority:
                buildCommunityLensAuthorityReceipt(runtimeCommunityLensAuthority),
            },
          });
          let workerRunTokens: {
            ingest: string;
            tool: string | null;
          } | null = null;
          const mintedWorkerRunTokens = await mintPolynetCodexWorkerRunTokenSet({
            ownerId: String(actor.dbUserId),
            threadId: String(ownedThread._id),
            runId,
            includeTool: Boolean(workerToolTarget),
          });
          if (!mintedWorkerRunTokens.ok) {
            await persistPartialAssistantMessageBestEffort({
              content: "",
              status: "error",
              reason: mintedWorkerRunTokens.code,
              errorCode: mintedWorkerRunTokens.code,
              errorMessage: mintedWorkerRunTokens.message,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishRunBestEffortForRun({
              status: "error",
              reason: mintedWorkerRunTokens.code,
              errorCode: mintedWorkerRunTokens.code,
              errorMessage: mintedWorkerRunTokens.message,
            });
            writer.send({
              event: "error",
              data: {
                code: mintedWorkerRunTokens.code,
                error: mintedWorkerRunTokens.message,
                message: mintedWorkerRunTokens.message,
                status: mintedWorkerRunTokens.status,
              },
            });
            return;
          }
          workerRunTokens = mintedWorkerRunTokens.tokens;

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
                scope: "pending",
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
              snapshotId?: unknown;
              targetRegion?: unknown;
              autoStopMinutes?: unknown;
              autoArchiveMinutes?: unknown;
              autoDeleteMinutes?: unknown;
              workerPort?: unknown;
              lifecycleMode?: unknown;
              providerEphemeral?: unknown;
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
            const resolvedSnapshotId =
              String(resolved.snapshotId ?? "").trim() || null;
            const resolvedTargetRegion =
              String(resolved.targetRegion ?? "").trim() || null;
            const resolvedAutoStopMinutes = readPositiveNumber(
              resolved.autoStopMinutes,
            );
            const resolvedAutoArchiveMinutes = readPositiveNumber(
              resolved.autoArchiveMinutes,
            );
            const resolvedAutoDeleteMinutes = readPositiveNumber(
              resolved.autoDeleteMinutes,
            );
            const resolvedWorkerPort = readPositiveNumber(resolved.workerPort);
            const resolvedLifecycleMode =
              String(resolved.lifecycleMode ?? "").trim() || null;
            const resolvedProviderEphemeral =
              typeof resolved.providerEphemeral === "boolean"
                ? resolved.providerEphemeral
                : null;
            const resolvedScope =
              resolvedLifecycleMode === "thread_ephemeral" ? "thread" : "run";
            workerMachineId = workerResolvedTarget.sandboxId;
            polynetCodexRuntimeWorkerMachineId = workerResolvedTarget.sandboxId;
            await streamAppendRunEvent({
              eventType: "daytona_codex_runtime_target_ready",
              eventKey: `${runId}:daytona_codex_runtime_target_ready:1`,
              payload: {
                run_id: runId,
                provider: "daytona",
                transport: "daytona_direct",
                scope: resolvedScope,
                target_id: workerResolvedTarget.targetId,
                sandbox_id: workerResolvedTarget.sandboxId,
                lifecycle_mode: resolvedLifecycleMode,
                provider_ephemeral: resolvedProviderEphemeral,
                snapshot_id: resolvedSnapshotId,
                target_region: resolvedTargetRegion,
                auto_stop_minutes: resolvedAutoStopMinutes,
                auto_archive_minutes: resolvedAutoArchiveMinutes,
                auto_delete_minutes: resolvedAutoDeleteMinutes,
                worker_port: resolvedWorkerPort,
                signed_preview_expires_at:
                  workerResolvedTarget.signedPreviewExpiresAt ?? null,
                timing: resolved.timing ?? null,
              },
            });
          } catch (error) {
            const targetFailureCode =
              error instanceof Error && error.message
                ? error.message.split(/\s|\n/)[0]
                : "daytona_codex_runtime_target_failed";
            const targetFailureMessage =
              error instanceof Error
                ? error.message
                : "Daytona Codex runtime target failed.";
            await persistPartialAssistantMessageBestEffort({
              content: "",
              status: "error",
              reason: targetFailureCode,
              errorCode: targetFailureCode,
              errorMessage: targetFailureMessage,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishRunBestEffortForRun({
              status: "error",
              reason: targetFailureCode,
              errorCode: targetFailureCode,
              errorMessage: targetFailureMessage,
            });
            writer.send({
              event: "error",
              data: {
                code: targetFailureCode,
                error: targetFailureMessage,
                message: targetFailureMessage,
                status: 503,
                provider: "daytona",
              },
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
                // Best-effort watcher; the worker turn timeout is the backstop.
              } finally {
                workerWatcherBusy = false;
              }
            })();
          }, 3_000);

          const workerActivePreviewPorts = new Set<number>();
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
              ingest: workerIngestTarget
                ? {
                    ...workerIngestTarget,
                    run_token: workerRunTokens?.ingest ?? null,
                    tool_run_token: workerRunTokens?.tool ?? null,
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
                      workspace_compute_billing: {
                        credit_key: polynetCodexRuntimeCreditKey,
                        reserved_credits: polynetCodexRuntimeCreditsReserved,
                        daytona_workspace_compute_usd_per_second:
                          DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
                      },
                      ...(workerResolvedTarget
                        ? {
                            daytona_runtime_target: {
                              target_id: workerResolvedTarget.targetId,
                              sandbox_id: workerResolvedTarget.sandboxId,
                              signed_preview_expires_at:
                                workerResolvedTarget.signedPreviewExpiresAt,
                            },
                          }
                        : {}),
                    },
                  }
                : null,
              platformTools: workerPlatformTools,
              mcpBridgeTools: workerMcpBridgeTools,
              target: workerResolvedTarget,
              onEvent: async (event) => {
                if (event.event === "start") {
                  if (polynetCodexRuntimeWorkerStartedAtMs === null) {
                    polynetCodexRuntimeWorkerStartedAtMs = Date.now();
                  }
                  const machineId = String(event.data.machine_id ?? "").trim();
                  if (machineId) {
                    workerMachineId = machineId;
                    polynetCodexRuntimeWorkerMachineId = machineId;
                  }
                  return;
                }
                if (event.event === "delta") {
                  emitWorkerDelta(event.data);
                  return;
                }
                if (event.event === "runtime_event") {
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
                  const timing = event.data.timing;
                  const timingRecord =
                    timing && typeof timing === "object" && !Array.isArray(timing)
                      ? (timing as Record<string, unknown>)
                      : null;
                  const totalMs = readPositiveNumber(timingRecord?.total_ms);
                  if (totalMs !== null) polynetCodexRuntimeTimingTotalMs = totalMs;
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
          const workerTimingTotalMs = readPositiveNumber(workerResult.timing?.total_ms);
          if (workerTimingTotalMs !== null) {
            polynetCodexRuntimeTimingTotalMs = workerTimingTotalMs;
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
            } catch (teardownError) {
              await streamAppendRunEvent({
                eventType: "daytona_codex_runtime_provider_teardown_failed",
                eventKey: `${runId}:daytona_codex_runtime_provider_teardown_failed:1`,
                payload: {
                  run_id: runId,
                  provider: "daytona",
                  transport: "daytona_direct",
                  target_id: workerResolvedTarget.targetId,
                  sandbox_id: workerResolvedTarget.sandboxId,
                  reason: teardownReason,
                  failure_stage: "schedule",
                  message:
                    teardownError instanceof Error
                      ? teardownError.message.slice(0, 1000)
                      : String(teardownError ?? "teardown_failed").slice(0, 1000),
                },
              });
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
                inferenceSourceOverride: streamedInferenceSource,
                inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
              });
              await finishCancelledRun();
              return;
            }
            await persistPartialAssistantMessageBestEffort({
              content: streamedContent,
              status: "error",
              reason: workerResult.code,
              errorCode: workerResult.code,
              errorMessage: workerResult.message,
              inferenceSourceOverride: streamedInferenceSource,
              inferenceLaneFallbacksOverride: streamedInferenceLaneFallbacks,
            });
            await finishRunBestEffortForRun({
              status: "error",
              reason: workerResult.code,
              errorCode: workerResult.code,
              errorMessage: workerResult.message,
            });
            writer.send({
              event: "error",
              data: {
                code: workerResult.code,
                error: workerResult.message,
                message: workerResult.message,
                status: workerResult.status,
              },
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
      }
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
              accountPlan: runtimeAccountPlan,
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
              communityLensAuthority: runtimeCommunityLensAuthority,
              communityContextVersion: runtimeCommunityId
                ? runtimeCommunityContextVersion
                : null,
              agentName: runtimeAgentProfile.agentName,
              agentSoul: runtimeAgentProfile.agentSoul,
              threadWorkingState: ownedThread.workingState ?? null,
              allowedToolNames: polynetAllowedToolNamesForRun,
              invocationSurface,
              memberAgentSurfaceContext,
              activeDaytonaRuntimeSubstrate:
                activeDaytonaRuntimeSubstrateForPolynetTools,
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
          accountPlan: runtimeAccountPlan,
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
          communityLensAuthority: runtimeCommunityLensAuthority,
          communityContextVersion: runtimeCommunityId
            ? runtimeCommunityContextVersion
            : null,
          agentName: runtimeAgentProfile.agentName,
          agentSoul: runtimeAgentProfile.agentSoul,
          threadWorkingState: ownedThread.workingState ?? null,
          allowedToolNames: polynetAllowedToolNamesForRun,
          invocationSurface,
          memberAgentSurfaceContext,
          activeDaytonaRuntimeSubstrate:
            activeDaytonaRuntimeSubstrateForPolynetTools,
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
          communityLensAuthority: runtimeCommunityLensAuthority,
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
          accountPlan: runtimeAccountPlan,
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
