import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  GLOBAL_PLATFORM_SKILLS,
} from "../shared/platformSkills.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

for (const path of [
  "convex/agentLifecycleActivations.ts",
  "convex/legacyOnboardingMigration.ts",
  "shared/cloudOnboardingGuideGateway.ts",
  "shared/runtimeSkillLifecycle.ts",
  "shared/communityMemberOnboarding.ts",
]) {
  assert.equal(existsSync(path), false, `${path} must remain retired`);
}

const compatibilityShim = read("convex/onboardingLifecycle.ts");
assert.match(compatibilityShim, /Temporary cached-client compatibility only/);
assert.match(compatibilityShim, /ensureMemberAgentGlobalChannel/);
assert.match(compatibilityShim, /compatibility_route: "member_agent_global_channel"/);
assert.doesNotMatch(
  compatibilityShim,
  /agentLifecycleActivations|onboarding-guide|ONBOARDING_LIFECYCLE_EVENT|runAgentTurn|community-onboarding/,
);

assert.deepEqual(GLOBAL_PLATFORM_SKILLS, []);

const runtimeSurface = [
  read("convex/runtimeTurnHandlers.ts"),
  read("convex/runtimeAgentLoop.ts"),
  read("convex/runtimeSkillResolution.ts"),
].join("\n");
assert.doesNotMatch(
  runtimeSurface,
  /onboardingLifecycle|onboarding_completed|skillLifecycleTrigger|privateLifecycleContext|community-onboarding/,
);

const platformSkillRuntime = read("convex/platformSkillRuntime.ts");
assert.match(
  platformSkillRuntime,
  /GLOBAL_PLATFORM_RUNTIME_SKILLS:[^=]*= \[\]/,
);
assert.doesNotMatch(platformSkillRuntime, /ONBOARDING|onboarding-guide/);

const app = read("apps/web/src/App.tsx");
const onboardingProfileController = read(
  "apps/web/src/controllers/useWebOnboardingProfileController.ts",
);
assert.doesNotMatch(app, /requestOnboardingGuideKickoff/);
assert.match(onboardingProfileController, /completeOnboarding:\s*true/);

const profiles = read("convex/profiles.ts");
assert.match(profiles, /onboardingCompletedAt/);
assert.match(profiles, /socialLinks/);

const toolRegistry = read("shared/toolRegistry.ts");
assert.match(toolRegistry, /member_profile_confirm_facts/);

const schema = read("convex/schema.ts");
assert.doesNotMatch(schema, /agentLifecycleActivations|memberOnboarding/);

const retiredCommunityConfigSurface = [
  read("apps/web/src/App.tsx"),
  read("apps/web/src/components/WebCommunitySettingsSection.tsx"),
  read("convex/communityLifecycle.ts"),
  read("shared/cloudCommunityAdminGateway.ts"),
  read("shared/appShellNavigation.ts"),
  read("shared/runtimeContextManifest.ts"),
].join("\n");
assert.doesNotMatch(
  retiredCommunityConfigSurface,
  /CommunityMemberOnboarding|communityMemberOnboarding|member_onboarding|memberOnboarding|saveCommunityMemberOnboardingConfig|selected_platform_onboarding_skill/,
);

const generatedApi = read("convex/_generated/api.d.ts");
assert.doesNotMatch(
  generatedApi,
  /agentLifecycleActivations|saveCommunityMemberOnboardingConfig/,
);

console.log("legacy_onboarding_retirement_contract_proof: ok");
