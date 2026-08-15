import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildRuntimeTurnEnvelope,
  renderRuntimeTurnEnvelopeForPrompt,
} from "../shared/runtimeTurnEnvelope.ts";
import {
  buildRuntimeTurnContextSnapshot,
  buildRuntimeTurnContextPacket,
  renderRuntimeTurnContextForPrompt,
} from "../shared/runtimeTurnContextPacket.ts";

const builderEnvelope = buildRuntimeTurnEnvelope({
  latestUserText: "Build the community wiki from these sources.",
  threadWorkingState: {
    version: 3,
    goal: "Create a useful resource map for the founder community.",
    currentStep: "Inspect existing resources.",
    completedSteps: ["Confirmed the community lens."],
    verifiedFindings: ["Builder tools are mounted for this turn."],
    openQuestions: ["Which source should become the canonical overview?"],
    nextAction: "List current community resources.",
  },
  threadId: "thread_1",
  communityId: "community_1",
  communityResourceLane: {
    lane: "builder",
    can_read_live_resources: true,
    can_use_resource_builder: true,
  },
  allowedToolNames: [
    "polynet_list",
    "polynet_read",
    "polynet_search",
    "polynet_write",
    "polynet_call",
  ],
});

assert.equal(builderEnvelope.authority.communityResourceLane, "builder");
assert.deepEqual(
  builderEnvelope.state.verified,
  [
    "Builder tools are mounted for this turn.",
    "Confirmed the community lens.",
  ],
  "envelope should carry compact verified continuity",
);
assert.equal(
  builderEnvelope.currentRequest,
  "Build the community wiki from these sources.",
  "envelope should preserve the current user request separately from durable continuity",
);
assert.equal(
  builderEnvelope.continuityGoal,
  "Create a useful resource map for the founder community.",
  "envelope should preserve durable working-state continuity",
);

const staleGoalEnvelope = buildRuntimeTurnEnvelope({
  latestUserText: "Now debug the production login failure.",
  threadWorkingState: {
    version: 3,
    goal: "Old task: build the community wiki.",
    currentStep: "Old task in progress.",
  },
  threadId: "thread_goal_precedence",
  allowedToolNames: [],
});
assert.equal(
  staleGoalEnvelope.currentRequest,
  "Now debug the production login failure.",
  "current request should stay truthful even when working-state goal is stale",
);
assert.equal(
  staleGoalEnvelope.continuityGoal,
  "Old task: build the community wiki.",
  "durable continuity should remain separate from the current request",
);

const continuationEnvelope = buildRuntimeTurnEnvelope({
  latestUserText: "go",
  threadWorkingState: {
    version: 3,
    goal: "Fix production login failure.",
    currentStep: "Inspect the auth callback.",
  },
  threadId: "thread_continuation",
  allowedToolNames: ["read", "grep", "bash"],
});
assert.equal(
  continuationEnvelope.currentRequest,
  "go",
  "continuation turns should preserve the latest utterance as current request",
);
assert.equal(
  continuationEnvelope.continuityGoal,
  "Fix production login failure.",
  "continuation turns should keep the durable goal useful",
);

const builderPrompt = renderRuntimeTurnEnvelopeForPrompt(builderEnvelope) ?? "";
assert.match(builderPrompt, /RUNTIME_TURN_ENVELOPE/);
assert.match(builderPrompt, /Current request: Build the community wiki from these sources\./);
assert.match(builderPrompt, /Continuity goal: Create a useful resource map for the founder community\./);
assert.match(builderPrompt, /resource_lane=builder/);
assert.match(builderPrompt, /Available tools: .*polynet_write/);
assert.doesNotMatch(builderPrompt, /community_resource_builder_/);
assert.match(builderPrompt, /does not replace the user request/);
assert.match(builderPrompt, /Authority fields only bound available actions/);
assert.doesNotMatch(builderPrompt, /Job kind:/);
assert.doesNotMatch(builderPrompt, /override inferred intent/);

const packetPrompt = renderRuntimeTurnContextForPrompt(
  buildRuntimeTurnContextPacket({
    runtimeTurnEnvelope: builderEnvelope,
    threadWorkingState: {
      version: 3,
      goal: "Create a useful resource map for the founder community.",
      currentStep: "Inspect existing resources.",
    },
  }),
) ?? "";
const envelopeIndex = packetPrompt.indexOf("RUNTIME_TURN_ENVELOPE");
const workingStateIndex = packetPrompt.indexOf("THREAD_WORKING_STATE");
assert.ok(envelopeIndex >= 0, "runtime packet prompt should render the turn envelope");
assert.ok(workingStateIndex >= 0, "runtime packet prompt should still render working state");
assert.ok(
  envelopeIndex < workingStateIndex,
  "turn envelope should render before detailed working state",
);

const snapshot = buildRuntimeTurnContextSnapshot({
  packet: buildRuntimeTurnContextPacket({
    runtimeTurnEnvelope: builderEnvelope,
  }),
  capturedAt: 1,
});
assert.equal(snapshot.runtimeTurnEnvelope?.continuityGoal, "Create a useful resource map for the founder community.");

