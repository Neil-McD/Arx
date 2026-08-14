import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  POLYNET_HARNESS_DAYTONA_PREVIEW_TOOL_NAMES,
  POLYNET_HARNESS_DAYTONA_WORKSPACE_TOOL_NAMES,
  POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES,
  buildPolynetHarnessToolPolicyReceipt,
  resolvePolynetHarnessToolPolicy,
} from "../shared/harnessToolPolicy.ts";
import {
  COMPUTER_USE_TOOL_NAMES,
  SANDBOX_FILE_SHELL_TOOL_NAMES,
  SANDBOX_PREVIEW_TOOL_NAMES,
  SANDBOX_TOOL_NAMES,
  type RetrievalToolName,
} from "../shared/retrievalTools.ts";
import {
  ACTIVE_WORKSPACE_RUNTIME_ENGINES,
  DEFAULT_ACTIVE_RUNTIME_ENGINE,
  RUNTIME_ENGINE_CODEX,
  RUNTIME_ENGINE_POLYNET,
  canUseRuntimeEngine,
  getRuntimeEngineAccessLevel,
  normalizeActiveWorkspaceRuntimeEngine,
  resolvePolynetRuntimeEngine,
} from "../shared/runtimeEngine.ts";

const read = (path: string) => readFileSync(path, "utf8");
assert.deepEqual([...ACTIVE_WORKSPACE_RUNTIME_ENGINES], [RUNTIME_ENGINE_POLYNET]);
assert.equal(DEFAULT_ACTIVE_RUNTIME_ENGINE, RUNTIME_ENGINE_POLYNET);
assert.equal(normalizeActiveWorkspaceRuntimeEngine("unknown"), RUNTIME_ENGINE_POLYNET);
for (const engine of ACTIVE_WORKSPACE_RUNTIME_ENGINES) {
  assert.equal(getRuntimeEngineAccessLevel(engine), "included");
  assert.equal(canUseRuntimeEngine({ engine }), true);
}
assert.equal(canUseRuntimeEngine({ engine: RUNTIME_ENGINE_CODEX }), false);

assert.deepEqual(
  [...POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES],
  ["terminal_read", "terminal_write", ...COMPUTER_USE_TOOL_NAMES],
);
assert.deepEqual([...POLYNET_HARNESS_DAYTONA_WORKSPACE_TOOL_NAMES], [...SANDBOX_FILE_SHELL_TOOL_NAMES]);
assert.deepEqual([...POLYNET_HARNESS_DAYTONA_PREVIEW_TOOL_NAMES], [...SANDBOX_PREVIEW_TOOL_NAMES]);

const allowed = [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "web_research",
  ...SANDBOX_TOOL_NAMES,
] as RetrievalToolName[];
const polynet = resolvePolynetHarnessToolPolicy({ allowedToolNames: allowed });
assert.ok(polynet.fixedRuntimeToolNames.includes("polynet_list"));
for (const forbidden of POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES) {
  assert.equal(polynet.fixedRuntimeToolNames.includes(forbidden), false);
}
assert.deepEqual(
  polynet.runtimeCapabilities.map((capability) => capability.name),
  ["workspace_files", "workspace_shell", "app_preview"],
);
assert.equal(buildPolynetHarnessToolPolicyReceipt(polynet).harness_kind, "polynet");

const app = read("apps/web/src/App.tsx");
const dock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const handlers = read("convex/runtimeTurnHandlers.ts");
assert.doesNotMatch(app, /activeRuntimeEngine|RUNTIME_ENGINE_CODEX/);
assert.match(dock, /runtime_engine: "polynet"[\s\S]*runtimeEngine: "polynet"/);
assert.equal(resolvePolynetRuntimeEngine({ requestedRuntimeEngine: "polynet" }).ok, true);
assert.equal(resolvePolynetRuntimeEngine({ requestedRuntimeEngine: "codex" }).ok, false);
assert.doesNotMatch(handlers, /polynetCodexWorker|POLYNET_CODEX_WORKER/);
assert.match(handlers, /polynet_daytona_runtime_cost_tracking_started/);
assert.match(handlers, /polynet_daytona_runtime_cost_recorded/);
assert.doesNotMatch(handlers, /reserveCreditsInternal|settleCreditsInternal/);

console.log("polynet_harness_isolation_contract_proof: ok");
