import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BLAXEL_STANDBY_SNAPSHOT_STORAGE_USD_PER_GB_SECOND,
  BLAXEL_VOLUME_STORAGE_USD_PER_GB_SECOND,
  PROVIDER_COST_BILLING_DISPOSITIONS,
  PROVIDER_COST_CATEGORIES,
  PROVIDER_COST_COMPONENTS,
  PROVIDER_COST_EVIDENCE_TYPES,
  estimateBlaxelStorageCostUsd,
  roundProviderCostQuantity,
  roundProviderCostUsd,
  resolveProviderCostAccountingHourBucket,
} from "../shared/providerCostAccounting.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function extractBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const packageJson = read("package.json");
const schema = read("convex/schema.ts");
const workspaceCredits = read("convex/workspaceCredits.ts");
const crons = read("convex/crons.ts");
const billingSurface = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const workspacePanel = read("apps/web/src/components/WebWorkspaceUserDataPanel.tsx");
const providerCostReconciliationDiagnostic = extractBetween(
  workspaceCredits,
  "export const getProviderCostReconciliationDiagnosticInternal = internalQuery",
  "export const listBlaxelStorageAccountingProjectIdsInternal = internalQuery",
);

assert.deepEqual(PROVIDER_COST_CATEGORIES, ["workspace", "web", "voice"]);
assert.ok(PROVIDER_COST_COMPONENTS.includes("blaxel_active_runtime"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("blaxel_volume_storage"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("blaxel_standby_snapshot"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("web_crawl_provider_call"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("fly_crawler"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("voice_transcription"));
assert.deepEqual(PROVIDER_COST_EVIDENCE_TYPES, ["estimated", "provider_reported", "exact"]);
assert.deepEqual(PROVIDER_COST_BILLING_DISPOSITIONS, [
  "tracked_only",
  "rolled_into_user_usage",
]);
assert.ok(!PROVIDER_COST_BILLING_DISPOSITIONS.includes("charged" as never));
assert.equal(BLAXEL_VOLUME_STORAGE_USD_PER_GB_SECOND, 0.00000004629);
assert.equal(BLAXEL_STANDBY_SNAPSHOT_STORAGE_USD_PER_GB_SECOND, 0.00000007716);
assert.equal(roundProviderCostUsd(0.000333288), 0.00033329);
assert.equal(roundProviderCostQuantity(7200.1234567), 7200.123457);
assert.equal(
  Number(
    estimateBlaxelStorageCostUsd({
      sizeGb: 2,
      durationSeconds: 3600,
      usdPerGbSecond: BLAXEL_VOLUME_STORAGE_USD_PER_GB_SECOND,
    }).toFixed(7),
  ),
  0.0003333,
);
assert.deepEqual(resolveProviderCostAccountingHourBucket(3_900_000), {
  periodStart: 0,
  periodEnd: 3_600_000,
  bucketKey: "0",
});

assert.match(
  packageJson,
  /"check:provider-cost-accounting-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/provider_cost_accounting_contract_proof\.ts"/,
  "package script must expose the provider cost accounting proof",
);

assert.match(
  schema,
  /providerCostEntries: defineTable\(\{[\s\S]*costKey: v\.string\(\)[\s\S]*category: v\.union\([\s\S]*v\.literal\("workspace"\)[\s\S]*v\.literal\("web"\)[\s\S]*v\.literal\("voice"\)/,
  "schema must define providerCostEntries with a small internal category set",
);
assert.match(
  schema,
  /component: v\.union\([\s\S]*v\.literal\("blaxel_active_runtime"\)[\s\S]*v\.literal\("blaxel_volume_storage"\)[\s\S]*v\.literal\("blaxel_standby_snapshot"\)[\s\S]*v\.literal\("web_crawl_provider_call"\)[\s\S]*v\.literal\("fly_crawler"\)[\s\S]*v\.literal\("voice_transcription"\)/,
  "schema must include provider cost components for workspace, crawl, and voice costs",
);
assert.match(
  schema,
  /billingDisposition: v\.union\([\s\S]*v\.literal\("tracked_only"\)[\s\S]*v\.literal\("rolled_into_user_usage"\)/,
  "schema must distinguish tracked overhead from user-usage mirror rows",
);
assert.doesNotMatch(
  schema,
  /billingDisposition: v\.union\([\s\S]*v\.literal\("charged"\)/,
  "provider cost accounting must not keep an ambiguous charged disposition",
);
assert.match(
  schema,
  /\.index\("by_costKey", \["costKey"\]\)[\s\S]*\.index\("by_component_period", \["component", "periodStart"\]\)/,
  "provider cost entries must be idempotent and queryable by component over time",
);
assert.match(
  schema,
  /\.index\("by_status_settledAt", \["status", "settledAt"\]\)/,
  "credit ledger entries must be queryable by settled period for margin diagnostics",
);
assert.match(
  schema,
  /by_providerVolumeProviderId_updatedAt[\s\S]*"providerVolumeProviderId"[\s\S]*"updatedAt"/,
  "cloud projects must be indexed for bounded Blaxel storage accounting scans",
);

assert.match(
  workspaceCredits,
  /export const recordProviderCostInternal = internalMutation/,
  "workspace credits module must expose an internal provider cost recording mutation",
);
assert.match(
  workspaceCredits,
  /export const getWorkspaceProviderMarginDiagnosticInternal = internalQuery/,
  "workspace credits module must expose an internal read-only provider margin diagnostic",
);
assert.match(
  workspaceCredits,
  /getWorkspaceProviderMarginDiagnosticInternal[\s\S]*by_status_settledAt[\s\S]*eq\("status", "succeeded"\)[\s\S]*gte\("settledAt", period\.periodStart\)[\s\S]*lt\("settledAt", period\.periodEnd\)/,
  "provider margin diagnostic must use settled succeeded ledger rows for user usage",
);
assert.match(
  workspaceCredits,
  /getWorkspaceProviderMarginDiagnosticInternal[\s\S]*PAID_TOOL_LEDGER_TOOL_NAMES[\s\S]*paidToolNames\.has\(toolName\)/,
  "provider margin diagnostic must limit user usage to canonical paid tool ledger names",
);
assert.match(
  workspaceCredits,
  /PROVIDER_COST_MARGIN_DIAGNOSTIC_LOOKBACK_MS = 24 \* 60 \* 60 \* 1000/,
  "provider margin diagnostic must use a conservative month-boundary lookback",
);
assert.match(
  workspaceCredits,
  /providerCostPeriodStart = Math\.max\([\s\S]*period\.periodStart - PROVIDER_COST_MARGIN_DIAGNOSTIC_LOOKBACK_MS[\s\S]*by_component_period[\s\S]*gte\("periodStart", providerCostPeriodStart\)[\s\S]*lt\("periodStart", period\.periodEnd\)/,
  "provider margin diagnostic must read a bounded lookback before allocating overlap",
);
assert.match(
  workspaceCredits,
  /function allocateProviderCostToDiagnosticPeriod[\s\S]*overlapStart[\s\S]*overlapEnd[\s\S]*overlapMs[\s\S]*rawVendorCostUsd \* \(overlapMs \/ \(rowPeriodEnd - rowPeriodStart\)\)/,
  "provider margin diagnostic must allocate period-based provider costs by overlap",
);
assert.match(
  workspaceCredits,
  /billingDisposition !== "tracked_only" &&[\s\S]*billingDisposition !== "rolled_into_user_usage"[\s\S]*continue[\s\S]*billingDisposition === "tracked_only" \? overheadByComponent : mirrorByComponent[\s\S]*trackedOnlyRawVendorCostUsd \+= allocatedRawVendorCostUsd[\s\S]*rolledIntoUserUsageRawVendorCostUsd \+= allocatedRawVendorCostUsd/,
  "provider margin diagnostic must separate tracked overhead from user-usage mirror rows",
);
assert.doesNotMatch(
  workspaceCredits,
  /v\.literal\("charged"\)/,
  "workspace credits provider-cost APIs must not accept an ambiguous charged disposition",
);
assert.match(
  workspaceCredits,
  /const totalMarginRawVendorCostUsd = roundDiagnosticUsd\([\s\S]*roundedSettledRawVendorCostUsd \+ roundedTrackedOnlyRawVendorCostUsd[\s\S]*roundedSettledPolynetPriceUsd - totalMarginRawVendorCostUsd/,
  "provider margin must use ledger raw cost plus tracked-only provider overhead",
);
assert.match(
  workspaceCredits,
  /const totalProviderExposureUsd = roundDiagnosticUsd\([\s\S]*roundedTrackedOnlyRawVendorCostUsd \+ roundedRolledIntoUserUsageRawVendorCostUsd[\s\S]*const uncollectedProviderExposureUsd = roundDiagnosticUsd\([\s\S]*Math\.max\([\s\S]*roundedRolledIntoUserUsageRawVendorCostUsd - roundedSettledRawVendorCostUsd/,
  "provider exposure must show full tracked provider cost and uncollected provider exposure separately from collected margin",
);
assert.match(
  workspaceCredits,
  /providerExposure: \{[\s\S]*ledgerRawVendorCostUsd[\s\S]*trackedOnlyProviderCostUsd[\s\S]*rolledIntoUserUsageProviderCostUsd[\s\S]*totalProviderCostUsd[\s\S]*uncollectedProviderExposureUsd/,
  "provider margin diagnostic must expose provider spend exposure as a first-class internal diagnostic",
);
assert.match(
  workspaceCredits,
  /reconciliation: \{[\s\S]*ledgerRawVendorCostUsd[\s\S]*rolledIntoUserUsageProviderCostUsd[\s\S]*mirrorDeltaUsd/,
  "rolled-into-user-usage provider costs must remain reconciliation evidence",
);
assert.match(
  workspaceCredits,
  /export const getProviderCostReconciliationDiagnosticInternal = internalQuery/,
  "workspace credits module must expose a read-only provider cost reconciliation diagnostic",
);
assert.doesNotMatch(
  providerCostReconciliationDiagnostic,
  /ctx\.db\.(insert|patch|delete|replace)|recordProviderCostEntry/,
  "provider cost reconciliation diagnostic must remain read-only",
);
assert.match(
  workspaceCredits,
  /PROVIDER_COST_RECONCILIATION_DEFAULT_LEDGER_LIMIT = 250[\s\S]*PROVIDER_COST_RECONCILIATION_MAX_LEDGER_LIMIT = 1000[\s\S]*PROVIDER_COST_RECONCILIATION_DEFAULT_COMPUTE_LIMIT_PER_DEBIT_SOURCE = 100[\s\S]*PROVIDER_COST_RECONCILIATION_MAX_COMPUTE_LIMIT_PER_DEBIT_SOURCE = 250[\s\S]*PROVIDER_COST_RECONCILIATION_DEFAULT_SAMPLE_LIMIT = 25[\s\S]*PROVIDER_COST_RECONCILIATION_MAX_SAMPLE_LIMIT = 50/,
  "provider cost reconciliation must use tight source-specific scan limits",
);
assert.match(
  providerCostReconciliationDiagnostic,
  /const ledgerLimit = clampProviderCostReconciliationLedgerLimit\(args\.ledgerLimit\)[\s\S]*const computeChargeLimitPerDebitSource = clampProviderCostReconciliationComputeLimitPerDebitSource\(/,
  "provider cost reconciliation must not reuse the broad margin diagnostic limits",
);
assert.match(
  providerCostReconciliationDiagnostic,
  /PAID_TOOL_LEDGER_TOOL_NAMES[\s\S]*creditLedgerEntries[\s\S]*by_status_settledAt[\s\S]*expectedProviderCostKey = `credit_ledger:\$\{creditKey\}:provider_cost`[\s\S]*readProviderCostEntryByCostKey/,
  "provider cost reconciliation must report settled paid ledger rows missing provider-cost mirrors",
);
assert.match(
  providerCostReconciliationDiagnostic,
  /WORKSPACE_COMPUTE_DEBIT_SOURCES[\s\S]*workspaceComputeCharges[\s\S]*by_debitSource_createdAt[\s\S]*expectedProviderCostKey = creditReservationKey[\s\S]*workspace_compute_charge:\$\{chargeKey\}:provider_cost[\s\S]*readProviderCostEntryByCostKey/,
  "provider cost reconciliation must report workspace compute charges missing provider-cost mirrors",
);
assert.match(
  providerCostReconciliationDiagnostic,
  /missingProviderCostUsdByCostKey = new Map[\s\S]*recordMissingProviderCost[\s\S]*Math\.max\(existing, normalizedCostUsd\)[\s\S]*uniqueMissingProviderCostKeys/,
  "provider cost reconciliation must dedupe missing provider cost by expected cost key",
);
assert.match(
  providerCostReconciliationDiagnostic,
  /scope: "user_usage_provider_cost_mirrors"[\s\S]*coverage: \{[\s\S]*creditLedgerEntries: true[\s\S]*workspaceComputeCharges: true[\s\S]*trackedOnlyStorageCosts: false[\s\S]*providerInvoiceRows: false[\s\S]*sourceBreakdownCanOverlap: true[\s\S]*canonicalMissingProviderCostUsd/,
  "provider cost reconciliation must label scope and coverage so it is not mistaken for provider invoice truth",
);
assert.match(
  workspaceCredits,
  /grossProfitUsd[\s\S]*grossMarginBps[\s\S]*scanLimitReached[\s\S]*userUsageScanLimitReached[\s\S]*providerCostScanLimitReached/,
  "provider margin diagnostic must report margin and explicit scan-limit state",
);
assert.match(
  workspaceCredits,
  /const quantity = roundProviderCostQuantity[\s\S]*const rawVendorCostUsd = roundProviderCostUsd[\s\S]*ctx\.db\.insert\("providerCostEntries"/,
  "provider cost recording must preserve sub-cent provider cost precision",
);
assert.match(
  workspaceCredits,
  /PROVIDER_COST_EVIDENCE_RANK: Record<ProviderCostEvidenceType, number> = \{[\s\S]*estimated: 1[\s\S]*provider_reported: 2[\s\S]*exact: 3/,
  "provider cost evidence must have explicit upgrade precedence",
);
assert.match(
  workspaceCredits,
  /function buildProviderCostEvidenceUpgradePatch[\s\S]*incomingRank <= existingRank[\s\S]*return null[\s\S]*previous_evidence[\s\S]*previous_raw_vendor_cost_usd[\s\S]*provider_cost_upgraded_at/,
  "provider cost recording must upgrade only stronger evidence and preserve previous audit context",
);
assert.match(
  workspaceCredits,
  /resolveProviderCostIdentityMismatch\(existing, row\)[\s\S]*console\.warn\("provider_cost_identity_mismatch"[\s\S]*return existing[\s\S]*ctx\.db\.patch\(existing\._id, upgradePatch\)/,
  "provider cost recording must refuse identity drift before patching stronger evidence",
);
assert.doesNotMatch(
  workspaceCredits,
  /const quantity = roundCurrency[\s\S]*const rawVendorCostUsd = roundCurrency/,
  "provider cost recording must not use user-facing 4-decimal currency rounding",
);
assert.match(
  workspaceCredits,
  /async function recordProviderCostEntryBestEffort[\s\S]*console\.warn\("provider_cost_record_failed"/,
  "provider cost mirror writes must not break primary credit settlement paths",
);
assert.match(
  workspaceCredits,
  /recordWorkspaceComputeChargeInternal[\s\S]*recordProviderCostEntryBestEffort\(ctx, \{[\s\S]*component: "blaxel_active_runtime"[\s\S]*billingDisposition: "rolled_into_user_usage"/,
  "workspace compute settlement must mirror active Blaxel runtime cost into provider cost accounting",
);
assert.match(
  workspaceCredits,
  /resolveCreditLedgerProviderCostEntry[\s\S]*toolName === "web_research"[\s\S]*component: action === "crawl" \? "web_crawl_provider_call" : "web_research_call"/,
  "web research and crawl settlements must map into internal provider cost accounting",
);
assert.match(
  workspaceCredits,
  /component: action === "crawl" \? "web_crawl_provider_call" : "web_research_call"[\s\S]*provider: normalizeOptionalString\(metadata\.final_provider\) \?\? vendor \?\? "web_provider"/,
  "web provider cost entries must prefer final provider evidence when available",
);
assert.match(
  workspaceCredits,
  /resolveCreditLedgerProviderCostEntry[\s\S]*toolName === "voice_transcribe"[\s\S]*component: "voice_transcription"/,
  "voice settlements must map into internal provider cost accounting",
);
assert.match(
  workspaceCredits,
  /component: "voice_transcription"[\s\S]*provider:[\s\S]*normalizeOptionalString\(metadata\.final_provider\)[\s\S]*vendor[\s\S]*"voice_provider"/,
  "voice provider cost entries must prefer final transcription provider evidence",
);
assert.match(
  workspaceCredits,
  /export const listBlaxelStorageAccountingProjectIdsInternal = internalQuery/,
  "Blaxel storage accounting must list project ids through a paginated internal query",
);
assert.match(
  workspaceCredits,
  /listBlaxelStorageAccountingProjectIdsInternal[\s\S]*paginationOptsValidator[\s\S]*withIndex\("by_providerVolumeProviderId_updatedAt"[\s\S]*q\.eq\("providerVolumeProviderId", "blaxel"\)[\s\S]*\.paginate\(/,
  "Blaxel storage accounting must use provider-volume pagination instead of a fixed take limit",
);
assert.match(
  workspaceCredits,
  /export const recordBlaxelStorageProviderCostsForProjectsInternal = internalMutation/,
  "Blaxel storage accounting must record page results through a bounded mutation",
);
assert.match(
  workspaceCredits,
  /export const recordBlaxelStorageProviderCostsInternal = internalAction/,
  "Blaxel storage accounting must use an action orchestrator so scans can continue across pages",
);
assert.match(
  workspaceCredits,
  /costKey: `blaxel_volume_storage:\$\{project\._id\}:\$\{volumeId\}:\$\{bucket\.bucketKey\}`[\s\S]*component: "blaxel_volume_storage"[\s\S]*billingDisposition: "tracked_only"/,
  "Blaxel volume storage costs must be idempotent by project, volume, and bucket, and tracked-only",
);
assert.match(
  workspaceCredits,
  /costKey: `blaxel_standby_snapshot:\$\{project\._id\}:\$\{sandboxId\}:\$\{bucket\.bucketKey\}`[\s\S]*component: "blaxel_standby_snapshot"[\s\S]*billingDisposition: "tracked_only"/,
  "Blaxel standby snapshot costs must be idempotent and tracked-only",
);
assert.match(
  workspaceCredits,
  /sandboxState !== "standby"/,
  "standby snapshot accounting must only record explicit standby state",
);
assert.match(
  workspaceCredits,
  /ctx\.scheduler\.runAfter\([\s\S]*recordBlaxelStorageProviderCostsInternal[\s\S]*bucketStart: bucket\.periodStart[\s\S]*bucketEnd: bucket\.periodEnd[\s\S]*bucketKey: bucket\.bucketKey/,
  "Blaxel storage accounting must schedule continuation with the same accounting bucket",
);
assert.match(
  crons,
  /"record blaxel storage provider costs"[\s\S]*recordBlaxelStorageProviderCostsInternal[\s\S]*pageSize: 100[\s\S]*maxPages: 5/,
  "Blaxel storage accounting cron must run bounded pages and let the action continue if needed",
);

for (const forbidden of [
  "Blaxel standby",
  "Blaxel volume",
  "Fly crawler",
  "Provider cost",
]) {
  assert.ok(
    !billingSurface.includes(forbidden),
    `billing UI must not expose internal provider-cost component: ${forbidden}`,
  );
  assert.ok(
    !workspacePanel.includes(forbidden),
    `workspace panel must not expose internal provider-cost component: ${forbidden}`,
  );
}

console.log("provider_cost_accounting_contract_proof: ok");
