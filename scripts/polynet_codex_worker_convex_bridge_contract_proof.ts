import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const bridge = read("convex/polynetCodexWorkerBridge.ts");
const handlers = read("convex/runtimeTurnHandlers.ts");
const ingest = read("convex/polynetCodexWorkerIngest.ts");
const terminal = read("convex/polynetCodexWorkerTerminal.ts");
const worker = read("services/polynet-codex-worker/src/server.ts");
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
  /POLYNET_CODEX_WORKER_RUNTIME_ENABLED[\s\S]*POLYNET_DEPLOYMENT_KIND[\s\S]*staging[\s\S]*POLYNET_CODEX_WORKER_URL[\s\S]*POLYNET_CODEX_WORKER_AUTH_TOKEN/,
  "bridge must be feature-flagged, staging-only, and configured by server env",
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
  ingest,
  /getRuntimeRunByOwnerRunIdInternal[\s\S]*runRow\.threadId[\s\S]*runRow\.engineId[\s\S]*invalid_run/,
  "ingest must validate the caller-supplied context against the real run record before writing",
);
assert.match(
  ingest,
  /settleRuntimeWorkspaceSession[\s\S]*credit_reservation_key[\s\S]*lease_settled/,
  "ingest must settle the workspace lease so a dead live path cannot leave turns unbilled",
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
  /terminal_url: buildPolynetCodexWorkerTerminalTarget\(\)/,
  "worker turns must receive the terminal bridge target",
);
assert.match(
  worker,
  /workspace_serve[\s\S]*workspace_preview_ready/,
  "worker must expose workspace_serve and emit the preview-ready event",
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
