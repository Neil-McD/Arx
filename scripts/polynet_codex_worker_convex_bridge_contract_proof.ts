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
const httpRoutes = read("convex/http.ts");
const ingest = read("convex/polynetCodexWorkerIngest.ts");
const terminal = read("convex/polynetCodexWorkerTerminal.ts");
const tool = read("convex/polynetCodexWorkerTool.ts");
const runToken = read("convex/polynetCodexWorkerRunToken.ts");
const disposal = read("convex/runtimeWorkspaceSessionDisposal.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeTurnPersistence = read("convex/runtimeTurnPersistence.ts");
const platformToolSurface = read("shared/polynetPlatformToolSurface.ts");
const worker = read("services/polynet-codex-worker/src/server.ts");
const ingestFailureLogStart = worker.indexOf('event: "ingest_push_failed"');
const ingestFailureLogBlock =
  ingestFailureLogStart >= 0 ? worker.slice(ingestFailureLogStart, ingestFailureLogStart + 800) : "";

assert.match(
  packageJson,
  /"check:polynet-codex-worker-convex-bridge": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/polynet_codex_worker_convex_bridge_contract_proof\.ts"/,
  "package.json must expose the Convex bridge contract proof",
);

assert.match(
  bridge,
  /POLYNET_CODEX_WORKER_ENGINE_ID = "polynet_codex_worker"/,
  "bridge must expose the canonical worker engine id",
);
for (const requiredEnvName of [
  "POLYNET_CODEX_WORKER_RUNTIME_ENABLED",
  "POLYNET_DEPLOYMENT_KIND",
  "POLYNET_CODEX_WORKER_URL",
  "POLYNET_CODEX_WORKER_AUTH_TOKEN",
]) {
  assert.match(
    bridge,
    new RegExp(requiredEnvName),
    `bridge must read ${requiredEnvName}`,
  );
}
assert.match(
  bridge,
  /polynet_codex_worker_deployment_kind_invalid/,
  "bridge must fail closed on invalid deployment kinds",
);
assert.match(
  bridge,
  /polynet_codex_worker_production_env_mismatch[\s\S]*polynet_codex_worker_staging_env_mismatch/,
  "bridge must reject obvious staging/production URL mismatches",
);
assert.match(
  bridge,
  /runtimeExecutionMode !== "agentic"[\s\S]*!params\.stream[\s\S]*inferenceSource !== "chatgpt"[\s\S]*getPolynetCodexWorkerBridgeConfig\(\)\.enabled/,
  "bridge must only route enabled streamed agentic ChatGPT turns",
);
assert.match(
  bridge,
  /fetch\(`\$\{config\.baseUrl\}\/v1\/codex\/turn\?stream=1`[\s\S]*Authorization: `Bearer \$\{config\.authToken\}`[\s\S]*chatgpt_auth: \{[\s\S]*access_token: params\.chatgptAuth\.accessToken[\s\S]*chatgpt_account_id: params\.chatgptAuth\.accountId/,
  "bridge must call the worker stream with bearer auth and per-user ChatGPT auth",
);
assert.match(
  bridge,
  /fly-force-instance-id/,
  "cancel and steer requests must be able to target the active Fly machine",
);
assert.match(
  bridge,
  /polynet_codex_worker_unreachable[\s\S]*polynet_codex_worker_stream_failed/,
  "bridge must normalize transport and stream failures",
);

assert.match(
  handlers,
  /shouldUsePolynetCodexWorkerBridge\(\{[\s\S]*runtimeExecutionMode,[\s\S]*stream,[\s\S]*inferenceSource/,
  "runtime handler must decide the worker bridge from resolved turn coordinates",
);
assert.match(
  handlers,
  /engineId: runtimeEngineId[\s\S]*POLYNET_CODEX_WORKER_CONTRACT_NAME[\s\S]*POLYNET_CODEX_WORKER_CONTRACT_VERSION/,
  "runtime runs must record the worker engine and contract when bridged",
);
assert.match(
  handlers,
  /if \(stream && usePolynetCodexWorkerBridge\) \{[\s\S]*runtimeSseResponse/,
  "worker path must be scoped to the streamed bridge branch",
);
assert.match(
  handlers,
  /countActivePolynetCodexWorkerRuns[\s\S]*project_run_limit_reached[\s\S]*user_run_limit_reached/,
  "worker path must enforce project and user concurrent-run caps",
);
assert.match(
  handlers,
  /getFreshChatgptAuthForUser\(\{[\s\S]*userId: String\(actor\.dbUserId\)[\s\S]*provider_connection_required/,
  "worker path must require fresh per-user ChatGPT auth",
);
assert.match(
  handlers,
  /createProjectRuntimeWorkspaceSession\(\{[\s\S]*projectId: runtimeProjectId[\s\S]*buildBlaxelProjectWorkspaceNames\(runtimeProjectId\)\.sandboxName/,
  "project-bound worker turns must adopt the canonical project workspace session",
);
assert.match(
  handlers,
  /buildPolynetCodexWorkerPrompt\(\{[\s\S]*communitySystemPrompt[\s\S]*agentName[\s\S]*threadWorkingState[\s\S]*allowedToolNames/,
  "worker prompt must receive PolyNet context from the runtime resolver",
);
assert.match(
  handlers,
  /buildPolynetCodexWorkerIngestTarget\(\)[\s\S]*polynet_codex_worker_ingest_unconfigured[\s\S]*buildPolynetCodexWorkerTerminalTarget\(\)[\s\S]*buildPolynetPlatformToolSpecs[\s\S]*buildPolynetCodexWorkerToolTarget\(\)/,
  "worker path must fail closed without durable ingest and then project terminal/tool bridge targets",
);
assert.match(
  handlers,
  /mintPolynetCodexWorkerRunTokenSet\(\{[\s\S]*ownerId: String\(actor\.dbUserId\)[\s\S]*includeTerminal: Boolean\(workerTerminalTarget\)[\s\S]*includeTool: Boolean\(workerToolTarget\)/,
  "worker path must mint per-run scoped tokens only for projected bridge surfaces",
);
assert.match(
  handlers,
  /streamPolynetCodexWorkerTurn\(\{[\s\S]*runId,[\s\S]*prompt: workerPrompt,[\s\S]*model: requestedModelId[\s\S]*sandboxName: workerSandboxName/,
  "worker path must delegate execution to the headless Codex worker",
);
assert.match(
  handlers,
  /pendingUserSteering[\s\S]*steerPolynetCodexWorkerTurn\(\{[\s\S]*machineId: workerMachineId/,
  "worker path must forward user steering to the active machine",
);
assert.match(
  handlers,
  /clearInterval\(workerCancelWatcher\)[\s\S]*cancelPolynetCodexWorkerTurn\(\{ runId, machineId: workerMachineId \}\)/,
  "worker path must clear the watcher and cancel failed remote turns",
);
assert.match(
  handlers,
  /event\.event === "runtime_event"[\s\S]*streamAppendRunEvent\(\{[\s\S]*worker_event_seq/,
  "worker runtime events must persist into Convex runtimeRunEvents",
);
assert.match(
  handlers,
  /disposeRuntimeWorkspaceSession\(\{[\s\S]*session: workerWorkspaceSession[\s\S]*source: "polynet_codex_worker"/,
  "worker path must dispose workspace leases through the shared disposal helper",
);
assert.match(
  handlers,
  /persistRuntimeAssistantMessage\(\{[\s\S]*engineId: POLYNET_CODEX_WORKER_ENGINE_ID[\s\S]*content: streamedContent/,
  "worker assistant output must persist with the worker engine id",
);
assert.match(
  runtimeTurnPersistence,
  /engineId\?: string \| null[\s\S]*const engineId = String\(args\.engineId[\s\S]*runtime_engine_id: engineId[\s\S]*engineId,/,
  "assistant persistence must store the resolved runtime engine id on both row and content metadata",
);

assert.match(
  httpRoutes,
  /POLYNET_CODEX_WORKER_INGEST_PATH[\s\S]*handlePolynetCodexWorkerIngest/,
  "ingest endpoint must be registered on the Convex http router",
);
assert.match(
  httpRoutes,
  /POLYNET_CODEX_WORKER_TERMINAL_PATH[\s\S]*handlePolynetCodexWorkerTerminal/,
  "terminal endpoint must be registered on the Convex http router",
);
assert.match(
  httpRoutes,
  /POLYNET_CODEX_WORKER_TOOL_PATH[\s\S]*handlePolynetCodexWorkerTool/,
  "platform-tool endpoint must be registered on the Convex http router",
);

assert.match(
  runToken,
  /POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET[\s\S]*"ingest"[\s\S]*"terminal"[\s\S]*"tool"[\s\S]*HMAC[\s\S]*SHA-256/,
  "run tokens must use endpoint audiences and HMAC SHA-256",
);
assert.match(
  runToken,
  /POLYNET_CODEX_WORKER_RUN_TOKEN_TTL_MS = 45 \* 60 \* 1000/,
  "run tokens must have a short default lifetime",
);
assert.match(
  runToken,
  /timingSafeEqual[\s\S]*expectedAudience[\s\S]*polynet_codex_worker_run_token_audience_mismatch[\s\S]*polynet_codex_worker_run_token_context_mismatch/,
  "run-token verification must check signature, audience, expiry, and run context",
);

assert.match(
  ingest,
  /POLYNET_CODEX_WORKER_AUTH_TOKEN[\s\S]*bearer !== expectedToken[\s\S]*verifyPolynetCodexWorkerRunToken\(\{[\s\S]*expectedAudience: "ingest"/,
  "ingest must require the shared bearer token and ingest-audience run token",
);
assert.match(
  ingest,
  /getRuntimeRunByOwnerRunIdInternal[\s\S]*runRow\.threadId[\s\S]*runRow\.engineId[\s\S]*invalid_run/,
  "ingest must validate the signed context against the canonical run row",
);
assert.match(
  ingest,
  /persistRuntimeAssistantMessage\(\{[\s\S]*messageKey: context\.assistant_message_key[\s\S]*engineId: POLYNET_CODEX_WORKER_ENGINE_ID[\s\S]*finishRunBestEffort/,
  "ingest must idempotently persist final assistant output and finish the run",
);
assert.match(
  ingest,
  /disposeRuntimeWorkspaceSession\(\{[\s\S]*source: "polynet_codex_worker_ingest"/,
  "ingest backstop must dispose leaked workspace leases through the shared helper",
);

assert.match(
  terminal,
  /verifyPolynetCodexWorkerRunToken\(\{[\s\S]*expectedAudience: "terminal"/,
  "terminal bridge must require a terminal-audience run token",
);
assert.match(
  terminal,
  /getRuntimeRunByOwnerRunIdInternal[\s\S]*project_workspace_required[\s\S]*startWorkspaceTerminalProcess[\s\S]*resolveWorkspaceTerminalPreview/,
  "terminal bridge must validate the run and use the shared terminal-preview path",
);
assert.match(
  tool,
  /verifyPolynetCodexWorkerRunToken\(\{[\s\S]*expectedAudience: "tool"/,
  "platform-tool bridge must require a tool-audience run token",
);
assert.match(
  tool,
  /getRuntimeRunByOwnerRunIdInternal[\s\S]*findPolynetPlatformToolSurfaceEntry[\s\S]*billingPolicy[\s\S]*executeRetrievalHarnessTool/,
  "platform-tool bridge must validate the run, registry row, billing policy, and shared dispatcher",
);
assert.match(
  runtimeAgentLoop,
  /export async function executeRetrievalHarnessTool/,
  "shared retrieval tool dispatcher must be exported for the worker bridge",
);
assert.match(
  platformToolSurface,
  /billingPolicy[\s\S]*unregistered tool/,
  "platform tool surface must be canonical and fail on unregistered rows",
);
assert.doesNotMatch(
  platformToolSurface,
  /community_write|community_resource_builder_stage_changeset|community_resource_builder_apply_changeset/,
  "write/builder tools must not be projected to worker turns in this slice",
);
assert.match(
  disposal,
  /refreshProjectSandboxActiveTerminalStatusInternal[\s\S]*workspace_session_accounting_kept_alive[\s\S]*settleRuntimeWorkspaceSession[\s\S]*releaseRuntimeWorkspaceSessionAccountingIfCurrent/,
  "workspace disposal must be terminal-aware and reuse current accounting release",
);

assert.match(
  worker,
  /runToken: ingestRunToken[\s\S]*terminalRunToken: ingestTerminalRunToken[\s\S]*toolRunToken: ingestToolRunToken/,
  "worker service must parse per-audience run tokens from the turn payload",
);
assert.match(
  worker,
  /run_token: params\.ingest\.runToken/,
  "worker service must relay the ingest run token",
);
assert.match(
  worker,
  /run_token: serve\.terminalRunToken/,
  "worker service must relay the terminal run token",
);
assert.match(
  worker,
  /run_token: bridge\.runToken/,
  "worker service must relay the platform-tool run token",
);
assert.match(
  worker,
  /readIngestFailureResponseSummary[\s\S]*response\.text\(\)[\s\S]*parsed\?\.code[\s\S]*parsed\?\.message/,
  "worker service must parse bounded ingest failure response details",
);
assert.match(
  worker,
  /event: "ingest_push_failed"[\s\S]*run_id[\s\S]*attempts[\s\S]*ingest_path[\s\S]*last_status[\s\S]*last_response_code[\s\S]*last_response_message[\s\S]*last_error_name[\s\S]*last_error_message/,
  "worker service must log sanitized ingest failure evidence",
);
assert.doesNotMatch(
  ingestFailureLogBlock,
  /token|authorization|params\.payload|body/i,
  "ingest failure log must not include tokens, auth headers, or request payloads",
);
assert.match(
  worker,
  /workspace_serve[\s\S]*workspace_serve_requested[\s\S]*workspace_serve_finished/,
  "worker service must expose the project app-serving tool path",
);
assert.match(
  worker,
  /turn\/steer[\s\S]*expectedTurnId: activeTurn\.turnId/,
  "worker service must steer only the active Codex turn",
);

assert.equal(
  exists("services/polynet-codex-worker/fly.production.toml"),
  false,
  "this staging slice must not add a production Fly rail",
);

console.log("polynet_codex_worker_convex_bridge_contract_proof: ok");
