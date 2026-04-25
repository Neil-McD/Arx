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
  "internal.threads.listRuntimeRunEventsByOwnerRunIdInternal",
  "runtime handler loads current run events before fallback finalization",
);
assertContains(
  handler,
  "summarizeRuntimeWorkingStateFromEvents({",
  "runtime handler summarizes current run events for fallback finalization",
);
assertContains(
  handler,
  "workingState: workingStateForFinalizer",
  "runtime handler passes current failure working state to finalizer",
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

for (const token of [
  "What happened:",
  "Verified so far:",
  "Changed/touched:",
  "Blocker:",
  "Next action:",
  "verifiedFindings",
  "filesChanged",
  "recentActions",
  "nextAction",
]) {
  assertContains(finalizer, token, `failure finalizer uses ${token}`);
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
  workingState: currentRunState,
});

assert.equal(output.usedFallback, true);
assertContains(output.content, "What happened:", "rendered what happened section");
assertContains(output.content, "Verified so far:", "rendered verified section");
assertContains(output.content, "src/App.tsx", "rendered touched file");
assertContains(output.content, "Daytona toolbox command failed (408)", "rendered blocker");
assertContains(output.content, "Retry bash", "rendered next action");

const partial = buildRuntimeFailureFinalAnswer({
  status: "cancelled",
  partialContent: "Already explained partial state.",
  workingState: null,
});
assert.equal(partial.usedFallback, false);
assert.equal(partial.content, "Already explained partial state.");

console.log("runtime_failure_finalization_proof: ok");