const sharedRuntimeTurnEnvelopeSource = readFileSync("shared/runtimeTurnEnvelope.ts", "utf8");
assert.doesNotMatch(
  sharedRuntimeTurnEnvelopeSource,
  /RuntimeJobKind|jobKind|resolveRuntimeJobKind|RUNTIME_JOB_CONTRACT/,
  "shared envelope code should not classify runtime intent",
);
assert.doesNotMatch(
  sharedRuntimeTurnEnvelopeSource,
  /normalizeRuntimeTurnEnvelope|runtime_turn_envelope|continuity_goal|allowed_tool_names/,
  "shared envelope code should not carry legacy persisted-envelope normalization",
);

const runtimeAgentLoopSource = readFileSync("convex/runtimeAgentLoop.ts", "utf8");
assert.match(
  runtimeAgentLoopSource,
  /buildRuntimeTurnEnvelope\(\{/,
  "normal runtime loop should build the explicit turn envelope",
);
assert.match(
  runtimeAgentLoopSource,
  /runtimeTurnEnvelope,/,
  "normal runtime loop should pass the turn envelope into the context loader",
);
assert.match(
  runtimeAgentLoopSource,
  /refreshRuntimeContextSnapshot\?\.\("started", runtimeTurnEnvelope\)/,
  "normal runtime loop should pass the envelope to the snapshot refresh callback",
);
assert.doesNotMatch(
  runtimeAgentLoopSource,
  /setCloudRuntimeRunTurnEnvelopeInternal/,
  "normal runtime loop should not persist the envelope through a separate run-row field",
);

const runtimeTurnContextSource = readFileSync("convex/runtimeTurnContext.ts", "utf8");
assert.doesNotMatch(
  runtimeTurnContextSource,
  /getRuntimeRunByOwnerRunIdInternal/,
  "context loader should not recover turn envelopes from the run row",
);
assert.match(
  runtimeTurnContextSource,
  /runtimeTurnEnvelope:\s*params\.runtimeTurnEnvelope \?\? null/,
  "context loader should use only the explicit prompt envelope",
);
assert.doesNotMatch(
  runtimeTurnContextSource,
  /normalizeRuntimeTurnEnvelope/,
  "context loader should not normalize persisted run-row envelopes",
);

const runtimeTurnHandlersSource = readFileSync("convex/runtimeTurnHandlers.ts", "utf8");
assert.match(
  runtimeTurnHandlersSource,
  /refreshRuntimeContextSnapshot/,
  "runtime handler should refresh active snapshots through an explicit callback",
);
assert.match(
  runtimeTurnHandlersSource,
  /phase: "started" \| "active" = "active"/,
  "runtime handler snapshot refresh callback should default to active phase",
);
assert.match(
  runtimeTurnHandlersSource,
  /let runtimeTurnEnvelopeForRun: RuntimeTurnEnvelopeV1 \| null = null/,
  "runtime handler should keep the loop-built envelope in run-local closure state",
);
assert.match(
  runtimeTurnHandlersSource,
  /if \(runtimeTurnEnvelope\) runtimeTurnEnvelopeForRun = runtimeTurnEnvelope/,
  "runtime handler should capture the latest loop-built envelope before snapshot persistence",
);
assert.match(
  runtimeTurnHandlersSource,
  /runtimeTurnEnvelope: runtimeTurnEnvelopeForRun/,
  "runtime handler should pass the captured envelope into context snapshots",
);
assert.match(
  runtimeTurnHandlersSource,
  /persistContextSnapshotBestEffort\(phase, runtimeTurnEnvelope\)/,
  "runtime handler should forward requested snapshot phase and envelope into persistence",
);

const threadsSource = readFileSync("convex/threads.ts", "utf8");
assert.doesNotMatch(
  threadsSource,
  /setCloudRuntimeRunTurnEnvelopeInternal/,
  "threads should not expose a separate runtime turn envelope setter",
);
assert.doesNotMatch(
  threadsSource,
  /normalizeRuntimeTurnEnvelope/,
  "threads should not normalize runtime turn envelopes for run-row persistence",
);
assert.doesNotMatch(
  threadsSource,
  /throw new Error\("runtime_turn_envelope_invalid"\)/,
  "threads should not define a separate runtime turn envelope validation failure",
);
assert.doesNotMatch(
  threadsSource,
  /runtimeTurnEnvelope:\s*normalizedRuntimeTurnEnvelope/,
  "threads should not persist normalized runtime turn envelopes in run rows",
);
assert.doesNotMatch(
  threadsSource,
  /runtimeTurnEnvelope:\s*args\.runtimeTurnEnvelope/,
  "threads should not store raw runtime turn envelope input",
);

const schemaSource = readFileSync("convex/schema.ts", "utf8");
assert.doesNotMatch(
  schemaSource,
  /runtimeTurnEnvelope:\s*v\.optional\(v\.any\(\)\)/,
  "runtimeRuns should not persist the turn envelope outside context snapshots",
);
assert.doesNotMatch(
  schemaSource,
  /runtimeTurnEnvelopeUpdatedAt:\s*v\.optional\(v\.number\(\)\)/,
  "runtimeRuns should not carry a separate turn envelope timestamp",
);

console.log("runtime_turn_envelope_proof: ok");
