import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVE_RUNTIME_ENGINES,
  DEFAULT_ACTIVE_RUNTIME_ENGINE,
  RUNTIME_ENGINE_POLYNET,
  canUseRuntimeEngine,
  resolvePolynetRuntimeEngine,
} from "../shared/runtimeEngine.ts";

assert.deepEqual([...ACTIVE_RUNTIME_ENGINES], [RUNTIME_ENGINE_POLYNET]);
assert.equal(DEFAULT_ACTIVE_RUNTIME_ENGINE, RUNTIME_ENGINE_POLYNET);
assert.equal(canUseRuntimeEngine({ engine: RUNTIME_ENGINE_POLYNET }), true);
assert.equal(resolvePolynetRuntimeEngine({ requestedRuntimeEngine: "polynet" }).ok, true);

// The run's tool receipt names the lens's tools directly.
assert.match(readFileSync("convex/runtimeTurnHandlers.ts", "utf8"), /harness_kind: "polynet",\s*fixed_runtime_tool_names: polynetAllowedToolNamesForRun,/);

const activeSources = [
  "convex/runtimeAgentLoop.ts",
  "convex/runtimeTurnHandlers.ts",
  "convex/runtimeTurnResolution.ts",
  "convex/agentTools.ts",
  "shared/lens.ts",
  "shared/retrievalTools.ts",
].map((path) => readFileSync(path, "utf8")).join("\n");
assert.doesNotMatch(
  activeSources,
  /polynetCodexWorker|runtimeExecutionSession|workspaceRuntime|daytonaCodexRuntime|terminal_start|computer_screenshot/,
);

console.log("polynet_harness_isolation_contract_proof: ok");
