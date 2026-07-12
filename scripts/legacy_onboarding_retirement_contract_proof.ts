import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  GLOBAL_PLATFORM_SKILLS,
  buildPlatformSkillToolNamesForSelection,
} from "../shared/platformSkills.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

for (const path of [
  "convex/onboardingLifecycle.ts",
  "convex/agentLifecycleActivations.ts",
  "shared/cloudOnboardingGuideGateway.ts",
  "shared/runtimeSkillLifecycle.ts",
]) {
  assert.equal(existsSync(path), false, `${path} must remain retired`);
}

assert.deepEqual(GLOBAL_PLATFORM_SKILLS, []);
assert.deepEqual(
  buildPlatformSkillToolNamesForSelection([
    { platform_skill_id: "platform:onboarding-guide" },
  ]),
  [],
);

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
assert.doesNotMatch(app, /requestOnboardingGuideKickoff/);
assert.match(app, /completeOnboarding:\s*true/);

const profiles = read("convex/profiles.ts");
assert.match(profiles, /onboardingCompletedAt/);
assert.match(profiles, /socialLinks/);

const toolRegistry = read("shared/toolRegistry.ts");
assert.match(toolRegistry, /member_profile_confirm_facts/);

const schema = read("convex/schema.ts");
assert.match(schema, /Inert retention table for historical onboarding-agent rows/);
assert.match(schema, /agentLifecycleActivations:\s*defineTable/);

const generatedApi = read("convex/_generated/api.d.ts");
assert.doesNotMatch(generatedApi, /onboardingLifecycle|agentLifecycleActivations/);

console.log("legacy_onboarding_retirement_contract_proof: ok");
