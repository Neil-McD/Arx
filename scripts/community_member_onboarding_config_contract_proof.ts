import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const sharedConfig = read("shared/communityMemberOnboarding.ts");
const schema = read("convex/schema.ts");
const lifecycle = read("convex/communityLifecycle.ts");
const communityModule = read("convex/community.ts");
const admin = read("convex/communityAdmin.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const uiController = read("apps/web/src/controllers/useWebCommunitySettingsUiController.ts");
const formController = read("shared/useCommunitySettingsFormController.ts");
const governanceController = read("shared/useCommunitySettingsGovernanceController.ts");
const settingsSection = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const app = read("apps/web/src/App.tsx");

assert.match(
  sharedConfig,
  /COMMUNITY_MEMBER_ONBOARDING_PRIMARY_ACTIONS[\s\S]*"introduce"[\s\S]*"ask_agent"[\s\S]*"view_resources"[\s\S]*"start_workflow"/,
  "member onboarding must have one small shared action enum",
);
assert.match(
  sharedConfig,
  /buildDefaultCommunityMemberOnboardingConfig/,
  "member onboarding must have shared defaults for missing community configs",
);
assert.match(
  sharedConfig,
  /parsed\.protocol !== "https:"/,
  "member onboarding URLs must be https only",
);
assert.doesNotMatch(
  sharedConfig,
  /parsed\.protocol !== "http:"/,
  "member onboarding URLs must not allow http",
);

assert.match(
  schema,
  /memberOnboarding: v\.optional\([\s\S]*enabled: v\.boolean\(\)[\s\S]*primaryAction: v\.union\([\s\S]*aiGuidePrompt: v\.string\(\)/,
  "community schema must store the persisted member onboarding config",
);

assert.match(
  lifecycle,
  /export const saveCommunityMemberOnboardingConfig = mutation/,
  "Convex must expose a dedicated member onboarding config mutation",
);
assert.match(
  lifecycle,
  /requireCommunityManager\([\s\S]*communityId: args\.communityId[\s\S]*userId/,
  "member onboarding config saves must be owner/admin-gated",
);
assert.match(
  lifecycle,
  /primary_action: v\.union\([\s\S]*v\.literal\("introduce"\)[\s\S]*v\.literal\("ask_agent"\)[\s\S]*v\.literal\("view_resources"\)[\s\S]*v\.literal\("start_workflow"\)/,
  "member onboarding primary action must be a strict server-side enum",
);
assert.match(
  lifecycle,
  /ctx\.db\.patch\(community\._id as any, \{[\s\S]*memberOnboarding[\s\S]*updatedAt: nowMs/,
  "member onboarding config saves must patch the community authority row",
);
assert.match(
  lifecycle,
  /member_onboarding: mapStoredMemberOnboardingConfig\(row\.memberOnboarding, row\.name\)/,
  "community record output must include normalized member onboarding config",
);
assert.match(
  communityModule,
  /export const saveCommunityMemberOnboardingConfig = saveCommunityMemberOnboardingConfigImpl/,
  "community module must export the member onboarding save mutation",
);
assert.match(
  admin,
  /canViewCommunityMemberOnboardingAdminConfig[\s\S]*role === "owner" \|\| role === "admin"/,
  "full member onboarding config must be owner/admin-only",
);
assert.match(
  admin,
  /\.\.\.\(canViewCommunityMemberOnboardingAdminConfig\(role\)[\s\S]*member_onboarding: mapCommunityMemberOnboardingForOutput\(community\)/,
  "membership community projection must include full member onboarding config only for settings hydration",
);

assert.match(
  gateway,
  /client\.mutation\("community:saveCommunityMemberOnboardingConfig" as any/,
  "web gateway must call the dedicated member onboarding mutation",
);
assert.match(
  uiController,
  /communityMemberOnboardingConfig[\s\S]*buildDefaultCommunityMemberOnboardingConfig/,
  "web settings state must initialize member onboarding config from shared defaults",
);
assert.match(
  uiController,
  /communityMemberOnboardingDirtyRef/,
  "web settings state must track member onboarding dirtiness separately",
);
assert.match(
  formController,
  /normalizeCommunityMemberOnboardingConfig\([\s\S]*selectedCommunity\.member_onboarding/,
  "community settings hydration must load saved member onboarding config",
);
assert.match(
  governanceController,
  /handleSaveCommunityMemberOnboarding[\s\S]*saveCloudCommunityMemberOnboardingConfig/,
  "community settings governance must save member onboarding through the gateway",
);
assert.match(
  settingsSection,
  /CommunityMemberOnboardingSettingsSection[\s\S]*Show onboarding to new members[\s\S]*Welcome video URL[\s\S]*AI guide prompt[\s\S]*Save onboarding/,
  "onboarding settings pane must render the persisted config form",
);
assert.doesNotMatch(
  settingsSection,
  /persisted onboarding fields are not wired yet/,
  "onboarding settings pane must not ship the old placeholder copy",
);
assert.match(
  app,
  /onSaveCommunityMemberOnboardingSuccess[\s\S]*member_onboarding: result\.member_onboarding/,
  "App state must update the active community after onboarding config saves",
);
assert.match(
  app,
  /communitySettingsDirtyRef\.current \|\| communityMemberOnboardingDirtyRef\.current/,
  "community switching guard must include unsaved member onboarding edits",
);
assert.match(
  app,
  /isCommunitySettingsDirty: communitySettingsDirtyRef\.current,\s*communitySettingsError/,
  "community settings save state must not be driven by onboarding dirtiness",
);

console.log("PASS: community member onboarding config is persisted and owner/admin gated.");
