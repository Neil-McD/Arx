import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const threads = read("convex/threads.ts");
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
]) {
  assert.doesNotMatch(
    read(path),
    /\bruntimeEngine\b|\bruntime_engine\b/,
    `${path} must not transport the constant native runtime marker`,
  );
}

assert.doesNotMatch(
  `${schema}\n${threads}`,
  /\bruntimeEngine\b|\bruntime_engine\b/,
  "thread schema and APIs must not retain the constant marker",
);
assert.doesNotMatch(
  read("convex/_generated/api.d.ts"),
  /threadRuntimeMarkerRetirement/,
  "generated Convex APIs must not retain the temporary operator",
);

assert.match(runtimeEngine, /POLYNET_RUNTIME_ENGINE_ID = "runtime_convex"/);
assert.match(runtimeResolution, /runtime_engine\?: RuntimeEngine \| null/);
assert.match(runtimeHandlers, /runtimeEngineResolved: runtimeEngineResolution\.resolvedRuntimeEngine/);
assert.match(runtimeHandlers, /eventType: "runtime_engine_resolved"/);

console.log("PASS: constant thread/client runtime marker has no writer while canonical runtime telemetry remains");
