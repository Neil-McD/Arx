import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const threads = read("convex/threads.ts");
const operator = read("convex/threadRuntimeMarkerRetirement.ts");
const runtimeEngine = read("shared/runtimeEngine.ts");
const runtimeResolution = read("convex/runtimeTurnResolution.ts");
const runtimeHandlers = read("convex/runtimeTurnHandlers.ts");

for (const path of [
  "shared/cloudThreadsRead.ts",
  "shared/cloudThreadsGateway.ts",
  "shared/cloudMemberAgentGateway.ts",
  "shared/webTurnRunnerCore.ts",
  "shared/useWebTurnRunnerController.ts",
  "apps/web/src/components/WebMemberAgentDock.tsx",
  "apps/web/src/components/WebCommunityFunnelEditor.tsx",
]) {
  assert.doesNotMatch(
    read(path),
    /\bruntimeEngine\b|\bruntime_engine\b/,
    `${path} must not transport the constant native runtime marker`,
  );
}

assert.match(
  schema,
  /runtimeEngine: v\.optional\(v\.literal\("polynet"\)\)/,
  "Release A must temporarily accept persisted marker residue",
);
assert.equal(
  [...threads.matchAll(/\bruntimeEngine\b/g)].length,
  2,
  "only the two rolling-client mutation validators may accept runtimeEngine",
);
assert.doesNotMatch(
  threads,
  /patch\.runtimeEngine|runtimeEngine:\s*"polynet"/,
  "ordinary thread traffic must not write or refresh the marker",
);

assert.match(operator, /internalQuery[\s\S]*q\.neq\(q\.field\("runtimeEngine"\), undefined\)/);
assert.match(operator, /internalMutation[\s\S]*expectedDocumentIds[\s\S]*runtimeEngine: undefined/);
assert.match(operator, /const MAX_PAGE_SIZE = 500/);
assert.doesNotMatch(operator, /workspace|project|provider/i);

assert.match(runtimeEngine, /POLYNET_RUNTIME_ENGINE_ID = "runtime_convex"/);
assert.match(runtimeResolution, /runtime_engine\?: RuntimeEngine \| null/);
assert.match(runtimeHandlers, /runtimeEngineResolved: runtimeEngineResolution\.resolvedRuntimeEngine/);
assert.match(runtimeHandlers, /eventType: "runtime_engine_resolved"/);

console.log("PASS: constant thread/client runtime marker has no writer while canonical runtime telemetry remains");
