import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function exists(relativePath: string): boolean {
  return existsSync(new URL(`../${relativePath}`, import.meta.url));
}

const packageJson = read("package.json");
const bridge = read("convex/polynetCodexWorkerBridge.ts");
const handlers = read("convex/runtimeTurnHandlers.ts");
const schema = read("convex/schema.ts");
const targets = read("convex/daytonaCodexRuntimeTargets.ts");
const targetActions = read("convex/daytonaCodexRuntimeTargetActions.ts");
const ingest = read("convex/polynetCodexWorkerIngest.ts");
const terminal = read("convex/polynetCodexWorkerTerminal.ts");
const tool = read("convex/polynetCodexWorkerTool.ts");
const runToken = read("convex/polynetCodexWorkerRunToken.ts");
const admission = read("convex/polynetCodexWorkerAdmission.ts");
const communityRecentContext = read("convex/communityRecentContext.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const platformToolSurface = read("shared/polynetPlatformToolSurface.ts");
const harnessToolPolicy = read("shared/harnessToolPolicy.ts");
const workerLimits = read("shared/polynetCodexWorkerLimits.ts");
const runtimeTurnEnvelope = read("shared/runtimeTurnEnvelope.ts");
const daytonaPolicy = read("shared/daytonaCodexRuntimePolicy.ts");
const worker = read("services/polynet-codex-worker/src/server.ts");
const daytonaConfig = read("services/polynet-codex-worker/src/daytonaCodexConfig.ts");
const daytonaWorkspace = read("services/polynet-codex-worker/src/daytonaLocalWorkspaceTool.ts");

assert.match(
  packageJson,
  /"check:polynet-codex-worker-convex-bridge": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/polynet_codex_worker_convex_bridge_contract_proof\.ts"/,
  "package.json must expose the Convex bridge contract proof",
);

assert.match(
  bridge,
  /POLYNET_CODEX_WORKER_CONTRACT_NAME = "polynet_codex_runtime_daytona_v1"/,
  "bridge contract must name the Daytona runtime contract",
);
for (const requiredEnvName of [
  "POLYNET_CODEX_WORKER_RUNTIME_ENABLED",
  "POLYNET_DEPLOYMENT_KIND",
  "POLYNET_CODEX_WORKER_AUTH_TOKEN",
]) {
  assert.match(bridge, new RegExp(requiredEnvName), `bridge must read ${requiredEnvName}`);
}
assert.match(
  bridge,
  /type PolynetCodexWorkerTransportProvider = "daytona_direct"/,
  "bridge must expose only the direct Daytona runtime provider",
);
assert.doesNotMatch(
  bridge,
  /worker_url|legacy_url|POLYNET_CODEX_RUNTIME_PROVIDER|POLYNET_CODEX_WORKER_URL|readCodexRuntimeProvider|workerUrlDeploymentMismatch/,
  "bridge must not retain the legacy worker_url transport rail",
);
assert.match(
  bridge,
  /DAYTONA_API_KEY[\s\S]*DAYTONA_JWT_TOKEN[\s\S]*daytona_direct_credentials_missing/,
  "direct Daytona provider must fail closed without Daytona credentials",
);
assert.doesNotMatch(
  bridge,
  /force-instance-id/,
  "cancel and steer must not depend on Fly machine pinning",
);

assert.match(
  schema,
  /daytonaCodexRuntimeTargets: defineTable\(\{[\s\S]*runId: v\.string\(\)[\s\S]*sandboxId: v\.optional\(v\.string\(\)\)[\s\S]*workerUrl: v\.optional\(v\.string\(\)\)[\s\S]*\.index\("by_runId"/,
  "schema must persist Daytona runtime target state by run id",
);
assert.match(
  schema,
  /polynetCodexWorkerCapacityLeases: defineTable\(\{[\s\S]*status: v\.union\([\s\S]*v\.literal\("active"\)[\s\S]*v\.literal\("released"\)[\s\S]*v\.literal\("expired"\)[\s\S]*\.index\("by_status_expiresAt"[\s\S]*\.index\("by_owner_status_expiresAt"[\s\S]*\.index\("by_project_status_expiresAt"/,
  "schema must define first-class Codex runtime capacity leases",
);

assert.match(
  targets,
  /claimDaytonaCodexRuntimeTargetInternal[\s\S]*markDaytonaCodexRuntimeTargetReadyInternal[\s\S]*releaseDaytonaCodexRuntimeTargetInternal/,
  "Daytona target mutations must claim, mark ready, and release target rows",
);
assert.match(
  targetActions,
  /ensureDaytonaCodexRuntimeTargetInternal[\s\S]*new Daytona\(buildDaytonaConfig\(\)\)[\s\S]*markDaytonaCodexRuntimeTargetReadyInternal/,
  "Daytona target action must create a provider sandbox and mark it ready",
);
assert.match(
  targetActions,
  /scanDaytonaWorkspaceForMeaningfulFiles[\s\S]*stopDaytonaSandboxForRetention[\s\S]*deleteDaytonaSandbox[\s\S]*teardownDaytonaCodexRuntimeTargetInternal[\s\S]*markDaytonaCodexRuntimeTargetProviderTeardownInternal/,
  "Daytona target teardown must classify workspace state, delete clean sandboxes, stop dirty sandboxes for retention, and record teardown state",
);

assert.match(
  handlers,
  /daytona_codex_runtime_target_resolve_started[\s\S]*ensureDaytonaCodexRuntimeTargetInternal/,
  "runtime handler must unconditionally resolve a Daytona runtime target for Codex worker turns",
);
assert.match(
  handlers,
  /if \(runtimeProjectId\)[\s\S]*workspace_session_skipped[\s\S]*daytona_direct_uses_runtime_workspace/,
  "direct Daytona turns must not adopt the legacy project workspace session",
);
assert.doesNotMatch(
  handlers,
  /createProjectRuntimeWorkspaceSession|workspace_session_adopted|workerWorkspaceSession|disposeRuntimeWorkspaceSession|workerBridgeConfig|getPolynetCodexWorkerBridgeConfig/,
  "runtime handler must not retain the legacy project-workspace adoption branch or handler-local transport branch for Codex worker turns",
);
assert.match(
  handlers,
  /tryAcquirePolynetCodexWorkerLease[\s\S]*reservePaidToolCredits[\s\S]*streamPolynetCodexWorkerTurn[\s\S]*target: workerResolvedTarget/,
  "runtime handler must acquire capacity, reserve credits, and stream through the resolved Daytona target",
);
assert.match(
  handlers,
  /releaseDaytonaCodexRuntimeTargetInternal[\s\S]*daytona_codex_runtime_provider_teardown_started[\s\S]*teardownAndRecordDaytonaCodexRuntimeTargetInternal/,
  "runtime handler must release target rows before scheduling provider teardown",
);

assert.match(
  admission,
  /tryAcquirePolynetCodexWorkerLease = internalMutation[\s\S]*POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT[\s\S]*user_run_limit_reached[\s\S]*project_run_limit_reached/,
  "admission must enforce deployment, user, and project runtime caps",
);
assert.match(
  workerLimits,
  /POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT = 5[\s\S]*POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT = 10[\s\S]*POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT = 10/,
  "worker limits must encode project, deployment, and user caps",
);

assert.match(
  ingest,
  /verifyPolynetCodexWorkerRunToken[\s\S]*expectedAudience: "ingest"[\s\S]*getRuntimeRunByOwnerRunIdInternal/,
  "ingest endpoint must verify scoped run tokens against the canonical run row",
);
assert.match(
  ingest,
  /normalizeWorkspacePreviewPort[\s\S]*workspace_preview_ready[\s\S]*daytonaActivePreviewPorts[\s\S]*finalizeDaytonaCodexRuntimeTargetFromWorkerIngestInternal[\s\S]*daytona_lifecycle_finalized[\s\S]*daytona_active_preview_ports/,
  "ingest endpoint must release Daytona targets from durable worker completion with normalized preview lease ports",
);
assert.match(
  terminal,
  /verifyPolynetCodexWorkerRunToken[\s\S]*expectedAudience: "terminal"[\s\S]*runStatus !== "running"[\s\S]*codex_worker_run_not_active/,
  "terminal endpoint must reject callbacks after the run is no longer active",
);
assert.match(
  runToken,
  /expectedAudience[\s\S]*owner_id[\s\S]*thread_id[\s\S]*run_id/,
  "run token verification must bind audience and run context",
);

assert.match(
  runtimeTurnEnvelope,
  /communityLensAuthority[\s\S]*allowedToolNames/,
  "runtime envelope must carry canonical community authority and allowed tool names",
);
assert.match(
  platformToolSurface,
  /requiredCommunityAuthority[\s\S]*toolName: "community_write"[\s\S]*requiredCommunityAuthority: "moderator"[\s\S]*entry\.requiredCommunityResourceLane === "builder"[\s\S]*authority\?\.canManageResources === true/,
  "platform tool surface must gate community_write by moderator authority and builder tools by resource-management authority",
);
assert.match(
  harnessToolPolicy,
  /resolvePolynetHarnessToolPolicy[\s\S]*fixedRuntimeToolNames[\s\S]*resolveCodexHarnessToolPolicy[\s\S]*mode: "native_codex"[\s\S]*duplicateShellTool: false/,
  "shared harness policy must split PolyNet fixed runtime tools from Codex native workspace policy",
);
assert.match(
  harnessToolPolicy,
  /CODEX_WORKSPACE_SERVE_TOOL_NAME = "workspace_serve"[\s\S]*CODEX_COMPUTER_OPEN_URL_TOOL_NAME = "computer_open_url"[\s\S]*CODEX_COMPUTER_SCREENSHOT_TOOL_NAME = "computer_screenshot"[\s\S]*CODEX_RUNTIME_ADAPTER_TOOL_NAMES[\s\S]*CODEX_WORKSPACE_SERVE_TOOL_NAME[\s\S]*CODEX_COMPUTER_OPEN_URL_TOOL_NAME[\s\S]*CODEX_COMPUTER_SCREENSHOT_TOOL_NAME[\s\S]*runtimeAdapterToolNames/,
  "Codex harness policy must classify preview and computer bridge tools as runtime adapters",
);
assert.match(
  handlers,
  /const codexPlatformToolProjection = \{[\s\S]*communityResourceLane:[\s\S]*runtimeCommunityLensAuthority\?\.communityResourceLane[\s\S]*communityLensAuthority: runtimeCommunityLensAuthority[\s\S]*resolveCodexHarnessToolPolicy\(\{[\s\S]*polynetPlatformToolProjection: codexPlatformToolProjection[\s\S]*workerPlatformTools = codexHarnessToolPolicy\.polynetPlatformTools/,
  "runtime handler must resolve Codex-visible PolyNet tools through the Codex harness policy",
);
assert.match(
  handlers,
  /eventType: "codex_harness_tool_policy_resolved"[\s\S]*buildCodexHarnessToolPolicyReceipt\(codexHarnessToolPolicy\)[\s\S]*runtime_tool_names: codexHarnessToolPolicy\.runtimeAdapterToolNames/,
  "runtime handler must emit Codex harness policy receipts before projecting worker tools",
);
assert.match(
  tool,
  /runAuthorityAllowsRequiredLane[\s\S]*authority\?\.canManageResources === true[\s\S]*readRunCommunityAuthority[\s\S]*runAuthorityAllowsRequiredAuthority[\s\S]*required_community_authority/,
  "worker tool endpoint must enforce canonical run-snapshot authority before dispatching tools",
);
assert.match(
  tool,
  /runStatus !== "running"[\s\S]*codex_worker_run_not_active/,
  "worker tool endpoint must reject callbacks after the run is no longer active",
);
assert.match(
  communityRecentContext,
  /readCommunityRecentContextForUser[\s\S]*readCommunityRecentContextInternal = internalQuery[\s\S]*userId: v\.id\("users"\)[\s\S]*readCommunityRecentContext = query[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*readCommunityRecentContextForUser/,
  "community recent context must keep public verified-auth query and expose an internal pre-resolved-user path for signed runtime tools",
);
assert.match(
  runtimeAgentLoop,
  /params\.toolName === "community_write"[\s\S]*publishCommunityAiFeedAgentPostInternal/,
  "community_write must use the trusted internal publish path for runtime tool calls",
);
assert.match(
  worker,
  /const WORKER_WORKSPACE_HOST_ID = "daytona" as const[\s\S]*POLYNET_CODEX_WORKSPACE_HOST must be daytona/,
  "worker service must be a Daytona-native Codex host",
);
assert.match(
  worker,
  /buildDaytonaCodexConfigToml[\s\S]*ensureDaytonaLocalWorkspace[\s\S]*startDaytonaLocalServer/,
  "worker service must render Daytona Codex config and use local Daytona workspace tools",
);
assert.match(
  worker,
  /function buildCodexDynamicTools\(activeTurn: ActiveTurn\)[\s\S]*buildWorkspaceServeDynamicToolSpec[\s\S]*forbidden_tool_names_present/,
  "worker service must derive actual Codex adapter tools through one receipt-producing helper",
);
assert.doesNotMatch(
  worker,
  /buildWorkspaceBashDynamicToolSpec|runDaytonaLocalBash|runBlaxelBash|CODEX_WORKSPACE_BASH_TOOL_NAME/,
  "worker service must not retain duplicate shell tool branches",
);
assert.doesNotMatch(
  worker,
  /WorkerToolCallSummary|toolCalls|workspace_exec|command_timeout_seconds|POLYNET_CODEX_WORKER_COMMAND_TIMEOUT_SECONDS/,
  "worker service must not retain legacy worker-managed workspace exec evidence shape",
);
assert.match(
  worker,
  /emitWorkerEvent\("codex_dynamic_tools_advertised"[\s\S]*codexDynamicTools\.receipt[\s\S]*dynamicTools: codexDynamicTools\.dynamicTools/,
  "worker service must emit the actual advertised Codex tools before starting the Codex thread",
);
assert.match(
  worker,
  /const codexThreadCwd = activeTurn\.workspaceRoot \?\? getDaytonaWorkspaceRoot\(\)[\s\S]*cwd: codexThreadCwd[\s\S]*codex_thread_cwd: codexThreadCwd/,
  "worker service must start Daytona Codex threads in the same workspace root used by workspace tools",
);
assert.match(
  worker,
  /const CODEX_APP_SERVER_ENV_ALLOWLIST = \[[\s\S]*"PATH"[\s\S]*"CODEX_HOME"[\s\S]*export function buildCodexAppServerEnv\(source: NodeJS\.ProcessEnv\)[\s\S]*key\.startsWith\("LC_"\)[\s\S]*env: buildCodexAppServerEnv\(process\.env\)[\s\S]*const codexAppServerEnv = buildCodexAppServerEnv\(process\.env\)[\s\S]*env: codexAppServerEnv/,
  "worker service must start Codex app-server with an explicit allowlisted env",
);
assert.doesNotMatch(
  worker,
  /env:\s*process\.env/,
  "worker service must not pass the full process env to Codex app-server subprocesses",
);
assert.match(
  daytonaConfig,
  /buildDaytonaCodexDeveloperInstructions[\s\S]*PolyNet's Codex runtime hosted in a Daytona sandbox/,
  "Daytona Codex config must inject PolyNet runtime instructions",
);
assert.match(
  daytonaPolicy,
  /DEFAULT_ACTIVE_MODEL_ID[\s\S]*POLYNET_DAYTONA_CODEX_SANDBOX_MODE[\s\S]*value === "workspace-write"[\s\S]*return "workspace-write"[\s\S]*return "danger-full-access"[\s\S]*type: "dangerFullAccess"[\s\S]*networkAccess: false[\s\S]*DAYTONA_RUNTIME_POLICY[\s\S]*approvalPolicy: "never"[\s\S]*workspaceAccess[\s\S]*mode: "native_codex"[\s\S]*duplicateShellTool: false/,
  "Daytona runtime policy must default to Codex full access, support explicit workspace-write rollback, and avoid a duplicate shell tool",
);
assert.match(
  daytonaWorkspace,
  /getDaytonaWorkspaceRoot[\s\S]*ensureDaytonaLocalWorkspace[\s\S]*startDaytonaLocalServer/,
  "Daytona local workspace adapter must expose root, ensure, and serve operations",
);

for (const requiredPath of [
  "convex/daytonaCodexRuntimeTargetActions.ts",
  "convex/daytonaCodexRuntimeTargets.ts",
  "shared/daytonaCodexRuntimePolicy.ts",
  "services/polynet-codex-worker/src/daytonaCodexConfig.ts",
  "services/polynet-codex-worker/src/daytonaLocalWorkspaceTool.ts",
]) {
  assert.ok(exists(requiredPath), `${requiredPath} must exist`);
}

console.log("polynet_codex_worker_convex_bridge_contract_proof: ok");
