import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAccountSetupStatus } from "../shared/accountSetup.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const accountSetupCore = read("convex/accountSetupCore.ts");
const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const schema = read("convex/schema.ts");

assert.match(
  accountSetupCore,
  /export function buildAccountSetupStatusForRows/,
  "operator visibility must reuse the canonical setup derivation in bulk form",
);
assert.match(
  accountSetupCore,
  /export async function loadAccountSetupStatusForUser/,
  "per-user profile setup status must share the same Convex helper",
);
for (const table of [
  "users",
  "userProfileDetails",
  "legalAcceptances",
  "communities",
  "communityMemberships",
]) {
  assert.match(operatorIntelligence, new RegExp(`"${table}"`), `operator setup visibility must source ${table}`);
}
assert.doesNotMatch(
  operatorIntelligence,
  /v\.literal\("agent"\)/,
  "operator setup snapshots must not include the deleted agent step",
);
assert.doesNotMatch(
  operatorDashboard,
  /v\.literal\("agent"\)/,
  "operator setup filters must not include the deleted agent step",
);

assert.match(
  operatorDashboard,
  /export const getOperatorAccountSetupSnapshot = query/,
  "operator account setup should expose a single snapshot query",
);
assert.match(
  operatorIntelligence,
  /export const getOperatorAccountSetupSnapshotInternal = internalQuery/,
  "operator account setup should expose a single read-only internal snapshot query",
);

assert.match(operatorDashboard, /requireOperatorAccess/, "setup visibility must be operator-only");
assert.doesNotMatch(
  schema,
  /accountSetupEvents: defineTable/,
  "account setup should not create a separate behavioral analytics table",
);
assert.doesNotMatch(operatorIntelligence, /accountSetupEvents/, "operator setup visibility should use canonical setup state only");
assert.match(operatorIntelligence, /"legalAcceptances"/, "operator setup visibility must source platform legal acceptance");
assert.doesNotMatch(operatorDashboard, /v\.literal\("direction"\)/, "operator setup filters must not include the deleted direction step");
assert.doesNotMatch(operatorIntelligence, /v\.literal\("direction"\)/, "operator setup snapshots must not include the deleted direction step");

const existingWithoutProfileDetail = buildAccountSetupStatus({
  displayName: "Existing Member",
  handle: "existing",
  avatarUrl: "https://example.com/avatar.png",
  hasAcceptedPlatformLegal: true,
});
assert.equal(existingWithoutProfileDetail.current_step, "complete");
assert.equal(existingWithoutProfileDetail.completed, true);

const identityCompleteWithoutProvider = buildAccountSetupStatus({
  displayName: "Ready Profile",
  handle: "ready",
  avatarUrl: "https://example.com/avatar.png",
  bio: "Creator.",
  hasAcceptedPlatformLegal: true,
});
assert.equal(identityCompleteWithoutProvider.current_step, "complete");
assert.deepEqual(identityCompleteWithoutProvider.missing, []);

const complete = buildAccountSetupStatus({
  displayName: "Complete",
  handle: "complete",
  avatarUrl: "https://example.com/avatar.png",
  hasAcceptedPlatformLegal: true,
});
assert.equal(complete.current_step, "complete");
assert.equal(complete.completed, true);
assert.equal(complete.percent, 100);

const missingLegal = buildAccountSetupStatus({
  displayName: "Legal Missing",
  handle: "legal-missing",
  avatarUrl: "https://example.com/avatar.png",
});
assert.equal(missingLegal.current_step, "identity");
assert.deepEqual(missingLegal.missing, ["platform_legal"]);

console.log("account_setup_operator_visibility_proof: ok");
