import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRuntimeContextFragmentsFromParts,
  renderRuntimeContextFragmentsForPrompt,
} from "../shared/runtimeContextFragments.ts";

const fragments = buildRuntimeContextFragmentsFromParts({
  latestUserText: "What is happening in this community?",
  threadWorkingState: {
    goal: "Produce a verified community summary.",
    currentStep: "Read current chat, resources, events, and members.",
    filesChanged: [],
    verifiedFindings: [],
  },
  recentToolAttempts: [
    {
      toolName: "polynet_search",
      status: "error",
      errorCode: "query_required",
      errorMessage: "polynet_search requires query.",
    },
  ],
});
assert.deepEqual(
  fragments.map((fragment) => fragment.kind),
  ["working_state", "recent_tool_attempts"],
);
const rendered = renderRuntimeContextFragmentsForPrompt(fragments);
assert.doesNotMatch(rendered, /PROJECT_CONTEXT/);
assert.match(rendered, /THREAD_WORKING_STATE/);
assert.match(rendered, /polynet_search error/);
assert.doesNotMatch(rendered, /WORKSPACE_PROCESS_CONTEXT|active terminal|preview_process/);

for (const path of [
  "shared/runtimePrompt.ts",
  "shared/runtimeTurnContextPacket.ts",
  "shared/runtimeContextFragments.ts",
  "convex/runtimeTurnContext.ts",
]) {
  const source = readFileSync(path, "utf8");
  assert.doesNotMatch(
    source,
    /RuntimeWorkspaceTerminalPrompt|activeBackgroundTerminals|recentBackgroundProcessEvents|workspace_harness_context/,
    `${path} must not restore Workspace prompt state`,
  );
}

console.log("runtime_prompt_layout_proof: ok");
