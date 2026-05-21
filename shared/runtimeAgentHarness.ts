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
  skillCounts: {
    installedPersonal: number;
    selectedPersonal: number;
    attachedCommunity: number;
    selectedCommunity: number;
  };
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
    skill_counts: turn.skillCounts,
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
