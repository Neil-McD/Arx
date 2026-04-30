import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRuntimeFailureFinalAnswer } from "../shared/runtimeFailureFinalizer.ts";
import { summarizeRuntimeWorkingStateFromEvents } from "../shared/runtimeWorkingStateLedger.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

function assertNotContains(haystack: string, needle: string, label: string): void {
  assert.ok(!haystack.includes(needle), `did not expect ${label}`);
}

const handler = readText("/Users/neilmcdevitt/code/arx/convex/runtimeTurnHandlers.ts");
const runtimeTurnContextLoader = readText(
  "/Users/neilmcdevitt/code/arx/convex/runtimeTurnContext.ts",
);
const runtimeTurnState = readText(
  "/Users/neilmcdevitt/code/arx/convex/httpRuntimeTurnState.ts",
);
const finalizer = readText("/Users/neilmcdevitt/code/arx/shared/runtimeFailureFinalizer.ts");

assertContains(
  handler,
  'import { buildRuntimeFailureFinalAnswer } from "../shared/runtimeFailureFinalizer";',
  "runtime handler imports failure finalizer",
);
assertContains(
  handler,
  "const finalAnswer = buildRuntimeFailureFinalAnswer({",
  "runtime handler builds final failure answer centrally",
);
assertContains(
  handler,
  'import { loadRuntimeTurnContextPacketForRun } from "./runtimeTurnContext";',
  "runtime handler imports canonical context loader",
);
assertContains(
  handler,
  "const loadedFailureContext = await loadRuntimeTurnContextPacketForRun({",
  "runtime handler loads canonical failure context",
);
assertContains(
  handler,
  "buildRuntimeTurnContextSnapshot({",
  "runtime handler snapshots canonical context at run finish",
);
assertContains(
  handler,
  'phase: "started"',
  "runtime handler persists run-start context snapshot",
);
assertContains(
  handler,
  'persistContextSnapshotBestEffort("active")',
  "runtime handler can refresh active-turn context snapshots during a run",
);
assertContains(
  runtimeTurnState,
  'phase: "finished"',
  "runtime handler persists run-finish context snapshot",
);
assertContains(
  handler,
  "refreshActiveContextSnapshotAfterEventBestEffort",
  "runtime handler refreshes active context from meaningful run events",
);
assertContains(
  handler,
  'eventType !== "tool_call_finished"',
  "runtime handler limits active context refresh to meaningful event types",
);
assertContains(
  handler,
  "contextSnapshot",
  "runtime handler passes context snapshot through finish persistence",
);
assertContains(
  handler,
  "summarizeCurrentRunEvents: true",
  "runtime handler asks loader to summarize current run evidence",
);
assertContains(
  handler,
  "failureContextPacket = loadedFailureContext.packet",
  "runtime handler uses loader-built packet",
);
assertContains(
  handler,
  "runtimeTurnContext: failureContextPacket",
  "runtime handler passes canonical packet to emergency fallback",
);
assertNotContains(
  handler,
  "const failureContextPacket = buildRuntimeTurnContextPacket({",
  "runtime handler should not hand-build failure packets",
);
assertContains(
  handler,
  "runtimeTurnContext: failureContextPacket",
  "runtime handler passes canonical packet to adaptive finalizer",
);
assertContains(
  handler,
  "renderRuntimeTurnContextForFailureFinalizer(params.runtimeTurnContext)",
  "adaptive finalizer renders the canonical packet",
);
assertContains(
  handler,
  "content: finalAnswer.content",
  "runtime handler persists finalizer output",
);
assertNotContains(
  handler,
  'partialContent || "Run stopped before producing a final answer."',
  "generic stopped fallback in runtime handler",
);

assertContains(
  runtimeTurnContextLoader,
  "internal.threads.listRuntimeRunEventsByOwnerRunIdInternal",
  "canonical loader loads current run events",
);
assertContains(
  runtimeTurnContextLoader,
  "summarizeRuntimeWorkingStateFromEvents({",
  "canonical loader summarizes current run events",
);
assertContains(
  runtimeTurnContextLoader,
  "mergeRuntimeWorkingStateTaskLedger({",
  "canonical loader preserves active task ledger while adding current-run evidence",
);
assertContains(
  runtimeTurnContextLoader,
  "previous: params.fallbackWorkingState",
  "canonical loader uses thread working state as task-ledger continuity",
);
assertContains(
  runtimeTurnContextLoader,
  "reconcileProjectWorkspaceTerminalsInternal",
  "canonical loader reads terminal ledger",
);
assertContains(
  runtimeTurnContextLoader,
  "mapRuntimeWorkspaceTerminalPrompt",
  "canonical loader maps terminal rows for prompt/finalizer context",
);

