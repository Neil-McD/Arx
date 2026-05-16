import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CODEX_HARNESS_EXECUTOR_ENV,
  CODEX_HARNESS_EXPERIMENT_ENV,
  CODEX_HARNESS_PROBE_MODE_ENV,
  buildCodexHarnessExecutorEventPayload,
  classifyCodexHarnessReadiness,
  isCodexHarnessExecutorEnabled,
  isCodexHarnessExperimentEnabled,
  isCodexHarnessReadinessReady,
  resolveCodexHarnessExecutorDecision,
  resolveCodexHarnessProbeMode,
  resolveCodexHarnessRoute,
} from "../shared/codexHarnessRoute.ts";
import {
  CODEX_HARNESS_PROBE_RESULT_MARKER,
  buildCodexHarnessProbeScript,
} from "../shared/codexHarnessProbeScript.ts";

const rootDir = process.cwd();

function readText(filePath: string): string {
  return readFileSync(path.join(rootDir, filePath), "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `expected source to include ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `expected source to include ${endNeedle}`);
  return source.slice(start, end);
}

function proveRouteSelection() {
  assert.equal(
    isCodexHarnessExperimentEnabled({ [CODEX_HARNESS_EXPERIMENT_ENV]: "true" }),
    true,
    "experiment flag should accept true",
  );
  assert.equal(
    isCodexHarnessExperimentEnabled({ [CODEX_HARNESS_EXPERIMENT_ENV]: "0" }),
    false,
    "experiment flag should stay off unless explicitly enabled",
  );
  assert.equal(
    isCodexHarnessExecutorEnabled({ [CODEX_HARNESS_EXECUTOR_ENV]: "true" }),
    true,
    "executor flag should accept true",
  );
  assert.equal(
    isCodexHarnessExecutorEnabled({ [CODEX_HARNESS_EXECUTOR_ENV]: "0" }),
    false,
    "executor flag should stay off unless explicitly enabled",
  );
  assert.equal(
    resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "canary" }),
    "canary",
    "probe mode should enter the Daytona canary only when explicitly requested",
  );
  assert.equal(
    resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "execution_canary" }),
    "execution_canary",
    "probe mode should support an explicit Codex execution smoke canary",
  );
  assert.equal(
    resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "shadow_turn" }),
    "shadow_turn",
    "probe mode should support an explicit real-turn Codex shadow run",
  );
  assert.equal(
    resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "tool_call_canary" }),
    "tool_call_canary",
    "probe mode should support an explicit Codex tool-call canary",
  );
  assert.equal(
    resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "true" }),
    "off",
    "probe mode should not treat generic truthy values as canary execution",
  );

  assert.deepEqual(
    resolveCodexHarnessRoute({
      experimentEnabled: false,
      runtimeExecutionMode: "agentic",
      inferenceSource: "chatgpt",
      projectId: "project-1",
      allowedToolNames: ["terminal_start"],
    }),
    {
      experimentEnabled: false,
      selected: false,
      reason: "experiment_disabled",
      engine: "polynet_native_kernel",
      executionPlacement: "convex_action",
      authBridge: "none",
      toolProjection: "current_runtime_session",
      codexHomePlacement: "none",
      updatePolicy: "current_deploy",
      requiresProjectWorkspace: false,
    },
    "disabled experiment must keep current harness",
  );

  assert.equal(
    resolveCodexHarnessRoute({
      experimentEnabled: true,
      runtimeExecutionMode: "chat",
      inferenceSource: "chatgpt",
      projectId: "project-1",
      allowedToolNames: ["terminal_start"],
    }).reason,
    "chat_turn_uses_current_harness",
    "chat-only turns should not enter the Codex app-server path",
  );
  assert.equal(
    resolveCodexHarnessRoute({
      experimentEnabled: true,
      runtimeExecutionMode: "agentic",
      inferenceSource: "chatgpt",
      projectId: null,
      allowedToolNames: ["terminal_start"],
    }).reason,
    "project_workspace_required",
    "first Codex harness slice should require a Daytona-backed project workspace",
  );
  assert.equal(
    resolveCodexHarnessRoute({
      experimentEnabled: true,
      runtimeExecutionMode: "agentic",
      inferenceSource: "platform",
      projectId: "project-1",
      allowedToolNames: ["terminal_start"],
    }).reason,
    "chatgpt_subscription_required_for_first_slice",
    "first Codex harness slice should not silently spend platform API-key quota",
  );
  assert.equal(
    resolveCodexHarnessRoute({
      experimentEnabled: true,
      runtimeExecutionMode: "agentic",
      inferenceSource: "chatgpt",
      projectId: "project-1",
      allowedToolNames: [],
    }).reason,
    "tool_surface_required",
    "agentic Codex route should require an explicit tool surface",
  );

  const selected = resolveCodexHarnessRoute({
    experimentEnabled: true,
    runtimeExecutionMode: "agentic",
    inferenceSource: "chatgpt",
    projectId: "project-1",
    allowedToolNames: ["terminal_start"],
  });
  assert.equal(selected.selected, true, "eligible turn should select Codex app-server candidate route");
  assert.equal(selected.engine, "codex_app_server");
  assert.equal(selected.executionPlacement, "daytona_sidecar");
  assert.equal(selected.authBridge, "chatgpt_subscription");
  assert.equal(selected.codexHomePlacement, "sidecar_isolated_codex_home");
  assert.equal(selected.updatePolicy, "pinned_daytona_runtime_image");

  const executorOff = resolveCodexHarnessExecutorDecision({
    route: selected,
    executorEnabled: false,
    runtimeExecutionMode: "agentic",
    stream: false,
    probeMode: "shadow_turn",
  });
  assert.deepEqual(
    executorOff,
    {
      executorEnabled: false,
      selected: false,
      mode: "off",
      reason: "executor_disabled",
      candidateEngine: "none",
      visibleAnswerEngine: "current_harness",
      executionPlacement: "none",
      fallbackPolicy: "current_harness",
      outputPolicy: "observe_only",
      writePolicy: "none",
      nonStreamingOnly: true,
    },
    "executor must default to off and leave the current harness visible",
  );
  assert.equal(
    resolveCodexHarnessExecutorDecision({
      route: selected,
      executorEnabled: true,
      runtimeExecutionMode: "agentic",
      stream: true,
      probeMode: "shadow_turn",
    }).reason,
    "streaming_not_supported",
    "executor candidate should not select streaming turns in the first slice",
  );
  assert.equal(
    resolveCodexHarnessExecutorDecision({
      route: selected,
      executorEnabled: true,
      runtimeExecutionMode: "agentic",
      stream: false,
      probeMode: "canary",
    }).reason,
    "shadow_turn_required",
    "executor candidate should require explicit shadow turn mode",
  );
  assert.doesNotMatch(
    readText("shared/codexHarnessRoute.ts"),
    /execution_canary_required/,
    "stale executor reasons should not imply that execution canary mode enables the real-turn executor",
  );
  const executorShadow = resolveCodexHarnessExecutorDecision({
    route: selected,
    executorEnabled: true,
    runtimeExecutionMode: "agentic",
    stream: false,
    probeMode: "shadow_turn",
  });
  assert.equal(executorShadow.selected, true, "eligible executor path should become a shadow candidate");
  assert.equal(executorShadow.mode, "shadow");
  assert.equal(executorShadow.candidateEngine, "codex_app_server");
  assert.equal(executorShadow.visibleAnswerEngine, "current_harness");
  assert.equal(executorShadow.outputPolicy, "shadow_no_user_visible_output");
  assert.equal(executorShadow.writePolicy, "read_only_first_slice");
  assert.deepEqual(
    buildCodexHarnessExecutorEventPayload({
      runId: "run-1",
      decision: executorShadow,
      probeMode: "shadow_turn",
    }),
    {
      run_id: "run-1",
      executor_enabled: true,
      selected: true,
      mode: "shadow",
      reason: "codex_app_server_shadow_candidate",
      candidate_engine: "codex_app_server",
      visible_answer_engine: "current_harness",
      execution_placement: "daytona_sidecar",
      fallback_policy: "current_harness_before_output",
      output_policy: "shadow_no_user_visible_output",
      write_policy: "read_only_first_slice",
      non_streaming_only: true,
      probe_mode: "shadow_turn",
    },
    "executor event payload should preserve current harness as the user-visible answer engine",
  );
}

