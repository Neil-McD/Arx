import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assertIncludes(source: string, expected: string, message: string): void {
  assert.ok(source.includes(expected), message);
}

const packageJson = read("package.json");
const schema = read("convex/schema.ts");
const state = read("convex/daytonaCodexRuntimeTargets.ts");
const actions = read("convex/daytonaCodexRuntimeTargetActions.ts");
const threads = read("convex/threads.ts");
const crons = read("convex/crons.ts");
const bridge = read("convex/polynetCodexWorkerBridge.ts");
const handlers = read("convex/runtimeTurnHandlers.ts");
const ingest = read("convex/polynetCodexWorkerIngest.ts");
const liveSmoke = read("scripts/daytona_codex_runtime_live_smoke.ts");
const cleanupSweeperProbe = read("scripts/daytona_codex_runtime_cleanup_sweeper_probe.ts");
const stopResumePersistenceProbe = read("scripts/daytona_sandbox_stop_resume_persistence_probe.ts");
const snapshotPromote = read("scripts/daytona_codex_runtime_snapshot_promote.ts");
const workerRunner = read("scripts/run_polynet_codex_worker_service_local.sh");
const worker = read("services/polynet-codex-worker/src/server.ts");
const daytonaRuntimePolicy = read("shared/daytonaCodexRuntimePolicy.ts");

assert.match(
  packageJson,
  /"check:daytona-codex-direct-runtime-proof"/,
  "package.json must expose the direct Daytona runtime contract proof",
);
assert.match(
  packageJson,
  /"probe:daytona-codex-native-workspace": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/daytona_codex_runtime_live_smoke\.ts --live --require-live --native-workspace-probe"/,
  "package.json must expose a focused live probe for native Codex workspace execution in Daytona",
);
assert.match(
  packageJson,
  /"probe:daytona-codex-interactive-preview": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/daytona_codex_runtime_live_smoke\.ts --live --require-live --interactive-preview-probe"/,
  "package.json must expose a focused live probe for interactive app previews in Daytona",
);
assert.match(
  packageJson,
  /"probe:daytona-codex-cleanup-sweeper": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/daytona_codex_runtime_cleanup_sweeper_probe\.ts"/,
  "package.json must expose the staging-only Daytona cleanup sweeper probe",
);
assert.match(
  packageJson,
  /"probe:daytona-stop-resume-persistence": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/daytona_sandbox_stop_resume_persistence_probe\.ts"/,
  "package.json must expose the staging-only Daytona stop/resume persistence probe",
);
assert.match(
  packageJson,
  /"promote:daytona-codex-runtime-snapshot": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/daytona_codex_runtime_snapshot_promote\.ts"/,
  "package.json must expose the guarded Daytona Codex runtime snapshot promotion script",
);

