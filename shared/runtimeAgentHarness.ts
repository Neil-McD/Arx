import type { NativeToolAwareMessage } from "./nativeToolProtocol";
import type { CodexMcpProjection } from "./codexMcpProjection.ts";
import type { RetrievalToolName } from "./retrievalTools";
import type {
  RuntimeKernelFailure,
  RuntimeKernelSuccess,
} from "./runtimeKernelTypes";

export type RuntimeAgentHarnessId = "polynet_native" | "codex_app_server";
export type RuntimeAgentHarnessExecutionPlacement =
  | "convex_action"
  | "daytona_sidecar";
export type RuntimeAgentHarnessInferenceSource =
  | "free"
  | "platform"
  | "chatgpt"
  | "user_key";
export type RuntimeAgentHarnessResult =
  | RuntimeKernelSuccess<string>
  | RuntimeKernelFailure<string>;

export type RuntimeAgentHarnessDescriptor = {
  id: RuntimeAgentHarnessId;
  label: string;
  executionPlacement: RuntimeAgentHarnessExecutionPlacement;
};

export type RuntimeAgentHarness = RuntimeAgentHarnessDescriptor & {
  execute: () => Promise<RuntimeAgentHarnessResult>;
};

export type PreparedRuntimeAgentTurn = {
  harnessId: RuntimeAgentHarnessId;
  runId: string;
  userId: string;
  threadId: string | null;
  projectId: string | null;
  communityId: string | null;
  requestedModelId: string;
  inferenceSource: RuntimeAgentHarnessInferenceSource;
  stream: boolean;
  executionPlacement: RuntimeAgentHarnessExecutionPlacement;
  nativeTranscript: NativeToolAwareMessage[];
  activeToolNames: string[];
  fixedAllowedToolNames: readonly RetrievalToolName[];
  mountedToolCount: number;
  codexMcpProjection: {
    version: CodexMcpProjection["version"];
    mode: CodexMcpProjection["mode"];
    fingerprint: string;
    eligibleToolCount: number;
    blockedToolCount: number;
    serverCount: number;
    eligibleRuntimeToolNames: string[];
  } | null;
  codexPrimaryCanary: {
    forcePolyNetReadOnlyDynamicTools: boolean;
    searchQuery: string | null;
  };
  skillCounts: {
    installedPersonal: number;
    selectedPersonal: number;
    attachedCommunity: number;
    selectedCommunity: number;
  };
};

export type RuntimeAgentHarnessSelectionReason =
  | "codex_primary_disabled"
  | "codex_primary_streaming_not_supported"
  | "codex_route_not_selected"
  | "codex_primary_adapter_unavailable"
  | "codex_primary_selected";

export type RuntimeAgentHarnessSelection = {
  selectedHarness: RuntimeAgentHarnessDescriptor;
  candidateHarness: RuntimeAgentHarnessDescriptor | null;
  fallbackHarness: RuntimeAgentHarnessDescriptor | null;
  codexPrimaryEnabled: boolean;
  codexPrimaryStreamingEnabled: boolean;
  codexRouteSelected: boolean;
  codexPrimaryAdapterAvailable: boolean;
  stream: boolean;
  reason: RuntimeAgentHarnessSelectionReason;
  selectionPolicy: "codex_primary_flag_then_native_fallback";
};

export const POLYNET_NATIVE_RUNTIME_AGENT_HARNESS: RuntimeAgentHarnessDescriptor = {
  id: "polynet_native",
  label: "PolyNet native runtime kernel",
  executionPlacement: "convex_action",
};

export const CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS: RuntimeAgentHarnessDescriptor = {
  id: "codex_app_server",
  label: "Codex app-server runtime",
  executionPlacement: "daytona_sidecar",
};

export function buildPreparedRuntimeAgentTurn(params: {
  harnessId: RuntimeAgentHarnessId;
  runId: string;
  userId: string;
  threadId?: string | null;
  projectId?: string | null;
  communityId?: string | null;
  requestedModelId: string;
  inferenceSource: RuntimeAgentHarnessInferenceSource;
  stream?: boolean;
  executionPlacement: RuntimeAgentHarnessExecutionPlacement;
  nativeTranscript: NativeToolAwareMessage[];
  activeToolNames: string[];
  fixedAllowedToolNames: readonly RetrievalToolName[];
  mountedToolCount: number;
  codexMcpProjection?: PreparedRuntimeAgentTurn["codexMcpProjection"];
  codexPrimaryCanary?: PreparedRuntimeAgentTurn["codexPrimaryCanary"];
  skillCounts: PreparedRuntimeAgentTurn["skillCounts"];
}): PreparedRuntimeAgentTurn {
  return {
    harnessId: params.harnessId,
    runId: params.runId,
    userId: params.userId,
    threadId: params.threadId ?? null,
    projectId: params.projectId ?? null,
    communityId: params.communityId ?? null,
    requestedModelId: params.requestedModelId,
    inferenceSource: params.inferenceSource,
    stream: params.stream ?? false,
    executionPlacement: params.executionPlacement,
    nativeTranscript: [...params.nativeTranscript],
    activeToolNames: [...params.activeToolNames],
    fixedAllowedToolNames: [...params.fixedAllowedToolNames],
    mountedToolCount: params.mountedToolCount,
    codexMcpProjection: params.codexMcpProjection ?? null,
    codexPrimaryCanary: params.codexPrimaryCanary ?? {
      forcePolyNetReadOnlyDynamicTools: false,
      searchQuery: null,
    },
    skillCounts: params.skillCounts,
  };
}

