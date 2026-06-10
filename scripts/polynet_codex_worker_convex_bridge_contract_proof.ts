import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const bridge = read("convex/polynetCodexWorkerBridge.ts");
const handlers = read("convex/runtimeTurnHandlers.ts");
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
