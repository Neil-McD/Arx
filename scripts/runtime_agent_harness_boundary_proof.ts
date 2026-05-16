import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS,
  POLYNET_NATIVE_RUNTIME_AGENT_HARNESS,
  buildRuntimeAgentHarnessSelectedEventPayload,
  resolveRuntimeAgentHarnessSelection,
} from "../shared/runtimeAgentHarness.ts";
import {
  CODEX_HARNESS_PRIMARY_ENV,
  isCodexHarnessPrimaryEnabled,
} from "../shared/codexHarnessRoute.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

const runtimeAgentHarness = readText("shared/runtimeAgentHarness.ts");
const codexHarnessRoute = readText("shared/codexHarnessRoute.ts");
const httpDaytona = readText("convex/httpDaytona.ts");
const packageJson = readText("package.json");

assert.equal(
  isCodexHarnessPrimaryEnabled({ [CODEX_HARNESS_PRIMARY_ENV]: "true" }),
  true,
  "Codex primary harness must require an explicit hard flag",
);
assert.equal(
  isCodexHarnessPrimaryEnabled({ [CODEX_HARNESS_PRIMARY_ENV]: "0" }),
  false,
  "Codex primary harness should default off for safe rollout",
);

assert.match(
  runtimeAgentHarness,
  /export type RuntimeAgentHarnessId = "polynet_native" \| "codex_app_server"/,
  "runtime should define a harness id union that includes the current native harness and the future Codex harness",
);

