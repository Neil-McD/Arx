import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPolynetHarnessToolPolicyReceipt,
  resolvePolynetHarnessToolPolicy,
} from "../shared/harnessToolPolicy.ts";
import { RETRIEVAL_TOOL_NAMES } from "../shared/retrievalTools.ts";
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

const policy = resolvePolynetHarnessToolPolicy({
  allowedToolNames: RETRIEVAL_TOOL_NAMES,
});
assert.deepEqual(policy.fixedRuntimeToolNames, RETRIEVAL_TOOL_NAMES);
assert.deepEqual(buildPolynetHarnessToolPolicyReceipt(policy), {
  harness_kind: "polynet",
  fixed_runtime_tool_names: RETRIEVAL_TOOL_NAMES,
});

const activeSources = [
  "convex/runtimeAgentLoop.ts",
  "convex/runtimeTurnHandlers.ts",
  "convex/runtimeTurnResolution.ts",
  "shared/harnessToolPolicy.ts",
  "shared/retrievalTools.ts",
].map((path) => readFileSync(path, "utf8")).join("\n");
assert.doesNotMatch(
  activeSources,
  /polynetCodexWorker|runtimeExecutionSession|workspaceRuntime|daytonaCodexRuntime|terminal_start|computer_screenshot/,
);

console.log("polynet_harness_isolation_contract_proof: ok");
