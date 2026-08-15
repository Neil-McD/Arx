import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function sourceFromExport(source: string, exportName: string, nextMarker: string): string {
  const start = source.indexOf(`export const ${exportName}`);
  assert.notEqual(start, -1, `${exportName} export missing`);
  const end = source.indexOf(nextMarker, start + 1);
  assert.notEqual(end, -1, `${exportName} end marker missing`);
  return source.slice(start, end);
}

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${startMarker} start marker missing`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `${endMarker} end marker missing`);
  return source.slice(start, end);
}

const packageJson = read("package.json");
const schemaSource = read("convex/schema.ts");
const workspaceCreditsSource = read("convex/workspaceCredits.ts");
const diagnosticsSource = sourceFromExport(
  workspaceCreditsSource,
  "getWorkspaceAccountingReconciliationDiagnosticsForOperator",
  "export const getWorkspaceAccountingInvariantDiagnosticsForOperator",
);
const providerCostEntriesSchema = sourceBetween(
  schemaSource,
  "providerCostEntries: defineTable({",
  "workspaceUsageCollections: defineTable({",
);

assert.match(
  packageJson,
  /"check:workspace-accounting-reconciliation-diagnostics-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_accounting_reconciliation_diagnostics_proof\.ts"/,
  "package script must expose the workspace accounting reconciliation diagnostics proof",
);

for (const table of [
  "workspaceUsageCollections",
  "creditLedgerEntries",
  "providerCostEntries",
  "workspaceComputeCharges",
]) {
  assert.match(schemaSource, new RegExp(`${table}: defineTable\\(`), `schema missing ${table}`);
}
assert.doesNotMatch(
  schemaSource,
  /workspaceAutoRecharge(?:Settings|Attempts): defineTable/,
  "retired auto-recharge tables must remain deleted",
);

for (const requiredIndex of [
  '.index("by_status_updatedAt", ["status", "updatedAt"])',
  '.index("by_pendingSettlementStatus_nextAttemptAt", ["pendingSettlementStatus", "pendingSettlementNextAttemptAt"])',
  '.index("by_status_expiresAt", ["status", "expiresAt"])',
  '.index("by_status_settledAt", ["status", "settledAt"])',
  '.index("by_linkedCreditKey", ["linkedCreditKey"])',
  '.index("by_debitSource_createdAt", ["debitSource", "createdAt"])',
]) {
  assert.ok(schemaSource.includes(requiredIndex), `schema missing ${requiredIndex}`);
}

assert.match(
  workspaceCreditsSource,
  /WORKSPACE_ACCOUNTING_RECONCILIATION_DEFAULT_LIMIT = 25[\s\S]*WORKSPACE_ACCOUNTING_RECONCILIATION_MAX_LIMIT = 100[\s\S]*WORKSPACE_ACCOUNTING_RECONCILIATION_LOOKBACK_MS = 31 \* 24 \* 60 \* 60 \* 1000/,
  "accounting reconciliation diagnostics must be bounded by explicit limits",
);
assert.match(
  workspaceCreditsSource,
  /WORKSPACE_ACCOUNTING_PAYMENT_INTENT_PROCESSING_STALE_MS = 30 \* 60 \* 1000/,
  "diagnostics must flag stale provider-payment processing rows for reconciliation",
);
assert.match(
  providerCostEntriesSchema,
  /category: v\.union\([\s\S]*v\.literal\("workspace"\)[\s\S]*v\.literal\("web"\)[\s\S]*v\.literal\("voice"\)/,
  "provider cost table schema must keep canonical provider-cost categories",
);
assert.doesNotMatch(
  providerCostEntriesSchema,
  /v\.literal\("runtime"\)/,
  "provider cost table schema must not reintroduce legacy runtime category rows",
);
assert.match(
  workspaceCreditsSource,
  /recordProviderCostInternal = internalMutation\(\{[\s\S]*category: v\.union\(v\.literal\("workspace"\), v\.literal\("web"\), v\.literal\("voice"\)\)/,
  "provider cost writer must not accept new runtime category rows",
);
assert.match(
  workspaceCreditsSource,
  /async function readProviderCostEntryByLinkedCreditKey[\s\S]*providerCostEntries[\s\S]*withIndex\("by_linkedCreditKey"[\s\S]*eq\("linkedCreditKey", normalizedCreditKey\)/,
  "provider cost mirror diagnostics must use linked credit key reconciliation",
);

assert.match(diagnosticsSource, /query\(/, "diagnostics must be a Convex query");
assert.match(
  diagnosticsSource,
  /requireOperatorRole\(ctx, args\.authSubject, "operator"\)/,
  "diagnostics must be operator-gated",
);
assert.match(
  diagnosticsSource,
  /boundedLimit\([\s\S]*WORKSPACE_ACCOUNTING_RECONCILIATION_DEFAULT_LIMIT[\s\S]*WORKSPACE_ACCOUNTING_RECONCILIATION_MAX_LIMIT/,
  "diagnostics must clamp caller-provided limits",
);
assert.doesNotMatch(
  diagnosticsSource,
  /ctx\.db\.(insert|patch|delete|replace)|ctx\.scheduler|runMutation|runAction|getStripeClient|paymentIntents\.create|paymentIntents\.retrieve|checkout\.sessions\.create/,
  "accounting reconciliation diagnostics must remain read-only and must not call Stripe",
);

assert.doesNotMatch(
  workspaceCreditsSource,
  /workspaceAutoRechargeSettings|workspaceAutoRechargeAttempts|WORKSPACE_ACCOUNTING_AUTO_RECHARGE/,
  "retired auto-recharge reconciliation code must remain deleted",
);

assert.match(
  diagnosticsSource,
  /workspaceUsageCollections[\s\S]*withIndex\("by_status_updatedAt"[\s\S]*eq\("status", "processing"[\s\S]*workspaceUsageCollections[\s\S]*eq\("status", "prepared"[\s\S]*WORKSPACE_CARD_COLLECTION_STALE_PREPARED_MS[\s\S]*workspaceUsageCollections[\s\S]*eq\("status", "failed"/,
  "diagnostics must scan processing, stale prepared, and failed usage collections by status",
);
assert.match(
  diagnosticsSource,
  /usageProcessingWithoutProviderPaymentIntent[\s\S]*normalizeStripePaymentIntentId\(collection\.providerPaymentIntentId\)[\s\S]*release_collection_or_reconcile_provider_attempt/,
  "diagnostics must flag usage collections processing without provider payment intents",
);
assert.match(
  diagnosticsSource,
  /usageProcessingWithProviderPaymentIntentStale[\s\S]*WORKSPACE_ACCOUNTING_PAYMENT_INTENT_PROCESSING_STALE_MS[\s\S]*retrieve_payment_intent_and_finalize_collection[\s\S]*processingWithProviderPaymentIntentStale/,
  "diagnostics must flag stale usage collections that need payment-intent reconciliation",
);

assert.match(
  diagnosticsSource,
  /creditLedgerEntries[\s\S]*by_pendingSettlementStatus_nextAttemptAt[\s\S]*pendingSettlementStatus", "succeeded"[\s\S]*pendingRetriesDue/,
  "diagnostics must include due pending settlement retries",
);
assert.match(
  diagnosticsSource,
  /creditLedgerEntries[\s\S]*by_status_expiresAt[\s\S]*eq\("status", "reserved"\)[\s\S]*staleReserved/,
  "diagnostics must include expired reserved ledger entries",
);
assert.match(
  diagnosticsSource,
  /PAID_TOOL_LEDGER_TOOL_NAMES[\s\S]*creditLedgerEntries[\s\S]*by_status_settledAt[\s\S]*readProviderCostEntryByLinkedCreditKey[\s\S]*providerCostMirrors/,
  "diagnostics must include recent paid ledger rows missing provider-cost mirrors",
);

assert.match(
  diagnosticsSource,
  /workspaceComputeCharges[\s\S]*by_debitSource_createdAt[\s\S]*canonicalUsageTruth: "creditLedgerEntries"/,
  "diagnostics must report legacy workspaceComputeCharges drift",
);
assert.doesNotMatch(
  diagnosticsSource,
  /providerCostRuntimeCategory|eq\("category", "runtime"\)|migrate_legacy_runtime_category_to_workspace/,
  "diagnostics must not carry the completed provider-cost runtime-category migration surface",
);

console.log("workspace_accounting_reconciliation_diagnostics_proof: ok");