assertContains(
  finalizer,
  "buildTinyEmergencyFallback",
  "failure finalizer keeps a tiny emergency fallback",
);
assertContains(
  finalizer,
  "selectLiveTerminal",
  "failure finalizer still preserves live-process awareness in emergency fallback",
);
assertContains(
  finalizer,
  "runtimeTurnContext?: RuntimeTurnContextPacket | null",
  "failure finalizer accepts canonical runtime context packet",
);
assertContains(
  finalizer,
  "input.runtimeTurnContext",
  "failure finalizer derives terminal truth from packet",
);
assertNotContains(
  finalizer,
  "activeBackgroundTerminals?:",
  "failure finalizer should not accept direct terminal arrays",
);
assertNotContains(
  handler,
  "activeBackgroundTerminals:",
  "runtime handler should not pass direct terminal arrays to finalizer",
);
assertNotContains(
  finalizer,
  "legacy_detailed_runtime_failure",
  "removed fixed-template failure mode",
);
assertNotContains(
  finalizer,
  "Run stopped before completing.",
  "removed fixed failure title",
);
for (const token of [
  "What happened:",
  "Verified so far:",
  "Changed/touched:",
  "Blocker:",
  "Next action:",
  "formatLiveTerminalResult",
  "buildLiveTerminalBlocker",
  "buildLiveTerminalNextAction",
]) {
  assertNotContains(finalizer, token, `removed deterministic finalizer token ${token}`);
}

const currentRunState = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "Build an app",
  runStatus: "error",
  runErrorMessage: "Daytona toolbox command failed (408)",
  events: [
    {
      eventType: "tool_call_finished",
      payload: { tool_name: "write", status: "ok", args: { path: "src/App.tsx" } },
    },
    {
      eventType: "tool_call_finished",
      payload: {
        tool_name: "bash",
        status: "error",
        args: { command: "npm run build" },
        error_message: "Daytona toolbox command failed (408)",
      },
    },
  ],
  nowMs: 1,
});
assert.equal(currentRunState.status, "blocked");
assert.deepEqual(currentRunState.filesChanged, ["src/App.tsx"]);

const output = buildRuntimeFailureFinalAnswer({
  status: "error",
  reason: "tool_failed",
  errorCode: "workspace_tool_execute_failed",
  errorMessage: "Daytona toolbox command failed (408)",
});

assert.equal(output.usedFallback, true);
assert.equal(
  output.content,
  "I hit a runtime stop before I could finish. Runtime note: Daytona toolbox command failed (408)",
);

const processAwareOutput = buildRuntimeFailureFinalAnswer({
  status: "error",
  reason: "tool_failed",
  errorCode: "workspace_tool_execute_failed",
  errorMessage: "Daytona command failed with exit code 127.",
  runtimeTurnContext: {
    activeBackgroundTerminals: [
      {
        id: "terminal_1",
        status: "running",
        lifecycleOwner: "project_background",
        command: "npm run dev -- --port 3000",
        previewPort: 3000,
        previewStatus: "blank",
        previewTransportStatus: "loaded",
        previewInspectionStatus: "same_origin_dom",
        previewRenderStatus: "blank_suspected",
        healthStatus: "healthy",
        lastBrowserObservationSummary: "Preview iframe loaded a blank white document.",
      },
    ],
  },
});
assertContains(
  processAwareOutput.content,
  "background process still appears to be running",
  "emergency fallback preserves live terminal truth",
);
assertContains(
  processAwareOutput.content,
  "render=blank_suspected",
  "emergency fallback preserves packet preview render truth",
);
assertNotContains(
  processAwareOutput.content,
  "What happened:",
  "emergency fallback does not resurrect deterministic ledger sections",
);

const partial = buildRuntimeFailureFinalAnswer({
  status: "cancelled",
  partialContent: "Already explained partial state.",
});
assert.equal(partial.usedFallback, false);
assert.equal(partial.content, "Already explained partial state.");

console.log("runtime_failure_finalization_proof: ok");
