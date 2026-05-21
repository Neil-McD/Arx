import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";

import {
  CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS,
  POLYNET_NATIVE_RUNTIME_AGENT_HARNESS,
  buildPreparedRuntimeAgentTurn,
} from "../shared/runtimeAgentHarness.ts";
import {
  CODEX_WORKSPACE_HANDOFF_ENV,
  CODEX_WORKSPACE_HANDOFF_LEGACY_ENV,
  isCodexWorkspaceHandoffEnabled,
  resolveCodexWorkspaceHandoffEligibility,
} from "../shared/codexWorkspaceHandoffPolicy.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

const runtimeAgentHarness = readText("shared/runtimeAgentHarness.ts");
const handoffPolicy = readText("shared/codexWorkspaceHandoffPolicy.ts");
const httpDaytona = readText("convex/httpDaytona.ts");
const runtimeTurnHandlers = readText("convex/runtimeTurnHandlers.ts");

assert.equal(
  existsSync("shared/codexHarnessRoute.ts"),
  false,
  "the old Codex route module should be deleted",
);

assert.match(
  runtimeAgentHarness,
  /export type RuntimeAgentHarnessId = "polynet_native" \| "codex_app_server"/,
  "runtime should keep explicit harness identifiers for attribution and handoff evidence",
);
assert.match(
  runtimeAgentHarness,
  /POLYNET_NATIVE_RUNTIME_AGENT_HARNESS[\s\S]*id: "polynet_native"[\s\S]*executionPlacement: "convex_action"/,
  "native harness should remain the default product runtime descriptor",
);
assert.match(
  runtimeAgentHarness,
  /CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS[\s\S]*id: "codex_app_server"[\s\S]*executionPlacement: "daytona_sidecar"/,
  "Codex app-server should remain represented as the Daytona-sidecar handoff harness",
);
assert.doesNotMatch(
  runtimeAgentHarness,
  /resolveRuntimeAgentHarnessSelection|RuntimeAgentHarnessSelection|codex_route_selected/,
  "runtimeAgentHarness should not contain a whole-turn Codex router",
);

const prepared = buildPreparedRuntimeAgentTurn({
  harnessId: POLYNET_NATIVE_RUNTIME_AGENT_HARNESS.id,
  runId: "run-1",
  userId: "user-1",
  requestedModelId: "gpt-5.5",
  inferenceSource: "chatgpt",
  executionPlacement: POLYNET_NATIVE_RUNTIME_AGENT_HARNESS.executionPlacement,
  nativeTranscript: [{ role: "user", content: "hi" }],
  activeToolNames: ["codex_workspace"],
  fixedAllowedToolNames: ["codex_workspace"],
  mountedToolCount: 0,
  skillCounts: {
    installedPersonal: 0,
    selectedPersonal: 0,
    attachedCommunity: 0,
    selectedCommunity: 0,
  },
});
assert.equal(prepared.harnessId, "polynet_native");
assert.equal(prepared.executionPlacement, "convex_action");
assert.deepEqual(prepared.nativeTranscript, [{ role: "user", content: "hi" }]);

assert.equal(
  isCodexWorkspaceHandoffEnabled({ [CODEX_WORKSPACE_HANDOFF_ENV]: "true" }),
  true,
  "new Codex workspace handoff flag should enable only the handoff tool",
);
assert.equal(
  isCodexWorkspaceHandoffEnabled({ [CODEX_WORKSPACE_HANDOFF_ENV]: "0" }),
  false,
  "new Codex workspace handoff flag should default off",
);
assert.equal(
  isCodexWorkspaceHandoffEnabled({ [CODEX_WORKSPACE_HANDOFF_LEGACY_ENV]: "true" }),
  true,
  "legacy staging primary flag should temporarily enable handoff without reintroducing routing",
);
assert.equal(
  resolveCodexWorkspaceHandoffEligibility({
    handoffEnabled: false,
    inferenceSource: "chatgpt",
    projectId: "project-1",
  }).ok,
  false,
  "disabled handoff should fail closed",
);
assert.deepEqual(
  resolveCodexWorkspaceHandoffEligibility({
    handoffEnabled: true,
    inferenceSource: "chatgpt",
    projectId: null,
  }),
  resolveCodexWorkspaceHandoffEligibility({
    handoffEnabled: true,
    inferenceSource: "chatgpt",
    projectId: "",
  }),
  "missing workspace project should have one deterministic failure shape",
);
assert.equal(
  resolveCodexWorkspaceHandoffEligibility({
    handoffEnabled: true,
    inferenceSource: "platform",
    projectId: "project-1",
  }).ok,
  false,
  "first staging slice should keep ChatGPT-backed runtime requirement explicit",
);
assert.deepEqual(
  resolveCodexWorkspaceHandoffEligibility({
    handoffEnabled: true,
    inferenceSource: "chatgpt",
    projectId: "project-1",
  }),
  {
    ok: true,
    executionPlacement: "daytona_sidecar",
    authBridge: "chatgpt_subscription",
    codexHomePlacement: "sidecar_isolated_codex_home",
    toolProjection: "polynet_runtime_session",
  },
  "eligible workspace handoff should return direct Daytona-sidecar placement metadata",
);

assert.match(
  handoffPolicy,
  /resolveCodexWorkspaceHandoffEligibility/,
  "handoff policy should expose direct eligibility instead of route selection",
);
assert.doesNotMatch(
  handoffPolicy,
  /resolveCodexHarnessRoute|resolveCodexHarnessExecutorDecision|selectedHarness|codex_primary_selected/,
  "handoff policy should not reintroduce router concepts",
);

assert.match(
  httpDaytona,
  /harnessId: POLYNET_NATIVE_RUNTIME_AGENT_HARNESS\.id[\s\S]*executionPlacement: POLYNET_NATIVE_RUNTIME_AGENT_HARNESS\.executionPlacement/,
  "normal runtime turns should always prepare the PolyNet native harness",
);
assert.doesNotMatch(
  httpDaytona,
  /runtimeHarnessSelection|runtime_agent_harness_selected|executeCodexHarnessProbeIfSelected|resolveCodexHarnessRoute/,
  "httpDaytona should not select Codex for the whole turn or run shadow probes in the product path",
);
assert.match(
  httpDaytona,
  /toolName === "codex_workspace"[\s\S]*resolveCodexWorkspaceHandoffEligibility[\s\S]*buildCodexAppServerRuntimeAgentHarness/,
  "codex_workspace should be the only product bridge into the Codex app-server harness",
);

assert.doesNotMatch(
  runtimeTurnHandlers,
  /codex_harness_route_resolved|codex_harness_executor_resolved|codex_harness_shadow_comparison|appendCodexHarnessShadowComparisonBestEffort/,
  "runtime turn handler should not emit pre-turn route or shadow comparison evidence",
);

assert.equal(POLYNET_NATIVE_RUNTIME_AGENT_HARNESS.id, "polynet_native");
assert.equal(CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS.id, "codex_app_server");

console.log("PASS: runtime agent harness boundary uses PolyNet native plus codex_workspace handoff");
