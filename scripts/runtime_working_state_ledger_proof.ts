import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isVerificationShellCommand,
  mergeRuntimeWorkingStateTaskLedger,
  summarizeRuntimeWorkingStateFromEvents,
} from "../shared/runtimeWorkingStateLedger.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

const schema = readText("convex/schema.ts");
const threads = readText("convex/threads.ts");
const resolution = readText("convex/runtimeTurnResolution.ts");
const handlers = readText("convex/runtimeTurnHandlers.ts");
const prompt = readText("shared/runtimePrompt.ts");
const contextPacket = readText("shared/runtimeTurnContextPacket.ts");
const contextFragments = readText("shared/runtimeContextFragments.ts");

for (const field of [
  "version: v.optional(v.number())",
  'v.literal("in_progress")',
  'v.literal("needs_verification")',
  "currentStep: v.optional(v.string())",
  "plan: v.optional(v.array(v.string()))",
  "completedSteps: v.optional(v.array(v.string()))",
  "decisions: v.optional(v.array(v.string()))",
  "openQuestions: v.optional(v.array(v.string()))",
  "focusFiles: v.optional(v.array(v.string()))",
  "verificationStatus: v.optional(",
  "filesTouched: v.optional(v.array(v.string()))",
  "recentActions: v.optional(v.array(v.string()))",
  "lastDiagnostic: v.optional(v.string())",
  "blocker: v.optional(v.string())",
  "nextAction: v.optional(v.string())",
]) {
  assertContains(schema, field, `workingState schema field ${field}`);
}

assert.ok(
  !schema.includes("codingHandoff"),
  "thread schema should not keep legacy coding-era handoff state",
);
assert.ok(
  !schema.includes("workspaceRuntime"),
  "workingState schema should not keep duplicate workspaceRuntime process truth",
);
assertContains(
  schema,
  "startedContextSnapshot: v.optional(v.any())",
  "runtime run schema should store run-start context snapshots",
);
assertContains(
  schema,
  "activeContextSnapshot: v.optional(v.any())",
  "runtime run schema should store live active-turn context snapshots",
);
assertContains(
  schema,
  "activeContextSnapshotUpdatedAt: v.optional(v.number())",
  "runtime run schema should timestamp live active-turn context snapshots",
);
assertContains(
  schema,
  "finishedContextSnapshot: v.optional(v.any())",
  "runtime run schema should store run-finish context snapshots",
);
assertContains(
  schema,
  "pendingUserSteering: v.optional(",
  "runtime run schema should keep pending steering on the active turn",
);
assertContains(
  schema,
  "stopRequestedAt: v.optional(v.number())",
  "runtime run schema should keep active-turn stop request time",
);
assertContains(
  schema,
  "stopReason: v.optional(v.string())",
  "runtime run schema should keep active-turn stop reason",
);

