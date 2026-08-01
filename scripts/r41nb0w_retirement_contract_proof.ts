import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const core = read("convex/r41nb0wRetirementCore.ts");
const backend = read("convex/r41nb0wRetirement.ts");
const audit = read("convex/criticalAudit.ts");
const lifecycle = read("convex/communityLifecycle.ts");
const docs = read("docs/r41nb0w-operator-retirement-v1.md");

assert.match(backend, /export const retireR41nb0wInternal = internalMutation/);
assert.doesNotMatch(backend, /export const retireR41nb0wInternal = mutation/);
assert.match(backend, /r41nb0w_retirement_exact_target_required/);
assert.match(backend, /r41nb0w_retirement_confirmation_required/);
assert.match(backend, /dryRun: v\.boolean\(\)/);
assert.match(backend, /communityCognitionCleanup\.drainDeletedCommunityCognitionInternal/);
assert.match(backend, /community_operator_retirement_completed/);
assert.match(audit, /community_operator_retirement_completed/);

for (const retainedTable of [
  "userStripeConnectAccounts",
  "communityPricePoints",
  "checkoutSessions",
  "purchaseClaims",
  "criticalAuditEvents",
  "dmConversations",
  "developerApps",
]) {
  assert.match(core, new RegExp(`table: "${retainedTable}"`));
}
assert.doesNotMatch(
  core.slice(core.indexOf("R41NB0W_DIRECT_PRODUCT_TABLES"), core.indexOf("R41NB0W_SCANNED_PRODUCT_TABLES")),
  /userStripeConnectAccounts|communityPricePoints|checkoutSessions|purchaseClaims|criticalAuditEvents|dmConversations|developerApps/,
);
assert.match(core, /await args\.ctx\.db\.delete\(args\.target\.openAiConnectionId\)/);
assert.match(core, /await args\.ctx\.db\.delete\(args\.target\.founderGrantId\)/);
assert.match(core, /await args\.ctx\.db\.delete\(args\.target\.communityId\)/);
assert.match(core, /await args\.ctx\.storage\.delete\(storageId\)/);
assert.match(core, /r41nb0w_retirement_shared_storage_forbidden/);
assert.match(core, /completed_checkout_present/);
assert.match(core, /redeemed_purchase_claim_present/);
assert.match(core, /table: "communityMemberships"/);
assert.match(core, /violations\.push\(`\$\{table\}_not_empty`\)/);
assert.match(core, /founder_grant_not_pristine_approved/);

assert.match(lifecycle, /COMMUNITY_DELETION_QUARANTINE_CODE/);
assert.match(lifecycle, /throw new ConvexError\(\{[\s\S]*COMMUNITY_DELETION_QUARANTINE_CODE/);
assert.match(docs, /preserve the owner user identity/i);
assert.match(docs, /does not\s+re-enable public community deletion/i);

console.log("r41nb0w_retirement_contract_proof: ok");
