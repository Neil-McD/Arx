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
  "recentActions: v.optional(v.array(v.string()))",
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
  'const ledgerStatus =',
  "run finish derives compact ledger status",
);
assertContains(
  threads,
  '"needs_verification"',
  "run finish can mark changed work as needing verification",
);
assertContains(
  threads,
  "recentActions",
  "run finish records compact recent actions",
);
assertContains(
  threads,
  "blocker",
  "run finish records blocker",
);
assertContains(
  threads,
  "nextAction",
  "run finish records next action",
);
assertContains(
  threads,
  "isVerificationShellCommand(command)",
  "run finish distinguishes verification shell commands",
);

for (const field of [
  "const statusRaw = String(record.status",
  "currentStep",
  "recentActions",
  "blocker",
  "nextAction",
]) {
  assertContains(resolution, field, `runtime workingState normalizer supports ${field}`);
}

for (const promptLine of [
  "Status:",
  "Current step:",
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
assert.deepEqual(writeThenPwd.filesChanged, ["src/App.tsx"]);

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
assert.ok(
  writeThenBuild.verifiedFindings.some((finding) => finding.includes("verification command")),
);

console.log("runtime_working_state_ledger_proof: ok");
