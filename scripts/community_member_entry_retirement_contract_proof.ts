import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { COMMUNITY_SETTINGS_PANES, parseCommunitySettingsPane } from "../shared/appShellNavigation.ts";
import { deriveWebDestinationFromPath } from "../shared/webAppRouteState.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const deletedFirstPartyFiles = [
  "convex/communityOnboarding.ts",
  "convex/communityOnboardingCore.ts",
  "shared/communityOnboarding.ts",
  "shared/communityOnboardingCopy.ts",
  "shared/cloudCommunityOnboardingGateway.ts",
  "apps/web/src/components/WebCommunityOnboardingController.tsx",
  "apps/web/src/components/WebCommunityOnboardingWorkflowSection.tsx",
  "apps/web/src/components/WebCommunityOnboardingOrientationModal.tsx",
  "apps/web/src/components/WebCommunityOnboardingAgentGuide.tsx",
  "apps/web/src/components/WebCommunityOnboardingMcpGuide.tsx",
] as const;

for (const path of deletedFirstPartyFiles) {
  assert.equal(existsSync(path), false, `${path} must remain retired`);
}

const lifecycle = read("convex/communityMembershipLifecycle.ts");
const interactions = read("convex/communityInteractions.ts");
const runtime = read("convex/runtimeTurnHandlers.ts");
const schema = read("convex/schema.ts");
const app = read("apps/web/src/App.tsx");
const composition = read("apps/web/src/components/WebAppCompositionRoot.tsx");
const chat = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const dock = read("apps/web/src/components/WebCommunityAgentDock.tsx");
const settings = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const settingsStyles = read("apps/web/src/styles/settings-runtime-and-theme-overrides.css");
const dockStyles = read("apps/web/src/components/WebCommunityAgentDock.css");
const contract = read("docs/community-member-arrival-v1.md");

assert.match(lifecycle, /type: "member_joined"/);
assert.doesNotMatch(lifecycle, /communityOnboarding|OnboardingSession/);
assert.doesNotMatch(interactions, /communityOnboarding|OnboardingMilestone/);
assert.doesNotMatch(runtime, /communityOnboarding|onboarding_progress/);

for (const [source, label] of [
  [app, "App"],
  [composition, "composition root"],
  [chat, "community chat"],
  [dock, "community agent dock"],
  [settings, "community settings"],
] as const) {
  assert.doesNotMatch(source, /CommunityOnboarding|communityOnboarding|community-onboarding/,
    `${label} must not retain deterministic member onboarding`);
}

assert.doesNotMatch(settingsStyles, /community-onboarding/);
assert.doesNotMatch(dockStyles, /is-onboarding|dock-onboarding/);
assert.deepEqual(COMMUNITY_SETTINGS_PANES, ["community", "sales_page", "offers", "appearance", "agent", "creators", "access", "danger"]);
assert.equal(parseCommunitySettingsPane("workflows"), "community");
assert.deepEqual(
  deriveWebDestinationFromPath("/m/c/polynet/onboarding/preview"),
  { kind: "community_chat", slug: "polynet", channelSlug: null },
);

assert.match(schema, /communityOnboardingConfigs: defineTable/);
assert.match(schema, /communityOnboardingSessions: defineTable/);
assert.match(contract, /does not create a separate onboarding\s+session/);

console.log("community member entry retirement contract: PASS");
