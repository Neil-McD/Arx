import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { buildPlatformHarnessRuntimeSystemPrompt } from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";

const deletedBridgePath = "shared/runtimeWorkspaceState.ts";
assert.equal(
  existsSync(deletedBridgePath),
  false,
  "event-derived runtime workspace state bridge should be deleted",
);

const prompt = buildPlatformHarnessRuntimeSystemPrompt({
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames: ["terminal_start", "terminal_read", "bash"],
  harnessName: "chat_tools",
  runtimeTurnContext: buildRuntimeTurnContextPacket({
    threadWorkingState: {
      version: 3,
      goal: "Why is the preview blank?",
      status: "blocked",
      nextAction: "Inspect active process context.",
    },
    activeBackgroundTerminals: [
      {
        id: "term_1",
        status: "running",
        lifecycleOwner: "project_background",
        command: "npm run dev",
        cwd: ".",
        previewPort: 3000,
        previewPath: "/",
        previewStatus: "blank",
        previewTransportStatus: "loaded",
        previewInspectionStatus: "same_origin_dom",
        previewRenderStatus: "blank_suspected",
        healthStatus: "healthy",
        healthSummary: "Process is running.",
        lastBrowserObservationSummary: "Preview iframe rendered a blank white page.",
        lastPreviewProbeSummary: "Preview metrics look blank.",
        outputTail: "ready in 300ms",
      },
    ],
  }),
});
assert.match(prompt, /WORKSPACE_PROCESS_CONTEXT/);
assert.match(prompt, /Active background processes/);
assert.match(prompt, /preview_process=blank; port=3000/);
assert.doesNotMatch(prompt, /; preview=blank/);
assert.match(prompt, /transport=loaded/);
assert.match(prompt, /inspection=same_origin_dom/);
assert.match(prompt, /render=blank_suspected/);
assert.match(prompt, /preview_diagnosis=blank_suspected/);
assert.match(prompt, /recommended_preview_debug_action=Keep the healthy server running/);
assert.match(prompt, /browser_observation=Preview iframe rendered a blank white page/);
assert.match(prompt, /preview_probe=Preview metrics look blank/);
assert.doesNotMatch(prompt, /WORKSPACE_RUNTIME_STATE/);
assert.doesNotMatch(prompt, /BACKGROUND_TERMINAL_STATE/);
assert.doesNotMatch(prompt, /Recent process event summary/);

for (const path of [
  "shared/runtimePrompt.ts",
  "shared/runtimeWorkingStateLedger.ts",
  "convex/runtimeTurnResolution.ts",
  "convex/threads.ts",
]) {
  const source = readFileSync(path, "utf8");
  assert.doesNotMatch(source, /runtimeWorkspaceState/);
  assert.doesNotMatch(source, /RuntimeWorkspaceStateSummary/);
  assert.doesNotMatch(source, /summarizeWorkspaceRuntimeStateFromEvents/);
}

console.log("runtime_workspace_state_proof: ok");
