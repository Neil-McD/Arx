import { readFileSync } from "node:fs";
import process from "node:process";

type Check = {
  name: string;
  ok: boolean;
  detail?: string;
};

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function check(name: string, ok: boolean, detail?: string): Check {
  return { name, ok, detail };
}

function main() {
  const shared = read("shared/codexBridgeContract.ts");
  const token = read("convex/codexBridgeToken.ts");
  const http = read("convex/httpCodexBridge.ts");
  const httpRoot = read("convex/http.ts");
  const threads = read("convex/threads.ts");
  const operatorDashboard = read("convex/operatorDashboard.ts");
  const blaxel = read("convex/blaxelWorkspaceClient.ts");
  const smoke = read("convex/codexBridgeSmoke.ts");
  const codexExecSmoke = read("convex/codexBridgeCodexExecSmoke.ts");
  const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
  const runtimeTurnResolution = read("convex/runtimeTurnResolution.ts");
  const operatorGate = read("convex/codexBridgeOperatorGate.ts");
  const codexBridgeGateway = read("shared/cloudCodexBridgeGateway.ts");
  const webWorkspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");
  const webWorkspaceRightPanel = read("apps/web/src/components/WebWorkspaceRightPanel.tsx");
  const operatorPlatformPanel = read("apps/web/src/components/OperatorPlatformPanelView.tsx");
  const echoSmokeScript = read("scripts/codex_bridge_echo_smoke.ts");
  const codexExecSmokeScript = read("scripts/codex_bridge_codex_exec_smoke.ts");
  const operatorTokenScript = read("scripts/codex_bridge_operator_token.ts");
  const stagingGuard = read("scripts/blaxel_staging_readiness_guard.sh");
  const docs = read("docs/codex-blaxel-bridge-poc.md");
  const envExample = read(".env.example");
  const stagingEnvExample = read(".env.staging.local.example");
  const packageJson = read("package.json");
  const smokeMintIndex = smoke.indexOf("const minted = await mintCodexBridgeRunToken");
  const smokeRunStartIndex = smoke.indexOf("ensureCloudRuntimeRunStartedByBridgeInternal");
  const codexExecMintIndex = codexExecSmoke.indexOf("const minted = await mintCodexBridgeRunToken");
  const codexExecRunStartIndex = codexExecSmoke.indexOf("ensureCloudRuntimeRunStartedByBridgeInternal");
  const blaxelUnavailableIndex = blaxel.indexOf("WORKLOAD_UNAVAILABLE");
  const blaxelNotFoundIndex = blaxel.indexOf("404|not found|not_found|does not exist");
  const publicFinishMutationStart = threads.indexOf("export const finishCloudRuntimeRun = mutation({");
  const bridgeFinishMutationStart = threads.indexOf(
    "export const finishCloudRuntimeRunByBridgeClaimsInternal = internalMutation({",
  );
  const publicFinishMutation =
    publicFinishMutationStart >= 0 && bridgeFinishMutationStart > publicFinishMutationStart
      ? threads.slice(publicFinishMutationStart, bridgeFinishMutationStart)
      : "";
  const bridgeFinishMutation =
    bridgeFinishMutationStart >= 0 ? threads.slice(bridgeFinishMutationStart) : "";
  const fallbackUseTargets = [
    shared,
    smoke,
    codexExecSmoke,
    operatorGate,
    echoSmokeScript,
    codexExecSmokeScript,
    operatorTokenScript,
    docs,
    envExample,
    stagingEnvExample,
  ].join("\n");

  const checks: Check[] = [
    check(
      "shared_contract_exports_run_scoped_env",
      /CODEX_BRIDGE_TOKEN_ENV_NAME = "POLYNET_CODEX_BRIDGE_TOKEN"/.test(shared) &&
        /CODEX_BRIDGE_EVENT_URL_ENV_NAME/.test(shared) &&
        /CODEX_BRIDGE_FINISH_URL_ENV_NAME/.test(shared) &&
        /CODEX_BRIDGE_OPERATOR_SECRET_ENV_NAME = "POLYNET_CODEX_BRIDGE_OPERATOR_SECRET"/.test(shared),
    ),
    check(
      "smoke_actions_are_operator_token_gated",
      /verifyCodexBridgeOperatorToken/.test(operatorGate) &&
        /CODEX_BRIDGE_OPERATOR_TOKEN_ISSUER/.test(operatorGate) &&
        /fixedTimeEqual/.test(operatorGate) &&
        /operatorToken: v\.string\(\)/.test(smoke) &&
        /operatorToken: v\.string\(\)/.test(codexExecSmoke) &&
        /verifyCodexBridgeOperatorToken\(args\.operatorToken/.test(smoke) &&
        /verifyCodexBridgeOperatorToken\(args\.operatorToken/.test(codexExecSmoke) &&
        /mintCodexBridgeOperatorToken/.test(echoSmokeScript) &&
        /mintCodexBridgeOperatorToken/.test(codexExecSmokeScript) &&
        /operatorToken: parsed\.operatorToken/.test(echoSmokeScript) &&
        /operatorToken: parsed\.operatorToken/.test(codexExecSmokeScript) &&
        /delete childEnv\.POLYNET_CODEX_BRIDGE_OPERATOR_SECRET/.test(echoSmokeScript) &&
        /delete childEnv\.POLYNET_CODEX_BRIDGE_OPERATOR_SECRET/.test(codexExecSmokeScript) &&
        !/--operator-secret/.test(echoSmokeScript) &&
        !/--operator-secret/.test(codexExecSmokeScript),
    ),
    check(
      "operator_token_binds_smoke_scope",
      /normalizeCodexBridgeBaseUrlOrigin/.test(shared) &&
        /projectId: string/.test(operatorTokenScript) &&
        /threadId: string/.test(operatorTokenScript) &&
        /baseUrl\?: string \| null/.test(operatorTokenScript) &&
        /payload\.projectId !== params\.projectId/.test(operatorGate) &&
        /payload\.threadId !== params\.threadId/.test(operatorGate) &&
        /payload\.baseUrlOrigin !== expectedBaseUrlOrigin/.test(operatorGate) &&
        /projectId: String\(args\.projectId\)/.test(smoke) &&
        /threadId: String\(args\.threadId\)/.test(smoke) &&
        /projectId: String\(args\.projectId\)/.test(codexExecSmoke) &&
        /threadId: String\(args\.threadId\)/.test(codexExecSmoke) &&
        /projectId,\s*threadId,\s*baseUrl/.test(echoSmokeScript) &&
        /projectId,\s*threadId,\s*baseUrl/.test(codexExecSmokeScript),
    ),
    check(
      "operator_token_can_be_minted_server_side_after_role_gate",
      /export async function mintCodexBridgeOperatorTokenForServer/.test(operatorGate) &&
        /CODEX_BRIDGE_OPERATOR_TOKEN_MAX_TTL_MS/.test(operatorGate) &&
        /crypto\.randomUUID\(\)/.test(operatorGate) &&
        /baseUrlOrigin/.test(operatorGate) &&
        /startOperatorCodexBridgeCodexExecRun/.test(codexExecSmoke) &&
        /operatorAccess\.getOperatorWriteAccessInternal/.test(codexExecSmoke) &&
        /mintCodexBridgeOperatorTokenForServer/.test(codexExecSmoke) &&
        /deploymentKind !== "staging"/.test(codexExecSmoke) &&
        /ctx\.runAction/.test(codexExecSmoke),
    ),
    check(
      "token_uses_dedicated_hmac_secret",
      /CODEX_BRIDGE_SIGNING_SECRET_ENV_NAME = "ARX_CODEX_BRIDGE_SIGNING_SECRET"/.test(token) &&
        /crypto\.subtle\.sign\("HMAC"/.test(token) &&
        /crypto\.subtle\.verify\(\s*"HMAC"/.test(token),
    ),
    check(
      "token_enforces_operation_and_expiry",
      /requiredOperation/.test(token) &&
        /claims\.expiresAt <= nowMs/.test(token) &&
        /codex_bridge_token_operation_denied/.test(token),
    ),
    check(
      "token_ttl_is_capped",
      /CODEX_BRIDGE_MAX_TOKEN_TTL_MS = 15 \* 60 \* 1000/.test(token) &&
        /Math\.min\(CODEX_BRIDGE_MAX_TOKEN_TTL_MS, Math\.max\(1_000, Math\.floor\(params\.ttlMs\)\)\)/.test(token),
    ),
    check(
      "http_routes_are_registered",
      /registerCodexBridgeRoutes/.test(httpRoot) &&
        /path: "\/runtime\/codex_bridge\/event"/.test(http) &&
        /path: "\/runtime\/codex_bridge\/finish"/.test(http) &&
        /path: "\/runtime\/codex_bridge\/context"/.test(http),
    ),
    check(
      "http_routes_use_bridge_token_not_user_bearer",
      /verifyCodexBridgeRunToken/.test(http) &&
        !/requireAuthenticatedActor|requireAuthenticatedSubject/.test(http),
    ),
    check(
      "http_routes_write_existing_ledger_internal_mutations",
      /appendCloudRuntimeRunEventByBridgeClaimsInternal/.test(http) &&
        /finishCloudRuntimeRunByBridgeClaimsInternal/.test(http),
    ),
    check(
      "http_context_route_uses_context_operation_and_audits_fetch",
      /requiredOperation: "context"/.test(http) &&
        /loadRuntimeTurnContextPacketForRun/.test(http) &&
        /buildRuntimeTurnContextSnapshot/.test(http) &&
        /CodexBridgeContextHttpResponseV1/.test(shared) &&
        /const httpResponse: CodexBridgeContextHttpResponseV1/.test(http) &&
        /contextResponse\?\.context\?\.contextPrompt/.test(codexExecSmoke) &&
        /eventType: "codex_bridge_context_fetched"/.test(http),
    ),
    check(
      "http_null_timestamps_are_omitted",
      /if \(raw === null \|\| raw === undefined\) return undefined/.test(http) &&
        /typeof raw === "string" && raw\.trim\(\) === ""/.test(http),
    ),
    check(
      "threads_have_bridge_start_append_finish",
      /ensureCloudRuntimeRunStartedByBridgeInternal/.test(threads) &&
        /appendCloudRuntimeRunEventByBridgeClaimsInternal/.test(threads) &&
        /finishCloudRuntimeRunByBridgeClaimsInternal/.test(threads) &&
        /getCloudThreadRuntimeContextByOwnerInternal/.test(threads) &&
        /resolveCodexBridgeRunScopeInternal/.test(threads),
    ),
    check(
      "threads_validate_bridge_scope",
      /run_project_scope_conflict/.test(threads) &&
        /run_community_scope_conflict/.test(threads) &&
        /runtime_run_not_running/.test(threads) &&
        /bridge_project_scope_conflict/.test(threads) &&
        /bridge_project_owner_conflict/.test(threads) &&
        /bridge_existing_run_scope_conflict/.test(threads) &&
        /bridge_existing_run_contract_conflict/.test(threads),
    ),
    check(
      "bridge_run_scope_is_thread_canonical",
      /async function resolveCodexBridgeRunScope/.test(threads) &&
        /const thread = \(await args\.ctx\.db\.get\(args\.threadId\)\)/.test(threads) &&
        /const projectId = normalizeIdValue\(thread\.projectId\)/.test(threads) &&
        /expectedProjectId && expectedProjectId !== projectId/.test(threads) &&
        /resolveRuntimeRunCanonicalCommunityLens/.test(threads) &&
        /resolveCodexBridgeRunScopeInternal/.test(smoke) &&
        /resolveCodexBridgeRunScopeInternal/.test(codexExecSmoke) &&
        !/getCloudProjectByIdInternal/.test(smoke) &&
        !/getCloudProjectByIdInternal/.test(codexExecSmoke),
    ),
    check(
      "bridge_start_resolves_and_writes_canonical_scope",
      /export const ensureCloudRuntimeRunStartedByBridgeInternal = internalMutation\({[\s\S]*const scope = await resolveCodexBridgeRunScope/.test(
        threads,
      ) &&
        /expectedProjectId: args\.projectId/.test(threads) &&
        /expectedCommunityId: args\.communityId/.test(threads) &&
        /bridge_owner_scope_conflict/.test(threads) &&
        /projectId: scope\.projectId/.test(threads) &&
        /communityId: scope\.communityId/.test(threads) &&
        /communityContextVersion: scope\.communityContextVersion/.test(threads) &&
        !/projectId: args\.projectId,[\s\S]*communityId: runtimeCommunityLens\.communityId/.test(
          threads,
        ),
    ),
    check(
      "bridge_start_reuses_only_matching_hidden_bridge_runs",
      /function assertExistingCodexBridgeRunMatchesScope/.test(threads) &&
        /args\.run\.status !== "running"/.test(threads) &&
        /args\.run\.visibility !== "internal_hidden"/.test(threads) &&
        /String\(args\.run\.contractName \?\? ""\)\.trim\(\) !== args\.contractName/.test(
          threads,
        ) &&
        /String\(args\.run\.contractVersion \?\? ""\)\.trim\(\) !== args\.contractVersion/.test(
          threads,
        ) &&
        /String\(args\.run\.executionMode \?\? ""\)\.trim\(\) !== args\.executionMode/.test(
          threads,
        ) &&
        /normalizeIdValue\(args\.run\.projectId\) !== normalizeIdValue\(args\.scope\.projectId\)/.test(
          threads,
        ) &&
        /normalizeIdValue\(args\.run\.communityId\)/.test(threads),
    ),
    check(
      "bridge_start_reconciles_stale_running_run_before_blocking",
      /let runningRun = await getRunningRuntimeRunByThread/.test(threads) &&
        /isRuntimeRunStale\(\{ run: runningRun, nowMs \}\)/.test(threads) &&
        /reason: "stale_bridge_run_reconciled"/.test(threads) &&
        /errorCode: "stale_bridge_run_reconciled"/.test(threads) &&
        /Previous hidden Codex bridge run lost liveness/.test(threads) &&
        /runningRun = await getRunningRuntimeRunByThread/.test(threads) &&
        /if \(runningRun && runningRun\.runId !== runId\) throw new Error\("thread_run_in_progress"\)/.test(
          threads,
        ),
    ),
    check(
      "internal_hidden_runs_are_evidence_only",
      /if \(args\.run\.visibility === "internal_hidden"\) return;/.test(threads) &&
        /const shouldUpdateThreadWorkingState = run\.visibility !== "internal_hidden"/.test(threads) &&
        /if \(shouldUpdateThreadWorkingState && workingState\) \{[\s\S]*await args\.ctx\.db\.patch\(args\.thread\._id/.test(
          threads,
        ),
    ),
    check(
      "blaxel_command_accepts_env",
      /env\?: Record<string, string> \| null/.test(blaxel) &&
        /normalizeCommandEnv/.test(blaxel) &&
        /\.\.\(commandEnv \? \{ env: commandEnv \}/.test(blaxel),
    ),
    check(
      "blaxel_command_retries_workload_warmup",
      blaxelUnavailableIndex >= 0 &&
        blaxelNotFoundIndex >= 0 &&
        blaxelUnavailableIndex < blaxelNotFoundIndex &&
        /loadReadyBlaxelWorkspaceSandbox/.test(blaxel) &&
        /normalizePositiveInteger\(params\.timeoutMs, 5_000\)/.test(blaxel) &&
        /sandbox\.wait\(\{[\s\S]*maxWait: Math\.min\(remainingMs, intervalMs\)/.test(blaxel) &&
        /sandbox = await params\.SandboxInstance\.get\(sandboxName\);[\s\S]*const state = sandboxStateFrom\(sandbox\);/.test(blaxel) &&
        /loadBlaxelWorkspaceSandboxForOperation/.test(blaxel) &&
        /readyTimeoutMs\?: number \| null/.test(blaxel) &&
        /executeBlaxelWorkspaceCommandOnce/.test(blaxel) &&
        /const resolved = await loadBlaxelWorkspaceSandboxForOperation\(\{[\s\S]*sandboxName: params\.sandboxName/.test(blaxel) &&
        /const sandbox = resolved\.sandbox/.test(blaxel) &&
        /readyRetryMs\?: number \| null/.test(blaxel) &&
        /BLAXEL_WORKSPACE_COMMAND_READY_RETRY_MS", 5_000/.test(blaxel) &&
        /result\.code !== "blaxel_sandbox_not_ready"/.test(blaxel) &&
        /readyRetryMs: 60_000/.test(smoke) &&
        /readyRetryMs: 60_000/.test(codexExecSmoke),
    ),
    check(
      "smoke_passes_token_via_env_not_command",
      /command: ECHO_COMMAND/.test(smoke) &&
        /\[CODEX_BRIDGE_TOKEN_ENV_NAME\]: minted\.token/.test(smoke) &&
        !/Bearer \$\{minted\.token\}|Bearer " \+ minted\.token/.test(smoke),
    ),
    check(
      "smoke_mints_token_before_run_start",
      smokeMintIndex >= 0 &&
        smokeRunStartIndex >= 0 &&
        smokeMintIndex < smokeRunStartIndex,
    ),
    check(
      "codex_exec_smoke_uses_real_codex_jsonl_and_context",
      /smokeCodexBridgeCodexExec/.test(codexExecSmoke) &&
        /"exec",[\s\S]*"--json"/.test(codexExecSmoke) &&
        /"--dangerously-bypass-approvals-and-sandbox"/.test(codexExecSmoke) &&
        /CODEX_BRIDGE_CONTEXT_URL_ENV_NAME/.test(codexExecSmoke) &&
        /operations: \["event", "finish", "context"\]/.test(codexExecSmoke) &&
        /eventType: "codex_exec_final"/.test(codexExecSmoke),
    ),
    check(
      "codex_exec_supports_real_thread_turn_mode",
      /POLYNET_CODEX_BRIDGE_MODE/.test(codexExecSmoke) &&
        /mode === "thread_turn"/.test(codexExecSmoke) &&
        /USER_REQUEST/.test(codexExecSmoke) &&
        /final_text_nonempty/.test(codexExecSmoke) &&
        /codex_bridge_thread_turn/.test(codexExecSmoke) &&
        /startOperatorCodexBridgeThreadTurnAsync/.test(codexExecSmoke) &&
        /userMessageKey/.test(codexExecSmoke) &&
        /threads\.addCloudThreadMessage/.test(codexExecSmoke) &&
        /user:\$\{params\.runId\}:codex_bridge_prompt/.test(codexExecSmoke) &&
        /runtimeCaller: v\.optional\(v\.boolean\(\)\)/.test(codexExecSmoke) &&
        /POLYNET_ENABLE_CODEX_BRIDGE_RUNTIME_TURNS/.test(codexExecSmoke) &&
        /threads\.getCloudThreadById/.test(codexExecSmoke) &&
        /runtimeAuthorized/.test(codexExecSmoke) &&
        /reconcileOperatorCodexBridgeCodexExecRun/.test(codexExecSmoke) &&
        /codex_bridge_thread_turn_async/.test(codexExecSmoke),
    ),
    check(
      "runtime_turn_can_explicitly_request_codex_bridge_harness",
      /requested_harness\?: "codex_bridge" \| null/.test(runtimeTurnResolution) &&
        /isCodexBridgeRuntimeHarnessRequested/.test(runtimeTurnHandlers) &&
        /String\(input\.requested_harness \?\? ""\)\.trim\(\) === "codex_bridge"/.test(runtimeTurnHandlers) &&
        /buildCodexBridgeRuntimeRunId/.test(runtimeTurnHandlers) &&
        /runtimeCaller: true/.test(runtimeTurnHandlers) &&
        /CODEX_BRIDGE_RUNTIME_RECONCILE_AFTER_MS/.test(runtimeTurnHandlers) &&
        /reconcileOperatorCodexBridgeCodexExecRun/.test(runtimeTurnHandlers) &&
        /loadCodexBridgeRuntimeSnapshot/.test(runtimeTurnHandlers) &&
        /event: "runtime_event"/.test(runtimeTurnHandlers) &&
        /engine_id: "codex_blaxel_bridge"/.test(runtimeTurnHandlers) &&
        /assistant:\$\{args\.runId\}:codex_bridge_final/.test(runtimeTurnHandlers) &&
        !/requested_harness: "codex_bridge"/.test(webWorkspaceHost),
    ),
    check(
      "codex_exec_smoke_streams_jsonl_while_running",
      /const \{ spawn, spawnSync \} = require\("node:child_process"\)/.test(codexExecSmoke) &&
        /async function runCodexExecStreaming/.test(codexExecSmoke) &&
        /const child = spawn\(command, args/.test(codexExecSmoke) &&
        /child\.stdout\.on\("data"/.test(codexExecSmoke) &&
        /eventPostQueue = eventPostQueue\.then/.test(codexExecSmoke) &&
        /async function handleCodexJsonlLine/.test(codexExecSmoke) &&
        /eventType: "codex_exec_stream_started"/.test(codexExecSmoke) &&
        /eventKey: "codex_exec_jsonl:" \+ eventIndex/.test(codexExecSmoke) &&
        /streamed_jsonl_event_count/.test(codexExecSmoke) &&
        /evidence\.codexJsonlStreamStarted/.test(codexExecSmoke) &&
        /"codexJsonlStreamStarted"/.test(codexExecSmokeScript) &&
        !/const lines = stdout\.split/.test(codexExecSmoke),
    ),
    check(
      "codex_exec_smoke_redacts_process_output_from_ledger",
      /summarizeCodexJsonlEvent/.test(codexExecSmoke) &&
        /final_text_matches_marker/.test(codexExecSmoke) &&
        !/stdout_preview|stderr_preview/.test(codexExecSmoke) &&
        !/final_text: clipText\(finalText/.test(codexExecSmoke) &&
        !/errorMessage: status === "succeeded" \? null : errorMessage/.test(codexExecSmoke),
    ),
    check(
      "async_codex_exec_persists_process_handle",
      /startOperatorCodexBridgeCodexExecRunAsync/.test(codexExecSmoke) &&
        /eventType: "codex_exec_process_started"/.test(codexExecSmoke) &&
        /eventKey: "codex_exec_process_started"/.test(codexExecSmoke) &&
        /process_name: processName/.test(codexExecSmoke) &&
        /provider_command_id: commandResult\.providerCommandId \?\? processName/.test(codexExecSmoke) &&
        /codex_exec_process_started_event_failed/.test(codexExecSmoke),
    ),
    check(
      "async_codex_exec_has_operator_reconcile_path",
      /readBlaxelWorkspaceProcess/.test(codexExecSmoke) &&
        /stopBlaxelWorkspaceProcess/.test(codexExecSmoke) &&
        /reconcileOperatorCodexBridgeCodexExecRun/.test(codexExecSmoke) &&
        /deploymentKind !== "staging"/.test(codexExecSmoke) &&
        /operatorAccess\.getOperatorWriteAccessInternal/.test(codexExecSmoke) &&
        /eventType: "codex_exec_process_observed"/.test(codexExecSmoke) &&
        /finishStaleRunning/.test(codexExecSmoke) &&
        /codex_exec_process_stale_timeout/.test(codexExecSmoke) &&
        /status: reconciledStatus/.test(codexExecSmoke) &&
        /assistantText: reconciledStatus === "ok" \? CODEX_EXEC_MARKER : undefined/.test(
          codexExecSmoke,
        ),
    ),
    check(
      "codex_bridge_has_non_codex_blaxel_process_lifecycle_probe",
      /probeOperatorCodexBridgeBlaxelProcessLifecycle/.test(codexExecSmoke) &&
        /deploymentKind !== "staging"/.test(codexExecSmoke) &&
        /operatorAccess\.getOperatorWriteAccessInternal/.test(codexExecSmoke) &&
        /resolveCodexBridgeRunScopeInternal/.test(codexExecSmoke) &&
        /lifecycleIntent: "agent_run"/.test(codexExecSmoke) &&
        /purpose: "codex_bridge_blaxel_process_probe"/.test(codexExecSmoke) &&
        /POLYNET_BLAXEL_PROCESS_PROBE_MARKER/.test(codexExecSmoke) &&
        /waitForCompletion: false/.test(codexExecSmoke) &&
        /const firstRead = await readBlaxelWorkspaceProcess/.test(codexExecSmoke) &&
        /await sleep\(waitMs\)/.test(codexExecSmoke) &&
        /const secondRead = await readBlaxelWorkspaceProcess/.test(codexExecSmoke) &&
        /const stopped = await stopBlaxelWorkspaceProcess/.test(codexExecSmoke),
    ),
    check(
      "codex_bridge_process_terminal_state_respects_running_status",
      /function isProcessTerminal\(read: Record<string, unknown> \| null\): boolean \{[\s\S]*if \(!read\) return false;[\s\S]*if \(isProcessRunning\(read\)\) return false;[\s\S]*processExitCode\(read\.exitCode\) !== null/.test(
        codexExecSmoke,
      ),
    ),
    check(
      "codex_exec_finish_carries_bounded_assistant_output",
      /assistantText\?: string \| null/.test(shared) &&
        /assistantModelId\?: string \| null/.test(shared) &&
        /assistantText: status === "succeeded" \? clipText\(finalText, 20_000\) : null/.test(
          codexExecSmoke,
        ) &&
        /assistantModelId: model \|\| null/.test(codexExecSmoke) &&
        /assistantText: safeOptionalText\(parsed\.body\.assistantText, 20_000\)/.test(http) &&
        /assistantModelId: safeOptionalText\(parsed\.body\.assistantModelId, 160\)/.test(http) &&
        /assistantText: request\.assistantText/.test(http) &&
        /assistantModelId: request\.assistantModelId/.test(http),
    ),
    check(
      "bridge_assistant_output_is_internal_claims_only",
      publicFinishMutationStart >= 0 &&
        bridgeFinishMutationStart >= 0 &&
        !/assistantText|assistantModelId/.test(publicFinishMutation) &&
        /assistantText: v\.optional\(v\.string\(\)\)/.test(bridgeFinishMutation) &&
        /assistantModelId: v\.optional\(v\.string\(\)\)/.test(bridgeFinishMutation),
    ),
    check(
      "bridge_finish_persists_idempotent_assistant_message",
      /function normalizeBridgeAssistantText/.test(threads) &&
        /text\.length > 20_000 \? text\.slice\(0, 20_000\) : text/.test(threads) &&
        /function normalizeBridgeAssistantModelId/.test(threads) &&
        /async function upsertCodexBridgeAssistantMessageForRun/.test(threads) &&
        threads.includes("const messageKey = `assistant:${runId}:codex_bridge_final`;") &&
        /withIndex\("by_owner_messageKey"/.test(threads) &&
        /if \(existing\.threadId !== args\.thread\._id\) throw new Error\("message_key_conflict"\)/.test(
          threads,
        ) &&
        /role: "assistant"/.test(threads) &&
        /engineId: "codex_blaxel_bridge"/.test(threads) &&
        /inference_source: "codex_bridge"/.test(threads) &&
        /status === "ok"[\s\S]*upsertCodexBridgeAssistantMessageForRun/.test(bridgeFinishMutation) &&
        /assistantText: args\.assistantText/.test(bridgeFinishMutation) &&
        /assistantModelId: args\.assistantModelId/.test(bridgeFinishMutation),
    ),
    check(
      "run_finished_links_persisted_bridge_assistant_message",
      /assistantMessage\?: CloudMessageLike \| null/.test(threads) &&
        /assistant_message_id: args\.assistantMessage \? String\(args\.assistantMessage\._id\) : null/.test(
          threads,
        ) &&
        /assistant_message_key: args\.assistantMessage\?\.messageKey \?\? null/.test(threads) &&
        /assistant_message_seq:/.test(threads) &&
        /assistantMessage,/.test(bridgeFinishMutation),
    ),
    check(
      "codex_exec_smoke_uses_ephemeral_codex_home",
      /const safeRunId = runId\.replace/.test(codexExecSmoke) &&
        /const codexHome = "\/tmp\/polynet-codex-home-"/.test(codexExecSmoke) &&
        /delete execEnv\.OPENAI_API_KEY/.test(codexExecSmoke) &&
        /rmSync\(codexHome, \{ recursive: true, force: true \}\)/.test(codexExecSmoke),
    ),
    check(
      "codex_exec_smoke_requires_dedicated_openai_key",
      /readEnv\("POLYNET_CODEX_BRIDGE_OPENAI_API_KEY"\)/.test(codexExecSmoke) &&
        !fallbackUseTargets.includes("POLYNET_CODEX_BRIDGE_ALLOW_SHARED_OPENAI_KEY") &&
        !fallbackUseTargets.includes("shared_staging_openai"),
    ),
    check(
      "staging_guard_enforces_bridge_secrets",
      /POLYNET_CODEX_BRIDGE_OPERATOR_SECRET/.test(stagingGuard) &&
        /POLYNET_CODEX_BRIDGE_OPENAI_API_KEY/.test(stagingGuard) &&
        /POLYNET_CODEX_BRIDGE_ALLOW_SHARED_OPENAI_KEY/.test(stagingGuard) &&
        /POLYNET_CODEX_BRIDGE_OPERATOR_SECRET=/.test(envExample) &&
        /POLYNET_CODEX_BRIDGE_OPERATOR_SECRET=/.test(stagingEnvExample) &&
        /POLYNET_ENABLE_CODEX_BRIDGE_RUNTIME_TURNS=false/.test(envExample) &&
        /POLYNET_ENABLE_CODEX_BRIDGE_RUNTIME_TURNS="false"/.test(stagingEnvExample),
    ),
    check(
      "codex_exec_smoke_mints_token_before_run_start",
      codexExecMintIndex >= 0 &&
        codexExecRunStartIndex >= 0 &&
        codexExecMintIndex < codexExecRunStartIndex,
    ),
    check(
      "codex_exec_smoke_is_staging_only_and_hidden",
      /deploymentKind === "staging"/.test(codexExecSmoke) &&
        /visibility: "internal_hidden"/.test(codexExecSmoke) &&
        !/api\.runtimeTurn|runCloudRuntimeTurn|createRuntimeTurnRequest/.test(codexExecSmoke),
    ),
    check(
      "package_exposes_bridge_smoke",
      /"smoke:codex-bridge-echo": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/codex_bridge_echo_smoke\.ts"/.test(
        packageJson,
      ) &&
        /"smoke:codex-bridge-codex-exec": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/codex_bridge_codex_exec_smoke\.ts"/.test(
          packageJson,
        ),
    ),
    check(
      "web_operator_panel_exposes_staging_bridge_trigger",
      /startOperatorCodexBridgeCodexExecRunCanonical/.test(codexBridgeGateway) &&
        /startOperatorCodexBridgeThreadTurnCanonical/.test(codexBridgeGateway) &&
        /loadOperatorCodexBridgeRunCanonical/.test(codexBridgeGateway) &&
        /reconcileOperatorCodexBridgeRunCanonical/.test(codexBridgeGateway) &&
        /bootstrapConvexAuthenticatedClient/.test(codexBridgeGateway) &&
        /readConvexRuntimeUrl/.test(codexBridgeGateway) &&
        /resolveOperatorCodexBridgeCanonicalThreadId/.test(codexBridgeGateway) &&
        /threads:getCloudThreadByThreadKey/.test(codexBridgeGateway) &&
        /threads:getCloudThreadById/.test(codexBridgeGateway) &&
        /codexBridgeCodexExecSmoke:startOperatorCodexBridgeCodexExecRunAsync/.test(codexBridgeGateway) &&
        /codexBridgeCodexExecSmoke:startOperatorCodexBridgeThreadTurnAsync/.test(codexBridgeGateway) &&
        /codexBridgeCodexExecSmoke:reconcileOperatorCodexBridgeCodexExecRun/.test(codexBridgeGateway) &&
        /operatorDashboard:getCodexBridgeRunForOperator/.test(codexBridgeGateway) &&
        /threadId,\n    \.\.\.\(baseUrl/.test(codexBridgeGateway) &&
        /\.\.\(threadId \? \{ threadId \} : null\)/.test(codexBridgeGateway) &&
        /startOperatorCodexBridgeCodexExecRunAsync/.test(codexExecSmoke) &&
        /waitForCompletion: false/.test(codexExecSmoke) &&
        /startOperatorCodexBridgeThreadTurnCanonical/.test(webWorkspaceHost) &&
        /loadOperatorCodexBridgeRunCanonical/.test(webWorkspaceHost) &&
        /reconcileOperatorCodexBridgeRunCanonical/.test(webWorkspaceHost) &&
        /operatorCodexBridgePrompt/.test(webWorkspaceHost) &&
        /prompt,\n\s+\}\);/.test(webWorkspaceHost) &&
        /CODEX_BRIDGE_RECONCILE_AFTER_MS/.test(webWorkspaceHost) &&
        /operatorCodexBridgeReconcileAttemptRef/.test(webWorkspaceHost) &&
        /finishStaleRunning: true/.test(webWorkspaceHost) &&
        /setTimeout\(poll, 2000\)/.test(webWorkspaceHost) &&
        /props\.operatorRightPanelSession &&\n\s+props\.activeProjectId &&\n\s+props\.activeThreadId &&\n\s+operatorCodexBridgePrompt\.trim\(\)/.test(webWorkspaceHost) &&
        /codexBridgeAction=\{\{/.test(webWorkspaceHost) &&
        /codexBridgeAction: \{/.test(webWorkspaceRightPanel) &&
        /prompt: string/.test(webWorkspaceRightPanel) &&
        /onPromptChange: \(value: string\) => void/.test(webWorkspaceRightPanel) &&
        /readback: OperatorCodexBridgeRunReadback/.test(webWorkspaceRightPanel) &&
        /codexBridgeAction=\{props\.codexBridgeAction\}/.test(webWorkspaceRightPanel) &&
        /function OperatorCodexBridgePanel/.test(operatorPlatformPanel) &&
        /Prompt/.test(operatorPlatformPanel) &&
        /onPromptChange/.test(operatorPlatformPanel) &&
        /Ledger events/.test(operatorPlatformPanel) &&
        /Run thread turn/.test(operatorPlatformPanel),
    ),
    check(
      "operator_bridge_readback_is_role_gated_and_contract_limited",
      /getCodexBridgeRunForOperator/.test(operatorDashboard) &&
        /await requireOperatorAccess\(ctx, args\.authSubject\)/.test(operatorDashboard) &&
        /withIndex\("by_owner_runId"/.test(operatorDashboard) &&
        /String\(run\.contractName \?\? ""\) !== "codex_blaxel_bridge"/.test(operatorDashboard) &&
        /String\(run\.visibility \?\? ""\) !== "internal_hidden"/.test(operatorDashboard) &&
        /withIndex\("by_owner_run_seq"/.test(operatorDashboard),
    ),
  ];

  const failed = checks.filter((item) => !item.ok);
  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        check: "codex_bridge_contract_proof",
        passed: checks.length - failed.length,
        failed: failed.map((item) => item.name),
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) process.exit(1);
}

main();