export function buildPreparedRuntimeAgentTurnEventPayload(
  turn: PreparedRuntimeAgentTurn,
): Record<string, unknown> {
  return {
    run_id: turn.runId,
    harness_id: turn.harnessId,
    execution_placement: turn.executionPlacement,
    user_scope_id: turn.userId,
    thread_id: turn.threadId,
    project_id: turn.projectId,
    community_scope_id: turn.communityId,
    requested_model_id: turn.requestedModelId,
    inference_source: turn.inferenceSource,
    stream: turn.stream,
    transcript_message_count: turn.nativeTranscript.length,
    active_tool_count: turn.activeToolNames.length,
    active_tool_names: turn.activeToolNames,
    fixed_allowed_tool_count: turn.fixedAllowedToolNames.length,
    fixed_allowed_tool_names: turn.fixedAllowedToolNames,
    mounted_tool_count: turn.mountedToolCount,
    codex_mcp_projection: turn.codexMcpProjection,
    codex_primary_canary: turn.codexPrimaryCanary,
    skill_counts: turn.skillCounts,
  };
}

export function resolveRuntimeAgentHarnessSelection(params: {
  codexPrimaryEnabled: boolean;
  codexPrimaryStreamingEnabled?: boolean;
  codexRouteSelected: boolean;
  codexPrimaryAdapterAvailable: boolean;
  stream?: boolean;
}): RuntimeAgentHarnessSelection {
  const codexCandidate = CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS;
  const nativeFallback = POLYNET_NATIVE_RUNTIME_AGENT_HARNESS;
  const stream = params.stream ?? false;
  const codexPrimaryStreamingEnabled =
    params.codexPrimaryStreamingEnabled ?? false;
  if (!params.codexPrimaryEnabled) {
    return {
      selectedHarness: nativeFallback,
      candidateHarness: null,
      fallbackHarness: null,
      codexPrimaryEnabled: false,
      codexPrimaryStreamingEnabled,
      codexRouteSelected: params.codexRouteSelected,
      codexPrimaryAdapterAvailable: params.codexPrimaryAdapterAvailable,
      stream,
      reason: "codex_primary_disabled",
      selectionPolicy: "codex_primary_flag_then_native_fallback",
    };
  }
  if (stream && !codexPrimaryStreamingEnabled) {
    return {
      selectedHarness: nativeFallback,
      candidateHarness: codexCandidate,
      fallbackHarness: nativeFallback,
      codexPrimaryEnabled: true,
      codexPrimaryStreamingEnabled,
      codexRouteSelected: params.codexRouteSelected,
      codexPrimaryAdapterAvailable: params.codexPrimaryAdapterAvailable,
      stream,
      reason: "codex_primary_streaming_not_supported",
      selectionPolicy: "codex_primary_flag_then_native_fallback",
    };
  }
  if (!params.codexRouteSelected) {
    return {
      selectedHarness: nativeFallback,
      candidateHarness: codexCandidate,
      fallbackHarness: nativeFallback,
      codexPrimaryEnabled: true,
      codexPrimaryStreamingEnabled,
      codexRouteSelected: false,
      codexPrimaryAdapterAvailable: params.codexPrimaryAdapterAvailable,
      stream,
      reason: "codex_route_not_selected",
      selectionPolicy: "codex_primary_flag_then_native_fallback",
    };
  }
  if (!params.codexPrimaryAdapterAvailable) {
    return {
      selectedHarness: nativeFallback,
      candidateHarness: codexCandidate,
      fallbackHarness: nativeFallback,
      codexPrimaryEnabled: true,
      codexPrimaryStreamingEnabled,
      codexRouteSelected: true,
      codexPrimaryAdapterAvailable: false,
      stream,
      reason: "codex_primary_adapter_unavailable",
      selectionPolicy: "codex_primary_flag_then_native_fallback",
    };
  }
  return {
    selectedHarness: codexCandidate,
    candidateHarness: codexCandidate,
    fallbackHarness: nativeFallback,
    codexPrimaryEnabled: true,
    codexPrimaryStreamingEnabled,
    codexRouteSelected: true,
    codexPrimaryAdapterAvailable: true,
    stream,
    reason: "codex_primary_selected",
    selectionPolicy: "codex_primary_flag_then_native_fallback",
  };
}

export function buildRuntimeAgentHarnessSelectedEventPayload(params: {
  runId: string;
  selection: RuntimeAgentHarnessSelection;
}): Record<string, unknown> {
  return {
    run_id: params.runId,
    selected_harness_id: params.selection.selectedHarness.id,
    selected_harness_label: params.selection.selectedHarness.label,
    execution_placement: params.selection.selectedHarness.executionPlacement,
    selection_policy: params.selection.selectionPolicy,
    selection_reason: params.selection.reason,
    fallback_harness_id: params.selection.fallbackHarness?.id ?? null,
    candidate_harness_id: params.selection.candidateHarness?.id ?? null,
    candidate_execution_placement:
      params.selection.candidateHarness?.executionPlacement ?? null,
    codex_primary_enabled: params.selection.codexPrimaryEnabled,
    codex_primary_streaming_enabled:
      params.selection.codexPrimaryStreamingEnabled,
    codex_route_selected: params.selection.codexRouteSelected,
    codex_primary_adapter_available:
      params.selection.codexPrimaryAdapterAvailable,
    stream: params.selection.stream,
  };
}

export function buildPolynetNativeRuntimeAgentHarness(params: {
  execute: () => Promise<RuntimeAgentHarnessResult>;
}): RuntimeAgentHarness {
  return {
    ...POLYNET_NATIVE_RUNTIME_AGENT_HARNESS,
    execute: params.execute,
  };
}
