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
  CODEX_HARNESS_PRIMARY_STREAMING_ENV,
  isCodexHarnessPrimaryEnabled,
  isCodexHarnessPrimaryStreamingEnabled,
} from "../shared/codexHarnessRoute.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

const runtimeAgentHarness = readText("shared/runtimeAgentHarness.ts");
const codexHarnessRoute = readText("shared/codexHarnessRoute.ts");
const httpDaytona = readText("convex/httpDaytona.ts");
const runtimeTurnHandlers = readText("convex/runtimeTurnHandlers.ts");
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
assert.equal(
  isCodexHarnessPrimaryStreamingEnabled({
    [CODEX_HARNESS_PRIMARY_STREAMING_ENV]: "true",
  }),
  true,
  "Codex primary streaming must require its own explicit hard flag",
);
assert.equal(
  isCodexHarnessPrimaryStreamingEnabled({
    [CODEX_HARNESS_PRIMARY_STREAMING_ENV]: "0",
  }),
  false,
  "Codex primary streaming should default off for safe rollout",
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
    codex_primary_streaming_enabled: false,
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
    codex_primary_streaming_enabled: false,
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

const streamingPrimaryEnabled = resolveRuntimeAgentHarnessSelection({
  codexPrimaryEnabled: true,
  codexPrimaryStreamingEnabled: true,
  codexRouteSelected: true,
  codexPrimaryAdapterAvailable: true,
  stream: true,
});
assert.equal(streamingPrimaryEnabled.selectedHarness.id, CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS.id);
assert.equal(streamingPrimaryEnabled.reason, "codex_primary_selected");

assert.match(
  codexHarnessRoute,
  /CODEX_HARNESS_PRIMARY_ENV = "POLYNET_CODEX_HARNESS_PRIMARY_ENABLED"/,
  "Codex primary harness rollout should have a separate explicit env flag",
);
assert.match(
  codexHarnessRoute,
  /CODEX_HARNESS_PRIMARY_STREAMING_ENV =\s*"POLYNET_CODEX_HARNESS_PRIMARY_STREAMING_ENABLED"/,
  "Codex primary streaming rollout should have a separate explicit env flag",
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
  /const codexPrimaryRoute = resolveCodexHarnessRoute\(\{[\s\S]*explicitPrimaryRequest: params\.codexPrimaryCanary === true[\s\S]*projectId: params\.projectId/,
  "runtime should only request the Codex primary route for an explicit staging canary",
);
assert.doesNotMatch(
  httpDaytona.slice(
    httpDaytona.indexOf("const codexPrimaryRoute = resolveCodexHarnessRoute"),
    httpDaytona.indexOf("const runtimeHarnessSelection = resolveRuntimeAgentHarnessSelection"),
  ),
  /runtimeExecutionMode: "agentic"|allowedToolNames: params\.allowedToolNames/,
  "Codex primary selection must not use broad agentic/tool availability facts as a router",
);
assert.match(
  runtimeTurnHandlers,
  /explicitPrimaryRequest: codexPrimaryCanaryRequested/,
  "runtime route evidence should track the explicit Codex canary request",
);
assert.doesNotMatch(
  runtimeTurnHandlers,
  /codexPrimaryCanaryRequested\s*\|\|\s*codexHarnessProbeMode !== "off"/,
  "probe-mode environment flags must not select Codex route evidence for ordinary turns",
);

assert.match(
  httpDaytona,
  /codexPrimaryEnabled: isCodexHarnessPrimaryEnabled\(\)/,
  "primary Codex selection must remain behind the hard primary flag",
);
assert.match(
  httpDaytona,
  /codexPrimaryStreamingEnabled: isCodexHarnessPrimaryStreamingEnabled\(\)/,
  "primary Codex streaming selection must remain behind its own hard flag",
);

assert.match(
  httpDaytona,
  /codexPrimaryAdapterAvailable: true/,
  "once the real adapter exists, selection should be able to choose Codex behind the primary flag",
);
assert.match(
  httpDaytona,
  /emitLiveAssistantDelta: emitCodexLiveAssistantDelta/,
  "Codex app-server harness should receive the existing runtime live-delta emitter",
);
assert.match(
  httpDaytona,
  /codexLiveAssistantDeltaEmitted[\s\S]*runtime_agent_harness_fallback_skipped[\s\S]*visible_output_started/,
  "Codex primary fallback should be skipped after user-visible live output starts",
);

assert.match(
  httpDaytona,
  /stream: params\.stream \?\? false/,
  "Codex primary selection should receive the explicit stream fact",
);
assert.match(
  runtimeTurnHandlers,
  /const emitCodexLiveAssistantDelta = async[\s\S]*emitDelta\(text\)[\s\S]*return true/,
  "runtime streaming path should bridge Codex assistant deltas into the existing SSE delta emitter",
);
assert.match(
  runtimeTurnHandlers,
  /codex_harness_live_stream_delta_failed[\s\S]*delta_chars: text\.length/,
  "runtime streaming path should record live-delta emit failures without raw delta text",
);
assert.doesNotMatch(
  runtimeTurnHandlers.slice(
    runtimeTurnHandlers.indexOf('eventType: "codex_harness_live_stream_delta_failed"'),
    runtimeTurnHandlers.indexOf("          writer.send({", runtimeTurnHandlers.indexOf('eventType: "codex_harness_live_stream_delta_failed"')),
  ),
  /delta:\s*text|raw_delta|full_content/,
  "runtime live-delta failure audit must not persist raw assistant text",
);
assert.match(
  runtimeTurnHandlers,
  /loopResult\.runtimeHarnessId === "codex_app_server"[\s\S]*codexLiveStreamDeltaAttemptedEvents > 0[\s\S]*streamedContent = loopResult\.assistantText/,
  "runtime streaming path should avoid replaying final Codex text after live deltas already streamed",
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