function proveReadinessClassification() {
  assert.equal(
    classifyCodexHarnessReadiness({
      probeOk: true,
      codexPathPresent: true,
      appServerStarted: true,
      authApplied: true,
      accountResolved: true,
      rateLimitsPresent: true,
    }),
    "ready",
    "fully observed canary should be ready",
  );
  assert.equal(isCodexHarnessReadinessReady("ready"), true);
  assert.equal(isCodexHarnessReadinessReady("rate_limits_unknown"), false);
  assert.equal(
    classifyCodexHarnessReadiness({
      probeOk: true,
      codexPathPresent: true,
      appServerStarted: true,
      authApplied: true,
      accountResolved: true,
      rateLimitsPresent: false,
    }),
    "rate_limits_unknown",
    "account success without rate-limit evidence should stay distinct from ready",
  );
  assert.equal(
    classifyCodexHarnessReadiness({
      probeOk: true,
      codexPathPresent: true,
      appServerStarted: true,
      authApplied: true,
      accountResolved: true,
      rateLimitsPresent: true,
      executionSmokeRequested: true,
      executionSmokeCompleted: false,
      executionMatchedExpected: false,
    }),
    "execution_failed",
    "execution canary mode should require a completed matching Codex turn before reporting ready",
  );
  assert.equal(
    classifyCodexHarnessReadiness({
      probeOk: true,
      codexPathPresent: true,
      appServerStarted: true,
      authApplied: true,
      accountResolved: true,
      rateLimitsPresent: true,
      toolCallCanaryRequested: true,
      toolCallCanaryCompleted: true,
      toolCallCanaryMatchedExpected: true,
      toolCallCanaryToolStarted: false,
    }),
    "execution_failed",
    "tool-call canary mode should require a captured Codex tool start before reporting ready",
  );
  assert.equal(
    classifyCodexHarnessReadiness({ code: "provider_connection_required" }),
    "auth_failed",
    "missing ChatGPT connection should be classified as auth failure",
  );
  assert.equal(
    classifyCodexHarnessReadiness({ code: "codex_binary_missing" }),
    "codex_missing",
    "missing Codex binary should be classified as environment readiness failure",
  );
  assert.equal(
    classifyCodexHarnessReadiness({ code: "codex_app_server_spawn_failed" }),
    "app_server_failed",
    "Codex app-server spawn failures should be classified separately",
  );
  assert.equal(
    classifyCodexHarnessReadiness({
      code: "codex_probe_failed",
      stage: "auth_payload_read",
      codexPathPresent: false,
      appServerStarted: false,
      authApplied: false,
    }),
    "not_ready",
    "early probe bootstrap failures should not be mislabeled as missing Codex",
  );
}