assert.match(
  runtimeAgentHarness,
  /export type PreparedRuntimeAgentTurn = \{/,
  "runtime should prepare an explicit turn envelope before selecting an executor",
);

assert.match(
  runtimeAgentHarness,
  /export type RuntimeAgentHarness = RuntimeAgentHarnessDescriptor & \{[\s\S]*execute: \(\) => Promise<RuntimeAgentHarnessResult>/,
  "runtime should define an adapter contract for swappable agent harness executors",
);

assert.match(
  runtimeAgentHarness,
  /POLYNET_NATIVE_RUNTIME_AGENT_HARNESS[\s\S]*id: "polynet_native"[\s\S]*executionPlacement: "convex_action"/,
  "native harness should be represented as a first-class descriptor",
);

assert.match(
  runtimeAgentHarness,
  /CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS[\s\S]*id: "codex_app_server"[\s\S]*executionPlacement: "daytona_sidecar"/,
  "Codex app-server harness should be represented as a first-class Daytona-sidecar descriptor",
);

assert.match(
  runtimeAgentHarness,
  /nativeTranscript: \[\.\.\.params\.nativeTranscript\]/,
  "prepared turn should copy transcript arrays instead of aliasing mutable inputs",
);

const primaryOff = resolveRuntimeAgentHarnessSelection({
  codexPrimaryEnabled: false,
  codexRouteSelected: true,
  codexPrimaryAdapterAvailable: true,
  stream: false,
});
assert.equal(primaryOff.selectedHarness.id, POLYNET_NATIVE_RUNTIME_AGENT_HARNESS.id);
assert.equal(primaryOff.reason, "codex_primary_disabled");

const adapterUnavailable = resolveRuntimeAgentHarnessSelection({
  codexPrimaryEnabled: true,
  codexRouteSelected: true,
  codexPrimaryAdapterAvailable: false,
  stream: false,
});
assert.equal(adapterUnavailable.selectedHarness.id, POLYNET_NATIVE_RUNTIME_AGENT_HARNESS.id);
assert.equal(adapterUnavailable.candidateHarness?.id, CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS.id);
assert.equal(adapterUnavailable.fallbackHarness?.id, POLYNET_NATIVE_RUNTIME_AGENT_HARNESS.id);
assert.equal(adapterUnavailable.reason, "codex_primary_adapter_unavailable");

const primarySelected = resolveRuntimeAgentHarnessSelection({
  codexPrimaryEnabled: true,
  codexRouteSelected: true,
  codexPrimaryAdapterAvailable: true,
  stream: false,
});
assert.equal(primarySelected.selectedHarness.id, CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS.id);
assert.equal(primarySelected.fallbackHarness?.id, POLYNET_NATIVE_RUNTIME_AGENT_HARNESS.id);
assert.equal(primarySelected.reason, "codex_primary_selected");

assert.deepEqual(
  buildRuntimeAgentHarnessSelectedEventPayload({
    runId: "run-1",
    selection: adapterUnavailable,
  }),
  {
    run_id: "run-1",
    selected_harness_id: "polynet_native",
    selected_harness_label: "PolyNet native runtime kernel",
    execution_placement: "convex_action",
    selection_policy: "codex_primary_flag_then_native_fallback",
    selection_reason: "codex_primary_adapter_unavailable",
    fallback_harness_id: "polynet_native",
    candidate_harness_id: "codex_app_server",
    candidate_execution_placement: "daytona_sidecar",
    codex_primary_enabled: true,
    codex_route_selected: true,
    codex_primary_adapter_available: false,
    stream: false,
  },
  "selection event should expose the Codex primary candidate while preserving native fallback",
);

const adapterAvailable = resolveRuntimeAgentHarnessSelection({
  codexPrimaryEnabled: true,
  codexRouteSelected: true,
  codexPrimaryAdapterAvailable: true,
  stream: false,
});
assert.deepEqual(
  buildRuntimeAgentHarnessSelectedEventPayload({
    runId: "run-2",
    selection: adapterAvailable,
  }),
  {
    run_id: "run-2",
    selected_harness_id: "codex_app_server",
    selected_harness_label: "Codex app-server runtime",
    execution_placement: "daytona_sidecar",
    selection_policy: "codex_primary_flag_then_native_fallback",
    selection_reason: "codex_primary_selected",
    fallback_harness_id: "polynet_native",
    candidate_harness_id: "codex_app_server",
    candidate_execution_placement: "daytona_sidecar",
    codex_primary_enabled: true,
    codex_route_selected: true,
    codex_primary_adapter_available: true,
    stream: false,
  },
  "when primary flag, route, and adapter are ready, selection should choose Codex with native fallback",
);

const streamingPrimary = resolveRuntimeAgentHarnessSelection({
  codexPrimaryEnabled: true,
  codexRouteSelected: true,
  codexPrimaryAdapterAvailable: true,
  stream: true,
});
assert.equal(streamingPrimary.selectedHarness.id, POLYNET_NATIVE_RUNTIME_AGENT_HARNESS.id);
assert.equal(streamingPrimary.reason, "codex_primary_streaming_not_supported");

assert.match(
  codexHarnessRoute,
  /CODEX_HARNESS_PRIMARY_ENV = "POLYNET_CODEX_HARNESS_PRIMARY_ENABLED"/,
  "Codex primary harness rollout should have a separate explicit env flag",
);

assert.match(
  httpDaytona,
  /from "\.\.\/shared\/runtimeAgentHarness\.ts"/,
  "httpDaytona should import the extracted runtime harness boundary",
);

assert.doesNotMatch(
  httpDaytona,
  /type RuntimeAgentHarnessId = "polynet_native" \| "codex_app_server"/,
  "httpDaytona should not own the harness id union after extraction",
);

assert.match(
  httpDaytona,
  /const preparedRuntimeTurn = buildPreparedRuntimeAgentTurn\(\{[\s\S]*harnessId: runtimeHarnessSelection\.selectedHarness\.id[\s\S]*executionPlacement: runtimeHarnessSelection\.selectedHarness\.executionPlacement/,
  "prepared turn should represent the selected runtime agent harness",
);

assert.match(
  httpDaytona,
  /const codexPrimaryRoute = resolveCodexHarnessRoute\(\{[\s\S]*runtimeExecutionMode: "agentic"[\s\S]*allowedToolNames: params\.allowedToolNames/,
  "runtime should resolve Codex primary route eligibility from the same turn facts",
);

assert.match(
  httpDaytona,
  /codexPrimaryEnabled: isCodexHarnessPrimaryEnabled\(\)/,
  "primary Codex selection must remain behind the hard primary flag",
);

assert.match(
  httpDaytona,
  /codexPrimaryAdapterAvailable: true/,
  "once the real adapter exists, selection should be able to choose Codex behind the primary flag",
);

assert.match(
  httpDaytona,
  /stream: params\.stream \?\? false/,
  "first Codex primary adapter should leave streaming turns on the native harness",
);

assert.match(
  httpDaytona,
  /buildCodexAppServerRuntimeAgentHarness/,
  "httpDaytona should construct the Codex app-server runtime harness adapter",
);

assert.match(
  httpDaytona,
  /runtimeHarnessSelection\.selectedHarness\.id === "codex_app_server"[\s\S]*\? codexRuntimeHarness[\s\S]*: nativeRuntimeHarness/,
  "runtime should choose the Codex adapter only when harness selection chooses Codex",
);

assert.match(
  httpDaytona,
  /runtime_agent_harness_fallback_started/,
  "Codex primary failures should record fallback to the native harness",
);

assert.match(
  httpDaytona,
  /eventType: "runtime_agent_harness_prepared"/,
  "prepared harness turns should be auditable in the runtime event ledger",
);

assert.match(
  httpDaytona,
  /eventType: "runtime_agent_harness_selected"[\s\S]*buildRuntimeAgentHarnessSelectedEventPayload/,
  "harness selection should be explicit before primary Codex replacement work",
);

assert.match(
  httpDaytona,
  /const nativeRuntimeHarness = buildPolynetNativeRuntimeAgentHarness\(\{[\s\S]*execute: async \(\) => await runNativeRuntimeKernel<string>/,
  "current native kernel should run through the extracted harness adapter builder",
);

assert.match(
  httpDaytona,
  /let loopResult = withRuntimeAgentLoopAttribution\([\s\S]*await selectedRuntimeHarness\.execute\(\),[\s\S]*selectedRuntimeHarness,[\s\S]*\)/,
  "runtime should execute through the selected harness adapter, not by calling the kernel directly at the call site",
);

assert.match(
  packageJson,
  /"check:runtime-agent-harness-boundary-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/runtime_agent_harness_boundary_proof\.ts"/,
  "package scripts should include the runtime agent harness boundary proof",
);

console.log("runtime_agent_harness_boundary_proof: ok");
