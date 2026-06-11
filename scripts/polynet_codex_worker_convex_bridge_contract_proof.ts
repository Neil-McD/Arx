import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const bridge = read("convex/polynetCodexWorkerBridge.ts");
const handlers = read("convex/runtimeTurnHandlers.ts");
const ingest = read("convex/polynetCodexWorkerIngest.ts");
const runToken = read("convex/polynetCodexWorkerRunToken.ts");
const disposal = read("convex/runtimeWorkspaceSessionDisposal.ts");
const terminal = read("convex/polynetCodexWorkerTerminal.ts");
const terminalCore = read("convex/workspaceTerminalProcessCore.ts");
const worker = read("services/polynet-codex-worker/src/server.ts");
const workerTool = read("services/polynet-codex-worker/src/blaxelTool.ts");
const previewPort = read("shared/workspacePreviewPort.ts");
const httpRoutes = read("convex/http.ts");
const persistence = read("convex/runtimeTurnPersistence.ts");
const attribution = read("shared/modelAttributionUi.ts");
const projection = read("apps/web/src/controllers/buildWebWorkspaceSurfaceProjection.tsx");
const app = read("apps/web/src/App.tsx");

assert.match(
  bridge,
  /POLYNET_CODEX_WORKER_ENGINE_ID = "polynet_codex_worker"/,
  "bridge must expose the canonical worker engine id",
);
assert.match(
  bridge,
  /POLYNET_CODEX_WORKER_ALLOWED_DEPLOYMENT_KINDS[\s\S]*"staging"[\s\S]*"production"[\s\S]*POLYNET_CODEX_WORKER_RUNTIME_ENABLED[\s\S]*POLYNET_CODEX_WORKER_URL[\s\S]*POLYNET_CODEX_WORKER_AUTH_TOKEN/,
  "bridge must be feature-flagged, limited to staging/production, and configured by server env",
);
assert.match(
  bridge,
  /polynet_codex_worker_deployment_kind_invalid/,
  "bridge must fail closed on invalid deployment kinds",
);
assert.match(
  bridge,
  /polynet_codex_worker_production_env_mismatch/,
  "bridge must reject production env that points at staging-looking worker URLs",
);
assert.match(
  bridge,
  /polynet_codex_worker_staging_env_mismatch/,
  "bridge must reject staging env that points at production-looking worker URLs",
);
assert.match(
  bridge,
  /fetch\(`\$\{config\.baseUrl\}\/v1\/codex\/turn\?stream=1`[\s\S]*Authorization: `Bearer \$\{config\.authToken\}`[\s\S]*run_id: params\.runId[\s\S]*prompt: params\.prompt/,
  "bridge must call the Fly worker turn stream with bearer auth and server-built prompt",
);
assert.match(
  bridge,
  /inferenceSource[\s\S]*!== "chatgpt"\) return false/,
  "bridge must only route chatgpt-lane turns to the worker (BYOK)",
);
assert.match(
  bridge,
  /chatgpt_auth: \{[\s\S]*access_token: params\.chatgptAuth\.accessToken[\s\S]*chatgpt_account_id: params\.chatgptAuth\.accountId/,
  "bridge must pass the user's own ChatGPT auth tokens per turn",
);
assert.match(
  handlers,
  /getFreshChatgptAuthForUser\(\{[\s\S]*userId: actor\.dbUserId[\s\S]*provider_connection_required/,
  "worker path must mint fresh per-user ChatGPT auth and fail closed without a connection",
);
assert.match(
  handlers,
  /buildPolynetCodexWorkerIngestTarget\(\)[\s\S]*assistant_message_key: assistantMessageKeyForRun/,
  "worker path must hand the worker a durable ingest target and assistant message key",
);
assert.match(
  handlers,
  /countActivePolynetCodexWorkerRuns[\s\S]*PROJECT_CONCURRENT_RUN_LIMIT[\s\S]*project_run_limit_reached[\s\S]*USER_CONCURRENT_RUN_LIMIT[\s\S]*user_run_limit_reached/,
  "worker path must enforce per-project and per-user concurrent run caps before starting a turn",
);
assert.match(
  handlers,
  /cancelPolynetCodexWorkerTurn\(\{ runId, machineId: workerMachineId \}\)[\s\S]*event\.event === "start"[\s\S]*workerMachineId = machineId/,
  "worker cancel must be pinned to the machine that reported the turn start",
);
assert.match(
  handlers,
  /pendingUserSteering[\s\S]*workerSteeredCount[\s\S]*steerPolynetCodexWorkerTurn\(\{[\s\S]*machineId: workerMachineId/,
  "the stream watcher must deliver pending user steering to the turn's machine",
);
assert.match(
  worker,
  /turn\/steer[\s\S]*expectedTurnId: activeTurn\.turnId/,
  "the worker must steer the active Codex turn with the expected-turn precondition",
);
assert.match(
  ingest,
  /POLYNET_CODEX_WORKER_AUTH_TOKEN[\s\S]*bearer !== expectedToken[\s\S]*401/,
  "ingest endpoint must reject requests without the shared worker bearer token",
);
assert.match(
  runToken,
  /POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET[\s\S]*"ingest"[\s\S]*"terminal"[\s\S]*"tool"[\s\S]*HMAC[\s\S]*SHA-256[\s\S]*exp[\s\S]*verifyPolynetCodexWorkerRunToken/,
  "worker run tokens must use a Convex-only HMAC secret, endpoint audiences, and expiry",
);
assert.match(
  runToken,
  /POLYNET_CODEX_WORKER_RUN_TOKEN_TTL_MS = 45 \* 60 \* 1000/,
  "worker run tokens must default to a short 45-minute lifetime",
);
assert.match(
  runToken,
  /includeTerminal\?: boolean[\s\S]*includeTool\?: boolean[\s\S]*includeTerminal[\s\S]*Promise\.resolve\(\{ ok: true as const, token: null[\s\S]*includeTool[\s\S]*Promise\.resolve\(\{ ok: true as const, token: null/,
  "worker run-token minting must leave terminal/tool tokens absent unless those bridge capabilities are projected",
);
assert.match(
  handlers,
  /mintPolynetCodexWorkerRunTokenSet\(\{[\s\S]*ownerId: String\(actor\.dbUserId\)[\s\S]*threadId: String\(ownedThread\._id\)[\s\S]*runId[\s\S]*run_token: workerRunTokens\.ingest[\s\S]*terminal_run_token: workerRunTokens\.terminal[\s\S]*tool_run_token: workerRunTokens\.tool/,
  "runtime handler must mint per-run ingest/terminal/tool tokens and hand them to the worker",
);
assert.match(
  handlers,
  /workerTerminalTarget = workerWorkspaceSession[\s\S]*workerPlatformTools = buildPolynetPlatformToolSpecs[\s\S]*workerToolTarget =[\s\S]*workerPlatformTools\.length > 0[\s\S]*includeTerminal: Boolean\(workerTerminalTarget\)[\s\S]*includeTool: Boolean\(workerToolTarget\)/,
  "runtime handler must only request terminal/tool tokens when it also projects those bridge URLs",
);
assert.match(
  bridge,
  /run_token: params\.ingest\.run_token[\s\S]*terminal_run_token: params\.ingest\.terminal_run_token[\s\S]*tool_run_token: params\.ingest\.tool_run_token/,
  "Convex worker bridge must forward run-token fields in the worker turn payload",
);
assert.match(
  worker,
  /runToken: ingestRunToken[\s\S]*terminalRunToken: ingestTerminalRunToken[\s\S]*toolRunToken: ingestToolRunToken/,
  "worker service must parse per-audience worker run tokens from the turn payload",
);
assert.match(
  worker,
  /run_token: params\.ingest\.runToken/,
  "worker service must relay the ingest run token to the durable ingest endpoint",
);
assert.match(
  worker,
  /run_token: serve\.terminalRunToken/,
  "worker service must relay the terminal run token to the workspace_serve endpoint",
);
assert.match(
  worker,
  /run_token: bridge\.runToken/,
  "worker service must relay the tool run token to the platform-tool endpoint",
);
assert.match(
  ingest,
  /verifyPolynetCodexWorkerRunToken\(\{[\s\S]*expectedAudience: "ingest"/,
  "ingest must require an ingest-audience worker run token",
);
assert.match(
  terminal,
  /verifyPolynetCodexWorkerRunToken\(\{[\s\S]*expectedAudience: "terminal"/,
  "terminal bridge must require a terminal-audience worker run token",
);
assert.match(
  read("convex/polynetCodexWorkerTool.ts"),
  /verifyPolynetCodexWorkerRunToken\(\{[\s\S]*expectedAudience: "tool"/,
  "platform-tool bridge must require a tool-audience worker run token",
);
assert.match(
  ingest,
  /getRuntimeRunByOwnerRunIdInternal[\s\S]*runRow\.threadId[\s\S]*runRow\.engineId[\s\S]*invalid_run/,
  "ingest must still validate the signed context against the real run record before writing",
);
assert.match(
  disposal,
  /resolveWorkspaceSessionAccountingReleaseDecision[\s\S]*refreshProjectSandboxActiveTerminalStatusInternal[\s\S]*workspace_session_accounting_kept_alive[\s\S]*settleRuntimeWorkspaceSession[\s\S]*releaseRuntimeWorkspaceSessionAccountingIfCurrent/,
  "shared workspace disposal must refresh terminal truth, keep active-preview accounting alive, and only settle/release after terminal truth says release is safe",
);
assert.match(
  handlers,
  /disposeRuntimeWorkspaceSession\(\{[\s\S]*session: workerWorkspaceSession[\s\S]*source: "polynet_codex_worker"/,
  "worker live path must dispose workspace leases through the shared terminal-aware disposal helper",
);
assert.match(
  ingest,
  /credit_reservation_key[\s\S]*disposeRuntimeWorkspaceSession\(\{[\s\S]*source: "polynet_codex_worker_ingest"[\s\S]*leaseDisposalOutcome[\s\S]*lease_disposal_outcome/,
  "ingest must use shared terminal-aware workspace disposal so a dead live path cannot underbill or stale-lock preview accounting",
);
assert.doesNotMatch(
  handlers,
  /settleRuntimeWorkspaceSession/,
  "worker live path must not bypass shared terminal-aware workspace disposal with direct settlement",
);
assert.doesNotMatch(
  ingest,
  /settleRuntimeWorkspaceSession/,
  "ingest must not bypass shared terminal-aware workspace disposal with direct settlement",
);
assert.match(
  handlers,
  /lease: \{[\s\S]*credit_reservation_key:[\s\S]*workerWorkspaceSession\.creditReservationKey/,
  "worker ingest context must carry the lease coordinates for backstop settlement",
);
assert.match(
  bridge,
  /polynet_codex_worker_unreachable[\s\S]*polynet_codex_worker_stream_failed/,
  "bridge must convert fetch and stream failures into structured results so callers settle leases",
);
assert.match(
  bridge,
  /WORKER_BUSY_RETRY_DELAYS_MS[\s\S]*response\.status === 409[\s\S]*continue/,
  "bridge must retry worker_busy with wake-sized backoff so pool autostart races do not fail turns",
);
assert.match(
  ingest,
  /"cancelled"[\s\S]*user_cancelled[\s\S]*status === "cancelled" \? "cancelled" : "error"/,
  "ingest backstop must preserve cancelled status instead of misclassifying user stops as errors",
);
assert.match(
  handlers,
  /\} finally \{[\s\S]*clearInterval\(workerCancelWatcher\);[\s\S]*polynet_codex_worker_stream_failed[\s\S]*cancelPolynetCodexWorkerTurn/,
  "handler must always clear the cancel watcher and stop the remote turn when the stream dies",
);
assert.match(
  ingest,
  /\$\{context\.run_id\}:polynet_codex_worker:\$\{seq\}:\$\{eventType\}/,
  "ingest events must reuse the live path's eventKey scheme so replays dedupe",
);
assert.match(
  ingest,
  /persistRuntimeAssistantMessage\(\{[\s\S]*messageKey: context\.assistant_message_key[\s\S]*finishRunBestEffort/,
  "ingest must idempotently persist the assistant message and finish the run",
);
assert.match(
  httpRoutes,
  /POLYNET_CODEX_WORKER_INGEST_PATH[\s\S]*handlePolynetCodexWorkerIngest/,
  "ingest endpoint must be registered on the Convex http router",
);
assert.match(
  httpRoutes,
  /POLYNET_CODEX_WORKER_TERMINAL_PATH[\s\S]*handlePolynetCodexWorkerTerminal/,
  "worker terminal endpoint must be registered on the Convex http router",
);
assert.match(
  httpRoutes,
  /POLYNET_CODEX_WORKER_TOOL_PATH[\s\S]*handlePolynetCodexWorkerTool/,
  "worker platform-tool endpoint must be registered on the Convex http router",
);
{
  const tool = read("convex/polynetCodexWorkerTool.ts");
  assert.match(
    tool,
    /getRuntimeRunByOwnerRunIdInternal[\s\S]*invalid_run[\s\S]*findPolynetPlatformToolSurfaceEntry[\s\S]*billingPolicy[\s\S]*executeRetrievalHarnessTool/,
    "platform-tool bridge must validate the run, resolve the registry entry, pass the billing hook, then dispatch through the shared retrieval tool executor",
  );
  const surface = read("shared/polynetPlatformToolSurface.ts");
  assert.match(
    surface,
    /billingPolicy/,
    "every platform tool surface entry must carry a billing policy",
  );
  assert.match(
    surface,
    /unregistered tool/,
    "platform tool surface must fail at load when a row names an unregistered tool",
  );
  assert.match(
    worker,
    /params\.namespace[\s\S]{0,40}=== "polynet"/,
    "worker must route platform tool calls by the namespace field, not name prefixes",
  );
  assert.doesNotMatch(
    surface,
    /community_write|community_resource_builder_stage_changeset|community_resource_builder_apply_changeset/,
    "write/builder tools must not be projected to worker turns in this slice",
  );
  assert.match(
    worker,
    /platformToolBridge[\s\S]*deferLoading: !activeTurn\.platformToolProbe/,
    "worker must project platform tools deferred (eager only for the probe rail proof)",
  );
  assert.match(
    worker,
    /platform_tool_requested[\s\S]*platform_tool_finished/,
    "worker must emit platform tool lifecycle runtime events",
  );
}
assert.match(
  terminal,
  /getRuntimeRunByOwnerRunIdInternal[\s\S]*invalid_run[\s\S]*startWorkspaceTerminalProcess[\s\S]*resolveWorkspaceTerminalPreview/,
  "serve bridge must validate the run then start the served process through the shared terminal core and gated preview proxy",
);
assert.match(
  terminal,
  /project_workspace_required/,
  "serve bridge must refuse turns without a project-bound workspace lease",
);
assert.match(
  handlers,
  /workerTerminalTarget = workerWorkspaceSession[\s\S]*buildPolynetCodexWorkerTerminalTarget\(\)[\s\S]*terminal_url: workerTerminalTarget/,
  "project-bound worker turns must receive the terminal bridge target",
);
assert.match(
  worker,
  /workspace_serve[\s\S]*workspace_preview_ready/,
  "worker must expose workspace_serve and emit the preview-ready event",
);
assert.match(
  previewPort,
  /WORKSPACE_PREVIEW_PORT_MIN = 3000[\s\S]*WORKSPACE_PREVIEW_PORT_MAX = 9999[\s\S]*normalizeWorkspacePreviewPort/,
  "workspace preview ports must have one shared 3000-9999 normalization contract",
);
assert.match(
  terminalCore,
  /normalizePreviewPort[\s\S]*normalizeWorkspacePreviewPort/,
  "Convex terminal core must use the shared preview port normalizer",
);
assert.match(
  workerTool,
  /workspace_serve[\s\S]*minimum: WORKSPACE_PREVIEW_PORT_MIN[\s\S]*maximum: WORKSPACE_PREVIEW_PORT_MAX/,
  "worker workspace_serve schema must advertise the same preview port range as Convex",
);
assert.match(
  worker,
  /normalizeWorkspacePreviewPort\(args\.port\)[\s\S]*formatWorkspacePreviewPortRange\(\)/,
  "worker workspace_serve runtime validation must use the shared preview port range",
);
assert.match(
  terminal,
  /formatWorkspacePreviewPortRange\(\)/,
  "worker terminal bridge must report the shared preview port range on invalid ports",
);
assert.doesNotMatch(
  `${worker}\n${terminal}\n${workerTool}`,
  /65535/,
  "worker serve and terminal bridge must not retain the old 1-65535 port contract",
);
assert.match(
  worker,
  /params\.sandboxProvided && params\.ingest\?\.terminalUrl/,
  "workspace_serve must only be offered on project-bound turns with the bridge configured",
);
assert.match(
  bridge,
  /event\.event === "delta"[\s\S]*assistantText[\s\S]*event\.event === "done"[\s\S]*event\.event === "run_finalized"/,
  "bridge must parse worker deltas and lifecycle finalization",
);

assert.match(
  handlers,
  /shouldUsePolynetCodexWorkerBridge\(\{[\s\S]*runtimeExecutionMode,[\s\S]*stream,[\s\S]*\}\)/,
  "runtime handler must decide the Fly bridge from resolved runtime mode",
);
assert.match(
  handlers,
  /engineId: runtimeEngineId[\s\S]*POLYNET_CODEX_WORKER_CONTRACT_NAME/,
  "runtime run records must identify the worker engine and bridge contract",
);
assert.match(
  handlers,
  /streamPolynetCodexWorkerTurn\(\{[\s\S]*runId,[\s\S]*model: requestedModelId,[\s\S]*prompt: workerPrompt/,
  "agentic streaming path must delegate execution to the worker",
);
assert.match(
  handlers,
  /event\.event === "runtime_event"[\s\S]*streamAppendRunEvent\(\{[\s\S]*eventType: workerEventType[\s\S]*worker_event_seq/,
  "worker runtime events must be persisted into Convex runtimeRunEvents",
);
assert.match(
  handlers,
  /persistRuntimeAssistantMessage\(\{[\s\S]*engineId: POLYNET_CODEX_WORKER_ENGINE_ID[\s\S]*content: streamedContent/,
  "worker assistant output must persist with the worker engine id",
);
assert.match(
  handlers,
  /event: "done"[\s\S]*engine_id: POLYNET_CODEX_WORKER_ENGINE_ID[\s\S]*assistant_message_id/,
  "worker stream must finish with persisted assistant message ids",
);

assert.match(
  persistence,
  /runtime_engine_id: String\(args\.engineId[\s\S]*engineId: String\(args\.engineId/,
  "assistant message persistence must store worker engine metadata",
);
assert.match(
  attribution,
  /engineId[\s\S]*polynet_codex_worker[\s\S]*· Codex[\s\S]*extractRuntimeEngineIdFromMessageContent/,
  "model attribution must expose the Codex marker from engine metadata",
);
assert.doesNotMatch(
  attribution,
  /Fly Worker/,
  "model attribution must not leak the Fly Worker infrastructure name to users",
);
assert.match(
  projection,
  /message\.engine_id[\s\S]*extractRuntimeEngineIdFromMessageContent[\s\S]*activeThreadStreamingState\?\.meta\?\.engine_id/,
  "workspace projection must use persisted and live-streaming engine ids for attribution",
);
assert.match(
  app,
  /extractRuntimeEngineIdFromMessageContent[\s\S]*formatModelSignature\([\s\S]*engineId/,
  "web app must pass worker engine id into attribution formatting",
);

console.log("polynet_codex_worker_convex_bridge_contract_proof: ok");