function proveAuthBridgeShape() {
  const source = readText("convex/chatgptAuth.ts");
  const codexBridgeStart = source.indexOf("export async function resolveCodexChatgptAuthTokens");
  assert.notEqual(
    codexBridgeStart,
    -1,
    "ChatGPT auth module should expose a Codex app-server token bridge",
  );
  const codexBridgeSource = source.slice(codexBridgeStart);
  assert.match(
    codexBridgeSource,
    /getFreshChatgptAuthForUser/,
    "Codex auth bridge must reuse PolyNet's canonical ChatGPT connection store",
  );
  assert.match(
    codexBridgeSource,
    /type:\s*"chatgptAuthTokens"/,
    "Codex auth bridge must build the app-server chatgptAuthTokens payload",
  );
  assert.doesNotMatch(
    codexBridgeSource,
    /refreshToken/,
    "Codex sidecar auth payload must not expose durable ChatGPT refresh credentials",
  );
  assert.match(
    codexBridgeSource,
    /accessTokenExpiresAt/,
    "Codex auth bridge should keep token expiry visible for sidecar refresh timing",
  );
}

function proveRuntimeTraceOnlyIntegration() {
  const handlers = readText("convex/runtimeTurnHandlers.ts");
  assert.match(
    handlers,
    /resolveCodexHarnessRoute/,
    "runtime turn handler should resolve the experimental Codex route",
  );
  assert.match(
    handlers,
    /eventType:\s*"codex_harness_route_resolved"/,
    "runtime turn handler should persist Codex route decisions for audit",
  );
  assert.match(
    handlers,
    /eventType:\s*"codex_harness_executor_resolved"/,
    "runtime turn handler should persist Codex executor candidate decisions for audit",
  );
  assert.match(
    handlers,
    /resolveCodexHarnessExecutorDecision/,
    "runtime turn handler should resolve the executor candidate separately from route eligibility",
  );
  assert.match(
    handlers,
    /isCodexHarnessExecutorEnabled/,
    "executor candidate should require its own hard internal flag",
  );
  assert.match(
    handlers,
    /if \(codexHarnessRoute\.experimentEnabled\)/,
    "Codex route event should stay behind the experiment flag",
  );
  assert.match(
    handlers,
    /resolveCodexHarnessProbeMode/,
    "runtime turn route event should include the current canary probe mode",
  );
  assert.match(
    handlers,
    /executeChatToolsAgentLoop/,
    "current PolyNet harness must remain the active executor in this slice",
  );
  assert.match(
    handlers,
    /captureCodexHarnessShadowEvidence/,
    "runtime turn handler should capture Codex shadow evidence from real product-path run events",
  );
  assert.match(
    handlers,
    /appendCodexHarnessShadowComparisonBestEffort/,
    "runtime turn handler should compare visible current-harness output to hidden Codex shadow output",
  );
  assert.match(
    handlers,
    /eventType:\s*"codex_harness_shadow_comparison"/,
    "runtime turn handler should persist a safe visible-vs-shadow comparison event",
  );
  assert.match(
    handlers,
    /visible_answer_sha256/,
    "shadow comparison should hash visible output instead of storing raw visible text",
  );
  assert.match(
    handlers,
    /shadow_output_sha256/,
    "shadow comparison should use the existing hidden Codex output hash",
  );
  assert.doesNotMatch(
    sliceBetween(handlers, "async function appendCodexHarnessShadowComparisonBestEffort", "export type JsonResponseFn"),
    /visible_answer_text|shadow_output_text|raw_output|rawOutput/,
    "shadow comparison must not persist raw visible or shadow text",
  );
}

