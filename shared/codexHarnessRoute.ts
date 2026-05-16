export const CODEX_HARNESS_EXPERIMENT_ENV = "POLYNET_CODEX_HARNESS_ENABLED";
export const CODEX_HARNESS_PROBE_MODE_ENV = "POLYNET_CODEX_HARNESS_PROBE_MODE";
export const CODEX_HARNESS_EXECUTOR_ENV = "POLYNET_CODEX_HARNESS_EXECUTOR_ENABLED";
export const CODEX_HARNESS_PRIMARY_ENV = "POLYNET_CODEX_HARNESS_PRIMARY_ENABLED";

type RuntimeExecutionMode = "agentic" | "chat";
type RuntimeInferenceSource = "free" | "platform" | "chatgpt" | "user_key";
export type CodexHarnessProbeMode =
  | "off"
  | "canary"
  | "execution_canary"
  | "shadow_turn"
  | "tool_call_canary";
export type CodexHarnessExecutorMode = "off" | "shadow";
export type CodexHarnessReadinessStatus =
  | "ready"
  | "not_ready"
  | "auth_failed"
  | "codex_missing"
  | "app_server_failed"
  | "execution_failed"
  | "rate_limits_unknown";

export type CodexHarnessRouteReason =
  | "experiment_disabled"
  | "chat_turn_uses_current_harness"
  | "project_workspace_required"
  | "chatgpt_subscription_required_for_first_slice"
  | "tool_surface_required"
  | "codex_app_server_candidate";

export type CodexHarnessExecutorReason =
  | "executor_disabled"
  | "route_not_selected"
  | "chat_turn_uses_current_harness"
  | "streaming_not_supported"
  | "shadow_turn_required"
  | "codex_app_server_shadow_candidate";

export type CodexHarnessRoute = {
  experimentEnabled: boolean;
  selected: boolean;
  reason: CodexHarnessRouteReason;
  engine: "polynet_native_kernel" | "codex_app_server";
  executionPlacement: "convex_action" | "daytona_sidecar";
  authBridge: "none" | "chatgpt_subscription";
  toolProjection: "current_runtime_session" | "polynet_runtime_session";
  codexHomePlacement: "none" | "sidecar_isolated_codex_home";
  updatePolicy: "current_deploy" | "pinned_daytona_runtime_image";
  requiresProjectWorkspace: boolean;
};

