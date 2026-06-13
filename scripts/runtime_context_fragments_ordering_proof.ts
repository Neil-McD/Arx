import assert from "node:assert/strict";

import {
  buildActionLedgerPromptFromRuntimeRunEvents,
  renderRuntimeContextFragmentsForPrompt,
  sortRuntimeContextRunEvents,
  type RuntimeContextFragmentV1,
  type RuntimeContextRunEvent,
} from "../shared/runtimeContextFragments.ts";

const events: RuntimeContextRunEvent[] = [
  {
    seq: 0,
    eventType: "tool_call_finished",
    eventKey: "zero",
    createdAt: 1,
    payload: {
      tool_name: "bash",
      status: "ok",
      args: { command: "echo zero" },
    },
  },
  {
    seq: 2,
    eventType: "tool_call_finished",
    eventKey: "two",
    createdAt: 100,
    payload: {
      tool_name: "grep",
      status: "ok",
      args: { pattern: "RuntimeTurnContextPacket", path: "shared" },
    },
  },
  {
    eventType: "run_finished",
    eventKey: "missing-seq",
    createdAt: 0,
    payload: {
      status: "ok",
    },
  },
  {
    seq: 1,
    eventType: "run_started",
    eventKey: "one",
    createdAt: 200,
    payload: {
      lane: "chat_tools",
      execution_mode: "agentic",
      engine_id: "polynet",
    },
  },
];

const sorted = sortRuntimeContextRunEvents(events);
assert.deepEqual(
  sorted.map((event) => event.eventKey),
  ["one", "two", "missing-seq", "zero"],
  "valid positive seq rows should sort before missing or nonpositive explicit seq rows",
);

const promptA = buildActionLedgerPromptFromRuntimeRunEvents({ events }) ?? "";
const promptB = buildActionLedgerPromptFromRuntimeRunEvents({ events: events.slice().reverse() }) ?? "";
assert.equal(promptA, promptB, "action ledger projection should be deterministic for shuffled inputs");
assert.ok(
  promptA.indexOf("seq=1 run_started") < promptA.indexOf("seq=2 tool_call_finished"),
  "valid sequence order should be preserved in action ledger prompt",
);
assert.ok(
  promptA.indexOf("seq=2 tool_call_finished") < promptA.indexOf("unsequenced run_finished"),
  "unsequenced rows should not outrank valid positive sequence rows",
);

function fragment(id: string, ordinal: number, kind: RuntimeContextFragmentV1["kind"]): RuntimeContextFragmentV1 {
  return {
    version: 1,
    id,
    kind,
    source: kind === "active_terminals" ? "workspace_terminals" : "runtime_run_events",
    ordinal,
    priority: "normal",
    title: id,
    body: id,
    budget: {
      maxChars: id.length,
      usedChars: id.length,
      truncated: false,
    },
    redaction: {
      applied: false,
      rules: [],
    },
    createdAt: null,
  };
}

const renderedFragments = renderRuntimeContextFragmentsForPrompt([
  fragment("RECENT_TOOL_ATTEMPTS_FRAGMENT", 60, "recent_tool_attempts"),
  fragment("TURN_ENVELOPE_FRAGMENT", 10, "turn_envelope"),
  fragment("ACTION_LEDGER_FRAGMENT", 30, "action_ledger"),
  fragment("WORKING_STATE_FRAGMENT", 20, "working_state"),
]) ?? "";
assert.ok(
  renderedFragments.indexOf("TURN_ENVELOPE_FRAGMENT") <
    renderedFragments.indexOf("WORKING_STATE_FRAGMENT"),
  "fragment renderer should sort by ordinal before rendering",
);
assert.ok(
  renderedFragments.indexOf("WORKING_STATE_FRAGMENT") <
    renderedFragments.indexOf("ACTION_LEDGER_FRAGMENT"),
  "fragment renderer should keep canonical ordinal order",
);
assert.ok(
  renderedFragments.indexOf("ACTION_LEDGER_FRAGMENT") <
    renderedFragments.indexOf("RECENT_TOOL_ATTEMPTS_FRAGMENT"),
  "fragment renderer should keep recent tool attempts after the action ledger",
);

console.log("runtime_context_fragments_ordering_proof: ok");
