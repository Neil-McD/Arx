import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isVerificationShellCommand,
  summarizeRuntimeWorkingStateFromEvents,
} from "../shared/runtimeWorkingStateLedger.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

const schema = readText("/Users/neilmcdevitt/code/arx/convex/schema.ts");
const threads = readText("/Users/neilmcdevitt/code/arx/convex/threads.ts");
const resolution = readText("/Users/neilmcdevitt/code/arx/convex/runtimeTurnResolution.ts");
const handlers = readText("/Users/neilmcdevitt/code/arx/convex/runtimeTurnHandlers.ts");
const prompt = readText("/Users/neilmcdevitt/code/arx/shared/runtimePrompt.ts");

for (const field of [
  "version: v.optional(v.number())",
  'v.literal("in_progress")',
  'v.literal("needs_verification")',
  "currentStep: v.optional(v.string())",
  "verificationStatus: v.optional(",
  "filesTouched: v.optional(v.array(v.string()))",
  "recentActions: v.optional(v.array(v.string()))",
  "lastDiagnostic: v.optional(v.string())",
  "workspaceRuntime: v.optional(",
  "blocker: v.optional(v.string())",
  "nextAction: v.optional(v.string())",
]) {
  assertContains(schema, field, `workingState schema field ${field}`);
}

assertContains(
  threads,
  "function buildRunStartedWorkingState",
  "run-start workingState builder",
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
  "compactThreadWorkingState(summarizeRuntimeWorkingStateFromEvents",
  "run finish compacts shared working state before storage",
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
  "const statusRaw = String(record.status",
  "verificationStatus",
  "filesTouched",
  "currentStep",
  "lastDiagnostic",
  "workspaceRuntime",
  "recentActions",
  "blocker",
  "nextAction",
]) {
  assertContains(resolution, field, `runtime workingState normalizer supports ${field}`);
}

for (const promptLine of [
  "Status:",
  "Current step:",
  "Verification:",
  "Files touched:",
  "Last diagnostic:",
  "Recent actions:",
  "Blocker:",
  "Next action:",
]) {
  assertContains(prompt, promptLine, `prompt projects ${promptLine}`);
}

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
assert.equal(writeThenPwd.status, "needs_verification");
assert.equal(writeThenPwd.verificationStatus, "needed");
assert.deepEqual(writeThenPwd.filesChanged, ["src/App.tsx"]);
assert.deepEqual(writeThenPwd.filesTouched, ["src/App.tsx"]);

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
assert.ok(
  writeThenBuild.verifiedFindings.some((finding) => finding.includes("verification command")),
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

const blankPreviewFailure = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "why is preview blank?",
  runStatus: "error",
  events: [
    {
      eventType: "tool_call_finished",
      payload: {
        tool_name: "terminal_read",
        status: "ok",
        details: {
          terminal_session_id: "term_1",
          status: "running",
          command: "npm run dev",
          preview_port: 3000,
          preview_status: "blank",
        },
      },
    },
  ],
  nowMs: 1,
});
assert.equal(blankPreviewFailure.workspaceRuntime?.terminalStatus, "running");
assert.equal(blankPreviewFailure.workspaceRuntime?.previewStatus, "blank");
assert.ok(blankPreviewFailure.nextAction?.includes("frontend render path"));
assert.ok(!blankPreviewFailure.nextAction?.includes("narrower or alternate path"));

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