assertContains(
  threads,
  "function buildRunStartedWorkingState",
  "run-start workingState builder",
);
assertContains(
  threads,
  "getRunningRuntimeRunByThread",
  "runtime runs remain the active-turn authority",
);
assertContains(
  threads,
  "activeContextSnapshot: args.snapshot",
  "context snapshot writes update live active-turn context",
);
assertContains(
  threads,
  'v.union(v.literal("started"), v.literal("active"), v.literal("finished"))',
  "context snapshot writer should support active in-run refreshes",
);
assertContains(
  threads,
  "function compactThreadWorkingState",
  "thread working state is compacted before storage",
);
assertContains(
  threads,
  'status: "in_progress"',
  "run start marks working state in progress",
);
assertContains(
  threads,
  "latestUserText: args.latestUserText",
  "run start receives latest user text",
);
assertContains(
  handlers,
  "latestUserText,",
  "runtime turn passes latest user text into run start",
);
assertContains(
  threads,
  "summarizeRuntimeWorkingStateFromEvents",
  "run finish uses shared working state ledger",
);
assertContains(
  threads,
  "compactThreadWorkingState(",
  "run finish compacts working state before storage",
);
assertContains(
  threads,
  "current: summarizeRuntimeWorkingStateFromEvents",
  "run finish summarizes current run with shared working state ledger",
);
assert.ok(
  !threads.includes("function summarizeThreadWorkingState"),
  "convex thread finalization should not keep a duplicate ledger summarizer",
);
assertContains(
  threads,
  'verificationStatus: "not_needed"',
  "run start resets current-run verification status",
);
assertContains(
  threads,
  "filesTouched: []",
  "run start resets current-run touched files",
);
assertContains(
  threads,
  "filesChanged: []",
  "run start resets current-run changed files",
);
assertContains(
  threads,
  "verifiedFindings: []",
  "run start resets current-run verified findings",
);
assertContains(
  threads,
  "lastDiagnostic: undefined",
  "run start resets current-run diagnostic",
);
assertContains(
  threads,
  "lastResult: previous?.lastResult",
  "run start keeps previous result as continuity only",
);
assertContains(
  threads,
  '"Started a new workspace run.", ...(previous?.recentActions ?? [])',
  "run start keeps previous recent actions as continuity only",
);
for (const field of [
  "plan: taskStillActive ? previous?.plan : undefined",
  "completedSteps: taskStillActive ? previous?.completedSteps : undefined",
  "decisions: taskStillActive ? previous?.decisions : undefined",
  "openQuestions: taskStillActive ? previous?.openQuestions : undefined",
  "focusFiles: taskStillActive ? previous?.focusFiles : undefined",
]) {
  assertContains(threads, field, `run start preserves active ledger field ${field}`);
}
assertContains(
  threads,
  "mergeRuntimeWorkingStateTaskLedger({",
  "run finish merges current-run evidence with active task ledger",
);
assertContains(
  threads,
  "shouldPreserveActiveTaskLedger({",
  "run start uses a goal-pivot guard before preserving active task ledger",
);
assertContains(
  threads,
  "TASK_PIVOT_PATTERN",
  "run start has an explicit goal-pivot reset rule",
);
assert.ok(
  !threads.includes("function mergeWorkingStateTaskLedger"),
  "threads should use the shared task-ledger merge helper",
);
assertContains(
  readText("shared/runtimeWorkingStateLedger.ts"),
  "export function mergeRuntimeWorkingStateTaskLedger",
  "shared runtime working state exports task-ledger merge helper",
);

for (const field of [
  "const statusRaw = String(record.status",
  "verificationStatus",
  "completedSteps",
  "openQuestions",
  "focusFiles",
  "filesTouched",
  "currentStep",
  "lastDiagnostic",
  "recentActions",
  "blocker",
  "nextAction",
]) {
  assertContains(resolution, field, `runtime workingState normalizer supports ${field}`);
}

for (const promptLine of [
  "Status:",
  "Current step:",
  "Plan:",
  "Completed steps:",
  "Decisions:",
  "Open questions:",
  "Focus files:",
  "Verification:",
  "Files touched:",
  "Last diagnostic:",
  "Recent actions:",
  "Blocker:",
  "Next action:",
]) {
  assertContains(
    `${contextPacket}\n${contextFragments}`,
    promptLine,
    `prompt projects ${promptLine}`,
  );
}
assertContains(
  prompt,
  "type RuntimeTurnContextPacket",
  "runtime prompt uses canonical runtime turn packet type",
);

assert.equal(isVerificationShellCommand("npm run build"), true);
assert.equal(isVerificationShellCommand("npm run check:web-typecheck"), true);
assert.equal(isVerificationShellCommand("npm test"), true);
assert.equal(isVerificationShellCommand("tsc --noEmit"), true);
assert.equal(isVerificationShellCommand("pwd"), false);
assert.equal(isVerificationShellCommand("ls"), false);
assert.equal(isVerificationShellCommand("echo ok"), false);

const writeThenPwd = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "Update the app",
  runStatus: "ok",
  events: [
    {
      eventType: "tool_call_finished",
      payload: { tool_name: "write", status: "ok", args: { path: "src/App.tsx" } },
    },
    {
      eventType: "tool_call_finished",
      payload: { tool_name: "bash", status: "ok", args: { command: "pwd" } },
    },
  ],
  nowMs: 1,
});
assert.equal(writeThenPwd.version, 3);
assert.equal(writeThenPwd.status, "needs_verification");
assert.equal(writeThenPwd.verificationStatus, "needed");
assert.deepEqual(writeThenPwd.filesChanged, ["src/App.tsx"]);
assert.deepEqual(writeThenPwd.filesTouched, ["src/App.tsx"]);
assert.ok(writeThenPwd.plan?.some((step) => step.includes("Verify the changed workspace files")));
assert.deepEqual(writeThenPwd.focusFiles, ["src/App.tsx"]);
assert.ok(
  writeThenPwd.completedSteps?.some((step) => step.includes("Changed 1 workspace file")),
);

