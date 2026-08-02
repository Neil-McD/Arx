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

const packageJson = read("package.json");
const workspaceCreditsSource = read("convex/workspaceCredits.ts");
const invariantDiagnosticSource = sourceFromExport(
  workspaceCreditsSource,
  "getWorkspaceAccountingInvariantDiagnosticsForOperator",
  "export const listBlaxelStorageAccountingProjectIdsInternal",
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
assert.doesNotMatch(
  workspaceCreditsSource,
  /workspaceAutoRechargeSettings|workspaceAutoRechargeAttempts|WORKSPACE_ACCOUNTING_AUTO_RECHARGE/,
  "retired auto-recharge diagnostics must remain deleted",
);
assert.match(
  invariantDiagnosticSource,
  /workspaceUsageCollections[\s\S]*eq\("status", "prepared"\)[\s\S]*eq\("status", "processing"\)[\s\S]*duplicateActiveUsageCollections[\s\S]*block_new_usage_collection_charge_until_collections_are_reconciled/,
  "historical active usage collections must remain visible for reconciliation",
);
assert.doesNotMatch(
  workspaceCreditsSource,
  /listActiveWorkspaceUsageCardCollectionsForUserInternal|prepareWorkspaceUsageCardCollectionInternal|collectWorkspaceUsageByCardInternal|attemptWorkspaceUsageStripeCollection/,
  "retired card-collection execution paths must remain deleted",
);

console.log("workspace_accounting_invariant_proof: ok");
