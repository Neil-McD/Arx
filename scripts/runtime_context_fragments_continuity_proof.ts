import assert from "node:assert/strict";

import {
  buildRuntimeRecentToolAttemptsFromEvents,
  buildRuntimeTurnContextPacket,
  renderRuntimeTurnContextForPrompt,
} from "../shared/runtimeTurnContextPacket.ts";
import { buildRuntimeTurnEnvelope } from "../shared/runtimeTurnEnvelope.ts";
import { summarizeRuntimeWorkingStateFromEvents } from "../shared/runtimeWorkingStateLedger.ts";

const turnOneEvents = [
  {
    seq: 1,
    eventType: "run_started",
    eventKey: "run_started",
    createdAt: 1_780_000_000_001,
    payload: {
      lane: "chat_tools",
      execution_mode: "agentic",
      engine_id: "polynet",
      model_id: "gpt-5",
    },
  },
  {
    seq: 2,
    eventType: "tool_call_finished",
    eventKey: "read",
    createdAt: 1_780_000_000_002,
    payload: {
      tool_name: "read",
      status: "ok",
      args: { path: "convex/communityAccess.ts" },
      output_preview: "read ok",
    },
  },
  {
    seq: 3,
    eventType: "tool_call_finished",
    eventKey: "edit",
    createdAt: 1_780_000_000_003,
    payload: {
      tool_name: "edit",
      status: "ok",
      args: { path: "convex/communityAccess.ts" },
      output_preview: "edit ok",
    },
  },
  {
    seq: 4,
    eventType: "tool_call_finished",
    eventKey: "bash",
    createdAt: 1_780_000_000_004,
    payload: {
      tool_name: "bash",
      status: "error",
      args: { command: "npm run check:community-access" },
      exit_code: 1,
      error_code: "shell_nonzero_exit",
      error_message: "Community access proof failed.",
      top_diagnostic_summary: "convex/communityAccess.ts:42 gate still allows missing entitlement",
      failure_semantics: {
        kind: "verification_failed",
        summary: "The community access proof still fails.",
        suggested_recovery: "Fix the entitlement guard and rerun the community access proof.",
        command: "npm run check:community-access",
        exit_code: 1,
      },
    },
  },
  {
    seq: 5,
    eventType: "run_finished",
    eventKey: "run_finished",
    createdAt: 1_780_000_000_005,
    payload: {
      status: "error",
      reason: "verification_failed",
      error_code: "shell_nonzero_exit",
    },
  },
];

const turnOneWorkingState = summarizeRuntimeWorkingStateFromEvents({
  latestUserText: "Fix the community access gate.",
  runStatus: "error",
  runReason: "verification_failed",
  runErrorMessage: "Community access proof failed.",
  events: turnOneEvents,
  nowMs: 1_780_000_000_010,
});

const nextUserText = "Continue from the failed proof and verify the access gate.";
const nextEnvelope = buildRuntimeTurnEnvelope({
  latestUserText: nextUserText,
  threadWorkingState: turnOneWorkingState,
  threadId: "thread_access_gate",
  communityId: "community_alpha",
  projectId: "project_access",
  allowedToolNames: ["read", "edit", "bash"],
});

const packet = buildRuntimeTurnContextPacket({
  latestUserText: nextUserText,
  runtimeTurnEnvelope: nextEnvelope,
  threadWorkingState: turnOneWorkingState,
  recentToolAttempts: buildRuntimeRecentToolAttemptsFromEvents({
    events: turnOneEvents,
  }),
  runtimeRunEvents: turnOneEvents,
});

const prompt = renderRuntimeTurnContextForPrompt(packet) ?? "";
assert.match(prompt, /RUNTIME_TURN_ENVELOPE/);
assert.match(prompt, /THREAD_WORKING_STATE/);
assert.match(prompt, /ACTION_LEDGER/);
assert.match(prompt, /RECENT_TOOL_ATTEMPTS/);
assert.match(prompt, /Current request: Continue from the failed proof and verify the access gate\./);
assert.match(prompt, /Continuity goal: Fix the community access gate\./);
assert.ok(
  prompt.indexOf("Current request: Continue from the failed proof and verify the access gate.") <
    prompt.indexOf("Continuity goal: Fix the community access gate."),
  "current request should stay separate from durable continuity goal",
);
assert.match(prompt, /tool=edit; status=ok; target=convex\/communityAccess\.ts/);
assert.match(prompt, /tool=bash; status=error; target=npm run check:community-access/);
assert.match(prompt, /bash error; target=npm run check:community-access/);
assert.match(prompt, /Fix the entitlement guard and rerun the community access proof/);

console.log("runtime_context_fragments_continuity_proof: ok");