function proveDaytonaProbeBridge() {
  const httpDaytona = readText("convex/httpDaytona.ts");
  const codexBridge = readText("convex/codexHarnessBridge.ts");
  const probeScriptSource = readText("shared/codexHarnessProbeScript.ts");
  const generatedProbeScript = buildCodexHarnessProbeScript();

  assert.equal(
    CODEX_HARNESS_PROBE_RESULT_MARKER,
    "POLYNET_CODEX_HARNESS_PROBE_RESULT ",
    "probe marker should stay stable for parsing Daytona command output",
  );
  assert.match(
    httpDaytona,
    /from "\.\/codexHarnessBridge"/,
    "httpDaytona should call through the dedicated Codex bridge module",
  );
  assert.match(
    httpDaytona,
    /await executeCodexHarnessProbeIfSelected\(\{/,
    "retrieval loop should call the Codex bridge helper from the product path",
  );
  assert.doesNotMatch(
    httpDaytona,
    /buildCodexHarnessProbeScript|resolveCodexChatgptAuthTokens|uploadDaytonaToolboxFile|executeDaytonaCommand/,
    "httpDaytona should not retain the low-level Codex bridge implementation",
  );

  assert.match(
    generatedProbeScript,
    /POLYNET_CODEX_AUTH_FILE/,
    "probe should receive ChatGPT auth through a temporary file, not command args",
  );
  assert.match(
    generatedProbeScript,
    /unlinkSync\(authFile\)/,
    "probe should remove the short-lived auth file immediately after reading it",
  );
  assert.match(
    generatedProbeScript,
    /command -v codex/,
    "probe should verify the Codex binary exists in the Daytona environment",
  );
  assert.match(
    generatedProbeScript,
    /"app-server",\s*"--listen",\s*"stdio:\/\/"/,
    "probe should start Codex app-server over stdio",
  );
  assert.match(
    generatedProbeScript,
    /child\.once\("error"/,
    "probe should convert app-server spawn failures into structured results",
  );
  assert.match(
    generatedProbeScript,
    /codex_app_server_spawn_failed/,
    "probe should emit a stable app-server spawn failure code",
  );
  assert.match(
    generatedProbeScript,
    /rpc\.request\(\s*"initialize"[\s\S]*60000/,
    "probe should tolerate cold Codex app-server initialization in Daytona",
  );
  assert.match(
    generatedProbeScript,
    /CODEX_HOME/,
    "probe should isolate Codex state with a sidecar-specific CODEX_HOME",
  );
  assert.match(
    generatedProbeScript,
    /delete env\.OPENAI_API_KEY/,
    "subscription-auth probe should not inherit platform OpenAI API keys",
  );
  assert.match(
    generatedProbeScript,
    /delete env\.CODEX_API_KEY/,
    "subscription-auth probe should not inherit platform Codex API keys",
  );
  assert.match(
    generatedProbeScript,
    /account\/login\/start/,
    "probe should apply ChatGPT auth through Codex app-server login",
  );
  assert.match(
    generatedProbeScript,
    /account\/read",\s*\{\s*refreshToken:\s*false\s*\}/,
    "probe should read account state without requesting durable refresh credentials",
  );
  assert.match(
    generatedProbeScript,
    /account\/rateLimits\/read/,
    "probe should attempt to observe subscription rate limit state",
  );
  assert.match(
    generatedProbeScript,
    /thread\/start/,
    "execution canary should start a bounded Codex app-server thread",
  );
  assert.match(
    generatedProbeScript,
    /turn\/start/,
    "execution canary should start a bounded Codex app-server turn",
  );
  assert.match(
    generatedProbeScript,
    /:\s*\{\s*type:\s*"readOnly",\s*networkAccess:\s*false\s*\}/,
    "execution canary should use the Codex app-server tagged read-only sandbox policy",
  );
	  assert.match(
	    generatedProbeScript,
	    /primaryTurnRequested[\s\S]*type:\s*"workspaceWrite"[\s\S]*writableRoots:\s*\[process\.cwd\(\)\][\s\S]*networkAccess:\s*false[\s\S]*excludeTmpdirEnvVar:\s*true[\s\S]*excludeSlashTmp:\s*true/,
	    "primary Codex turns should use a Daytona workspace-only sandbox with network and temp access disabled",
	  );
	  assert.match(
	    generatedProbeScript,
	    /sandboxPolicyNetworkAccess = turnSandboxPolicy\.networkAccess === true/,
	    "probe results should expose the requested network policy instead of relying only on source inspection",
	  );
	  assert.match(
	    codexBridge,
	    /sandbox_policy_network_access/,
	    "primary completion events should persist requested sandbox policy evidence",
	  );
  assert.match(
    generatedProbeScript,
    /nativeToolSteps:\s*\[\]/,
    "probe script should return native Codex tool step evidence",
  );
  assert.match(
    generatedProbeScript,
    /item\/commandExecution\/outputDelta/,
    "probe script should capture native Codex command output deltas",
  );
  assert.match(
    generatedProbeScript,
    /item\/fileChange\/outputDelta/,
    "probe script should capture native Codex file-change output deltas",
  );
  assert.match(
    generatedProbeScript,
    /polynet codex execution ok/,
    "execution canary should use a deterministic expected response",
  );
  assert.match(
    generatedProbeScript,
    /POLYNET_CODEX_EXECUTION_MODE/,
    "probe should distinguish fixed canary execution from real-turn shadow execution",
  );
  assert.match(
    generatedProbeScript,
    /toolCallCanaryRequested = executionMode === "tool_call_canary"/,
    "probe script should support an explicit Codex read-only tool-call canary",
  );
  assert.match(
    generatedProbeScript,
    /Use the available read-only tools or shell to inspect the current working directory/,
    "tool-call canary should ask Codex to use the read-only tool surface instead of answering from memory",
  );
  assert.match(
    generatedProbeScript,
    /Do not mutate files, start servers, access network/,
    "tool-call canary should keep the Codex turn read-only and network-free",
  );
  assert.match(
    generatedProbeScript,
    /codex_tool_call_canary_no_tool_event/,
    "tool-call canary should fail if Codex completes without a captured tool event",
  );
  assert.match(
    generatedProbeScript,
    /primaryTurnRequested = executionMode === "primary_turn"/,
    "probe script should support visible Codex primary turns separately from hidden shadow turns",
  );
  assert.match(
    generatedProbeScript,
    /POLYNET_CODEX_RUNTIME_PROMPT_FILE/,
    "primary turn should pass PolyNet runtime context through a temporary prompt file",
  );
  assert.match(
    generatedProbeScript,
    /POLYNET_CODEX_RUNTIME_INSTRUCTIONS/,
    "primary turn should pass PolyNet runtime instructions separately from user prompt text",
  );
  assert.match(
    generatedProbeScript,
    /POLYNET_CODEX_SHADOW_PROMPT_FILE/,
    "shadow turn should pass the real user message through a temporary prompt file",
  );
  assert.match(
    generatedProbeScript,
    /unlinkSync\(promptFile\)/,
    "shadow and primary turns should remove the temporary prompt file after reading it",
  );
  assert.match(
    generatedProbeScript,
    /executionFinalTextSha256/,
    "shadow turn should hash Codex output instead of persisting raw output",
  );
  assert.match(
    generatedProbeScript,
    /shadowOutputSha256/,
    "shadow turn should expose only hashed output evidence",
  );
  assert.match(
    generatedProbeScript,
    /adapterEvents:\s*\[\]/,
    "execution canary should collect bounded Codex app-server adapter events",
  );
  assert.doesNotMatch(
    generatedProbeScript,
    /\bnotifications\s*:\s*\[\]/,
    "probe result must not retain raw Codex app-server notifications",
  );
  assert.doesNotMatch(
    generatedProbeScript,
    /result\.notifications/,
    "probe result must not push raw Codex app-server notifications into the result packet",
  );
  assert.match(
    generatedProbeScript,
    /adapterSummary:\s*\{/,
    "execution canary should collect a summarized notification count packet",
  );
  assert.match(
    generatedProbeScript,
    /function recordAdapterNotification\(message\)/,
    "probe should map Codex app-server notifications through an explicit adapter function",
  );
  for (const notificationMethod of [
    "thread/started",
    "turn/started",
    "item/started",
    "item/agentMessage/delta",
    "item/agentReasoning/delta",
    "turn/completed",
  ]) {
    assert.match(
      generatedProbeScript,
      new RegExp(notificationMethod.replaceAll("/", "\\/")),
      "adapter should recognize " + notificationMethod,
    );
  }
  assert.match(
    generatedProbeScript,
    /recordAdapterNotification\(message\);[\s\S]*handleExecutionNotification\(message\);/,
    "probe should record adapter events before execution collection consumes Codex notifications",
  );
  assert.match(
    generatedProbeScript,
    /type:\s*"thread_start_response"/,
    "adapter should include synthetic thread start response evidence",
  );
  assert.match(
    generatedProbeScript,
    /type:\s*"turn_start_response"/,
    "adapter should include synthetic turn start response evidence",
  );
  assert.match(
    generatedProbeScript,
    /type:\s*"execution_text_collected"/,
    "adapter should include final text collection evidence without exposing the raw text",
  );
  const assistantDeltaAdapterBlock = sliceBetween(
    generatedProbeScript,
    'if (method === "item/agentMessage/delta")',
    'if (method === "item/agentReasoning/delta")',
  );
  assert.match(
    assistantDeltaAdapterBlock,
    /delta_chars:\s*delta\.length/,
    "assistant delta adapter event should store only the delta length",
  );
  assert.doesNotMatch(
    assistantDeltaAdapterBlock,
    /\n\s*delta\s*:/,
    "assistant delta adapter event must not persist raw delta text",
  );
  const reasoningDeltaAdapterBlock = sliceBetween(
    generatedProbeScript,
    'if (method === "item/agentReasoning/delta")',
    'if (method === "turn/completed")',
  );
  assert.match(
    reasoningDeltaAdapterBlock,
    /delta_chars:\s*delta\.length/,
    "reasoning delta adapter event should store only the delta length",
  );
  assert.doesNotMatch(
    reasoningDeltaAdapterBlock,
    /\n\s*delta\s*:/,
    "reasoning delta adapter event must not persist raw delta text",
  );
  const shadowOutputBlock = sliceBetween(
    generatedProbeScript,
    "if (shadowTurnRequested) {",
    "pushAdapterEvent({",
  );
  assert.match(
    shadowOutputBlock,
    /result\.executionFinalText\s*=\s*null/,
    "shadow turn should clear the raw Codex final text before returning a result",
  );
  assert.match(
    shadowOutputBlock,
    /result\.shadowOutputSha256\s*=\s*sha256Text\(finalText\)/,
    "shadow turn should return a hash of Codex output instead of raw output",
  );
  assert.doesNotMatch(
    shadowOutputBlock,
    /shadowOutputText|shadow_output_text|raw_output|rawOutput/,
    "shadow turn result must not introduce raw output fields",
  );
  assert.match(
    generatedProbeScript,
    /account\/chatgptAuthTokens\/refresh/,
    "probe should handle Codex app-server refresh requests without receiving a refresh token",
  );
  assert.match(
    generatedProbeScript,
    /Unsupported Codex app-server request/,
    "probe should fail closed on unknown Codex app-server requests instead of returning ambiguous null approvals",
  );
  assert.match(
    probeScriptSource,
    /mkdirSync\(nativeHome,\s*\{\s*recursive:\s*true\s*\}\)/,
    "probe should create the isolated HOME directory before starting Codex",
  );

  assert.match(
    codexBridge,
    /resolveCodexChatgptAuthTokens/,
    "Daytona bridge should reuse PolyNet's canonical ChatGPT auth token resolver",
  );
  assert.match(
    codexBridge,
    /export function buildCodexAppServerRuntimeAgentHarness/,
    "Daytona bridge should expose a Codex app-server runtime harness adapter",
  );
  assert.match(
    codexBridge,
    /CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS/,
    "Codex app-server adapter should use the shared runtime harness descriptor",
  );
  assert.match(
    codexBridge,
    /buildCodexRuntimeHarnessSuccess/,
    "Codex app-server adapter should map assistant text into RuntimeAgentHarnessResult success shape",
  );
  assert.match(
    codexBridge,
    /buildCodexRuntimeHarnessFailure/,
    "Codex app-server adapter should map app-server failures into RuntimeAgentHarnessResult failure shape",
  );
  assert.match(
    codexBridge,
    /tool_projection:\s*"codex_native_workspace_tools_v0"/,
    "Codex primary adapter should explicitly declare native workspace tool projection",
  );
  assert.match(
    codexBridge,
    /readCodexPrimaryNativeToolSteps/,
    "Codex primary adapter should map native tool evidence into runtime steps",
  );
  assert.match(
    codexBridge,
    /eventType:\s*"codex_harness_primary_tool_event"/,
    "Codex primary adapter should emit primary native tool evidence events",
  );
  assert.match(
    codexBridge,
    /eventType:\s*"codex_harness_primary_started"[\s\S]*eventType:\s*"codex_harness_primary_completed"/,
    "Codex primary adapter should emit started/completed runtime evidence",
  );
  assert.match(
    codexBridge,
    /uploadDaytonaToolboxFile/,
    "Daytona bridge should upload the probe and temporary auth payload through the toolbox file API",
  );
  const scriptUploadIndex = codexBridge.indexOf("const scriptUpload = await uploadDaytonaToolboxFile");
  const authUploadIndex = codexBridge.indexOf("const authUpload = await uploadDaytonaToolboxFile");
  assert.ok(
    scriptUploadIndex >= 0 && authUploadIndex > scriptUploadIndex,
    "Daytona bridge should upload the non-secret probe script before the short-lived auth file",
  );
  assert.match(
    codexBridge,
    /chmod 600/,
    "Daytona bridge should tighten auth file permissions before running the probe",
  );
  assert.match(
    codexBridge,
    /POLYNET_CODEX_AUTH_FILE=\$\{shellQuote\(authPath\)\}/,
    "Daytona bridge should pass the temporary auth file into the node probe process environment",
  );
  assert.match(
    codexBridge,
    /POLYNET_CODEX_EXECUTION_MODE=\$\{shellQuote\(probeMode\)\}/,
    "Daytona bridge should pass the explicit Codex execution mode into the probe",
  );
  assert.match(
    codexBridge,
    /POLYNET_CODEX_EXECUTION_SMOKE=\$\{executionSmokeRequested \? "1" : "0"\}/,
    "Daytona bridge should keep Codex execution behind explicit execution canary mode",
  );
  assert.match(
    codexBridge,
    /resolveCodexHarnessExecutorDecision/,
    "Daytona bridge should re-check the executor decision before running real-turn shadow mode",
  );
  assert.match(
    codexBridge,
    /executorEnabled:\s*isCodexHarnessExecutorEnabled\(\)/,
    "real-turn shadow mode should require the hard executor flag inside the Daytona helper",
  );
  assert.match(
    codexBridge,
    /stream:\s*params\.stream/,
    "real-turn shadow mode should respect the runtime turn streaming boundary",
  );
  assert.match(
    codexBridge,
    /if \(!executorDecision\.selected\) return;/,
    "Daytona bridge should skip shadow execution when the executor decision is not selected",
  );
  assert.match(
    codexBridge,
    /POLYNET_CODEX_SHADOW_PROMPT_FILE=\$\{shellQuote\(shadowPromptPath \?\? ""\)\}/,
    "Daytona bridge should pass the real user message by temporary prompt file, not raw command text",
  );
  assert.match(
    codexBridge,
    /POLYNET_CODEX_TOOL_CANARY_FILE=\$\{shellQuote\(toolCallCanaryRequested \? toolCanaryFileName : ""\)\}/,
    "Daytona bridge should pass the tool-call canary file name through the probe environment",
  );
  assert.match(
    codexBridge,
    /POLYNET_CODEX_TOOL_CANARY_EXPECTED=\$\{shellQuote\(toolCallCanaryRequested \? toolCanaryExpectedText : ""\)\}/,
    "Daytona bridge should pass the expected tool-call canary contents through the probe environment",
  );
  for (const eventType of [
    "codex_harness_execution_started",
    "codex_harness_shadow_started",
    "codex_harness_thread_started",
    "codex_harness_event_adapter_summary",
    "codex_harness_event_adapter_event",
    "codex_harness_tool_call_started",
    "codex_harness_tool_call_completed",
    "codex_harness_tool_call_readiness",
    "codex_harness_execution_completed",
    "codex_harness_execution_readiness",
    "codex_harness_shadow_completed",
    "codex_harness_shadow_readiness",
  ]) {
    assert.match(
      codexBridge,
      new RegExp('eventType:\\s*"' + eventType + '"'),
      "Daytona bridge should emit " + eventType,
    );
  }
  assert.doesNotMatch(
    sliceBetween(
      codexBridge,
      'eventType: "codex_harness_tool_call_completed"',
      'eventType: "codex_harness_tool_call_readiness"',
    ),
    /final_text|executionFinalText"/,
    "tool-call canary completion should not persist raw file contents",
  );
  assert.match(
    codexBridge,
    /token\|authorization\|secret\|api\[_-\]\?key\|credential\|email/,
    "Codex harness events should redact account email and secret-bearing fields",
  );
  assert.match(
    codexBridge,
    /executeDaytonaCommand/,
    "Daytona bridge should run the probe inside the existing workspace session",
  );
  assert.match(
    codexBridge,
    /toolName:\s*"codex_harness_probe"/,
    "Daytona bridge should allocate workspace access through the existing execution session",
  );
  assert.match(
    codexBridge,
    /if \(!route\.selected\) return;/,
    "Daytona bridge should stay inert unless the experimental Codex route is selected",
  );
  assert.match(
    codexBridge,
    /const probeMode = resolveCodexHarnessProbeMode\(\)/,
    "Daytona bridge should resolve explicit probe mode before doing sidecar work",
  );
  assert.match(
    codexBridge,
    /readLatestUserMessageTextForCodexShadow\(params\.messages\)/,
    "shadow turn should use the latest real user message from the active PolyNet turn",
  );
  assert.match(
    httpDaytona,
    /messages:\s*params\.messages/,
    "retrieval loop should pass the real turn messages into the Codex shadow helper",
  );
  assert.match(
    httpDaytona,
    /stream:\s*params\.stream \?\? false/,
    "retrieval loop should pass the real product turn stream setting into the Codex shadow helper",
  );
  assert.match(
    codexBridge,
    /if \(probeMode === "off"\) return;/,
    "Daytona bridge should not run the probe on every eligible turn",
  );
  const parseErrorBlock = sliceBetween(
    codexBridge,
    'eventKeySuffix: "parse_error"',
    "await emitCodexHarnessReadinessEvent({",
  );
  assert.doesNotMatch(
    parseErrorBlock,
    /output_preview|stdout_preview|stderr_preview/,
    "parse failures must not persist raw command output previews",
  );
  assert.match(
    parseErrorBlock,
    /stdout_chars/,
    "parse failures may persist command output length for debugging without storing raw output",
  );
  assert.match(
    codexBridge,
    /eventType:\s*"codex_harness_readiness"/,
    "Daytona bridge should emit the durable readiness event",
  );
  assert.match(
    codexBridge,
    /classifyCodexHarnessReadiness/,
    "Daytona bridge should normalize canary outcomes into readiness statuses",
  );
  assert.match(
    codexBridge,
    /status:\s*"not_ready"/,
    "Daytona bridge should preserve a generic not-ready state for workspace/upload failures",
  );
  assert.match(
    codexBridge,
    /codex_harness_app_server_started/,
    "runtime events should record whether Codex app-server started",
  );
  assert.match(
    codexBridge,
    /codex_harness_auth_applied/,
    "runtime events should record whether ChatGPT auth was accepted by Codex",
  );
  assert.match(
    codexBridge,
    /codex_harness_account_resolved/,
    "runtime events should record sanitized Codex account resolution",
  );
  assert.match(
    codexBridge,
    /codex_harness_rate_limits_updated/,
    "runtime events should record sanitized rate limit observations when available",
  );
  assert.match(
    httpDaytona,
    /codex_probe_unhandled/,
    "probe failures should fail open back to the existing PolyNet harness",
  );
}

proveRouteSelection();
proveReadinessClassification();
proveAuthBridgeShape();
proveRuntimeTraceOnlyIntegration();
proveDaytonaProbeBridge();
console.log("PASS: Codex harness bridge keeps current runtime active, probes Daytona safely, and scopes ChatGPT auth");
