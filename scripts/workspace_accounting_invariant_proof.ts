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

function assertBefore(source: string, first: string, second: string, message: string) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} missing`);
  assert.notEqual(secondIndex, -1, `${second} missing`);
  assert.ok(firstIndex < secondIndex, message);
}

const packageJson = read("package.json");
const workspaceCreditsSource = read("convex/workspaceCredits.ts");
const invariantDiagnosticSource = sourceFromExport(
  workspaceCreditsSource,
  "getWorkspaceAccountingInvariantDiagnosticsForOperator",
  "export const listBlaxelStorageAccountingProjectIdsInternal",
);
const listActiveCollectionsSource = sourceFromExport(
  workspaceCreditsSource,
  "listActiveWorkspaceUsageCardCollectionsForUserInternal",
  "export const prepareWorkspaceUsageCardCollectionInternal",
);
const prepareCollectionSource = sourceFromExport(
  workspaceCreditsSource,
  "prepareWorkspaceUsageCardCollectionInternal",
  "export const markWorkspaceUsageCardCollectionProcessingInternal",
);
const collectByCardSource = sourceFromExport(
  workspaceCreditsSource,
  "collectWorkspaceUsageByCardInternal",
  "export const getWorkspaceCreditBalanceInternal",
);
const stalePreparedBlock = collectByCardSource.slice(
  collectByCardSource.indexOf("const stalePrepared"),
  collectByCardSource.indexOf("const candidateResult"),
);
const candidateBlock = collectByCardSource.slice(
  collectByCardSource.indexOf("const candidateResult"),
  collectByCardSource.indexOf("return {"),
);

assert.match(
  packageJson,
  /"check:workspace-accounting-invariant-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_accounting_invariant_proof\.ts"/,
  "package script must expose the workspace accounting invariant proof",
);

assert.match(
  workspaceCreditsSource,
  /WORKSPACE_ACCOUNTING_INVARIANT_DEFAULT_LIMIT = 25[\s\S]*WORKSPACE_ACCOUNTING_INVARIANT_MAX_LIMIT = 100/,
  "accounting invariant diagnostics must use bounded limits",
);
assert.match(invariantDiagnosticSource, /query\(/, "invariant diagnostic must be a query");
assert.match(
  invariantDiagnosticSource,
  /requireOperatorRole\(ctx, args\.authSubject, "operator"\)/,
  "invariant diagnostic must be operator-gated",
);
assert.match(
  invariantDiagnosticSource,
  /boundedLimit\([\s\S]*WORKSPACE_ACCOUNTING_INVARIANT_DEFAULT_LIMIT[\s\S]*WORKSPACE_ACCOUNTING_INVARIANT_MAX_LIMIT/,
  "invariant diagnostic must clamp caller-provided limits",
);
assert.doesNotMatch(
  invariantDiagnosticSource,
  /ctx\.db\.(insert|patch|delete|replace)|getStripeClient|paymentIntents|checkout\.sessions/,
  "invariant diagnostic must remain read-only and must not call Stripe",
);
assert.match(
  invariantDiagnosticSource,
  /disposition[\s\S]*"blocked_closed"[\s\S]*"repairable"[\s\S]*"clean"/,
  "invariant diagnostic must classify clean, repairable, and blocked-closed states",
);
assert.match(
  invariantDiagnosticSource,
  /readRecentWorkspaceCreditBalanceRows[\s\S]*buildWorkspaceCreditBalanceDiagnostics[\s\S]*duplicate_rows_are_repairable_negative_rows_block_closed/,
  "invariant diagnostic must classify duplicate and negative balance rows",
);
assert.match(
  invariantDiagnosticSource,
  /workspaceAutoRechargeSettings[\s\S]*by_status_updatedAt[\s\S]*duplicateAutoRechargeSettings[\s\S]*block_auto_recharge_until_settings_are_canonical/,
  "duplicate auto-recharge settings must be surfaced as blocked-closed charging state",
);
assert.match(
  invariantDiagnosticSource,
  /workspaceAutoRechargeAttempts[\s\S]*eq\("status", "prepared"\)[\s\S]*eq\("status", "processing"\)[\s\S]*duplicateActiveAutoRechargeAttempts[\s\S]*block_new_auto_recharge_charge_until_attempts_are_reconciled/,
  "duplicate active auto-recharge attempts must block new auto-recharge charges",
);
assert.match(
  invariantDiagnosticSource,
  /workspaceUsageCollections[\s\S]*eq\("status", "prepared"\)[\s\S]*eq\("status", "processing"\)[\s\S]*duplicateActiveUsageCollections[\s\S]*block_new_usage_collection_charge_until_collections_are_reconciled/,
  "duplicate active usage collections must block new usage collection charges",
);

assert.match(
  workspaceCreditsSource,
  /async function readActiveWorkspaceUsageCardCollectionsForUser[\s\S]*by_user_status[\s\S]*eq\("status", "prepared"\)[\s\S]*by_user_status[\s\S]*eq\("status", "processing"\)/,
  "active usage collection helper must read prepared and processing rows by user/status",
);
assert.match(
  listActiveCollectionsSource,
  /internalQuery\([\s\S]*readActiveWorkspaceUsageCardCollectionsForUser/,
  "active usage collection helper must be exposed to internal actions",
);
assert.doesNotMatch(
  listActiveCollectionsSource,
  /ctx\.db\.(insert|patch|delete|replace)|getStripeClient|paymentIntents|checkout\.sessions/,
  "active usage collection read must remain read-only and provider-free",
);

assert.match(
  prepareCollectionSource,
  /readActiveWorkspaceUsageCardCollectionsForUser[\s\S]*duplicate_active_workspace_usage_collections[\s\S]*active_workspace_usage_collection_exists/,
  "usage collection prepare must fail closed when active collection state already exists",
);
assertBefore(
  prepareCollectionSource,
  "readActiveWorkspaceUsageCardCollectionsForUser",
  "readCanonicalWorkspaceCreditBalance",
  "usage collection prepare must check active collection invariants before touching balances",
);
assert.doesNotMatch(
  prepareCollectionSource,
  /getStripeClient|paymentIntents|checkout\.sessions/,
  "usage collection prepare must not call Stripe",
);

assert.match(
  stalePreparedBlock,
  /listActiveWorkspaceUsageCardCollectionsForUserInternal[\s\S]*activeCollections\.length > 1[\s\S]*duplicate_active_workspace_usage_collections/,
  "stale prepared usage collection retries must fail closed on duplicate active collections",
);
assertBefore(
  stalePreparedBlock,
  "listActiveWorkspaceUsageCardCollectionsForUserInternal",
  "attemptWorkspaceUsageStripeCollection",
  "stale prepared retry must inspect active collection invariants before Stripe collection attempt",
);

assert.match(
  candidateBlock,
  /activeBeforePrepare[\s\S]*listActiveWorkspaceUsageCardCollectionsForUserInternal[\s\S]*activeBeforePrepare\.length > 0/,
  "new usage collection candidates must be skipped when active collection state already exists",
);
assert.match(
  candidateBlock,
  /activeAfterPrepare[\s\S]*listActiveWorkspaceUsageCardCollectionsForUserInternal[\s\S]*activeAfterPrepare\.length > 1[\s\S]*duplicate_active_workspace_usage_collections/,
  "new usage collection candidates must be rechecked after prepare before Stripe collection",
);
assertBefore(
  candidateBlock,
  "activeBeforePrepare",
  "prepareWorkspaceUsageCardCollectionInternal",
  "candidate collection must check active state before preparing a new collection",
);
assertBefore(
  candidateBlock,
  "prepareWorkspaceUsageCardCollectionInternal",
  "readStripeForCollection(collectionKey)",
  "candidate collection must prepare DB state before reading Stripe",
);
assertBefore(
  candidateBlock,
  "activeAfterPrepare",
  "readStripeForCollection(collectionKey)",
  "candidate collection must recheck active state before reading Stripe",
);
assertBefore(
  candidateBlock,
  "readStripeForCollection(collectionKey)",
  "attemptWorkspaceUsageStripeCollection",
  "candidate collection must only attempt Stripe after invariant checks and provider setup",
);

console.log("workspace_accounting_invariant_proof: ok");
