export const CODEX_WORKSPACE_HANDOFF_ENV =
  "POLYNET_CODEX_WORKSPACE_HANDOFF_ENABLED";
export const CODEX_WORKSPACE_HANDOFF_LEGACY_ENV =
  "POLYNET_CODEX_HARNESS_PRIMARY_ENABLED";
export const CODEX_HARNESS_PROBE_MODE_ENV = "POLYNET_CODEX_HARNESS_PROBE_MODE";

type RuntimeInferenceSource = "free" | "platform" | "chatgpt" | "user_key";

export type CodexHarnessProbeMode =
  | "off"
  | "canary"
  | "execution_canary"
  | "shadow_turn"
  | "tool_call_canary";
export type CodexHarnessReadinessStatus =
  | "ready"
  | "not_ready"
  | "auth_failed"
  | "codex_missing"
  | "app_server_failed"
  | "execution_failed"
  | "rate_limits_unknown";

export type CodexWorkspaceHandoffBlockedReason =
  | "codex_workspace_disabled"
  | "project_workspace_required"
  | "chatgpt_subscription_required_for_first_slice";

export type CodexWorkspaceHandoffEligibility =
  | {
      ok: true;
      executionPlacement: "daytona_sidecar";
      authBridge: "chatgpt_subscription";
      codexHomePlacement: "sidecar_isolated_codex_home";
      toolProjection: "polynet_runtime_session";
    }
  | {
      ok: false;
      reason: CodexWorkspaceHandoffBlockedReason;
      message: string;
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

export function isCodexWorkspaceHandoffEnabled(
  env: Record<string, unknown> = (globalThis as any)?.process?.env ?? {},
): boolean {
  const primaryValue = env[CODEX_WORKSPACE_HANDOFF_ENV] ?? readEnv(CODEX_WORKSPACE_HANDOFF_ENV);
  if (String(primaryValue ?? "").trim()) return isEnabledFlagValue(primaryValue);
  return isEnabledFlagValue(
    env[CODEX_WORKSPACE_HANDOFF_LEGACY_ENV] ??
      readEnv(CODEX_WORKSPACE_HANDOFF_LEGACY_ENV),
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

export function resolveCodexWorkspaceHandoffEligibility(params: {
  handoffEnabled?: boolean;
  inferenceSource: RuntimeInferenceSource;
  projectId?: string | null;
}): CodexWorkspaceHandoffEligibility {
  const handoffEnabled =
    params.handoffEnabled ?? isCodexWorkspaceHandoffEnabled();
  if (!handoffEnabled) {
    return {
      ok: false,
      reason: "codex_workspace_disabled",
      message: "Codex workspace handoff is not enabled for this deployment.",
    };
  }
  if (!String(params.projectId ?? "").trim()) {
    return {
      ok: false,
      reason: "project_workspace_required",
      message: "Codex workspace handoff requires a bound project workspace.",
    };
  }
  if (params.inferenceSource !== "chatgpt") {
    return {
      ok: false,
      reason: "chatgpt_subscription_required_for_first_slice",
      message:
        "Codex workspace handoff currently requires a ChatGPT-backed runtime connection.",
    };
  }
  return {
    ok: true,
    executionPlacement: "daytona_sidecar",
    authBridge: "chatgpt_subscription",
    codexHomePlacement: "sidecar_isolated_codex_home",
    toolProjection: "polynet_runtime_session",
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
