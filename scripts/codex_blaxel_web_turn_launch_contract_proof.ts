import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(source: string, needle: string, message: string): void {
  assert.ok(source.includes(needle), message);
}

function assertOrderWithin(source: string, startNeedle: string, orderedNeedles: string[], message: string): void {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${message}: missing ${startNeedle}`);
  let cursor = start;
  for (const needle of orderedNeedles) {
    const index = source.indexOf(needle, cursor + 1);
    assert.notEqual(index, -1, `${message}: missing ${needle}`);
    assert.ok(index > cursor, `${message}: expected ${needle} after prior invariant`);
    cursor = index;
  }
}

function listFilesRecursive(dir: string): string[] {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relativePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(relativePath));
      continue;
    }
    files.push(relativePath);
  }
  return files;
}

const gateway = read("shared/cloudCodexRuntimeGateway.ts");
assertIncludes(gateway, "bootstrapGatewayAuthContext", "gateway must use authenticated Convex context");
assertIncludes(gateway, '"threads:getCloudThreadByThreadKey"', "gateway must resolve public thread key to Convex thread id");
assertIncludes(
  gateway,
  '"blaxelCodexRuntimeTurn:runBlaxelCodexRuntimeTurn"',
  "gateway must call the productized Codex Blaxel action",
);
assertIncludes(gateway, "destroyAfterRun: params.destroyAfterRun !== false", "web launch must default to destroying sandboxes");
assertIncludes(gateway, "CODEX_BLAXEL_DEFAULT_MODEL_ID", "gateway must expose the Codex runtime model identity");
assertIncludes(gateway, 'CODEX_BLAXEL_DEFAULT_MODEL_ID = "gpt-5.5"', "Codex runtime default model must match the app default model");
assert.doesNotMatch(gateway, /gpt-5\.3-codex-spark/, "Codex runtime gateway must not keep the old Codex Spark default");

const controller = read("shared/useWebTurnRunnerController.ts");
assertIncludes(controller, "VITE_ENABLE_CODEX_BLAXEL_WEB_TURNS", "Codex web launch must be staging-flagged");
assertIncludes(controller, 'params.requestedFundingSource === "user_chatgpt"', "Codex web launch must be user ChatGPT funded");
assertIncludes(controller, 'params.inferenceSource === "chatgpt"', "Codex web launch must require ChatGPT inference source");
assertIncludes(controller, "runCloudCodexBlaxelRuntimeTurn", "turn runner must call Codex Blaxel gateway");
assertIncludes(controller, "invokeCloudCodexRunEventsStream", "Codex web launch must prefer live SSE over persisted event polling");
assertIncludes(controller, "streamCodexRuntimeEvents", "turn runner must own Codex SSE event consumption");
assertIncludes(controller, "threadStreamingActiveRunIdRefById", "Codex SSE must track the active run id outside React render timing");
assertIncludes(controller, "isCurrentCodexSseRun", "Codex SSE writes must be guarded by the current active run");
assertIncludes(controller, "shouldStopForStaleRun", "stale Codex SSE streams must stop before mutating thread streaming state");
assertIncludes(controller, "threadStreamingFastPaintRefById", "Codex assistant text must have a per-thread fast-paint switch");
assertIncludes(controller, "threadStreamingTelemetryRefById", "Codex streaming must capture client-side latency telemetry");
assertIncludes(controller, "updateThreadStreamingTelemetryRef", "Codex streaming telemetry must update refs without forcing React state per event");
assert.doesNotMatch(
  controller,
  /setThreadStreamingTelemetry/,
  "Codex streaming telemetry must not keep the legacy per-event React state setter",
);
assertIncludes(controller, "fastPaint", "streaming telemetry must record whether smoothing was bypassed");
assertIncludes(controller, "firstDeltaReceivedAtMs", "streaming telemetry must record first token arrival");
assertIncludes(controller, "firstDisplayPaintAtMs", "streaming telemetry must record first rendered token paint");
assertIncludes(controller, "pendingChars", "streaming telemetry must record text backlog");
assertIncludes(controller, "threadStreamingFastPaintRefById.current[threadId] = true", "Codex turns must bypass assistant text smoothing");
assertIncludes(controller, "threadStreamingFastPaintRefById.current[threadId] = false", "non-Codex turns must keep normal smoothing behavior");
assertIncludes(controller, "const nextContent = fastPaint", "streaming flush must branch on the fast-paint flag");
assertOrderWithin(
  controller,
  "const nextContent = fastPaint",
  [
    "? targetContent",
    ": getNextSmoothStreamingText",
    "setThreadStreamingDisplayContent(threadId, nextContent, streamTelemetry)",
  ],
  "Codex fast-paint must paint the latest buffer directly while preserving smoothing fallback",
);
const codexSseStart = controller.indexOf("const streamCodexRuntimeEvents = useCallback");
const codexSseEnd = controller.indexOf("const stopStreamingTurn = useCallback", codexSseStart + 1);
assert.notEqual(codexSseStart, -1, "Codex SSE consumer must exist");
assert.notEqual(codexSseEnd, -1, "Codex SSE consumer must end before stopStreamingTurn");
const codexSseBlock = controller.slice(codexSseStart, codexSseEnd);
assertIncludes(
  codexSseBlock,
  "const streamTelemetry = updateThreadStreamingTelemetryRef",
  "Codex SSE start must publish telemetry through the existing start state update",
);
const codexDeltaStart = codexSseBlock.indexOf('} else if (eventName === "delta")');
const codexDeltaEnd = codexSseBlock.indexOf('} else if (eventName === "done")', codexDeltaStart + 1);
assert.notEqual(codexDeltaStart, -1, "Codex SSE delta handler must exist");
assert.notEqual(codexDeltaEnd, -1, "Codex SSE done handler must follow delta handler");
const codexDeltaBlock = codexSseBlock.slice(codexDeltaStart, codexDeltaEnd);
assertIncludes(
  codexDeltaBlock,
  "updateThreadStreamingTelemetryRef",
  "Codex SSE delta handler must retain telemetry without React state updates",
);
assertIncludes(
  codexDeltaBlock,
  "scheduleStreamingFlush();",
  "Codex SSE delta handler must let the paint loop publish telemetry with content",
);
assert.doesNotMatch(
  codexDeltaBlock,
  /setThreadStreamingState|setThreadStreamingDisplayContent/,
  "Codex SSE delta handler must not publish React state before the paint loop",
);
assertIncludes(controller, 'engine_id: "codex_blaxel_app_server"', "streaming state must identify Codex Blaxel runtime");
assertIncludes(controller, 'streamTransport: params.runIdHint ? "sse" : "recovery"', "Codex web launch must use SSE when a run id is available");
assertIncludes(controller, 'streamTransport: "recovery"', "Codex web launch must keep recovery polling as the fallback");
assertIncludes(controller, "readLatestUserMessageText", "Codex prompt must come from the latest user message");
assertIncludes(controller, "isCodexBlaxelProviderConnectionFailure", "provider-connection failures must keep existing modal semantics");
assertIncludes(
  controller,
  "const recoveredFailure = await recoverRuntimeTurnFromPersistedState",
  "Codex runtime failures must hydrate persisted run state before surfacing the error",
);
const createThreadMessageStart = controller.indexOf("const createThreadMessage = useCallback");
const createThreadMessageEnd = controller.indexOf("const createAssistantTextMessage = useCallback", createThreadMessageStart);
assert.notEqual(createThreadMessageStart, -1, "message creation helper must exist");
assert.notEqual(createThreadMessageEnd, -1, "assistant message creation helper must follow message creation helper");
const createThreadMessageBlock = controller.slice(createThreadMessageStart, createThreadMessageEnd);
assert.doesNotMatch(
  createThreadMessageBlock,
  /\bseq\s*:/,
  "web cloud message creation must not force seq=0; Convex must own thread message sequencing",
);
assertOrderWithin(
  controller,
  "const shouldUseCodexBlaxel =",
  [
    "await ensureCloudThreadRecordForRuntime(session, threadId);",
    "streamCodexRuntimeEvents({",
    "await runCloudCodexBlaxelRuntimeTurn({",
    "await recoverRuntimeTurnFromPersistedState({",
    "abort.abort();",
    "resetThreadStreamingState(threadId,",
    "let baseUrl: string;",
    "return invokeCloudRuntimeTurn({",
  ],
  "Codex branch must run before the legacy runtime_turn transport and keep non-Codex fallback intact",
);

const lifecycle = read("apps/web/src/controllers/useWebRuntimeRunLifecycle.ts");
assertIncludes(lifecycle, 'value.streamTransport !== "sse"', "recovery polling must poll non-SSE runs");
assertIncludes(lifecycle, "readAssistantTextDelta", "recovery polling must render assistant text deltas");
assertIncludes(lifecycle, "listConvexCloudRuntimeRunEvents", "recovery polling must read persisted runtime events");

const runtimeTransport = read("shared/cloudRuntimeTransport.ts");
assertIncludes(runtimeTransport, "invokeCloudCodexRunEventsStream", "transport must expose Codex SSE event stream fetch");
assertIncludes(runtimeTransport, '"/runtime/codex_run_events_stream"', "transport must call the Codex run event SSE route");

const http = read("convex/http.ts");
assertIncludes(http, "registerCodexRunEventsStreamRoutes", "Convex HTTP router must register Codex run event stream routes");

const codexStreamRoute = read("convex/httpCodexRunEventsStream.ts");
assertIncludes(codexStreamRoute, 'path: "/runtime/codex_run_events_stream"', "Codex SSE route must be mounted");
assertIncludes(codexStreamRoute, "requireAuthenticatedActor", "Codex SSE route must require user auth");
assertIncludes(codexStreamRoute, "threads.listCloudRuntimeRunEvents", "Codex SSE route must stream from the persisted event ledger");
assertIncludes(codexStreamRoute, 'event: "runtime_event"', "Codex SSE route must stream timeline events");
assertIncludes(codexStreamRoute, 'event: "delta"', "Codex SSE route must stream assistant token deltas");
assertIncludes(codexStreamRoute, 'event: "done"', "Codex SSE route must close on run_finished");
assertIncludes(codexStreamRoute, 'row.event_type !== "assistant_text_delta"', "Codex SSE route must only emit live text from assistant text delta events");

const core = read("shared/webTurnRunnerCore.ts");
assertIncludes(core, "streamTelemetry?:", "thread streaming state must expose latency telemetry during active runs");
for (const telemetryField of [
  "startedAtMs",
  "sseStartedAtMs",
  "firstDeltaReceivedAtMs",
  "lastDeltaReceivedAtMs",
  "firstDisplayPaintAtMs",
  "lastDisplayPaintAtMs",
  "targetChars",
  "displayedChars",
  "pendingChars",
  "fastPaint",
]) {
  assertIncludes(core, telemetryField, `stream telemetry must include ${telemetryField}`);
}

const blaxelRuntime = read("convex/blaxelCodexRuntimeTurn.ts");
assertIncludes(blaxelRuntime, "appendCodexRuntimePhaseEventBestEffort", "Codex runtime action must record durable phase telemetry");
assertIncludes(blaxelRuntime, "phaseTelemetryWrites", "Codex runtime action must queue durable phase telemetry");
assertIncludes(blaxelRuntime, "queueCodexRuntimePhaseEvent", "Codex runtime action must queue phase events off the critical path");
assertIncludes(blaxelRuntime, "flushCodexRuntimePhaseTelemetry", "Codex runtime action must flush queued phase telemetry at safe points");
assertIncludes(blaxelRuntime, "Promise.allSettled(writes)", "queued phase telemetry must be best-effort during flush");
assert.doesNotMatch(
  blaxelRuntime,
  /await appendCodexRuntimePhaseEventBestEffort/,
  "Codex runtime phase telemetry must not be awaited directly in the launch path",
);
for (const eventType of [
  "codex_runtime_context_loaded",
  "codex_sandbox_ensure_started",
  "codex_sandbox_ensure_completed",
  "codex_bridge_dir_prepare_completed",
  "codex_bridge_auth_payload_write_completed",
  "codex_bridge_runtime_payload_write_completed",
  "codex_bridge_files_prepared",
  "codex_app_server_launch_requested",
  "codex_bridge_client_launch_requested",
  "codex_bridge_client_failed",
]) {
  assertIncludes(blaxelRuntime, eventType, `Codex runtime phase telemetry must include ${eventType}`);
}
assert.doesNotMatch(
  blaxelRuntime,
  /codex_bridge_client_completed/,
  "Codex runtime must not append success-side bridge completion after run_finished",
);
assertIncludes(blaxelRuntime, "phase_duration_ms", "Codex runtime phase telemetry must record phase duration");
assertIncludes(blaxelRuntime, "appendCloudRuntimeRunEventByBridgeClaimsInternal", "Codex phase telemetry must use the runtime event ledger");

const projection = read("apps/web/src/controllers/buildWebWorkspaceSurfaceProjection.tsx");
assertIncludes(projection, "params.runtimeEventsByRunId[message.run_id] ?? []", "persisted messages must attach hydrated runtime events");
assertIncludes(projection, "params.activeThreadStreamingState.runtimeEvents", "active streaming state must feed existing timeline");
assertIncludes(projection, "message.engine_id", "message footer attribution must use persisted runtime engine id");
assertIncludes(projection, "extractRuntimeEngineIdFromMessageContent", "message footer attribution must fall back to content runtime metadata");
assertIncludes(projection, "readRuntimeEngineIdFromEvents(runtimeEvents)", "message footer attribution must fall back to run_started engine metadata");
assertIncludes(projection, "const streamingMeta = params.activeThreadStreamingState?.meta ?? null", "streaming messages must read live runtime metadata");
assertIncludes(projection, "const streamingModelLabel = params.formatModelSignature", "streaming messages must format the same model attribution as persisted messages");
assertIncludes(projection, "modelLabel: streamingModelLabel", "streaming message view must carry the live model label");
assertIncludes(projection, "function streamingInitialStatusLabelForEngine", "streaming messages must derive an initial pre-event status from runtime metadata");
assertIncludes(projection, 'engineId === "codex_blaxel_app_server" ? "Starting Codex" : null', "Codex streaming placeholders must be Codex-native before events arrive");
assertIncludes(projection, "initialStatusLabel: streamingInitialStatusLabel", "streaming message view must carry the pre-event runtime status hint");
assertOrderWithin(
  projection,
  "const runtimeEvents = params.activeThreadStreamingState?.runtimeEvents ?? [];",
  [
    "const streamingMeta = params.activeThreadStreamingState?.meta ?? null",
    "const streamingEngineId =",
    "const streamingModelLabel = params.formatModelSignature",
    "const streamingInitialStatusLabel = streamingInitialStatusLabelForEngine(streamingEngineId)",
    "modelLabel: streamingModelLabel",
    "initialStatusLabel: streamingInitialStatusLabel",
  ],
  "Codex streaming footer and initial status must derive from live metadata before rendering the placeholder",
);

const threadViews = read("apps/web/src/components/webWorkspaceThreadViews.ts");
assertOrderWithin(
  threadViews,
  "export type WorkspaceStreamingMessageView = {",
  [
    "runtimeEvents: ThreadStreamingRuntimeEvent[];",
    "content: string;",
    "runId: string | null;",
    "modelLabel: string | null;",
    "initialStatusLabel: string | null;",
  ],
  "streaming message view must include model attribution and pre-event status",
);

const streamingMessage = read("apps/web/src/components/WebWorkspaceStreamingMessage.tsx");
assertIncludes(streamingMessage, "MessageFooter", "streaming assistant messages must render the standard footer");
assertIncludes(streamingMessage, "<MessageFooter metaLabel={view.modelLabel} />", "streaming assistant footer must show the live model label");
assertIncludes(streamingMessage, 'const placeholderLabel = view.initialStatusLabel ?? "Thinking"', "non-Codex streaming placeholders must keep the generic Thinking fallback");
assertIncludes(streamingMessage, "aria-label={placeholderLabel}", "streaming placeholder aria label must match the runtime-specific status");
assertIncludes(streamingMessage, "{placeholderLabel}", "streaming placeholder text must render the runtime-specific status");

const workspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");
assertIncludes(workspaceHost, "left.modelLabel === right.modelLabel", "streaming message memo equality must include the model label");
assertIncludes(workspaceHost, "left.initialStatusLabel === right.initialStatusLabel", "streaming message memo equality must include the pre-event status label");

const runtimeTimeline = read("apps/web/src/components/RuntimeLiveTimeline.tsx");
assertIncludes(runtimeTimeline, "function isCodexRuntimeEvent", "runtime timeline must detect Codex events explicitly");
assertIncludes(runtimeTimeline, 'event.event_type.startsWith("codex_")', "Codex timeline detection must use Codex event types");
assertIncludes(runtimeTimeline, 'asString(payload?.engine_id) === "codex_blaxel_app_server"', "Codex timeline detection must use run_started engine metadata");
assertIncludes(runtimeTimeline, 'asString(harness?.kind) === "codex_app_server"', "Codex timeline detection must use normalized Codex harness metadata");
assertIncludes(runtimeTimeline, "function buildCodexTimelineState", "runtime timeline must build a Codex-specific display state");
for (const status of ["Starting Codex", "Connecting Codex", "Running Codex", "Streaming", "Codex stopped"]) {
  assertIncludes(runtimeTimeline, status, `Codex timeline must support ${status}`);
}
assertOrderWithin(
  runtimeTimeline,
  "const codexTimeline = useMemo",
  [
    "const displayCodexStatus = useSmoothStreamingText",
    "if (codexTimeline.isCodex)",
    "return timerLabel || approvalCards || displayCodexStatus",
    "if (!showActiveIndicators)",
    "visibleToolSteps.length > 0",
  ],
  "Codex timeline branch must render before the generic runtime timeline while preserving the non-Codex path",
);
const codexBranchStart = runtimeTimeline.indexOf("if (codexTimeline.isCodex)");
const codexCompactBranchStart = runtimeTimeline.indexOf("if (!showActiveIndicators)", codexBranchStart + 1);
const genericBranchStart = runtimeTimeline.indexOf("if (!showActiveIndicators)", codexCompactBranchStart + 1);
assert.notEqual(codexBranchStart, -1, "Codex timeline branch must exist");
assert.notEqual(codexCompactBranchStart, -1, "Codex compact timeline branch must exist");
assert.notEqual(genericBranchStart, -1, "generic timeline branch must still exist after Codex branch");
const codexBranch = runtimeTimeline.slice(codexBranchStart, genericBranchStart);
assert.doesNotMatch(codexBranch, /displayWord|displayNarration|visibleToolSteps|runtime-tool-drawer|Planning|Completed/, "Codex main timeline must not use generic planning/completed/tool-drawer UI");

const attribution = read("shared/modelAttributionUi.ts");
assertIncludes(attribution, 'if (raw.includes("codex")) return "Codex";', "Codex runtime attribution must render Codex");
assertIncludes(
  attribution,
  "runtimeProvider ? `${modelLabel} · ${runtimeProvider}` : appendInferenceProviderLabel(modelLabel, source)",
  "Codex runtime attribution must override ChatGPT funding-source footer labels",
);

const inferenceSourceUi = read("shared/inferenceSourceUi.ts");
assertIncludes(
  inferenceSourceUi,
  'if (raw === "chatgpt" || raw === "user_chatgpt") return "Polynet";',
  "native Polynet turns must render Polynet, not ChatGPT, in assistant footers",
);

const app = read("apps/web/src/App.tsx");
assertIncludes(app, "extractRuntimeEngineIdFromMessageContent", "workspace projection must receive runtime engine extractor");
assertIncludes(app, "engineId,", "formatModelSignature must pass runtime engine id into attribution formatter");

const componentFiles = listFilesRecursive("apps/web/src/components");
for (const file of componentFiles) {
  assert.ok(
    !/Codex.*Timeline|Timeline.*Codex/.test(file),
    `Codex web launch must reuse existing runtime timeline, found ${file}`,
  );
}

const packageJson = read("package.json");
assertIncludes(
  packageJson,
  "check:codex-blaxel-web-turn-launch-contract",
  "package scripts must expose Codex web turn launch proof",
);

console.log("codex_blaxel_web_turn_launch_contract_proof: ok");
