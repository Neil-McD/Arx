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

assert.equal(
  existsSync("convex/legacyOnboardingMigration.ts"),
  false,
  "the zero-work legacy storage migration must remain deleted",
);

const schema = read("convex/schema.ts");
assert.doesNotMatch(schema, /agentLifecycleActivations:\s*defineTable/);
assert.doesNotMatch(schema, /memberOnboarding:\s*v\.optional/);

const generatedApi = read("convex/_generated/api.d.ts");
assert.match(generatedApi, /onboardingLifecycle/);
assert.doesNotMatch(generatedApi, /legacyOnboardingMigration/);

const preflight = read("scripts/community_first_release_production_preflight.ts");
assert.match(preflight, /legacyStorageReady/);
assert.match(preflight, /run_currently_deployed_bounded_legacy_onboarding_cleanup_then_rerun_preflight/);

console.log("cached_client_member_entry_compatibility_contract_proof: ok");
