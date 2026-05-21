import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `expected source to include ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `expected source to include ${endNeedle}`);
  return source.slice(start, end);
}

const operatorTypes = read("shared/operatorTypes.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorPanel = read("apps/web/src/components/WebOperatorDataPanel.tsx");
const packageJson = read("package.json");

const runtimeDiagnosticsBlock = sliceBetween(
  operatorIntelligence,
  "getOperatorRuntimeToolDiagnosticsInternal = internalQuery",
  "export const listOperatorRisksInternal",
);

assert.match(
  operatorTypes,
  /export type OperatorCodexHarnessDiagnostics = /,
  "operator diagnostics should have a first-class Codex harness canary projection",
);
for (const field of [
  "workspaceHandoffStarts",
  "workspaceHandoffCompletions",
  "workspaceHandoffFailures",
  "probeStarts",
  "probeCompletions",
  "readinessEvents",
  "readyEvents",
  "executionStarts",
  "executionCompletions",
  "executionReadinessEvents",
  "executionReadyEvents",
  "adapterSummaries",
  "adapterEvents",
  "latestWorkspaceHandoff",
  "latestProbe",
  "latestReadiness",
  "latestExecution",
  "latestExecutionReadiness",
  "latestAdapterSummary",
  "latestStreamSummary",
]) {
  assert.match(operatorTypes, new RegExp(`${field}:`), `Codex harness diagnostics missing ${field}`);
}
assert.match(
  operatorTypes,
  /codexHarness: OperatorCodexHarnessDiagnostics/,
  "runtime/tool diagnostics snapshot should include Codex harness diagnostics",
);

for (const eventType of [
  "codex_workspace_handoff_started",
  "codex_workspace_handoff_completed",
  "codex_harness_probe_started",
  "codex_harness_app_server_started",
  "codex_harness_auth_applied",
  "codex_harness_account_resolved",
  "codex_harness_rate_limits_updated",
  "codex_harness_execution_started",
  "codex_harness_thread_started",
  "codex_harness_execution_completed",
  "codex_harness_execution_readiness",
  "codex_harness_event_adapter_summary",
  "codex_harness_event_adapter_event",
  "codex_harness_stream_event_summary",
  "codex_harness_stream_event",
  "codex_harness_live_stream_delta_failed",
  "codex_harness_tool_call_started",
  "codex_harness_tool_call_completed",
  "codex_harness_tool_call_readiness",
  "codex_harness_probe_completed",
  "codex_harness_readiness",
]) {
  assert.match(
    operatorIntelligence,
    new RegExp(`"${eventType}"`),
    `operator runtime diagnostics should sample ${eventType}`,
  );
}
assert.match(
  operatorIntelligence,
  /function buildCodexHarnessDiagnostics\(runtimeEvents: any\[\]\)/,
  "operator intelligence should project Codex canary events through a bounded helper",
);
assert.match(
  operatorIntelligence,
  /streamSummaryRows[\s\S]*latestStreamSummary/,
  "operator intelligence should project Codex stream-event summaries without raw delta text",
);
assert.match(
  runtimeDiagnosticsBlock,
  /const codexHarness = buildCodexHarnessDiagnostics\(runtimeEvents\)[\s\S]*codexHarness,/,
  "runtime/tool diagnostics should return the Codex canary projection",
);
assert.match(
  sliceBetween(operatorIntelligence, "latestProbe:", "latestReadiness:"),
  /readPayloadString\(latestProbePayload,\s*"status"\)\s*===\s*"ok"/,
  "latest probe projection should treat status=ok as success",
);
assert.doesNotMatch(
  sliceBetween(operatorIntelligence, "function buildCodexHarnessDiagnostics", "async function readCriticalAuditEventsByType"),
  /accessToken|refreshToken|Authorization|OPENAI_API_KEY|CODEX_API_KEY|authFile|accountEmail|rawOutput|stdout|stderr/,
  "Codex canary operator projection must not expose tokens, auth files, or raw command output",
);

assert.match(
  operatorPanel,
  /formatCodexHarnessStatus/,
  "operator panel should format Codex readiness states explicitly",
);
assert.match(
  operatorPanel,
  /Codex canary[\s\S]*Codex workspace handoffs[\s\S]*Latest Codex handoff[\s\S]*Latest Codex readiness/,
  "operator panel should render canary status, workspace handoff evidence, and latest readiness evidence",
);
assert.match(
  operatorPanel,
  /Codex execution canary[\s\S]*Latest Codex execution/,
  "operator panel should render execution canary status and latest execution evidence",
);
assert.match(
  operatorPanel,
  /Codex adapter events[\s\S]*Latest Codex adapter/,
  "operator panel should render Codex app-server adapter event evidence",
);

assert.match(
  packageJson,
  /"check:codex-harness-observability-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/codex_harness_observability_proof\.ts"/,
  "Codex harness observability proof must be wired into package scripts",
);

console.log("codex_harness_observability_proof: ok");
