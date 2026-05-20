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
const sharedWorkspaceCredits = read("shared/workspaceCredits.ts");
const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorPlatformHealth = read("shared/operatorPlatformHealth.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = [
  read("apps/web/src/components/WebWorkspaceRightPanel.tsx"),
  read("apps/web/src/components/useOperatorDashboardData.ts"),
  read("apps/web/src/components/OperatorPlatformPanelView.tsx"),
  read("apps/web/src/components/OperatorBusinessPanelView.tsx"),
].join("\n");
const packageJson = read("package.json");

const runtimeDiagnosticsBlock = sliceBetween(
  operatorIntelligence,
  "getOperatorRuntimeToolDiagnosticsInternal = internalQuery",
  "export const listOperatorRisksInternal",
);
const toolEconomicsBlock = sliceBetween(
  operatorIntelligence,
  "getOperatorToolEconomicsInternal = internalQuery",
  "export const getOperatorRuntimeToolDiagnosticsInternal",
);
const toolEconomicsBuilderBlock = sliceBetween(
  operatorIntelligence,
  "async function buildOperatorToolEconomicsSnapshot",
  "async function readCriticalAuditEventsByType",
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
  "tool economics diagnostics must query unbilled compute by debit source and time",
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
  "sandboxCreateFailures",
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
assert.doesNotMatch(
  operatorTypes,
  /export type OperatorRuntimeToolDiagnosticsSnapshot = \{(?:(?!export type OperatorToolEconomicsSnapshot)[\s\S])*paidToolEconomics|export type OperatorRuntimeToolDiagnosticsSnapshot = \{(?:(?!export type OperatorToolEconomicsSnapshot)[\s\S])*paidTools:|export type OperatorRuntimeToolDiagnosticsSnapshot = \{(?:(?!export type OperatorToolEconomicsSnapshot)[\s\S])*usageIntegrity\?:/,
  "runtime diagnostics must not own paid-tool economics or usage accounting",
);
assert.match(
  operatorTypes,
  /export type OperatorToolEconomicsSnapshot = [\s\S]*usageIntegrity:[\s\S]*workspaceCreditFailures: number[\s\S]*paidToolLedgerFailures: number[\s\S]*unbilledComputeCharges: number/,
  "operator tool economics must expose usage integrity separately",
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
  operatorTypes,
  /export type OperatorPaidToolEconomicsLane = [\s\S]*revenueUsd: number[\s\S]*vendorCostUsd: number[\s\S]*grossMarginUsd: number[\s\S]*grossMarginRate: number \| null[\s\S]*missingCostRows: number/,
  "runtime/tool diagnostics must expose paid-tool economics fields",
);
assert.doesNotMatch(
  operatorTypes,
  /partnerCommissionUsd|partnerShareOfGrossMargin|netAfterPartnerUsd|netAfterPartnerMarginRate|partnerGrossMarginShareBps|partnerCommissionRows|voidedPartnerCommissionUsd/,
  "operator tool economics must not expose deferred paid-tool partner commission fields",
);
assert.match(
  operatorTypes,
  /paidToolEconomics:[\s\S]*grossMarginBps: number[\s\S]*costEvidenceCoverage: number \| null[\s\S]*lanes: OperatorPaidToolEconomicsLane\[\]/,
  "operator tool economics must expose paid-tool economics",
);
assert.match(
  operatorTypes,
  /accountingIntegrity:[\s\S]*balanceMismatchUsers: number[\s\S]*reconciliationCoverageGaps: number[\s\S]*issues: OperatorToolBalanceAccountingIssue\[\]/,
  "operator tool economics must expose tool-balance accounting integrity",
);
assert.match(
  operatorTypes,
  /evidence:[\s\S]*scannedCreditLimit: number[\s\S]*scannedComputeLimit: number[\s\S]*scannedBalanceLimit: number[\s\S]*scannedIntegritySampleLimit: number/,
  "operator tool economics evidence must expose paid-tool and integrity scan limits",
);

assert.match(
  runtimeDiagnosticsBlock,
  /readRuntimeRunsByStatus[\s\S]*readRuntimeEventsByType[\s\S]*readDiagnosticEventsBySubsystem/,
  "runtime/tool diagnostics must aggregate runtime execution evidence",
);
assert.doesNotMatch(
  runtimeDiagnosticsBlock,
  /readCreditLedgerEntriesByTool|readPartnerCommissionLedgerRowsByBasisType|readWorkspaceComputeChargesByDebitSource|creditLedgerEntries|partnerCommissionLedger|workspaceComputeCharges/,
  "runtime diagnostics must not read finance ledgers",
);
assert.match(
  toolEconomicsBlock,
  /buildOperatorToolEconomicsSnapshot\(ctx, range, nowMs\)/,
  "operator tool economics query must use the dedicated economics snapshot builder",
);
assert.match(
  operatorIntelligence,
  /function buildPaidToolDiagnostics[\s\S]*reservedCredits[\s\S]*settledCredits[\s\S]*refundedCredits[\s\S]*unbilledComputeCharges/,
  "operator tool economics must project safe paid-tool accounting aggregates",
);
assert.match(
  runtimeDiagnosticsBlock,
  /executionAvailability:[\s\S]*turnSuccessRate[\s\S]*toolFailureRate[\s\S]*providerFailures[\s\S]*sandboxCreateFailures[\s\S]*topFailureCodes/,
  "runtime/tool diagnostics must return execution availability fields",
);
assert.match(
  runtimeDiagnosticsBlock,
  /topFailingTools: buildRuntimeBucket\(executionToolFailureRows, readToolName/,
  "runtime/tool diagnostics must keep workspace-credit failures out of top failing tools",
);
assert.doesNotMatch(
  runtimeDiagnosticsBlock,
  /topFailingTools: buildRuntimeBucket\(toolFailureRows, readToolName/,
  "runtime/tool diagnostics must not use raw tool failures for execution-only top failing tools",
);
assert.doesNotMatch(
  schema,
  /partnerCommissionLedger:[\s\S]*\.index\("by_basis_createdAt", \["basisType", "createdAt"\]\)|partnerCommissionLedger:[\s\S]*\.index\("by_credit_ledger_entry", \["sourceCreditLedgerEntryId"\]\)/,
  "partner commission ledger must not retain paid-tool-only read indexes",
);
assert.doesNotMatch(
  operatorIntelligence,
  /readPartnerCommissionLedgerRowsByBasisType|buildToolGrossMarginPartnerCommissionByEntryId|partnerGrossMarginShareBps|sourceCreditLedgerEntryId[\s\S]*buildPaidToolEconomics/,
  "operator tool economics must not read deferred paid-tool partner commission rows",
);
assert.doesNotMatch(
  operatorIntelligence,
  /readToolGrossMarginPartnerCommissionUsd|settledRows\.map\(async/,
  "operator tool economics must not do per-ledger-row partner commission queries",
);
assert.match(
  operatorIntelligence,
  /grossMarginUsd: readSignedLedgerUsd\(lane\.grossMarginUsd\)[\s\S]*grossMarginUsd = readSignedLedgerUsd\(revenueUsd - vendorCostUsd\)/,
  "operator tool economics must preserve signed gross margin truth",
);
assert.doesNotMatch(
  operatorIntelligence,
  /Math\.max\(0, revenueUsd - vendorCostUsd\)/,
  "operator tool economics must not clamp losses to zero",
);
assert.match(
  toolEconomicsBuilderBlock,
  /const paidToolEconomics = buildPaidToolEconomics\(paidToolLedgerRows\)[\s\S]*paidToolEconomics,/,
  "operator tool economics must return paid-tool economics from paid-tool ledger rows",
);
assert.match(
  toolEconomicsBuilderBlock,
  /readWorkspaceCreditBalanceRows\(ctx, scannedBalanceLimit\)[\s\S]*readStaleReservedCreditLedgerRows\(ctx, nowMs, scannedIntegritySampleLimit\)[\s\S]*readDuePendingCreditSettlementRows\(ctx, nowMs, scannedIntegritySampleLimit\)[\s\S]*buildToolBalanceAccountingIntegrity\(/,
  "operator tool economics must build accounting integrity from balance, reservation, and settlement rows",
);
assert.match(
  operatorIntelligence,
  /buildSampledBalanceReconciliation[\s\S]*workspaceCreditsUncollectedPaid[\s\S]*purchasedCreditsDebited[\s\S]*purchasedCreditsRefunded[\s\S]*uncollected_credits/,
  "tool-balance accounting integrity must replay top-ups, paid-tool ledger debits, refunds, and uncollected usage",
);
assert.match(
  runtimeDiagnosticsBlock,
  /const executionTurnTerminalCount = turnsSucceeded \+ executionRunFailureCodeRows\.length;/,
  "runtime execution scoring must not treat user-cancelled turns as availability failures",
);
assert.match(
  toolEconomicsBuilderBlock,
  /usageIntegrity:[\s\S]*workspaceCreditFailures[\s\S]*paidToolLedgerFailures[\s\S]*unbilledComputeCharges[\s\S]*topFailureCodes/,
  "operator tool economics must return usage integrity fields",
);
assert.match(
  sharedWorkspaceCredits,
  /PAID_TOOL_LEDGER_TOOL_NAMES = \["daytona_workspace", "web_research", "voice_transcribe"\]/,
  "operator tool economics must use the canonical Daytona, web research, and voice paid-tool ledger rows",
);
assert.match(
  operatorIntelligence,
  /PAID_TOOL_LEDGER_TOOL_NAMES\.map/,
  "operator tool economics must read paid-tool ledger rows through the canonical list",
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
  /workspaceSessionCreateFailureRows[\s\S]*normalizedWorkspaceSessionCreateFailureCodes[\s\S]*workspaceSessionCreateFailureCodeRows[\s\S]*executionWorkspaceSessionCreateFailureCodeRows/,
  "runtime/tool diagnostics must preserve workspace-session failure root causes",
);
assert.match(
  runtimeDiagnosticsBlock,
  /latestEvents:\s*diagnosticRows\.slice\(0, 8\)\.map\(mapDiagnosticEvent\)/,
  "runtime/tool diagnostics should project compact diagnostic events, not raw runtime payloads",
);
assert.match(
  runtimeDiagnosticsBlock,
  /sourceTables:[\s\S]*"runtimeRuns"[\s\S]*"runtimeRunEvents"[\s\S]*"platformDiagnosticEvents"[\s\S]*scannedRunLimit[\s\S]*scannedEventLimit/,
  "runtime/tool diagnostics evidence must name execution source tables",
);
assert.match(
  toolEconomicsBuilderBlock,
  /sourceTables:[\s\S]*"creditLedgerEntries"[\s\S]*"workspaceComputeCharges"[\s\S]*"workspaceCreditBalances"[\s\S]*"checkoutSessions"[\s\S]*scannedCreditLimit[\s\S]*scannedBalanceLimit/,
  "operator tool economics evidence must name finance and materialized-balance source tables",
);
assert.doesNotMatch(
  toolEconomicsBuilderBlock,
  /"partnerCommissionLedger"|scannedCommissionLimit|toolGrossMarginPartnerCommissionRows/,
  "operator tool economics evidence must not include deferred paid-tool partner commission scans",
);
assert.doesNotMatch(
  runtimeDiagnosticsBlock,
  /output_preview|outputText|rawArguments|full_content|prompt:|metadata:|query:|url:|transcript:|audio:/,
  "runtime/tool operator projection must not expose raw prompts or tool output",
);
assert.doesNotMatch(
  toolEconomicsBuilderBlock,
  /output_preview|outputText|rawArguments|full_content|prompt:|query:|url:|transcript:|audio:/,
  "tool economics operator projection must not expose raw prompts or tool output",
);
assert.doesNotMatch(
  runtimeDiagnosticsBlock,
  /internalMutation|mutation|action|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete/,
  "operator runtime/tool diagnostics must stay read-only",
);
assert.doesNotMatch(
  toolEconomicsBuilderBlock,
  /internalMutation|mutation|action|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete/,
  "operator tool economics diagnostics must stay read-only",
);

assert.match(
  operatorDashboard,
  /getOperatorRuntimeToolDiagnostics = query[\s\S]*requireOperatorAccess[\s\S]*getOperatorRuntimeToolDiagnosticsInternal/,
  "public runtime/tool diagnostics query must be operator-gated",
);
assert.match(
  operatorDashboard,
  /getOperatorToolEconomics = query[\s\S]*requireOperatorAccess[\s\S]*getOperatorToolEconomicsInternal/,
  "public tool economics query must be operator-gated",
);
assert.match(
  operatorGateway,
  /operatorDashboard:getOperatorRuntimeToolDiagnostics/,
  "web gateway must call the gated runtime/tool diagnostics query",
);
assert.match(
  operatorGateway,
  /operatorDashboard:getOperatorToolEconomics/,
  "web gateway must call the gated tool economics query",
);
assert.doesNotMatch(
  operatorGateway,
  /operatorIntelligence:getOperator(?:RuntimeToolDiagnostics|ToolEconomics)Internal/,
  "web gateway must not call internal operator diagnostics directly",
);
assert.match(
  operatorPanel,
  /loadOperatorRuntimeToolDiagnosticsCanonical/,
  "operator panel must load runtime/tool diagnostics",
);
assert.match(
  operatorPanel,
  /loadOperatorToolEconomicsCanonical/,
  "operator panel must load tool economics diagnostics",
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
assert.match(
  toolBalancePanelBlock,
  /Tool economics[\s\S]*Tool revenue[\s\S]*Vendor cost[\s\S]*Gross margin[\s\S]*Cost evidence[\s\S]*Tool economics are sampled for this window[\s\S]*Target:/,
  "operator Business panel must render paid-tool economics",
);
assert.doesNotMatch(
  toolBalancePanelBlock,
  /Partner commissions|Partner share|Net after partner|Partner tool-usage commission|partnerCommissionUsd/,
  "operator Business panel must not render deferred paid-tool partner commission fields",
);
assert.match(
  toolBalancePanelBlock,
  /Tool balance accounting[\s\S]*Health[\s\S]*Balance mismatches[\s\S]*Stale reservations[\s\S]*Settlement retries due[\s\S]*Coverage gaps[\s\S]*No sampled tool-balance accounting issues returned/,
  "operator Business panel must render compact tool-balance accounting integrity",
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
