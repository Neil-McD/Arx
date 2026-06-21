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
const runToken = read("convex/polynetCodexWorkerRunToken.ts");
const admission = read("convex/polynetCodexWorkerAdmission.ts");
const workerLimits = read("shared/polynetCodexWorkerLimits.ts");
const runtimeTurnEnvelope = read("shared/runtimeTurnEnvelope.ts");
const worker = read("services/polynet-codex-worker/src/server.ts");
const daytonaConfig = read("services/polynet-codex-worker/src/daytonaCodexConfig.ts");
const daytonaPolicy = read("services/polynet-codex-worker/src/daytonaRuntimePolicy.ts");
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
  "POLYNET_CODEX_RUNTIME_PROVIDER",
  "POLYNET_DEPLOYMENT_KIND",
  "POLYNET_CODEX_WORKER_AUTH_TOKEN",
]) {
  assert.match(bridge, new RegExp(requiredEnvName), `bridge must read ${requiredEnvName}`);
}
assert.match(
  bridge,
  /function readCodexRuntimeProvider\(\)[\s\S]*return "daytona_direct"/,
  "bridge must default to direct Daytona runtime provider",
);
assert.match(
  bridge,
  /DAYTONA_API_KEY[\s\S]*DAYTONA_JWT_TOKEN[\s\S]*daytona_direct_credentials_missing/,
  "direct Daytona provider must fail closed without Daytona credentials",
);
assert.match(
  bridge,
  /proxy\\\.daytona\\\.works[\s\S]*app\\\.daytona\\\.io[\s\S]*polynet_codex_worker_ephemeral_daytona_url_invalid/,
  "legacy URL mode must reject raw Daytona ephemeral URLs as canonical worker URLs",
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
  /teardownDaytonaCodexRuntimeTargetInternal[\s\S]*daytona\.delete[\s\S]*markDaytonaCodexRuntimeTargetProviderTeardownInternal/,
  "Daytona target teardown must delete the provider sandbox and record teardown state",
);

assert.match(
  handlers,
  /getPolynetCodexWorkerBridgeConfig\(\)[\s\S]*workerBridgeConfig\.provider === "daytona_direct"[\s\S]*ensureDaytonaCodexRuntimeTargetInternal/,
  "runtime handler must resolve a Daytona runtime target for direct Daytona turns",
);
assert.match(
  handlers,
  /runtimeProjectId && workerBridgeConfig\.provider === "daytona_direct"[\s\S]*workspace_session_skipped[\s\S]*daytona_direct_uses_runtime_workspace/,
  "direct Daytona turns must not adopt the legacy project workspace session",
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
  worker,
  /type WorkerWorkspaceHostId = "blaxel" \| "daytona"[\s\S]*readWorkspaceHostId\(\)[\s\S]*POLYNET_CODEX_WORKSPACE_HOST/,
  "worker service must select Daytona as a first-class workspace host",
);
assert.match(
  worker,
  /buildDaytonaCodexConfigToml[\s\S]*ensureDaytonaLocalWorkspace[\s\S]*runDaytonaLocalBash/,
  "worker service must render Daytona Codex config and use local Daytona workspace tools",
);
assert.match(
  daytonaConfig,
  /buildDaytonaCodexDeveloperInstructions[\s\S]*PolyNet's Codex runtime hosted in a Daytona sandbox/,
  "Daytona Codex config must inject PolyNet runtime instructions",
);
assert.match(
  daytonaPolicy,
  /normalizeModel[\s\S]*"gpt-5.5"[\s\S]*DAYTONA_RUNTIME_POLICY[\s\S]*approvalPolicy: "never"[\s\S]*networkAccess: false[\s\S]*shellNetworkAccess: "provider_default"/,
  "Daytona runtime policy must encode the current native Codex and workspace network defaults",
);
assert.match(
  daytonaWorkspace,
  /getDaytonaWorkspaceRoot[\s\S]*runDaytonaLocalBash[\s\S]*startDaytonaLocalServer/,
  "Daytona local workspace adapter must expose root, shell, and serve operations",
);

for (const requiredPath of [
  "convex/daytonaCodexRuntimeTargetActions.ts",
  "convex/daytonaCodexRuntimeTargets.ts",
  "services/polynet-codex-worker/src/daytonaCodexConfig.ts",
  "services/polynet-codex-worker/src/daytonaRuntimePolicy.ts",
  "services/polynet-codex-worker/src/daytonaLocalWorkspaceTool.ts",
]) {
  assert.ok(exists(requiredPath), `${requiredPath} must exist`);
}

console.log("polynet_codex_worker_convex_bridge_contract_proof: ok");
