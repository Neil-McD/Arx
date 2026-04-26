import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildWorkspaceRuntimeSystemPrompt } from "../shared/runtimePrompt.ts";
import { summarizeRuntimeWorkingStateFromEvents } from "../shared/runtimeWorkingStateLedger.ts";
import { summarizeWorkspaceRuntimeStateFromEvents } from "../shared/runtimeWorkspaceState.ts";

const blankPreviewEvents = [
  {
    eventType: "tool_call_finished",
    payload: {
      tool_name: "terminal_read",
      status: "ok",
      details: {
        terminal_session_id: "term_1",
        status: "running",
        command: "npm run dev",
        cwd: ".",
        preview_port: 3000,
        preview_status: "blank",
        output_tail: "ready in 300ms",
      },
    },
  },
];

const blankPreviewRuntime = summarizeWorkspaceRuntimeStateFromEvents({
  events: blankPreviewEvents,
  nowMs: 1,
});
assert.equal(blankPreviewRuntime?.terminalStatus, "running");
assert.equal(blankPreviewRuntime?.previewStatus, "blank");
assert.equal(
  blankPreviewRuntime?.issue,
  "Preview is reachable but rendered blank while the terminal is still running.",
);
assert.ok(
  blankPreviewRuntime?.nextAction?.includes("frontend render path"),
  "blank preview should route recovery toward frontend inspection",
);

const blankPreviewWorkingState = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "Why is the preview blank?",
  runStatus: "error",
  events: blankPreviewEvents,
  nowMs: 1,
});
assert.equal(blankPreviewWorkingState.status, "blocked");
assert.equal(blankPreviewWorkingState.workspaceRuntime?.previewStatus, "blank");
assert.equal(
  blankPreviewWorkingState.nextAction,
  "Inspect the frontend render path, browser console symptoms, root mount, imports, and CSS before restarting the terminal.",
);
assert.ok(
  !blankPreviewWorkingState.nextAction?.includes("narrower or alternate path"),
  "blank preview should not fall back to generic tool retry guidance",
);

const exitedPreviewRuntime = summarizeWorkspaceRuntimeStateFromEvents({
  events: [
    {
      eventType: "tool_call_finished",
      payload: {
        tool_name: "terminal_read",
        status: "ok",
        details: {
          terminal_session_id: "term_2",
          status: "failed",
          command: "npm run dev",
          preview_port: 3000,
          exit_code: 127,
          output_tail: "bash: vite: command not found",
        },
      },
    },
  ],
  nowMs: 2,
});
assert.equal(exitedPreviewRuntime?.terminalStatus, "failed");
assert.equal(exitedPreviewRuntime?.previewStatus, "server_exited");
assert.equal(exitedPreviewRuntime?.exitCode, 127);

const prompt = buildWorkspaceRuntimeSystemPrompt({
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames: ["terminal_start", "terminal_read", "bash"],
  harnessName: "chat_tools",
  threadWorkingState: blankPreviewWorkingState,
});
assert.match(prompt, /WORKSPACE_RUNTIME_STATE/);
assert.match(prompt, /Terminal: running; command=npm run dev; cwd=\./);
assert.match(prompt, /Preview: blank; port=3000/);
assert.match(prompt, /inspect frontend render\/console\/root-mount\/import\/CSS causes before restarting/);
assert.ok(
  prompt.indexOf("THREAD_WORKING_STATE") < prompt.indexOf("WORKSPACE_RUNTIME_STATE"),
  "runtime state should follow compact thread working state",
);

const schemaSource = readFileSync("/Users/neilmcdevitt/code/arx/convex/schema.ts", "utf8");
assert.match(schemaSource, /workspaceRuntime: v\.optional/);
assert.match(schemaSource, /v\.literal\("blank"\)/);
assert.match(schemaSource, /v\.literal\("server_exited"\)/);

console.log("runtime_workspace_state_proof: ok");
