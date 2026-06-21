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
const bridge = read("convex/polynetCodexWorkerBridge.ts");
const handlers = read("convex/runtimeTurnHandlers.ts");

assert.match(
  packageJson,
  /"check:daytona-codex-direct-runtime-proof"/,
  "package.json must expose the direct Daytona runtime contract proof",
);

assert.match(
  schema,
  /daytonaCodexRuntimeTargets: defineTable\(\{[\s\S]*scope: v\.union\([\s\S]*v\.literal\("run"\)[\s\S]*provider: v\.literal\("daytona"\)[\s\S]*workerState: v\.union\([\s\S]*v\.literal\("creating"\)[\s\S]*v\.literal\("ready"\)[\s\S]*workerUrl: v\.optional\(v\.string\(\)\)[\s\S]*signedPreviewExpiresAt[\s\S]*lifecycleMode[\s\S]*v\.literal\("prepared_staging_reuse"\)[\s\S]*v\.literal\("per_turn_ephemeral"\)[\s\S]*providerTeardownState/,
  "schema must persist Daytona runtime targets with run scope, worker state, URL, preview expiry, lifecycle mode, and provider teardown state",
);
assert.match(
  schema,
  /\.index\("by_owner_runId", \["ownerId", "runId"\]\)[\s\S]*\.index\("by_workerState_updatedAt", \["workerState", "updatedAt"\]\)/,
  "Daytona target table must support run lookup and lifecycle cleanup scans",
);

assert.match(
  state,
  /claimDaytonaCodexRuntimeTargetInternal = internalMutation[\s\S]*lifecycleMode: v\.union\([\s\S]*prepared_staging_reuse[\s\S]*per_turn_ephemeral[\s\S]*by_owner_runId[\s\S]*lifecycleMode: args\.lifecycleMode[\s\S]*scope: "run"[\s\S]*provider: "daytona"[\s\S]*workerState: "creating"[\s\S]*providerTeardownState: "pending"/,
  "target state must atomically claim a run-scoped Daytona target with lifecycle ownership",
);
assert.match(
  state,
  /markDaytonaCodexRuntimeTargetReadyInternal = internalMutation[\s\S]*workerState: "ready"[\s\S]*workerUrl[\s\S]*signedPreviewExpiresAt[\s\S]*lastHealthAt[\s\S]*providerTeardownState: "pending"/,
  "target state must mark worker URL readiness with health, signed preview expiry, and pending teardown",
);
assert.match(
  state,
  /releaseDaytonaCodexRuntimeTargetInternal = internalMutation[\s\S]*workerState: "released"[\s\S]*releaseReason/,
  "target state must release run ownership before provider teardown",
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
  /import \{ DAYTONA_RUNTIME_POLICY \} from "\.\.\/services\/polynet-codex-worker\/src\/daytonaRuntimePolicy\.ts"/,
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
  actions,
  /POLYNET_DAYTONA_DIRECT_PUBLIC_PREVIEW[\s\S]*policy\.publicPreview[\s\S]*POLYNET_DAYTONA_DIRECT_EPHEMERAL[\s\S]*policy\.ephemeral[\s\S]*POLYNET_DAYTONA_DIRECT_CPU[\s\S]*policy\.defaultResources\.cpu[\s\S]*POLYNET_DAYTONA_DIRECT_MEMORY[\s\S]*policy\.defaultResources\.memory[\s\S]*POLYNET_DAYTONA_DIRECT_DISK[\s\S]*policy\.defaultResources\.disk/,
  "Daytona direct targets must derive preview, ephemeral, and resource defaults from the canonical policy",
);
assert.match(
  actions,
  /function readConfiguredReusableSandboxId\(\): string[\s\S]*POLYNET_DAYTONA_DIRECT_SANDBOX_ID[\s\S]*function readDaytonaTargetLifecycleMode\(\): DaytonaTargetLifecycleMode[\s\S]*prepared_staging_reuse[\s\S]*per_turn_ephemeral/,
  "Daytona direct targets must distinguish temporary prepared sandbox reuse from per-turn ephemeral ownership",
);
assert.doesNotMatch(
  actions,
  /daytona-managed|DaytonaManaged|POLYNET_DAYTONA_MANAGED/,
  "Daytona direct target actions must not keep the deleted managed broker surface",
);
assert.match(
  actions,
  /public: params\.lifecycle\.publicPreview[\s\S]*ephemeral: params\.lifecycle\.ephemeral[\s\S]*autoStopInterval: params\.lifecycle\.autoStopMinutes[\s\S]*autoArchiveInterval: params\.lifecycle\.autoArchiveMinutes[\s\S]*\.\.\.\(snapshot \? \{ snapshot \} : \{ resources: params\.lifecycle\.resources \}\)/,
  "Daytona direct sandbox creation must use policy-backed preview and lifecycle defaults, while keeping snapshot and resources mutually exclusive",
);
assert.match(
  actions,
  /async function ensureSandboxStarted[\s\S]*sandbox\.start\(timeoutSeconds\)[\s\S]*sandbox\.waitUntilStarted\?\.\(timeoutSeconds\)/,
  "Daytona direct action must start stopped reusable sandboxes instead of only waiting on them",
);
assert.match(
  actions,
  /snapshotId: lifecycle\.snapshotId[\s\S]*targetRegion: lifecycle\.targetRegion[\s\S]*autoStopMinutes: lifecycle\.autoStopMinutes[\s\S]*autoArchiveMinutes: lifecycle\.autoArchiveMinutes[\s\S]*autoDeleteMinutes: lifecycle\.autoDeleteMinutes[\s\S]*lifecycleMode/,
  "Daytona action must return non-secret lifecycle metadata for runtime receipts",
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
  /POLYNET_CODEX_WORKSPACE_HOST: "daytona"[\s\S]*POLYNET_CODEX_WORKER_MODEL[\s\S]*gpt-5\.5[\s\S]*run_polynet_codex_worker_service_local\.sh/,
  "Daytona direct action must start the existing Codex worker inside the Daytona sandbox",
);
assert.match(
  actions,
  /getSignedPreviewUrl\?\.\(WORKER_PORT, previewSeconds\)[\s\S]*markDaytonaCodexRuntimeTargetReadyInternal/,
  "Daytona direct action must resolve a signed worker URL and persist it as target readiness",
);
assert.match(
  actions,
  /teardownDaytonaCodexRuntimeTargetInternal = internalAction[\s\S]*getDaytonaCodexRuntimeTargetByRunIdInternal[\s\S]*prepared_staging_reuse[\s\S]*state: "skipped"[\s\S]*reason: `\$\{args\.reason\}:prepared_staging_reuse`/,
  "Daytona teardown must skip and preserve the temporary prepared staging sandbox",
);
assert.match(
  actions,
  /teardownDaytonaCodexRuntimeTargetInternal[\s\S]*state: "pending"[\s\S]*daytona\.get\(sandboxId\)[\s\S]*sandbox\.delete[\s\S]*daytona\.delete[\s\S]*sandbox\.stop[\s\S]*finalState = "stopped"[\s\S]*state: finalState/,
  "Daytona teardown must delete per-turn sandboxes and accurately record stop fallback",
);
assert.match(
  actions,
  /type DaytonaProviderTeardownTiming = \{[\s\S]*provider_teardown_ms[\s\S]*const teardownStartedAtMs = Date\.now\(\)[\s\S]*provider_teardown_ms: elapsedMs\(teardownStartedAtMs\)[\s\S]*timing: timing\(\)/,
  "Daytona teardown must return non-secret provider teardown timing receipts",
);
assert.match(
  actions,
  /isDaytonaNotFoundError\(error\)[\s\S]*state: "deleted"[\s\S]*reason: `\$\{args\.reason\}:sandbox_missing`/,
  "Daytona teardown must treat already-missing sandboxes as deleted for idempotent cleanup",
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
  bridge,
  /type PolynetCodexWorkerTransportProvider = "worker_url" \| "daytona_direct"/,
  "bridge must model direct Daytona as a transport provider, not a second prompt system",
);
assert.match(
  bridge,
  /POLYNET_CODEX_RUNTIME_PROVIDER[\s\S]*return "daytona_direct"/,
  "bridge must default to direct Daytona when no stable worker URL is configured",
);
const providerFunctionIndex = bridge.indexOf("function readCodexRuntimeProvider()");
assert.notEqual(providerFunctionIndex, -1, "bridge must define runtime provider selection");
const providerFunctionBlock = bridge.slice(providerFunctionIndex, providerFunctionIndex + 600);
assert.doesNotMatch(
  providerFunctionBlock,
  /POLYNET_CODEX_WORKER_URL/,
  "stale worker URL env must not silently select the deleted worker URL rail",
);
assertIncludes(
  bridge,
  '/\\.proxy\\.daytona\\.works|app\\.daytona\\.io/',
  "bridge must reject ephemeral Daytona preview URLs and deleted Fly hosts on the explicit URL rail",
);
assertIncludes(
  bridge,
  '/\\.fly\\.dev/',
  "bridge must reject deleted Fly hosts on the explicit URL rail",
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
  /getPolynetCodexWorkerBridgeConfig\(\)[\s\S]*provider === "daytona_direct"[\s\S]*daytona_codex_runtime_target_resolve_started[\s\S]*daytonaCodexRuntimeTargetActions[\s\S]*ensureDaytonaCodexRuntimeTargetInternal/,
  "runtime handler must resolve a Daytona target before streaming direct Codex turns",
);
assert.match(
  handlers,
  /daytona_codex_runtime_target_resolve_started[\s\S]*transport: "daytona_direct"/,
  "runtime handler must mark Daytona target resolution as the direct transport path",
);
assert.match(
  handlers,
  /runtimeProjectId && workerBridgeConfig\.provider === "daytona_direct"[\s\S]*eventType: "workspace_session_skipped"[\s\S]*transport: "daytona_direct"[\s\S]*daytona_direct_uses_runtime_workspace/,
  "direct Daytona turns must not create or require a legacy project workspace session",
);
const readyEventIndex = handlers.indexOf('eventType: "daytona_codex_runtime_target_ready"');
assert.notEqual(readyEventIndex, -1, "runtime handler must emit Daytona readiness evidence");
const readyEventBlock = handlers.slice(readyEventIndex, readyEventIndex + 1800);
assert.match(
  readyEventBlock,
  /provider: "daytona"[\s\S]*transport: "daytona_direct"[\s\S]*scope: "run"[\s\S]*target_id[\s\S]*sandbox_id[\s\S]*snapshot_id[\s\S]*target_region[\s\S]*auto_stop_minutes[\s\S]*auto_archive_minutes[\s\S]*auto_delete_minutes[\s\S]*worker_port[\s\S]*signed_preview_expires_at[\s\S]*timing: resolved\.timing/,
  "runtime handler must emit auditable non-secret Daytona readiness and timing metadata",
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
  /const teardownReason = workerResult\.ok \? "turn_finished" : "turn_failed"[\s\S]*releaseDaytonaCodexRuntimeTargetInternal[\s\S]*reason: teardownReason[\s\S]*daytona_codex_runtime_provider_teardown_started[\s\S]*cleanup_mode: "scheduled"[\s\S]*ctx\.scheduler\.runAfter\([\s\S]*teardownAndRecordDaytonaCodexRuntimeTargetInternal/,
  "runtime handler must release direct Daytona target ownership and schedule provider teardown outside the visible turn path",
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

console.log("daytona_codex_direct_runtime_contract_proof: ok");
