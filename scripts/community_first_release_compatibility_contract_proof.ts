import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

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

const schema = read("convex/schema.ts");
assert.doesNotMatch(schema, /agentLifecycleActivations|memberOnboarding/);
assert.equal(existsSync("convex/legacyOnboardingMigration.ts"), false);

const generatedApi = read("convex/_generated/api.d.ts");
assert.doesNotMatch(generatedApi, /legacyOnboardingMigration/);
assert.match(generatedApi, /onboardingLifecycle/);

console.log("community_first_release_compatibility_contract_proof: ok");
