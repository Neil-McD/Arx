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

const schema = read("convex/schema.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorPlatformHealth = read("shared/operatorPlatformHealth.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = read("apps/web/src/components/WebWorkspaceRightPanel.tsx");
const packageJson = read("package.json");

const runtimeDiagnosticsBlock = sliceBetween(
  operatorIntelligence,
  "getOperatorRuntimeToolDiagnosticsInternal = internalQuery",
  "export const listOperatorRisksInternal",
);
const runtimeCardBlock = sliceBetween(
  operatorPlatformHealth,
  "function buildRuntimeCard",
  "function buildAuthCard",
);
const runtimePanelBlock = sliceBetween(
  operatorPanel,
  "<h2>Runtime execution</h2>",
  "Runtime diagnostics are sampled for this window",
);
const toolBalancePanelBlock = sliceBetween(
  operatorPanel,
  "<h2>Tool balance revenue</h2>",
  "<h2>Partner payout cycles</h2>",
);

assert.match(
  schema,
  /runtimeRuns:[\s\S]*\.index\("by_status_startedAt", \["status", "startedAt"\]\)/,
  "runtime diagnostics must query runtime runs by status and time",
);
assert.match(
  schema,
  /runtimeRunEvents:[\s\S]*\.index\("by_eventType_createdAt", \["eventType", "createdAt"\]\)/,
  "runtime diagnostics must query runtime events by type and time",
);
assert.match(
  schema,
  /workspaceComputeCharges:[\s\S]*\.index\("by_debitSource_createdAt", \["debitSource", "createdAt"\]\)/,
  "runtime diagnostics must query unbilled compute by debit source and time",
);

assert.match(
  operatorTypes,
  /export type OperatorRuntimeToolDiagnosticsSnapshot = /,
  "operator runtime/tool diagnostics snapshot contract is missing",
);
for (const field of [
  "turnsStarted",
  "turnsSucceeded",
  "turnsFailed",
  "toolCalls",
  "toolFailures",
  "runtimeDiagnosticEvents",
  "providerFailures",
  "rateLimitFailures",
  "workspaceCreditFailures",
  "paidToolLedgerFailures",
  "sandboxCreateFailures",
  "unbilledComputeCharges",
]) {
  assert.match(operatorTypes, new RegExp(`${field}: number`), `runtime/tool totals missing ${field}`);
}
assert.match(
  operatorTypes,
  /topFailureCodes: OperatorRuntimeToolFailureBucket\[\]/,
  "runtime/tool diagnostics must expose normalized failure buckets",
);
assert.match(
  operatorTypes,
  /executionAvailability\?:[\s\S]*turnSuccessRate: number \| null[\s\S]*toolFailureRate: number \| null[\s\S]*topFailingTools: OperatorRuntimeToolFailureBucket\[\]/,
  "runtime/tool diagnostics must expose execution availability separately",
);
assert.match(
  operatorTypes,
  /usageIntegrity\?:[\s\S]*workspaceCreditFailures: number[\s\S]*paidToolLedgerFailures: number[\s\S]*unbilledComputeCharges: number/,
  "runtime/tool diagnostics must expose usage integrity separately",
);
assert.match(
  operatorTypes,
  /export type OperatorPaidToolLane = /,
  "runtime/tool diagnostics must expose a paid-tool lane contract",
);
for (const field of [
  "reservations",
  "succeeded",
  "refunded",
  "stillReserved",
  "failures",
  "reservedCredits",
  "settledCredits",
  "refundedCredits",
]) {
  assert.match(operatorTypes, new RegExp(`${field}: number`), `paid-tool diagnostics missing ${field}`);
}
assert.match(
  operatorTypes,
  /paidTools:[\s\S]*totals:[\s\S]*lanes: OperatorPaidToolLane\[\]/,
  "runtime/tool diagnostics must expose aggregate paid-tool accounting",
);

assert.match(
  runtimeDiagnosticsBlock,
  /readRuntimeRunsByStatus[\s\S]*readRuntimeEventsByType[\s\S]*readCreditLedgerEntriesByTool[\s\S]*readWorkspaceComputeChargesByDebitSource/,
  "runtime/tool diagnostics must aggregate runtime, tool, credit, and compute evidence",
);
assert.match(
  operatorIntelligence,
  /function buildPaidToolDiagnostics[\s\S]*reservedCredits[\s\S]*settledCredits[\s\S]*refundedCredits[\s\S]*unbilledComputeCharges/,
  "runtime/tool diagnostics must project safe paid-tool accounting aggregates",
);
assert.match(
  runtimeDiagnosticsBlock,
  /const paidTools = buildPaidToolDiagnostics\(paidToolLedgerRows, unbilledComputeCharges\)[\s\S]*paidTools,/,
  "runtime/tool diagnostics must return paid-tool accounting from the ledger rows",
);
assert.match(
  runtimeDiagnosticsBlock,
  /executionFailureCodeRows[\s\S]*usageIntegrityFailureCodeRows[\s\S]*executionAvailability:[\s\S]*usageIntegrity:/,
  "runtime/tool diagnostics must split execution availability from usage integrity",
);
assert.match(
  runtimeDiagnosticsBlock,
  /executionRuntimeDiagnosticCodeRows[\s\S]*usageRuntimeDiagnosticCodeRows[\s\S]*usageIntegrityFailureCodeRows/,
  "runtime/tool diagnostics must classify runtime diagnostic events before scoring",
);
assert.match(
  runtimeDiagnosticsBlock,
  /const executionTurnTerminalCount = turnsSucceeded \+ executionRunFailureCodeRows\.length;/,
  "runtime execution scoring must not treat user-cancelled turns as availability failures",
);
assert.match(
  runtimeDiagnosticsBlock,
  /executionAvailability:[\s\S]*turnSuccessRate[\s\S]*toolFailureRate[\s\S]*providerFailures[\s\S]*sandboxCreateFailures[\s\S]*topFailureCodes/,
  "runtime/tool diagnostics must return execution availability fields",
);
assert.match(
  runtimeDiagnosticsBlock,
  /usageIntegrity:[\s\S]*workspaceCreditFailures[\s\S]*paidToolLedgerFailures[\s\S]*unbilledComputeCharges[\s\S]*topFailureCodes/,
  "runtime/tool diagnostics must return usage integrity fields",
);
assert.match(
  operatorIntelligence,
  /PAID_TOOL_LEDGER_NAMES = \["daytona_workspace", "web_research", "voice_transcribe"\]/,
  "runtime/tool diagnostics must include Daytona, web research, and voice paid-tool ledger rows",
);
assert.match(
  operatorIntelligence,
  /readRuntimeRunsByStatus[\s\S]*withIndex\("by_status_startedAt"/,
  "runtime run reads must use the status/time index",
);
assert.match(
  operatorIntelligence,
  /readRuntimeEventsByType[\s\S]*withIndex\("by_eventType_createdAt"/,
  "runtime event reads must use the event type/time index",
);
assert.match(
  operatorIntelligence,
  /readWorkspaceComputeChargesByDebitSource[\s\S]*withIndex\("by_debitSource_createdAt"/,
  "compute charge reads must use the debit source/time index",
);
assert.match(
  operatorIntelligence,
  /normalizeRuntimeFailureCode[\s\S]*workspace_credits_exhausted[\s\S]*provider_rate_limited[\s\S]*provider_failed[\s\S]*sandbox_create_failed/,
  "runtime/tool diagnostics must normalize failure codes into operator vocabulary",
);
assert.match(
  runtimeDiagnosticsBlock,
  /workspaceSessionCreateFailureRows[\s\S]*normalizedWorkspaceSessionCreateFailureCodes[\s\S]*workspaceSessionCreateFailureCodeRows[\s\S]*workspaceCreditFailures[\s\S]*normalizedWorkspaceSessionCreateFailureCodes/,
  "runtime/tool diagnostics must preserve workspace-session failure root causes",
);
assert.match(
  runtimeDiagnosticsBlock,
  /latestEvents:\s*diagnosticRows\.slice\(0, 8\)\.map\(mapDiagnosticEvent\)/,
  "runtime/tool diagnostics should project compact diagnostic events, not raw runtime payloads",
);
assert.match(
  runtimeDiagnosticsBlock,
  /sourceTables:[\s\S]*"runtimeRuns"[\s\S]*"runtimeRunEvents"[\s\S]*"platformDiagnosticEvents"[\s\S]*"creditLedgerEntries"[\s\S]*"workspaceComputeCharges"/,
  "runtime/tool diagnostics evidence must name its source tables",
);
assert.doesNotMatch(
  runtimeDiagnosticsBlock,
  /output_preview|outputText|rawArguments|full_content|prompt:|metadata:|query:|url:|transcript:|audio:/,
  "runtime/tool operator projection must not expose raw prompts or tool output",
);
assert.doesNotMatch(
  runtimeDiagnosticsBlock,
  /internalMutation|mutation|action|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete/,
  "operator runtime/tool diagnostics must stay read-only",
);

assert.match(
  operatorDashboard,
  /getOperatorRuntimeToolDiagnostics = query[\s\S]*requireOperatorAccess[\s\S]*getOperatorRuntimeToolDiagnosticsInternal/,
  "public runtime/tool diagnostics query must be operator-gated",
);
assert.match(
  operatorGateway,
  /operatorDashboard:getOperatorRuntimeToolDiagnostics/,
  "web gateway must call the gated runtime/tool diagnostics query",
);
assert.doesNotMatch(
  operatorGateway,
  /operatorIntelligence:getOperatorRuntimeToolDiagnosticsInternal/,
  "web gateway must not call internal runtime/tool diagnostics directly",
);
assert.match(
  operatorPanel,
  /loadOperatorRuntimeToolDiagnosticsCanonical/,
  "operator panel must load runtime/tool diagnostics",
);
assert.match(
  operatorPanel,
  /Runtime execution/,
  "operator panel must render the runtime/tool diagnostics section",
);
assert.doesNotMatch(
  operatorPanel,
  /Runtime &amp; tools/,
  "operator panel should use the narrowed runtime execution label",
);
assert.match(
  runtimeCardBlock,
  /runtime\.executionAvailability[\s\S]*Turns, tools, providers, and sandbox execution clean/,
  "platform runtime card must score execution availability",
);
assert.doesNotMatch(
  runtimeCardBlock,
  /workspaceCreditFailures|paidToolLedgerFailures|unbilledComputeCharges|paid-tool ledger failures|unbilled compute charges|credit failures/,
  "platform runtime card must not score tool-balance accounting anomalies",
);
assert.match(
  runtimePanelBlock,
  /Turn success[\s\S]*Failed turns[\s\S]*Tool failure rate[\s\S]*Provider failures[\s\S]*Rate limits[\s\S]*Sandbox create failures/,
  "operator runtime panel must render execution availability fields",
);
assert.doesNotMatch(
  runtimePanelBlock,
  /Credit failures|Paid-tool failures|Unbilled compute/,
  "operator runtime panel must keep usage accounting out of execution health",
);
assert.match(
  operatorPanel,
  /Promise\.allSettled[\s\S]*fulfilledValue[\s\S]*fulfilledList/,
  "operator panel must keep loaded sections when one diagnostics section fails",
);
assert.match(
  operatorPanel,
  /Runtime diagnostics are sampled for this window/,
  "operator panel must label sampled runtime diagnostics",
);
assert.match(
  toolBalancePanelBlock,
  /Credits settled[\s\S]*Credits refunded[\s\S]*Credit failures[\s\S]*Paid-tool failures[\s\S]*Unbilled compute[\s\S]*No paid-tool credit activity returned/,
  "operator panel must render compact paid-tool accounting and usage integrity",
);
assert.doesNotMatch(
  operatorPanel,
  /metadata|rawQuery|queryText|transcript|audioBlob|audioUrl/,
  "operator panel must not render raw paid-tool metadata",
);
assert.match(
  packageJson,
  /"check:runtime-tool-diagnostics-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/runtime_tool_diagnostics_proof\.ts"/,
  "runtime/tool diagnostics proof must be wired into package scripts",
);

console.log("runtime_tool_diagnostics_proof: ok");
