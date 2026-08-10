import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const app = read("apps/web/src/App.tsx");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const lifecycle = read("shared/useCommunitySettingsAccessLifecycle.ts");
const governance = read("shared/useCommunitySettingsGovernanceController.ts");
const settingsController = read(
  "apps/web/src/controllers/useWebCommunitySettingsController.ts",
);
const settingsUi = read(
  "apps/web/src/controllers/useWebCommunitySettingsUiController.ts",
);
const settingsSection = read(
  "apps/web/src/components/WebCommunitySettingsSection.tsx",
);

assert.match(
  gateway,
  /fetchCloudCommunitySettings<[\s\S]*communityLifecycle:getCommunitySettings[\s\S]*parseCloudCommunitySettingsSnapshot/,
  "General settings must read one parsed aggregate snapshot",
);
assert.match(
  gateway,
  /saveCloudCommunitySettings<[\s\S]*expectedSettingsRevision[\s\S]*parseCloudCommunitySettingsSnapshot/,
  "General settings saves must use and return the versioned aggregate contract",
);
assert.doesNotMatch(
  gateway,
  /listCloudCommunityPricePointRows|saveCloudCommunityOneLiner/,
  "superseded first-party pricing and one-liner gateways must be deleted",
);
assert.equal(
  existsSync("shared/useCommunitySettingsFormController.ts"),
  false,
  "the directory-backed settings hydrator must be deleted",
);
assert.equal(
  existsSync("shared/useCommunitySettingsDataController.ts"),
  false,
  "the split pricing hydrator must be deleted",
);
assert.match(
  lifecycle,
  /resetCommunitySettingsSelection\(params\.activeCommunityId\)[\s\S]*communityTab === "settings" \|\| params\.communityTab === "funnel"[\s\S]*loadCommunitySettings\(\{/,
  "settings and the surviving Funnel About editor must hydrate from the aggregate authority",
);
assert.doesNotMatch(
  lifecycle,
  /communities:|loadCommunityPricing|setCommunitySettingsPricingMode/,
  "the lifecycle must not rebuild General settings from shell or pricing projections",
);
assert.match(
  settingsController,
  /communitySettingsLoadSequenceRef\.current !== requestSequence[\s\S]*communitySettingsDraftRevisionRef\.current !== draftRevision/,
  "late aggregate reads must not overwrite another selection or a newer draft",
);
assert.match(
  governance,
  /getCommunitySettingsBaseline\(\)[\s\S]*expectedSettingsRevision: baseline\.settingsRevision/,
  "saves must submit the exact baseline revision",
);
assert.match(
  governance,
  /community_settings_conflict[\s\S]*onCommunitySettingsConflict\(\)/,
  "stale writes must become an explicit client conflict state",
);
assert.match(
  settingsSection,
  /communitySettingsConflict[\s\S]*handleReloadLatestCommunitySettings\(\)[\s\S]*Reload latest/,
  "conflicts must require an explicit reload rather than an automatic merge or retry",
);
assert.match(
  settingsUi,
  /handleCancelCommunitySettings[\s\S]*setDraftFromSnapshot\(saved\)[\s\S]*clearCommunitySettingsDirty\(\)/,
  "Cancel must be a local complete-baseline restore",
);
assert.doesNotMatch(
  settingsController,
  /handleCancelCommunitySettings[\s\S]*fetchCloud|handleCancelCommunitySettings[\s\S]*loadCommunity/,
  "Cancel must perform no network read",
);
assert.doesNotMatch(
  app,
  /communityPricingDirtyRef|markCommunityPricingDirty|loadCommunityPricing|syncCommunitySettingsSelection/,
  "App composition must not retain split hydration or duplicate pricing dirtiness",
);

console.log("PASS: community settings client version contract is complete.");