const mergedTaskLedger = mergeRuntimeWorkingStateTaskLedger({
  previous: {
    plan: ["Keep the existing preview server running."],
    completedSteps: ["Started the preview server."],
    decisions: ["Do not restart a healthy background terminal."],
    openQuestions: ["Is the preview blank because of the app or the transport?"],
    focusFiles: ["src/main.tsx"],
  },
  current: writeThenPwd,
});
assert.ok(
  mergedTaskLedger.plan?.some((step) => step.includes("existing preview server")),
);
assert.ok(
  mergedTaskLedger.completedSteps?.some((step) => step.includes("Started the preview server")),
);
assert.ok(
  mergedTaskLedger.decisions?.some((decision) => decision.includes("healthy background terminal")),
);
assert.ok(
  mergedTaskLedger.openQuestions?.some((question) => question.includes("app or the transport")),
);
assert.ok(mergedTaskLedger.focusFiles?.includes("src/main.tsx"));

const writeThenBuild = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "Update the app",
  runStatus: "ok",
  events: [
    {
      eventType: "tool_call_finished",
      payload: { tool_name: "write", status: "ok", args: { path: "src/App.tsx" } },
    },
    {
      eventType: "tool_call_finished",
      payload: { tool_name: "bash", status: "ok", args: { command: "npm run build" } },
    },
  ],
  nowMs: 1,
});
assert.equal(writeThenBuild.status, "complete");
assert.equal(writeThenBuild.verificationStatus, "passed");
assert.equal(writeThenBuild.plan, undefined);
assert.ok(
  writeThenBuild.verifiedFindings.some((finding) => finding.includes("verification command")),
);
assert.ok(
  writeThenBuild.completedSteps?.some((step) => step.includes("verification command")),
);

const readOnlyRun = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "Inspect the app",
  runStatus: "ok",
  events: [
    {
      eventType: "tool_call_finished",
      payload: { tool_name: "read", status: "ok", args: { path: "src/App.tsx" } },
    },
    {
      eventType: "tool_call_finished",
      payload: { tool_name: "grep", status: "ok", args: { pattern: "App" } },
    },
  ],
  nowMs: 1,
});
assert.equal(readOnlyRun.status, "complete");
assert.equal(readOnlyRun.verificationStatus, "not_needed");
assert.deepEqual(readOnlyRun.filesTouched, ["src/App.tsx"]);
assert.deepEqual(readOnlyRun.filesChanged, []);
assert.deepEqual(readOnlyRun.focusFiles, ["src/App.tsx"]);

const failedTypecheck = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "Fix types",
  runStatus: "error",
  events: [
    {
      eventType: "tool_call_finished",
      payload: {
        tool_name: "bash",
        status: "error",
        args: { command: "npm run check:web-typecheck" },
        diagnostics: [
          {
            source: "typescript",
            severity: "error",
            file: "src/App.tsx",
            line: 12,
            column: 34,
            code: "TS2322",
            message: "Type 'string' is not assignable to type 'number'.",
          },
        ],
        top_diagnostic_summary:
          "src/App.tsx:12:34 TS2322: Type 'string' is not assignable to type 'number'.",
      },
    },
  ],
  nowMs: 1,
});
assert.equal(failedTypecheck.status, "blocked");
assert.equal(failedTypecheck.verificationStatus, "failed");
assert.equal(
  failedTypecheck.lastDiagnostic,
  "src/App.tsx:12:34 TS2322: Type 'string' is not assignable to type 'number'.",
);
assert.ok(failedTypecheck.nextAction?.includes("src/App.tsx:12:34 TS2322"));

const emptyFailure = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: null,
  runStatus: "error",
  events: [],
  nowMs: 1,
});
for (const [key, value] of Object.entries(emptyFailure)) {
  assert.notEqual(value, null, `workingState should omit ${key} instead of storing null`);
}
assert.equal(Object.hasOwn(emptyFailure, "goal"), false);
assert.equal(Object.hasOwn(emptyFailure, "lastDiagnostic"), false);

console.log("runtime_working_state_ledger_proof: ok");
