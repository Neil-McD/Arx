import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const shim = read("convex/onboardingLifecycle.ts");
assert.match(shim, /export const requestOnboardingGuideKickoff = action/);
assert.match(shim, /resolveAuthenticatedActorInternal/);
assert.match(shim, /resolveMemberEntryDestinationInternal/);
assert.match(shim, /ensureMemberAgentGlobalChannel/);
assert.match(shim, /run_required: false/);
assert.doesNotMatch(
  shim,
  /agentLifecycleActivations|ensureCloudThread|runAgentTurn|onboarding-guide|community-onboarding/,
);

const migration = read("convex/legacyOnboardingMigration.ts");
for (const marker of [
  "MAX_BATCH_SIZE = 100",
  "auditCommunityMemberOnboardingPageInternal",
  "clearCommunityMemberOnboardingPageInternal",
  "auditAgentLifecycleActivationsPageInternal",
  "deleteAgentLifecycleActivationsPageInternal",
  "paginationOptsValidator",
  "memberOnboarding: undefined",
]) {
  assert.ok(migration.includes(marker), `legacy migration should include ${marker}`);
}
assert.doesNotMatch(migration, /\.collect\(\)/);

const schema = read("convex/schema.ts");
assert.match(schema, /Deprecated release-compatibility table/);
assert.match(schema, /Deprecated release-compatibility field/);

const generatedApi = read("convex/_generated/api.d.ts");
assert.match(generatedApi, /legacyOnboardingMigration/);
assert.match(generatedApi, /onboardingLifecycle/);

const preflight = read("scripts/community_first_release_production_preflight.ts");
assert.match(preflight, /historicalThreadReviewRequired/);
assert.match(preflight, /dedicatedOnboardingThreads > 0/);

console.log("community_first_release_compatibility_contract_proof: ok");
