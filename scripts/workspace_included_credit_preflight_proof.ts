import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildProductionWorkspaceIncludedCreditPreflight,
} from "./workspace_included_credit_production_preflight.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const preflightSource = read("scripts/workspace_included_credit_production_preflight.ts");
const workspaceCreditsSource = read("convex/workspaceCredits.ts");

assert.match(
  packageJson,
  /"check:workspace-included-credit-preflight-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_included_credit_preflight_proof\.ts"/,
  "package script must expose included-credit preflight proof",
);
assert.match(
  packageJson,
  /"preflight:workspace-included-credits:prod": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_included_credit_production_preflight\.ts --mode=gate"/,
  "package script must expose included-credit production preflight",
);
assert.doesNotMatch(
  packageJson,
  /workspace-included-credit-clear:prod/,
  "one-time included-credit cleanup apply scripts must not remain after cleanup",
);
assert.doesNotMatch(
  workspaceCreditsSource,
  /clearLegacyIncludedWorkspaceCreditsForMaintenance|ARX_WORKSPACE_INCLUDED_CREDIT_CLEANUP_SECRET/,
  "temporary included-credit cleanup mutation must not remain after cleanup",
);
assert.match(preflightSource, /readOnly: true/, "preflight must be read-only");
assert.match(preflightSource, /writePathAvailable: false/, "preflight must not expose a write path");
assert.match(preflightSource, /writeCommand: null/, "preflight must not print a concrete write command");

for (const forbidden of [
  "convex run",
  "ctx.db",
  ".insert(",
  ".patch(",
  ".replace(",
  ".delete(",
  "runMutation",
  "mutation(",
  "internalMutation",
]) {
  assert.ok(!preflightSource.includes(forbidden), `preflight must stay read-only and avoid ${forbidden}`);
}

const dirtyRows = [
  {
    _id: "balance-1",
    userId: "user-1",
    includedCreditsBalance: 100,
    includedCycleCredits: 500,
    purchasedCreditsBalance: 4900,
    uncollectedCreditsBalance: 0,
    pendingCardCollectionCreditsBalance: 0,
    updatedAt: 10,
  },
  {
    _id: "balance-2",
    userId: "user-2",
    includedCreditsBalance: 0,
    includedCycleCredits: 0,
    purchasedCreditsBalance: 25,
    uncollectedCreditsBalance: 1,
    pendingCardCollectionCreditsBalance: 2,
    updatedAt: 11,
  },
];

const dirty = buildProductionWorkspaceIncludedCreditPreflight(dirtyRows, 100, "gate");
assert.equal(dirty.ok, false);
assert.equal(dirty.readOnly, true);
assert.equal(dirty.dryRun, true);
assert.equal(dirty.writePathAvailable, false);
assert.equal(dirty.writeCommand, null);
assert.equal(dirty.explicitAcceptanceRequired, false);
assert.equal(dirty.releaseGate.blocksProduction, true);
assert.equal(dirty.releaseGate.exitCodeWhenRunAsGate, 1);
assert.equal(dirty.releaseGate.reason, "legacy_included_workspace_credit_fields_must_be_cleared");
assert.equal(dirty.summary.cleanupCandidateRows, 1);
assert.equal(dirty.summary.totalPurchasedCredits, 4925);
assert.equal(dirty.summary.totalLegacyIncludedCredits, 100);
assert.equal(dirty.summary.totalLegacyIncludedCycleCredits, 500);
assert.deepEqual(dirty.diagnostic.authoritativeBalanceFields, [
  "purchasedCreditsBalance",
  "uncollectedCreditsBalance",
  "pendingCardCollectionCreditsBalance",
]);

const clean = buildProductionWorkspaceIncludedCreditPreflight([dirtyRows[1]!], 100, "gate");
assert.equal(clean.ok, true);
assert.equal(clean.releaseGate.blocksProduction, false);
assert.equal(clean.releaseGate.exitCodeWhenRunAsGate, 0);
assert.equal(clean.diagnostic.requiredReview, "none");

const truncated = buildProductionWorkspaceIncludedCreditPreflight([dirtyRows[1]!], 1, "gate");
assert.equal(truncated.ok, false);
assert.equal(
  truncated.releaseGate.reason,
  "production_workspace_credit_balance_scan_truncated_increase_limit_before_release",
);

console.log("workspace_included_credit_preflight_proof: ok");
