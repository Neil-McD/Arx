import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RETRIEVAL_TOOL_NAMES,
  type RetrievalToolName,
} from "../shared/retrievalTools.ts";
import { resolvePolynetHarnessToolPolicy } from "../shared/harnessToolPolicy.ts";
import {
  buildRuntimeToolPolicySurface,
  getFixedRuntimeToolPolicy,
} from "../shared/runtimeToolPolicy.ts";

assert.deepEqual(
  resolvePolynetHarnessToolPolicy({
    allowedToolNames: RETRIEVAL_TOOL_NAMES,
  }).fixedRuntimeToolNames,
  RETRIEVAL_TOOL_NAMES,
);
const surface = buildRuntimeToolPolicySurface({
  fixedToolNames: [...RETRIEVAL_TOOL_NAMES],
});
assert.equal(surface.summary.total, RETRIEVAL_TOOL_NAMES.length);
assert.equal(surface.summary.requiresWorkspace, 0);
assert.equal(surface.summary.byCategory.unknown, 0);

for (const toolName of RETRIEVAL_TOOL_NAMES) {
  const policy = getFixedRuntimeToolPolicy(toolName as RetrievalToolName);
  assert.equal(policy.toolName, toolName);
  assert.equal(policy.requiresWorkspace, false);
}
assert.equal(getFixedRuntimeToolPolicy("polynet_list").readOnly, true);
assert.equal(getFixedRuntimeToolPolicy("polynet_write").exclusive, true);
assert.equal(getFixedRuntimeToolPolicy("member_profile_confirm_facts").mutatesState, true);

const source = [
  readFileSync("shared/retrievalTools.ts", "utf8"),
  readFileSync("shared/harnessToolPolicy.ts", "utf8"),
  readFileSync("shared/runtimeToolPolicy.ts", "utf8"),
].join("\n");
assert.doesNotMatch(
  source,
  /COMPUTER_USE_TOOL_NAMES|SANDBOX_TOOL_NAMES|WORKSPACE_TOOL_NAMES|workspace_fs|workspace_shell|terminal_start|computer_screenshot/,
);

console.log("runtime_tool_policy_proof: ok");
