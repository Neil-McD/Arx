import assert from "node:assert/strict";

import { buildPlatformHarnessRuntimeSystemPrompt } from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";
import { deriveRuntimePreviewDiagnosis } from "../shared/runtimePreviewDiagnostics.ts";
import type { RuntimeWorkspaceTerminalPrompt } from "../shared/runtimePrompt.ts";

function terminal(
  overrides: Partial<RuntimeWorkspaceTerminalPrompt>,
): RuntimeWorkspaceTerminalPrompt {
  return {
    id: "term_1",
    status: "running",
    lifecycleOwner: "project_background",
    command: "npm run dev",
    healthStatus: "healthy",
    ...overrides,
  };
}

assert.equal(
  deriveRuntimePreviewDiagnosis(
    terminal({
      previewTransportStatus: "loaded",
      previewInspectionStatus: "same_origin_dom",
      previewRenderStatus: "blank_suspected",
    }),
  )?.diagnosis,
  "blank_suspected",
);
assert.match(
  deriveRuntimePreviewDiagnosis(
    terminal({
      previewTransportStatus: "loaded",
      previewInspectionStatus: "same_origin_dom",
      previewRenderStatus: "blank_suspected",
    }),
  )?.recommendedNextAction ?? "",
  /Keep the healthy server running/,
);

assert.equal(
  deriveRuntimePreviewDiagnosis(
    terminal({
      previewTransportStatus: "loaded",
      previewInspectionStatus: "cross_origin_uninspectable",
      previewRenderStatus: "unknown",
    }),
  )?.diagnosis,
  "cross_origin_uninspectable",
);
assert.match(
  deriveRuntimePreviewDiagnosis(
    terminal({
      previewTransportStatus: "loaded",
      previewInspectionStatus: "cross_origin_uninspectable",
      previewRenderStatus: "unknown",
    }),
  )?.recommendedNextAction ?? "",
  /computer\/browser observation/,
);

assert.equal(
  deriveRuntimePreviewDiagnosis(
    terminal({
      status: "exited",
      healthStatus: "exited",
      previewStatus: "server_exited",
    }),
  )?.diagnosis,
  "process_dead",
);
assert.match(
  deriveRuntimePreviewDiagnosis(
    terminal({
      status: "exited",
      healthStatus: "exited",
      previewStatus: "server_exited",
    }),
  )?.recommendedNextAction ?? "",
  /restart the background terminal/,
);

assert.equal(
  deriveRuntimePreviewDiagnosis(
    terminal({
      previewTransportStatus: "loaded",
      previewRenderStatus: "visible_content",
    }),
  )?.diagnosis,
  "visible_content",
);

const prompt = buildPlatformHarnessRuntimeSystemPrompt({
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames: ["terminal_start", "terminal_read", "computer_screenshot"],
  harnessName: "chat_tools",
  runtimeTurnContext: buildRuntimeTurnContextPacket({
    activeBackgroundTerminals: [
      terminal({
        previewStatus: "blank",
        previewTransportStatus: "loaded",
        previewInspectionStatus: "same_origin_dom",
        previewRenderStatus: "blank_suspected",
      }),
    ],
  }),
});

assert.match(prompt, /preview_diagnosis=blank_suspected/);
assert.match(prompt, /recommended_preview_debug_action=Keep the healthy server running/);
assert.match(prompt, /preview_process=blank/);
assert.doesNotMatch(prompt, /; preview=blank/);
assert.match(prompt, /terminal health, preview transport\/render probe, browser\/computer observation, then app root\/runtime\/CSS diagnosis/);
assert.match(prompt, /preview_process as process\/transport availability only/);

console.log("runtime_preview_diagnostics_proof: ok");