export type CodexHarnessExecutorDecision = {
  executorEnabled: boolean;
  selected: boolean;
  mode: CodexHarnessExecutorMode;
  reason: CodexHarnessExecutorReason;
  candidateEngine: "none" | "codex_app_server";
  visibleAnswerEngine: "current_harness";
  executionPlacement: "none" | "daytona_sidecar";
  fallbackPolicy: "current_harness" | "current_harness_before_output";
  outputPolicy: "observe_only" | "shadow_no_user_visible_output";
  writePolicy: "none" | "read_only_first_slice";
  nonStreamingOnly: boolean;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function isEnabledFlagValue(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

export function isCodexHarnessExperimentEnabled(
  env: Record<string, unknown> = (globalThis as any)?.process?.env ?? {},
): boolean {
  return isEnabledFlagValue(
    env[CODEX_HARNESS_EXPERIMENT_ENV] ?? readEnv(CODEX_HARNESS_EXPERIMENT_ENV),
  );
}

export function isCodexHarnessExecutorEnabled(
  env: Record<string, unknown> = (globalThis as any)?.process?.env ?? {},
): boolean {
  return isEnabledFlagValue(
    env[CODEX_HARNESS_EXECUTOR_ENV] ?? readEnv(CODEX_HARNESS_EXECUTOR_ENV),
  );
}

export function isCodexHarnessPrimaryEnabled(
  env: Record<string, unknown> = (globalThis as any)?.process?.env ?? {},
): boolean {
  return isEnabledFlagValue(
    env[CODEX_HARNESS_PRIMARY_ENV] ?? readEnv(CODEX_HARNESS_PRIMARY_ENV),
  );
}

export function resolveCodexHarnessProbeMode(
  env: Record<string, unknown> = (globalThis as any)?.process?.env ?? {},
): CodexHarnessProbeMode {
  const normalized = String(
    env[CODEX_HARNESS_PROBE_MODE_ENV] ?? readEnv(CODEX_HARNESS_PROBE_MODE_ENV),
  )
    .trim()
    .toLowerCase();
  if (normalized === "canary") return "canary";
  if (normalized === "execution_canary") return "execution_canary";
  if (normalized === "shadow_turn") return "shadow_turn";
  if (normalized === "tool_call_canary") return "tool_call_canary";
  return "off";
}

function currentHarnessRoute(params: {
  experimentEnabled: boolean;
  reason: CodexHarnessRouteReason;
}): CodexHarnessRoute {
  return {
    experimentEnabled: params.experimentEnabled,
    selected: false,
    reason: params.reason,
    engine: "polynet_native_kernel",
    executionPlacement: "convex_action",
    authBridge: "none",
    toolProjection: "current_runtime_session",
    codexHomePlacement: "none",
    updatePolicy: "current_deploy",
    requiresProjectWorkspace: false,
  };
}

function currentHarnessExecutorDecision(params: {
  executorEnabled: boolean;
  reason: CodexHarnessExecutorReason;
  outputPolicy?: CodexHarnessExecutorDecision["outputPolicy"];
}): CodexHarnessExecutorDecision {
  return {
    executorEnabled: params.executorEnabled,
    selected: false,
    mode: "off",
    reason: params.reason,
    candidateEngine: "none",
    visibleAnswerEngine: "current_harness",
    executionPlacement: "none",
    fallbackPolicy: "current_harness",
    outputPolicy: params.outputPolicy ?? "observe_only",
    writePolicy: "none",
    nonStreamingOnly: true,
  };
}

export function resolveCodexHarnessRoute(params: {
  experimentEnabled: boolean;
  runtimeExecutionMode: RuntimeExecutionMode;
  inferenceSource: RuntimeInferenceSource;
  projectId?: string | null;
  allowedToolNames: readonly string[];
}): CodexHarnessRoute {
  if (!params.experimentEnabled) {
    return currentHarnessRoute({
      experimentEnabled: false,
      reason: "experiment_disabled",
    });
  }
  if (params.runtimeExecutionMode !== "agentic") {
    return currentHarnessRoute({
      experimentEnabled: true,
      reason: "chat_turn_uses_current_harness",
    });
  }
  if (!String(params.projectId ?? "").trim()) {
    return currentHarnessRoute({
      experimentEnabled: true,
      reason: "project_workspace_required",
    });
  }
  if (params.inferenceSource !== "chatgpt") {
    return currentHarnessRoute({
      experimentEnabled: true,
      reason: "chatgpt_subscription_required_for_first_slice",
    });
  }
  if (params.allowedToolNames.length === 0) {
    return currentHarnessRoute({
      experimentEnabled: true,
      reason: "tool_surface_required",
    });
  }
  return {
    experimentEnabled: true,
    selected: true,
    reason: "codex_app_server_candidate",
    engine: "codex_app_server",
    executionPlacement: "daytona_sidecar",
    authBridge: "chatgpt_subscription",
    toolProjection: "polynet_runtime_session",
    codexHomePlacement: "sidecar_isolated_codex_home",
    updatePolicy: "pinned_daytona_runtime_image",
    requiresProjectWorkspace: true,
  };
}

export function resolveCodexHarnessExecutorDecision(params: {
  route: CodexHarnessRoute;
  executorEnabled: boolean;
  runtimeExecutionMode: RuntimeExecutionMode;
  stream: boolean;
  probeMode: CodexHarnessProbeMode;
}): CodexHarnessExecutorDecision {
  if (!params.executorEnabled) {
    return currentHarnessExecutorDecision({
      executorEnabled: false,
      reason: "executor_disabled",
    });
  }
  if (!params.route.selected) {
    return currentHarnessExecutorDecision({
      executorEnabled: true,
      reason: "route_not_selected",
    });
  }
  if (params.runtimeExecutionMode !== "agentic") {
    return currentHarnessExecutorDecision({
      executorEnabled: true,
      reason: "chat_turn_uses_current_harness",
    });
  }
  if (params.stream) {
    return currentHarnessExecutorDecision({
      executorEnabled: true,
      reason: "streaming_not_supported",
    });
  }
  if (params.probeMode !== "shadow_turn") {
    return currentHarnessExecutorDecision({
      executorEnabled: true,
      reason: "shadow_turn_required",
    });
  }
  return {
    executorEnabled: true,
    selected: true,
    mode: "shadow",
    reason: "codex_app_server_shadow_candidate",
    candidateEngine: "codex_app_server",
    visibleAnswerEngine: "current_harness",
    executionPlacement: "daytona_sidecar",
    fallbackPolicy: "current_harness_before_output",
    outputPolicy: "shadow_no_user_visible_output",
    writePolicy: "read_only_first_slice",
    nonStreamingOnly: true,
  };
}

export function buildCodexHarnessRouteEventPayload(params: {
  runId: string;
  route: CodexHarnessRoute;
  probeMode?: CodexHarnessProbeMode;
}): Record<string, unknown> {
  return {
    run_id: params.runId,
    experiment_enabled: params.route.experimentEnabled,
    selected: params.route.selected,
    reason: params.route.reason,
    engine: params.route.engine,
    execution_placement: params.route.executionPlacement,
    auth_bridge: params.route.authBridge,
    tool_projection: params.route.toolProjection,
    codex_home_placement: params.route.codexHomePlacement,
    update_policy: params.route.updatePolicy,
    requires_project_workspace: params.route.requiresProjectWorkspace,
    probe_mode: params.probeMode ?? "off",
  };
}

export function buildCodexHarnessExecutorEventPayload(params: {
  runId: string;
  decision: CodexHarnessExecutorDecision;
  probeMode: CodexHarnessProbeMode;
}): Record<string, unknown> {
  return {
    run_id: params.runId,
    executor_enabled: params.decision.executorEnabled,
    selected: params.decision.selected,
    mode: params.decision.mode,
    reason: params.decision.reason,
    candidate_engine: params.decision.candidateEngine,
    visible_answer_engine: params.decision.visibleAnswerEngine,
    execution_placement: params.decision.executionPlacement,
    fallback_policy: params.decision.fallbackPolicy,
    output_policy: params.decision.outputPolicy,
    write_policy: params.decision.writePolicy,
    non_streaming_only: params.decision.nonStreamingOnly,
    probe_mode: params.probeMode,
  };
}

export function classifyCodexHarnessReadiness(params: {
  code?: string | null;
  stage?: string | null;
  probeOk?: boolean;
  codexPathPresent?: boolean;
  appServerStarted?: boolean;
  authApplied?: boolean;
  accountResolved?: boolean;
  rateLimitsPresent?: boolean;
  executionSmokeRequested?: boolean;
  executionSmokeCompleted?: boolean;
  executionMatchedExpected?: boolean;
  toolCallCanaryRequested?: boolean;
  toolCallCanaryCompleted?: boolean;
  toolCallCanaryMatchedExpected?: boolean;
  toolCallCanaryToolStarted?: boolean;
}): CodexHarnessReadinessStatus {
  const code = String(params.code ?? "").trim();
  const stage = String(params.stage ?? "").trim();
  const reachedCodexLookup =
    stage === "codex_binary_lookup" ||
    stage === "app_server_start" ||
    stage === "initialize" ||
    stage === "account_login" ||
    stage === "account_read" ||
    stage === "rate_limits_read" ||
    stage === "completed";
  const reachedAppServer =
    stage === "app_server_start" ||
    stage === "initialize" ||
    stage === "account_login" ||
    stage === "account_read" ||
    stage === "rate_limits_read" ||
    stage === "completed" ||
    params.appServerStarted === true;
  const reachedAuth =
    stage === "account_login" ||
    stage === "account_read" ||
    stage === "rate_limits_read" ||
    stage === "completed" ||
    params.authApplied === true;
  if (code === "codex_binary_missing" || (params.codexPathPresent === false && reachedCodexLookup)) {
    return "codex_missing";
  }
  if (
    code === "codex_app_server_spawn_failed" ||
    code === "codex_probe_result_missing" ||
    code === "codex_probe_command_error" ||
    stage === "app_server_start" ||
    (params.appServerStarted === false && reachedAppServer)
  ) {
    return "app_server_failed";
  }
  if (
    code === "provider_connection_required" ||
    code === "chatgpt_access_token_missing" ||
    stage === "account_login" ||
    (params.authApplied === false && reachedAuth)
  ) {
    return "auth_failed";
  }
  if (
    params.probeOk === true &&
    params.codexPathPresent === true &&
    params.appServerStarted === true &&
    params.authApplied === true &&
    params.accountResolved === true
  ) {
    if (
      params.executionSmokeRequested === true &&
      (params.executionSmokeCompleted !== true || params.executionMatchedExpected !== true)
    ) {
      return "execution_failed";
    }
    if (
      params.toolCallCanaryRequested === true &&
      (
        params.toolCallCanaryCompleted !== true ||
        params.toolCallCanaryMatchedExpected !== true ||
        params.toolCallCanaryToolStarted !== true
      )
    ) {
      return "execution_failed";
    }
    return params.rateLimitsPresent === true ? "ready" : "rate_limits_unknown";
  }
  return "not_ready";
}

export function isCodexHarnessReadinessReady(
  status: CodexHarnessReadinessStatus,
): boolean {
  return status === "ready";
}