assert.match(
  schema,
  /daytonaCodexRuntimeTargets: defineTable\(\{[\s\S]*scope: v\.union\([\s\S]*v\.literal\("run"\)[\s\S]*v\.literal\("thread"\)[\s\S]*provider: v\.literal\("daytona"\)[\s\S]*workerState: v\.union\([\s\S]*v\.literal\("creating"\)[\s\S]*v\.literal\("ready"\)[\s\S]*workerUrl: v\.optional\(v\.string\(\)\)[\s\S]*signedPreviewExpiresAt[\s\S]*lifecycleMode[\s\S]*providerEphemeral[\s\S]*sandboxCpu[\s\S]*sandboxMemoryGiB[\s\S]*sandboxDiskGiB[\s\S]*billingCreditKey[\s\S]*billingReservedCredits[\s\S]*billingIntervalStartedAt[\s\S]*billingIntervalClosedAt[\s\S]*billingIntervalSequence[\s\S]*billingIntervalResourceSource[\s\S]*billingSettlementState[\s\S]*billingSettlementCredits[\s\S]*billingSettlementRawVendorCostUsd[\s\S]*billingSettlementUpdatedAt[\s\S]*providerTeardownState[\s\S]*workspaceChangeState[\s\S]*workspaceRetentionState[\s\S]*workspaceRetentionExpiresAt[\s\S]*activePreviewPorts[\s\S]*previewLeaseState[\s\S]*cleanupDecision/,
  "schema must persist Daytona runtime targets with worker lifecycle, provider persistence, billing settlement, workspace retention, preview lease, and cleanup decision state",
);
assert.match(
  schema,
  /\.index\("by_owner_runId", \["ownerId", "runId"\]\)[\s\S]*\.index\("by_owner_threadId", \["ownerId", "threadId"\]\)[\s\S]*\.index\("by_workerState_updatedAt", \["workerState", "updatedAt"\]\)[\s\S]*\.index\("by_workspaceRetentionState_expiresAt"[\s\S]*\.index\("by_previewLeaseState_expiresAt"/,
  "Daytona target table must support run lookup, thread reuse lookup, worker scans, workspace retention expiry scans, and preview lease expiry scans",
);

assert.match(
  state,
  /claimDaytonaCodexRuntimeTargetInternal = internalMutation[\s\S]*lifecycleMode: v\.union\([\s\S]*prepared_staging_reuse[\s\S]*thread_ephemeral[\s\S]*per_turn_ephemeral[\s\S]*providerEphemeral: v\.boolean\(\)[\s\S]*by_owner_runId[\s\S]*args\.lifecycleMode === "thread_ephemeral"[\s\S]*by_owner_threadId[\s\S]*scope: args\.lifecycleMode === "thread_ephemeral" \? "thread" : "run"[\s\S]*provider: "daytona"[\s\S]*workerState: "creating"[\s\S]*providerEphemeral: args\.providerEphemeral[\s\S]*providerTeardownState: "pending"/,
  "target state must atomically claim run-scoped or thread-scoped Daytona targets with lifecycle ownership and provider persistence",
);
assert.match(
  state,
  /getDaytonaCodexRuntimeTargetByIdInternal = internalQuery[\s\S]*targetId: v\.id\("daytonaCodexRuntimeTargets"\)[\s\S]*ctx\.db\.get\(args\.targetId\)/,
  "target state must expose a target-id internal lookup for focused staging cleanup probes",
);
assert.match(
  state,
  /expectedSnapshotId[\s\S]*snapshotMatches[\s\S]*threadTargets[\s\S]*by_owner_threadId[\s\S]*String\(target\.scope[\s\S]*!== "thread"[\s\S]*String\(target\.lifecycleMode[\s\S]*!== "thread_ephemeral"[\s\S]*target\.providerEphemeral !== args\.providerEphemeral[\s\S]*!snapshotMatches\(target\)[\s\S]*return await claimExistingTarget\(reusable\)/,
  "thread_ephemeral targets must reuse only same-snapshot non-deleted sandboxes for the same owner, thread, workspace root, and provider persistence",
);
assert.doesNotMatch(
  state,
  /resetWorkspaceLifecyclePatch/,
  "target reclaim must not use a blanket reset patch that erases preview leases or human-save retention",
);
assert.match(
  state,
  /claimExistingTarget[\s\S]*providerTeardownState: "pending"[\s\S]*errorCode: undefined[\s\S]*errorMessage: undefined[\s\S]*target: await ctx\.db\.get\(target\._id\)/,
  "target reclaim must update run ownership and worker teardown fields while preserving independent lifecycle facts",
);
assert.match(
  state,
  /markDaytonaCodexRuntimeTargetReadyInternal = internalMutation[\s\S]*workerState: "ready"[\s\S]*workerUrl[\s\S]*signedPreviewExpiresAt[\s\S]*lastHealthAt[\s\S]*providerTeardownState: "pending"/,
  "target state must mark worker URL readiness with health, signed preview expiry, and pending teardown",
);
assert.match(
  state,
  /releaseDaytonaCodexRuntimeTargetInternal = internalMutation[\s\S]*incomingPreviewPorts[\s\S]*existingPreviewPorts[\s\S]*new Set\(\[\.\.\.existingPreviewPorts, \.\.\.incomingPreviewPorts\]\)[\s\S]*target_already_released_preview_merged[\s\S]*workerState: "released"[\s\S]*releaseReason[\s\S]*previewLeaseState: activePreviewPorts\.length > 0 \? "active" : "none"[\s\S]*previewLeaseExpiresAt/,
  "target release must merge active preview lease evidence, including late durable-ingest evidence after the live path released",
);
assert.match(
  state,
  /markDaytonaCodexRuntimeTargetWorkspaceLifecycleInternal = internalMutation[\s\S]*workspaceChangeState[\s\S]*human_save_pending[\s\S]*workspaceRetentionExpiresAt[\s\S]*workspaceMeaningfulFilePreview[\s\S]*cleanupDecision[\s\S]*cleanupEligibleAt/,
  "target state must persist post-turn workspace classification, human-save retention, and cleanup decision state",
);
assert.match(
  state,
  /listExpiredDaytonaCodexRuntimeTargetsInternal = internalQuery[\s\S]*by_workspaceRetentionState_expiresAt[\s\S]*human_save_pending[\s\S]*lte\("workspaceRetentionExpiresAt", nowMs\)[\s\S]*by_previewLeaseState_expiresAt[\s\S]*eq\("previewLeaseState", "active"\)\.lte\("previewLeaseExpiresAt", nowMs\)/,
  "target state must expose bounded expired retention and preview lease scans for the system sweeper",
);
assert.match(
  state,
  /markDaytonaCodexRuntimeTargetPreviewLeaseExpiredInternal = internalMutation[\s\S]*previewLeaseState: "expired"[\s\S]*cleanupEligibleAt: nowMs[\s\S]*markDaytonaCodexRuntimeTargetRetentionExpiredInternal = internalMutation[\s\S]*workspaceRetentionState: "expired"[\s\S]*cleanupDecision: "delete_expired_retention"/,
  "target state must persist explicit preview lease expiry and human-save retention expiry transitions",
);
assert.match(
  state,
  /markDaytonaCodexRuntimeTargetProviderTeardownInternal = internalMutation[\s\S]*v\.literal\("skipped"\)[\s\S]*v\.literal\("stopped"\)[\s\S]*v\.literal\("deleted"\)[\s\S]*v\.literal\("failed"\)[\s\S]*providerTeardownState: args\.state[\s\S]*providerTeardownReason: args\.reason[\s\S]*args\.state === "deleted"[\s\S]*sandboxState: "deleted"[\s\S]*args\.state === "stopped"[\s\S]*sandboxState: "stopped"/,
  "target state must persist provider teardown outcome and mirror stopped/deleted sandbox state",
);

assert.match(
  actions,
  /^"use node";[\s\S]*await import\("@daytona\/sdk"\)/,
  "Daytona direct target creation must live in a Node internal action that loads the official SDK",
);
assert.match(
  actions,
  /from "\.\.\/shared\/daytonaCodexRuntimePolicy"/,
  "Daytona direct target creation must use the canonical Daytona runtime policy module",
);
assert.match(
  actions,
  /DAYTONA_API_KEY[\s\S]*DAYTONA_API_URL[\s\S]*DAYTONA_TARGET/,
  "Daytona action must read provider config from staging server env",
);
assertIncludes(
  actions,
  'readFirstEnv(["DAYTONA_ORGANIZATION_ID", "DAYTONA_ORG_ID"])',
  "Daytona action must accept the current staging org-id env alias",
);
assert.match(
  actions,
  /function sanitizeDaytonaRuntimeError\(value: unknown\): string[\s\S]*Bearer\|Basic[\s\S]*redacted-token[\s\S]*redacted-daytona-preview-url[\s\S]*worker_log=\)\[\\s\\S\]\+/,
  "Daytona action must sanitize tokens, signed preview URLs, and worker logs",
);
assert.doesNotMatch(
  actions,
  /export function sanitizeDaytonaRuntimeError/,
  "Daytona error sanitizer must remain private to avoid growing a public API surface",
);
assert.match(
  actions,
  /const message = sanitizeDaytonaRuntimeError\(error\);[\s\S]*errorMessage: message[\s\S]*throw new Error\(message\)/,
  "Daytona action must persist and throw sanitized errors only",
);
assertIncludes(
  actions,
  'readEnv("POLYNET_DAYTONA_DIRECT_SANDBOX_ID")',
  "Daytona direct mode must support one explicitly supplied staging sandbox env while snapshots are being proven",
);
assert.doesNotMatch(
  actions,
  /POLYNET_DAYTONA_MANAGED_SANDBOX_ID/,
  "Daytona direct mode must not keep the deleted daytona-managed sandbox alias",
);
assert.match(
  actions,
  /DAYTONA_SNAPSHOT[\s\S]*daytona_direct_snapshot_required/,
  "Daytona direct mode must fail closed instead of creating an unbootstrapped runtime unless explicitly allowed",
);
assert.match(
  actions,
  /daytona_snapshot_runtime_incomplete:package_json_missing[\s\S]*daytona_snapshot_runtime_incomplete:node_modules_missing[\s\S]*daytona_snapshot_runtime_incomplete:codex_cli_missing[\s\S]*daytona_snapshot_runtime_incomplete:worker_runner_missing/,
  "Daytona direct worker startup must fail closed when the configured snapshot is missing runtime files",
);
assert.doesNotMatch(
  actions,
  /npm ci|npm install|POLYNET_DAYTONA_DIRECT_CODEX_PACKAGE|POLYNET_DAYTONA_DIRECT_WORKER_START_COMMAND|DEFAULT_CODEX_PACKAGE/,
  "Daytona direct worker startup must not install dependencies, install Codex, or accept a start-command override during a user turn",
);
assert.doesNotMatch(
  actions,
  /"sleep 1"/,
  "Daytona direct worker startup must not add a fixed sleep before health checks",
);
assert.match(
  actions,
  /readBoundedIntegerEnv\([\s\S]*POLYNET_DAYTONA_DIRECT_WORKER_HEALTH_POLL_MS[\s\S]*250[\s\S]*100[\s\S]*1500[\s\S]*pollMs: number[\s\S]*setTimeout\(resolve, params\.pollMs\)/,
  "Daytona direct worker health polling must be configurable, bounded, and default to a fast 250ms poll",
);
assert.match(
  actions,
  /parsed\.worker_http_ready === true \|\| parsed\.ok === true/,
  "Daytona direct target readiness must accept worker HTTP readiness without waiting for native Codex init",
);
assert.match(
  actions,
  /const policy = DAYTONA_RUNTIME_POLICY\.daytonaSandbox[\s\S]*POLYNET_DAYTONA_DIRECT_AUTO_STOP_MINUTES[\s\S]*policy\.autoStopIntervalMinutes[\s\S]*POLYNET_DAYTONA_DIRECT_AUTO_ARCHIVE_MINUTES[\s\S]*POLYNET_DAYTONA_DIRECT_AUTO_DELETE_MINUTES/,
  "Daytona direct targets must read lazy lifecycle economics from the canonical policy with staging env overrides",
);
assert.match(
  daytonaRuntimePolicy,
  /DAYTONA_CODEX_DEFAULT_PREVIEW_LEASE_MINUTES = 30/,
  "Daytona preview leases must default to 30 minutes before system cleanup expires them",
);
assert.match(
  daytonaRuntimePolicy,
  /DAYTONA_CODEX_DEFAULT_AUTO_STOP_MINUTES = 30/,
  "Daytona provider auto-stop must not undercut the 30-minute PolyNet preview lease",
);
assert.match(
  actions,
  /POLYNET_DAYTONA_DIRECT_PUBLIC_PREVIEW[\s\S]*policy\.publicPreview[\s\S]*resources: \{[\s\S]*POLYNET_DAYTONA_DIRECT_CPU[\s\S]*policy\.defaultResources\.cpu[\s\S]*POLYNET_DAYTONA_DIRECT_MEMORY[\s\S]*policy\.defaultResources\.memory[\s\S]*POLYNET_DAYTONA_DIRECT_DISK[\s\S]*policy\.defaultResources\.disk/,
  "Daytona direct targets must derive preview and resource defaults from the canonical policy",
);
assert.match(
  actions,
  /defaultDaytonaProviderEphemeralForLifecycleMode[\s\S]*function readDaytonaProviderEphemeralForLifecycleMode\([\s\S]*POLYNET_DAYTONA_DIRECT_EPHEMERAL[\s\S]*defaultDaytonaProviderEphemeralForLifecycleMode\(lifecycleMode\)/,
  "Daytona target actions must use the canonical lifecycle-specific provider persistence default with an explicit staging override",
);
assert.match(
  daytonaRuntimePolicy,
  /providerEphemeralByLifecycle: \{[\s\S]*thread_ephemeral: false[\s\S]*per_turn_ephemeral: true[\s\S]*function defaultDaytonaProviderEphemeralForLifecycleMode[\s\S]*if \(lifecycleMode === "per_turn_ephemeral"\) return true[\s\S]*return false[\s\S]*provider_ephemeral_by_lifecycle/,
  "canonical Daytona policy must expose lifecycle-specific provider persistence defaults instead of one generic ephemeral flag",
);
assert.doesNotMatch(
  daytonaRuntimePolicy,
  /(^|\n)\s*ephemeral: true[;,]/,
  "canonical Daytona policy must not expose a misleading generic daytonaSandbox.ephemeral default",
);
assert.match(
  actions,
  /function readConfiguredReusableSandboxId\(\): string[\s\S]*POLYNET_DAYTONA_DIRECT_SANDBOX_ID[\s\S]*function readDaytonaTargetLifecycleMode\(\): DaytonaTargetLifecycleMode[\s\S]*readConfiguredReusableSandboxId\(\)[\s\S]*prepared_staging_reuse[\s\S]*POLYNET_DAYTONA_DIRECT_LIFECYCLE_MODE[\s\S]*per_turn_ephemeral[\s\S]*thread_ephemeral[\s\S]*return "thread_ephemeral"/,
  "Daytona direct targets must default to same-thread reusable sandboxes while preserving explicit staging reuse and per-turn overrides",
);
assert.match(
  actions,
  /const lifecycleMode = readDaytonaTargetLifecycleMode\(\);[\s\S]*const lifecycle = buildDaytonaTargetLifecycleConfig\(lifecycleMode\);[\s\S]*providerEphemeral: lifecycle\.providerEphemeral/,
  "Daytona direct targets must choose provider persistence after resolving the PolyNet lifecycle mode",
);
assert.doesNotMatch(
  actions,
  /daytona-managed|DaytonaManaged|POLYNET_DAYTONA_MANAGED/,
  "Daytona direct target actions must not keep the deleted managed broker surface",
);
assert.match(
  actions,
  /public: params\.lifecycle\.publicPreview[\s\S]*ephemeral: params\.lifecycle\.providerEphemeral[\s\S]*autoStopInterval: params\.lifecycle\.autoStopMinutes[\s\S]*autoArchiveInterval: params\.lifecycle\.autoArchiveMinutes[\s\S]*autoDeleteInterval: params\.lifecycle\.providerEphemeral[\s\S]*\? 0[\s\S]*: params\.lifecycle\.autoDeleteMinutes[\s\S]*\.\.\.\(snapshot \? \{ snapshot \} : \{ resources: params\.lifecycle\.resources \}\)/,
  "Daytona direct sandbox creation must use policy-backed preview and lifecycle defaults, including explicit provider auto-delete behavior, while keeping snapshot and resources mutually exclusive",
);
assert.match(
  actions,
  /async function ensureSandboxStarted[\s\S]*sandbox\.start\(timeoutSeconds\)[\s\S]*sandbox\.waitUntilStarted\?\.\(timeoutSeconds\)/,
  "Daytona direct action must start stopped reusable sandboxes instead of only waiting on them",
);
assert.match(
  actions,
  /snapshotId: lifecycle\.snapshotId[\s\S]*targetRegion: lifecycle\.targetRegion[\s\S]*autoStopMinutes: lifecycle\.autoStopMinutes[\s\S]*autoArchiveMinutes: lifecycle\.autoArchiveMinutes[\s\S]*autoDeleteMinutes: lifecycle\.autoDeleteMinutes[\s\S]*lifecycleMode[\s\S]*providerEphemeral: lifecycle\.providerEphemeral/,
  "Daytona action must return non-secret lifecycle and provider persistence metadata for runtime receipts",
);
assert.match(
  actions,
  /type DaytonaTargetTiming = \{[\s\S]*target_claim_ms[\s\S]*sandbox_create_or_get_ms[\s\S]*sandbox_start_ms[\s\S]*worker_start_ms[\s\S]*worker_http_ready_ms[\s\S]*worker_health_ready_mode[\s\S]*codex_app_server_init_ms[\s\S]*preview_url_ms[\s\S]*target_ready_persist_ms[\s\S]*target_ready_total_ms[\s\S]*cached_target_ready/,
  "Daytona target action must model non-secret startup timing receipts",
);
assert.match(
  actions,
  /const timing: DaytonaTargetTiming = \{[\s\S]*target_claim_ms: elapsedMs\(targetClaimStartedAtMs\)[\s\S]*sandbox_create_or_get_ms[\s\S]*worker_http_ready_ms[\s\S]*worker_health_ready_mode[\s\S]*codex_app_server_init_ms[\s\S]*preview_url_ms[\s\S]*target_ready_persist_ms[\s\S]*target_ready_total_ms/,
  "Daytona target action must measure claim, sandbox, worker, preview, persist, and total target readiness",
);
assert.match(
  actions,
  /timing\.sandbox_create_or_get_ms = elapsedMs[\s\S]*timing\.sandbox_start_ms = elapsedMs[\s\S]*timing\.worker_start_ms = elapsedMs[\s\S]*timing\.worker_http_ready_ms = timing\.worker_start_ms[\s\S]*timing\.preview_url_ms = elapsedMs[\s\S]*timing\.codex_app_server_init_ms[\s\S]*timing\.worker_health_ready_mode[\s\S]*timing\.target_ready_persist_ms = elapsedMs[\s\S]*timing\.target_ready_total_ms = elapsedMs/,
  "Daytona target action must fill startup timing buckets",
);
assert.match(
  actions,
  /const workerStartStartedAtMs = Date\.now\(\)[\s\S]*const previewUrlStartedAtMs = Date\.now\(\)[\s\S]*const \[workerHealth, preview\] = await Promise\.all\(\[[\s\S]*startWorker\(\{ sandbox, authToken \}\)\.finally\(\(\) => \{[\s\S]*timing\.worker_start_ms = elapsedMs\(workerStartStartedAtMs\)[\s\S]*timing\.worker_http_ready_ms = timing\.worker_start_ms[\s\S]*Promise\.resolve\(sandbox\.getSignedPreviewUrl\?\.\(WORKER_PORT, previewSeconds\)\)\.finally\(\(\) => \{[\s\S]*timing\.preview_url_ms = elapsedMs\(previewUrlStartedAtMs\)/,
  "Daytona target action must overlap worker startup and signed preview URL resolution after sandbox start",
);
assert.match(
  actions,
  /codexHealth[\s\S]*timing\.codex_app_server_init_ms = readOptionalNonNegativeNumber\(codexHealth\?\.init_latency_ms\)[\s\S]*timing\.worker_health_ready_mode = codexHealth\?\.initialized === true \? "codex" : "http"/,
  "Daytona target timing must distinguish HTTP readiness from full native Codex readiness",
);
assert.match(
  actions,
  /const workspaceRoot = readEnv\("POLYNET_DAYTONA_WORKSPACE_ROOT"\) \|\| DEFAULT_WORKSPACE_ROOT[\s\S]*POLYNET_CODEX_WORKSPACE_HOST: "daytona"[\s\S]*POLYNET_DAYTONA_WORKSPACE_ROOT: workspaceRoot[\s\S]*POLYNET_CODEX_WORKER_AGENT_CWD: workspaceRoot[\s\S]*POLYNET_CODEX_WORKER_MODEL[\s\S]*DAYTONA_RUNTIME_POLICY\.nativeCodex\.defaultModelId[\s\S]*run_polynet_codex_worker_service_local\.sh/,
  "Daytona direct action must start the existing Codex worker inside the Daytona sandbox with Codex cwd aligned to the Daytona workspace root",
);
assert.match(
  actions,
  /const DEFAULT_REMOTE_ROOT = DAYTONA_CODEX_REMOTE_ROOT;[\s\S]*const DEFAULT_WORKSPACE_ROOT = DAYTONA_CODEX_WORKSPACE_ROOT;[\s\S]*mkdir -p \$\{shellQuote\(workerEnv\.POLYNET_DAYTONA_WORKSPACE_ROOT\)\}/,
  "Daytona direct action must keep the runtime repo and user workspace in separate roots and create the user workspace before starting the worker",
);
assert.match(
  workerRunner,
  /DEFAULT_CODEX_HOME_DIR="\/home\/daytona\/\.polynet-codex-home"[\s\S]*DEFAULT_CODEX_HOME_DIR="\$\{TMPDIR:-\/tmp\}\/polynet-codex-worker-local\/codex-home"[\s\S]*CODEX_HOME_DIR="\$\{POLYNET_CODEX_WORKER_CODEX_HOME:-\$DEFAULT_CODEX_HOME_DIR\}"/,
  "Daytona worker runner must keep Codex home outside the user workspace by default while supporting local proofs",
);
assert.match(
  workerRunner,
  /join\(rootDir, "shared\/daytonaCodexRuntimePolicy\.ts"\)[\s\S]*renderDaytonaCodexCliConfigToml\(\{[\s\S]*model: process\.env\.POLYNET_CODEX_WORKER_MODEL \|\| null/,
  "Daytona worker runner must render Codex CLI config from the shared Daytona runtime policy",
);
assert.doesNotMatch(
  workerRunner,
  /POLYNET_CODEX_WORKER_MODEL="\$\{POLYNET_CODEX_WORKER_MODEL:-gpt-5\.5\}"/,
  "Daytona worker runner must not duplicate the shared default Codex model",
);
assert.doesNotMatch(
  workerRunner,
  /POLYNET_DAYTONA_WORKSPACE_ROOT[\s\S]*CODEX_HOME_DIR="\$\{POLYNET_CODEX_WORKER_CODEX_HOME:-"\$DAYTONA_WORKSPACE_ROOT\/\.polynet-codex-home"\}"/,
  "Daytona worker runner must not derive Codex home from the user workspace root",
);
assert.doesNotMatch(
  liveSmoke,
  /!\s+-name \.polynet-codex-home/,
  "Daytona live smoke must not preserve a legacy Codex home inside the runtime repo",
);
assert.match(
  daytonaRuntimePolicy,
  /DEFAULT_ACTIVE_MODEL_ID[\s\S]*POLYNET_DAYTONA_CODEX_SANDBOX_MODE[\s\S]*value === "workspace-write"[\s\S]*return "workspace-write"[\s\S]*return "danger-full-access"[\s\S]*type: "dangerFullAccess"[\s\S]*sandbox_mode = \$\{tomlString\(policy\.nativeCodex\.threadSandbox\)\}/,
  "Daytona runtime policy must default Codex to danger-full-access while preserving an explicit workspace-write rollback",
);
assert.match(
  worker,
  /const CODEX_APP_SERVER_ENV_ALLOWLIST = \[[\s\S]*"PATH"[\s\S]*"CODEX_HOME"[\s\S]*export function buildCodexAppServerEnv\(source: NodeJS\.ProcessEnv\)[\s\S]*key\.startsWith\("LC_"\)[\s\S]*env: buildCodexAppServerEnv\(process\.env\)[\s\S]*const codexAppServerEnv = buildCodexAppServerEnv\(process\.env\)[\s\S]*env: codexAppServerEnv/,
  "Codex app-server subprocesses must inherit only an explicit allowlisted env from the worker",
);
assert.doesNotMatch(
  worker,
  /env:\s*process\.env/,
  "Codex app-server subprocesses must not inherit the full worker process env",
);
assert.match(
  worker,
  /const configuredTurnTimeoutSeconds = readIntegerEnv\("POLYNET_CODEX_WORKER_TURN_TIMEOUT_SECONDS", 0\);[\s\S]*configuredTurnTimeoutSeconds > 0 \? configuredTurnTimeoutSeconds \* 1000 : null[\s\S]*typeof timeoutMs === "number" && timeoutMs > 0[\s\S]*Optional operator backstop only; active agent turns do not[\s\S]*have a product hard cap by default/,
  "Codex worker turns must have no product hard cap by default while preserving an explicit operator timeout backstop",
);
assert.match(
  liveSmoke,
  /installBubblewrap:[\s\S]*--install-bubblewrap[\s\S]*POLYNET_DAYTONA_SMOKE_INSTALL_BUBBLEWRAP/,
  "Daytona live smoke must expose an explicit staging-only bubblewrap repair flag",
);
assert.match(
  liveSmoke,
  /forceWorkspaceWrite[\s\S]*--codex-workspace-write[\s\S]*POLYNET_DAYTONA_SMOKE_CODEX_WORKSPACE_WRITE[\s\S]*codexFullAccess: !forceWorkspaceWrite[\s\S]*if \(!params\.codexFullAccess\)[\s\S]*POLYNET_DAYTONA_CODEX_SANDBOX_MODE = "workspace-write"[\s\S]*FULL_ACCESS_CANARY_ENV_NAME[\s\S]*FULL_ACCESS_CANARY_FILE/,
  "Daytona live smoke must default to Codex full-access, expose a workspace-write rollback, and keep env/file canaries",
);
assert.match(
  liveSmoke,
  /nativeCodex\?\.thread_sandbox !== expectedThreadSandbox[\s\S]*turnSandboxPolicy\?\.type !== "dangerFullAccess"[\s\S]*envSeen !== "no"[\s\S]*worker env canary[\s\S]*fileSeen !== "yes" && fileSeen !== "no"/,
  "Daytona live smoke must verify danger-full-access policy receipts, require hidden worker env canaries, and record file canary visibility",
);
assert.match(
  liveSmoke,
  /sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y bubblewrap[\s\S]*sudo -n chmod u\+s \/usr\/bin\/bwrap[\s\S]*bwrap --ro-bind \/ \/ --dev \/dev --proc \/proc --tmpfs \/tmp \/bin\/sh -lc 'echo bwrap-ok'/,
  "Daytona live smoke bubblewrap repair must install bwrap, set setuid-root mode, and prove bwrap startup",
);
assert.match(
  liveSmoke,
  /native_file_readback_exit_code[\s\S]*native_file_readback_ok[\s\S]*approval_denial_count/,
  "Daytona live smoke must keep native Codex file-write failures diagnostic instead of stopping at cat failure",
);
assert.match(
  liveSmoke,
  /nativeWorkspaceProbe:[\s\S]*--native-workspace-probe[\s\S]*POLYNET_DAYTONA_NATIVE_WORKSPACE_PROBE/,
  "Daytona live smoke must expose a focused native workspace probe mode",
);
assert.match(
  liveSmoke,
  /runNativeCodexWorkspaceProbe[\s\S]*Do not call workspace_serve[\s\S]*Do not call computer_open_url or computer_screenshot[\s\S]*Do not call workspace_bash/,
  "native workspace probe must instruct Codex to avoid preview, computer, and duplicate shell fallback tools",
);
assert.match(
  liveSmoke,
  /assertNativeWorkspaceProbeResult[\s\S]*assertPreparedSmokeResult[\s\S]*codexFullAccess: true[\s\S]*countNativeProbeRuntimeAdapterCalls[\s\S]*runtimeAdapterCallCount !== 0[\s\S]*native_file_readback_ok/,
  "native workspace probe must verify full-access policy, no runtime adapter calls, and native file readback",
);
assert.match(
  liveSmoke,
  /interactivePreviewProbe:[\s\S]*--interactive-preview-probe[\s\S]*POLYNET_DAYTONA_INTERACTIVE_PREVIEW_PROBE/,
  "Daytona live smoke must expose a focused interactive preview probe mode",
);
assert.match(
  liveSmoke,
  /runInteractivePreviewCodexProbe[\s\S]*workspace_serve exactly once[\s\S]*Do not call workspace_bash, computer_open_url, computer_screenshot[\s\S]*python3 -m http\.server/,
  "interactive preview probe must ask Codex to write a deterministic app and serve it without fallback tools",
);
assert.match(
  liveSmoke,
  /assertInteractivePreviewCodexProbeResult[\s\S]*workspace_serve_requested[\s\S]*workspace_serve_finished[\s\S]*workspace_preview_ready[\s\S]*interactive_file_readback_ok/,
  "interactive preview probe must verify native file creation and preview adapter events before browser validation",
);
assert.match(
  liveSmoke,
  /runSignedPreviewBrowserInteractionProbe[\s\S]*getSignedPreviewUrl[\s\S]*chromium\.launch[\s\S]*#count-up[\s\S]*#count-value[\s\S]*afterText === "1"/,
  "interactive preview probe must open the signed Daytona preview with Playwright and prove a click updates the DOM",
);
assert.match(
  liveSmoke,
  /nativeProbeFailureSignals[\s\S]*shell wrapper[\s\S]*sandbox networking setup[\s\S]*patch layer[\s\S]*workspace shell access is blocked/,
  "native workspace probe must classify the known shell, sandbox, patch, and write failure signatures",
);
assert.match(
  liveSmoke,
  /sandboxDirectWriteOk[\s\S]*workspace_write_probe[\s\S]*classifyNativeWorkspaceProbeFailure[\s\S]*daytona_direct_write_ok_codex_native_workspace_failed/,
  "native workspace probe must distinguish Daytona direct write success from Codex native workspace failure",
);
assert.match(
  liveSmoke,
  /args\.nativeWorkspaceProbe && !args\.codexFullAccess[\s\S]*requires Codex danger-full-access[\s\S]*!args\.nativeWorkspaceProbe && typeof sandbox\.getSignedPreviewUrl/,
  "native workspace probe must require full access and skip preview URL resolution",
);
assert.match(
  liveSmoke,
  /args\.interactivePreviewProbe && !args\.codexFullAccess[\s\S]*requires Codex danger-full-access[\s\S]*runSignedPreviewBrowserInteractionProbe/,
  "interactive preview probe must require full access and run browser interaction validation",
);
assert.match(
  liveSmoke,
  /const codex = asRecord\(parsed\.codex\);[\s\S]*parsed\.ok === true && codex\?\.initialized === true/,
  "Daytona live smoke must wait for full Codex app-server readiness, not only worker HTTP readiness",
);
assert.match(
  snapshotPromote,
  /runStagingGuard[\s\S]*CONVEX_DEPLOYMENT: EXPECTED_CONVEX_DEPLOYMENT[\s\S]*POLYNET_DEPLOYMENT_KIND: "staging"/,
  "snapshot promotion must run the staging guard with the staging Convex deployment",
);
assert.match(
  snapshotPromote,
  /DAYTONA_SNAPSHOT is required[\s\S]*refusing to promote from an unbootstrapped base/,
  "snapshot promotion must fail closed when no base Daytona snapshot is configured",
);
assert.match(
  snapshotPromote,
  /npm ci --omit=dev --ignore-scripts --no-audit --no-fund[\s\S]*npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund/,
  "snapshot promotion must install production dependencies and Codex CLI before snapshotting",
);
assert.match(
  snapshotPromote,
  /verifyRuntimeFiles[\s\S]*package_json[\s\S]*node_modules[\s\S]*codex_cli[\s\S]*worker_runner[\s\S]*danger-full-access/,
  "snapshot promotion must verify runtime files and danger-full-access policy before accepting a snapshot",
);
assert.match(
  snapshotPromote,
  /writeSnapshotReceipt[\s\S]*snapshot_name[\s\S]*source_branch[\s\S]*source_head[\s\S]*source_dirty_file_count[\s\S]*REMOTE_SNAPSHOT_RECEIPT/,
  "snapshot promotion must persist a non-secret identity receipt inside the snapshot",
);
assert.match(
  snapshotPromote,
  /cleanBeforeSnapshot[\s\S]*REMOTE_WORKSPACE_ROOT[\s\S]*find \$\{shellQuote\(REMOTE_WORKSPACE_ROOT\)\} -mindepth 1 -maxdepth 1 -exec rm -rf \{\} \+/,
  "snapshot promotion must clean the user workspace and worker logs before snapshotting",
);
assert.match(
  snapshotPromote,
  /_experimental_createSnapshot\(args\.snapshotName, 900\)[\s\S]*verifier_sandbox_create[\s\S]*snapshot: args\.snapshotName[\s\S]*readSnapshotReceipt[\s\S]*startWorkerFromSnapshot/,
  "snapshot promotion must create a Daytona snapshot and verify it from a no-upload sandbox",
);
assert.match(
  snapshotPromote,
  /runNativeCodexWorkspaceProbe[\s\S]*Do not call workspace_serve[\s\S]*Do not call computer_open_url or computer_screenshot[\s\S]*Do not call workspace_bash[\s\S]*runtimeAdapterCallCount !== 0/,
  "snapshot promotion native probe must forbid preview, computer, and duplicate shell fallback tools",
);
assert.match(
  snapshotPromote,
  /setConvexSnapshotEnv[\s\S]*\["convex", "env", "set", "DAYTONA_SNAPSHOT", snapshotName\][\s\S]*\["convex", "env", "remove", "POLYNET_DAYTONA_DIRECT_SANDBOX_ID"\][\s\S]*\["convex", "env", "remove", "POLYNET_DAYTONA_DIRECT_LIFECYCLE_MODE"\]/,
  "snapshot promotion must update only staging DAYTONA_SNAPSHOT and clear prepared sandbox overrides",
);
assert.match(
  actions,
  /getSignedPreviewUrl\?\.\(WORKER_PORT, previewSeconds\)[\s\S]*markDaytonaCodexRuntimeTargetReadyInternal/,
  "Daytona direct action must resolve a signed worker URL and persist it as target readiness",
);
assert.match(
  actions,
  /teardownDaytonaCodexRuntimeTargetInternal = internalAction[\s\S]*getDaytonaCodexRuntimeTargetByRunIdInternal[\s\S]*lifecycleMode === "prepared_staging_reuse"[\s\S]*cleanupDecision: "skip_prepared_staging_reuse"[\s\S]*state: "skipped"/,
  "Daytona teardown must keep prepared staging reuse isolated from normal cleanup",
);
assert.match(
  actions,
  /scanDaytonaWorkspaceForMeaningfulFiles[\s\S]*node_modules[\s\S]*\.next[\s\S]*meaningful_file_count[\s\S]*meaningfulFilePreview/,
  "Daytona teardown must scan the workspace and ignore obvious dependency/cache/build folders before deciding retention",
);
assert.match(
  actions,
  /previewLeaseActive[\s\S]*cleanupDecision: "keep_running_active_preview"[\s\S]*state: "skipped"[\s\S]*active_preview_lease/,
  "Daytona teardown must keep the sandbox running when an active preview lease exists",
);
assert.match(
  actions,
  /lifecycleMode === "thread_ephemeral"[\s\S]*cleanupDecision: "keep_thread_ephemeral_reuse"[\s\S]*state: "skipped"[\s\S]*thread_ephemeral_reuse/,
  "Daytona teardown must keep thread-scoped sandboxes reusable across Helena/Codex turns",
);
assert.match(
  actions,
  /lifecycleMode === "thread_ephemeral"[\s\S]*deleteDaytonaSandbox[\s\S]*workspaceChangeState: workspaceScan\.changeState[\s\S]*workspaceRetentionState: "none"[\s\S]*cleanupDecision: "delete_without_active_lease"[\s\S]*state: "deleted"[\s\S]*appendDaytonaPreviewStoppedEventBestEffort/,
  "Daytona teardown must still delete explicit per-turn sandboxes without an active preview lease even when workspace files are dirty or unscannable",
);
assert.doesNotMatch(
  actions,
  /stopDaytonaSandboxForRetention|cleanupDecision: "stop_for_human_save"[\s\S]*state: "stopped"/,
  "Daytona teardown must not stop and retain dirty files by default; dirty workspace state is telemetry only",
);
assert.match(
  actions,
  /type DaytonaProviderTeardownTiming = \{[\s\S]*provider_teardown_ms[\s\S]*const teardownStartedAtMs = Date\.now\(\)[\s\S]*provider_teardown_ms: elapsedMs\(teardownStartedAtMs\)[\s\S]*timing: timing\(\)/,
  "Daytona teardown must return non-secret provider teardown timing receipts",
);
assert.match(
  actions,
  /isDaytonaNotFoundError\(error\)[\s\S]*state: "deleted"[\s\S]*reason: `\$\{args\.reason\}:sandbox_missing`[\s\S]*appendDaytonaPreviewStoppedEventBestEffort/,
  "Daytona teardown must treat already-missing sandboxes as deleted for idempotent cleanup and tombstone active previews",
);
assert.match(
  actions,
  /const message = sanitizeDaytonaRuntimeError\(error\);[\s\S]*markDaytonaCodexRuntimeTargetProviderTeardownInternal[\s\S]*state: "failed"[\s\S]*errorCode: daytonaRuntimeErrorCode\(error\)[\s\S]*errorMessage: message/,
  "Daytona teardown failures must be sanitized and persisted",
);
assert.match(
  actions,
  /teardownAndRecordDaytonaCodexRuntimeTargetInternal = internalAction[\s\S]*getDaytonaCodexRuntimeTargetByRunIdInternal[\s\S]*teardownDaytonaCodexRuntimeTargetInternal[\s\S]*appendTeardownRuntimeEventBestEffort[\s\S]*eventType: "daytona_codex_runtime_provider_teardown_finished"[\s\S]*eventType: "daytona_codex_runtime_provider_teardown_failed"/,
  "scheduled Daytona teardown must execute provider cleanup and append finished or failed runtime events outside the visible turn path",
);
assert.match(
  threads,
  /appendCloudRuntimeRunEventInternal = internalMutation[\s\S]*requireOwnedCloudThread[\s\S]*getRuntimeRunByOwnerRunId[\s\S]*by_owner_run_eventKey[\s\S]*runtimeRunEvents[\s\S]*lastEventSeq/,
  "threads must expose a trusted internal runtime-event append path for scheduled provider cleanup audit events",
);
assert.match(
  actions,
  /appendTeardownRuntimeEventBestEffort[\s\S]*threads\.appendCloudRuntimeRunEventInternal/,
  "scheduled Daytona teardown audit events must use the trusted internal append path instead of the authenticated public mutation",
);
assert.match(
  actions,
  /appendDaytonaPreviewStoppedEventBestEffort[\s\S]*markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal[\s\S]*eventType: "workspace_preview_stopped"[\s\S]*target_run_id: params\.runId/,
  "provider stop/delete cleanup must append workspace_preview_stopped so stale Daytona preview cards leave the UI",
);
assert.match(
  actions,
  /isDaytonaSandboxUnavailableForPreviewState[\s\S]*state === "archived"[\s\S]*state === "destroyed"[\s\S]*resolveDaytonaCodexRuntimePreviewInternal[\s\S]*isDaytonaNotFoundError\(error\)[\s\S]*preview_resolution_sandbox_missing[\s\S]*providerSandboxState[\s\S]*markDaytonaCodexRuntimeTargetProviderTeardownInternal[\s\S]*appendDaytonaPreviewStoppedEventBestEffort[\s\S]*source: "preview_resolution_provider_state"[\s\S]*code: "daytona_sandbox_not_available"[\s\S]*getSignedPreviewUrl\(port, expiresInSeconds\)/,
  "Daytona preview resolution must reconcile provider-stopped sandbox state before minting a stale iframe URL",
);
assert.match(
  actions,
  /finalizeDaytonaCodexRuntimeTargetFromWorkerIngestInternal = internalAction[\s\S]*releaseDaytonaCodexRuntimeTargetInternal[\s\S]*activePreviewPorts[\s\S]*daytona_codex_runtime_provider_teardown_started[\s\S]*cleanup_mode: "durable_ingest"[\s\S]*ctx\.scheduler\.runAfter\([\s\S]*teardownAndRecordDaytonaCodexRuntimeTargetInternal[\s\S]*failure_stage: "schedule"/,
  "durable worker ingest must have an idempotent Daytona target finalizer that releases preview leases and schedules provider teardown",
);
assert.match(
  actions,
  /resolveHumanSaveRetentionExpiresAt[\s\S]*workspaceRetentionState[\s\S]*human_save_pending[\s\S]*existingExpiresAt > nowMs[\s\S]*return existingExpiresAt/,
  "Daytona teardown must preserve an existing human-save deadline instead of extending it after preview expiry",
);
assert.match(
  actions,
  /sweepExpiredDaytonaCodexRuntimeTargetsInternal = internalAction[\s\S]*targetId: v\.optional\(v\.id\("daytonaCodexRuntimeTargets"\)\)[\s\S]*getDaytonaCodexRuntimeTargetByIdInternal[\s\S]*listExpiredDaytonaCodexRuntimeTargetsInternal[\s\S]*expiredRetentionTargets[\s\S]*deleteExpiredHumanSaveRetentionTarget[\s\S]*expiredPreviewLeaseTargets[\s\S]*markDaytonaCodexRuntimeTargetPreviewLeaseExpiredInternal[\s\S]*teardownAndRecordDaytonaCodexRuntimeTargetInternal/,
  "Daytona sweeper must support a focused target-id probe while broad sweeps still process expired retention first, then expire preview leases and re-enter teardown",
);
assert.match(
  actions,
  /shouldSkipExpiredTargetCleanup[\s\S]*isActivePreviewLease\(target, nowMs\)[\s\S]*return "active_preview_lease"/,
  "Daytona sweeper must protect still-active preview leases from expired retention deletion",
);
assert.match(
  actions,
  /deleteExpiredHumanSaveRetentionTarget[\s\S]*shouldSkipExpiredTargetCleanup[\s\S]*deleteDaytonaSandbox[\s\S]*markDaytonaCodexRuntimeTargetRetentionExpiredInternal[\s\S]*markDaytonaCodexRuntimeTargetProviderTeardownInternal[\s\S]*state: "deleted"/,
  "Daytona sweeper must delete expired retained sandboxes, skip still-active preview leases, and persist expired/deleted state",
);
assert.match(
  crons,
  /sweep expired daytona codex runtime targets[\s\S]*\{ minutes: 5 \}[\s\S]*daytonaCodexRuntimeTargetActions[\s\S]*sweepExpiredDaytonaCodexRuntimeTargetsInternal[\s\S]*limit: 20/,
  "Convex cron must run the bounded Daytona Codex expired-target sweeper",
);

assert.match(
  cleanupSweeperProbe,
  /EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949"[\s\S]*EXPECTED_DEPLOYMENT_KIND = "staging"[\s\S]*missing required --target-id/,
  "cleanup sweeper probe must be explicit-target and staging-only",
);
assert.match(
  cleanupSweeperProbe,
  /CONVEX_DEPLOY_KEY[\s\S]*must not run with deploy-key authority[\s\S]*DAYTONA_API_KEY[\s\S]*DAYTONA_JWT_TOKEN/,
  "cleanup sweeper probe must refuse deploy-key authority and require Daytona provider credentials",
);
assert.match(
  cleanupSweeperProbe,
  /getDaytonaCodexRuntimeTargetByIdInternal[\s\S]*sweepExpiredDaytonaCodexRuntimeTargetsInternal[\s\S]*targetId[\s\S]*nowMs[\s\S]*limit: 1/,
  "cleanup sweeper probe must read one target and invoke the targeted sweeper path",
);
assert.match(
  cleanupSweeperProbe,
  /assertInitialTarget[\s\S]*previewLeaseState[\s\S]*active[\s\S]*previewLeaseExpiresAt \+ 1[\s\S]*assertDeletedAfterPreviewExpiry[\s\S]*workspaceRetentionState[\s\S]*none[\s\S]*cleanupDecision[\s\S]*delete_without_active_lease/,
  "cleanup sweeper probe must prove active preview expiry deletes the sandbox instead of retaining dirty files",
);
assert.doesNotMatch(
  cleanupSweeperProbe,
  /assertStoppedForHumanSave|assertRetentionExpiryResult|assertDeletedAfterRetention|retentionSweepNowMs/,
  "cleanup sweeper probe must not require a second human-save retention sweep after preview expiry",
);

assert.match(
  stopResumePersistenceProbe,
  /EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949"[\s\S]*EXPECTED_DEPLOYMENT_KIND = "staging"[\s\S]*CONVEX_DEPLOY_KEY[\s\S]*provider probe must not run with deploy-key authority/,
  "Daytona stop/resume persistence probe must be staging-only and refuse deploy-key authority",
);
assert.match(
  stopResumePersistenceProbe,
  /DAYTONA_API_KEY[\s\S]*DAYTONA_JWT_TOKEN[\s\S]*DAYTONA_ORGANIZATION_ID/,
  "Daytona stop/resume persistence probe must require provider credentials without printing them",
);
assert.match(
  stopResumePersistenceProbe,
  /ephemeral: false[\s\S]*expectedFailure: false[\s\S]*non-ephemeral stop\/resume persistence failed/,
  "Daytona stop/resume persistence probe must treat non-ephemeral persistence as the required retention primitive",
);
assert.match(
  stopResumePersistenceProbe,
  /mkdir -p \$\{shellQuote\(DAYTONA_CODEX_WORKSPACE_ROOT\)\}[\s\S]*printf \$\{shellQuote\(marker\)\} > \$\{shellQuote\(MARKER_FILE\)\}[\s\S]*sandbox\.stop\(120, true\)[\s\S]*params\.daytona\.get\(sandbox\.id\)[\s\S]*afterStop\.start\(180\)[\s\S]*cat \$\{shellQuote\(MARKER_FILE\)\}/,
  "Daytona stop/resume persistence probe must write a workspace marker, stop, resolve by id, restart, and read the marker back",
);
assert.match(
  stopResumePersistenceProbe,
  /--compare-ephemeral[\s\S]*ephemeral: true[\s\S]*expectedFailure: true/,
  "Daytona stop/resume persistence probe must optionally compare current ephemeral stop behavior as evidence",
);
assert.match(
  stopResumePersistenceProbe,
  /deleteSandbox[\s\S]*sandbox\.delete\(120\)[\s\S]*daytona\.delete\(sandbox, 120\)/,
  "Daytona stop/resume persistence probe must clean up provider sandboxes after the probe",
);

assert.match(
  bridge,
  /type PolynetCodexWorkerTransportProvider = "daytona_direct"/,
  "bridge must model direct Daytona as the only Codex runtime transport provider",
);
assert.doesNotMatch(
  bridge,
  /worker_url|legacy_url|POLYNET_CODEX_RUNTIME_PROVIDER|POLYNET_CODEX_WORKER_URL|readCodexRuntimeProvider|workerUrlDeploymentMismatch|polynet_codex_worker_deleted_host_url/,
  "bridge must not retain the deleted worker URL transport rail",
);
assert.match(
  bridge,
  /hasDaytonaCredentials\(\)[\s\S]*daytona_direct_credentials_missing/,
  "bridge must fail closed when direct Daytona credentials are missing",
);
assert.match(
  bridge,
  /target\?: PolynetCodexWorkerResolvedTarget \| null[\s\S]*resolveWorkerTransport\(\{ target: params\.target/,
  "bridge stream/cancel/steer must consume a resolved Daytona target instead of requiring a canonical worker URL",
);
assert.match(
  bridge,
  /daytona_direct_target_missing/,
  "bridge must report a missing direct target rather than falling back to a deleted worker rail",
);

assert.match(
  handlers,
  /daytona_codex_runtime_target_resolve_started[\s\S]*daytonaCodexRuntimeTargetActions[\s\S]*ensureDaytonaCodexRuntimeTargetInternal/,
  "runtime handler must unconditionally resolve a Daytona target before streaming Codex worker turns",
);
assert.match(
  handlers,
  /daytona_codex_runtime_target_resolve_started[\s\S]*transport: "daytona_direct"/,
  "runtime handler must mark Daytona target resolution as the direct transport path",
);
assert.match(
  handlers,
  /if \(runtimeProjectId\)[\s\S]*eventType: "workspace_session_skipped"[\s\S]*transport: "daytona_direct"[\s\S]*daytona_direct_uses_runtime_workspace/,
  "direct Daytona turns must not create or require a legacy project workspace session",
);
assert.doesNotMatch(
  handlers,
  /createProjectRuntimeWorkspaceSession|workspace_session_adopted|workerWorkspaceSession|disposeRuntimeWorkspaceSession|workerBridgeConfig|getPolynetCodexWorkerBridgeConfig/,
  "runtime handler must not retain the legacy project-workspace adoption branch or handler-local transport branch for Codex worker turns",
);
const readyEventIndex = handlers.indexOf('eventType: "daytona_codex_runtime_target_ready"');
assert.notEqual(readyEventIndex, -1, "runtime handler must emit Daytona readiness evidence");
const readyEventBlock = handlers.slice(readyEventIndex, readyEventIndex + 1800);
assert.match(
  readyEventBlock,
  /provider: "daytona"[\s\S]*transport: "daytona_direct"[\s\S]*scope: resolvedScope[\s\S]*target_id[\s\S]*sandbox_id[\s\S]*lifecycle_mode: resolvedLifecycleMode[\s\S]*provider_ephemeral: resolvedProviderEphemeral[\s\S]*snapshot_id[\s\S]*target_region[\s\S]*auto_stop_minutes[\s\S]*auto_archive_minutes[\s\S]*auto_delete_minutes[\s\S]*worker_port[\s\S]*signed_preview_expires_at[\s\S]*timing: resolved\.timing/,
  "runtime handler must emit auditable non-secret Daytona readiness, provider persistence, and timing metadata",
);
assert.doesNotMatch(
  readyEventBlock,
  /workerUrl|authToken|worker_url|auth_token/,
  "Daytona readiness receipt must not expose the signed worker URL or auth token",
);
assert.match(
  handlers,
  /streamPolynetCodexWorkerTurn\(\{[\s\S]*target: workerResolvedTarget/,
  "runtime handler must pass the resolved Daytona target into the stream transport",
);
assert.match(
  handlers,
  /workspace_compute_cost_tracking: \{[\s\S]*cost_key: polynetCodexRuntimeCostKey[\s\S]*daytona_workspace_compute_usd_per_second/,
  "runtime handler must pass canonical workspace compute billing context to worker ingest",
);
assert.match(
  ingest,
  /asRecord\(contextRecord\?\.workspace_compute_cost_tracking\)/,
  "worker ingest must read the canonical workspace compute cost-tracking context",
);
assert.match(
  handlers,
  /const workerActivePreviewPorts = new Set<number>\(\)[\s\S]*workerEventType === "workspace_preview_ready"[\s\S]*workerActivePreviewPorts\.add[\s\S]*releaseDaytonaCodexRuntimeTargetInternal[\s\S]*activePreviewPorts: Array\.from\(workerActivePreviewPorts\)[\s\S]*daytona_codex_runtime_provider_teardown_started[\s\S]*cleanup_mode: "scheduled"[\s\S]*ctx\.scheduler\.runAfter\([\s\S]*teardownAndRecordDaytonaCodexRuntimeTargetInternal/,
  "runtime handler must release direct Daytona target ownership with active preview lease evidence and schedule provider teardown outside the visible turn path",
);
assert.doesNotMatch(
  handlers,
  /ctx\.runAction\([\s\S]{0,240}teardownDaytonaCodexRuntimeTargetInternal/,
  "runtime handler must not await provider teardown in the visible turn path",
);
assert.match(
  handlers,
  /daytona_codex_runtime_provider_teardown_failed[\s\S]*failure_stage: "schedule"[\s\S]*teardownError instanceof Error[\s\S]*teardownError\.message\.slice\(0, 1000\)/,
  "runtime handler must record teardown scheduling failures without blocking the run finalizer",
);
assert.match(
  ingest,
  /normalizeWorkspacePreviewPort[\s\S]*workspace_preview_ready[\s\S]*daytonaActivePreviewPorts[\s\S]*finalizeDaytonaCodexRuntimeTargetFromWorkerIngestInternal[\s\S]*daytona_lifecycle_finalized[\s\S]*daytona_active_preview_ports/,
  "durable worker ingest must normalize preview-ready ports and report Daytona lifecycle finalization evidence",
);

console.log("daytona_codex_direct_runtime_contract_proof: ok");
