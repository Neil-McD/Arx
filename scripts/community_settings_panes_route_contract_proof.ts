import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseCommunitySettingsPane } from "../shared/appShellNavigation.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const navigation = read("shared/appShellNavigation.ts");
const routeState = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const shellState = read("apps/web/src/controllers/useWebShellState.ts");
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const settingsSection = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const modalHost = read("apps/web/src/components/WebCommunityModalHost.tsx");
const communityUiController = read(
  "apps/web/src/controllers/useWebCommunityUiController.ts",
);
const communityGateway = read("shared/cloudCommunityAdminGateway.ts");
const accessViewModel = read("shared/communityAccessViewModel.ts");
const communitySettingsPaneContract = navigation.slice(
  navigation.indexOf("export const COMMUNITY_SETTINGS_PANES"),
  navigation.indexOf("export type CommunitySettingsPane"),
);

for (const pane of ["community", "workflows"] as const) {
  assert.match(navigation, new RegExp(`"${pane}"`), `navigation contract missing ${pane} pane slug`);
  assert.match(settingsSection, new RegExp(`${pane}`), `settings UI missing ${pane} pane`);
}

assert.match(
  navigation,
  /export const COMMUNITY_SETTINGS_PANES = \[[\s\S]*"community"[\s\S]*"workflows"[\s\S]*\] as const/,
  "community settings panes must be a shared slug union",
);
assert.doesNotMatch(
  communitySettingsPaneContract,
  /"integrations"/,
  "third-party integrations must not remain a community settings pane",
);
assert.doesNotMatch(
  navigation,
  /"danger"/,
  "Danger must not remain a community settings pane or parser result",
);
assert.equal(
  parseCommunitySettingsPane("danger"),
  "community",
  "legacy Danger URLs must fail safely into the canonical Community pane",
);
assert.doesNotMatch(
  settingsSection,
  /CommunityDangerZoneSection|Delete community|openDeleteCommunityModal|canDeleteCommunity/,
  "community settings must not advertise or wire quarantined deletion",
);
assert.doesNotMatch(
  modalHost,
  /WebDeleteCommunityModal|deleteModal/,
  "the community modal host must not retain deletion presentation",
);
assert.doesNotMatch(
  communityUiController,
  /useCommunityDeleteController|deleteCommunity|deleteModal|openDeleteCommunityModal/,
  "the community UI controller must not retain deletion state or actions",
);
assert.doesNotMatch(
  app,
  /openDeleteCommunityModal|canDeleteActiveCommunity/,
  "App must not retain community deletion capability plumbing",
);
assert.doesNotMatch(
  communityGateway,
  /client\.mutation\("communityLifecycle:deleteCommunity"/,
  "the current community browser gateway must not call the quarantined mutation",
);
assert.equal(
  existsSync("apps/web/src/components/WebDeleteCommunityModal.tsx"),
  false,
  "the orphaned community deletion modal must be deleted",
);
assert.equal(
  existsSync("shared/useCommunityDeleteController.ts"),
  false,
  "the orphaned community deletion controller must be deleted",
);
assert.doesNotMatch(
  settingsSection,
  /CommunityMemberOnboarding|member-onboarding|Save onboarding|AI guide prompt/,
  "retired community onboarding controls must not remain in settings",
);
assert.doesNotMatch(
  navigation,
  /"personal"/,
  "personal must not be a community settings pane; personal profile/account controls belong in global settings",
);
assert.match(
  navigation,
  /export function parseCommunitySettingsPane\(value: string \| null \| undefined\): CommunitySettingsPane/,
  "community settings pane slugs must parse through one shared helper",
);

assert.match(
  routeState,
  /communitySettingsPane\?: CommunitySettingsPane \| null/,
  "app route state must carry the active community settings pane",
);
assert.match(
  routeState,
  /communityTab === "settings"[\s\S]*return `\/c\/\$\{encodeURIComponent\(slug\)\}\/\$\{tabSegment\}\/\$\{encodeURIComponent\(settingsPane\)\}`/,
  "settings routes must build pane-specific URLs",
);
assert.match(
  routeState,
  /communityTab === "settings" \? parseCommunitySettingsPane\(segments\[3\] \?\? null\) : null/,
  "settings routes must restore the pane slug from the path",
);
assert.match(
  routeState,
  /state\.communitySettingsPane/,
  "generic app route builder must pass the settings pane into community tab route building",
);

assert.match(
  shellState,
  /const \[communitySettingsPane, setCommunitySettingsPane\] =\s*useState<CommunitySettingsPane>/,
  "the shell state controller must own the route-level settings pane",
);
assert.match(
  app,
  /useWebShellState\(\{[\s\S]*initialAppRoute,[\s\S]*initialPublicRoute,[\s\S]*initialShellVariant,[\s\S]*\}\)/,
  "App must compose the shell state controller",
);
assert.match(
  app,
  /nextAppRoute\.communityTab === "settings" \? nextAppRoute\.communitySettingsPane \?\? "community" : "community"/,
  "refresh and popstate must restore the settings pane from parsed route state",
);
assert.match(
  app,
  /buildCommunityTabPath\(nextCommunitySlug, "settings", null, pane\)/,
  "pane selection must navigate to the pane-specific settings route",
);
assert.match(
  app,
  /navigateTo\(settingsPath, opts\?\.replace \? \{ replace: true \} : \{\}\)/,
  "unauthorized pane normalization must replace history instead of creating a back-button loop",
);
assert.match(
  app,
  /communitySettingsPane:[\s\S]*activePage === "community" && communityTab === "settings" \? communitySettingsPane : null/,
  "current route snapshots must include the active settings pane",
);

assert.match(
  routeLifecycle,
  /communitySettingsPane: CommunitySettingsPane/,
  "path lifecycle must receive the active settings pane",
);
assert.match(
  routeLifecycle,
  /params\.activePage === "community" && params\.communityTab === "settings"[\s\S]*\? params\.communitySettingsPane/,
  "path lifecycle must preserve pane URLs while syncing app state to the browser path",
);

assert.match(
  surfaceProjection,
  /activePane: params\.communitySettingsPane/,
  "community surface projection must pass the route-backed pane into settings UI",
);
assert.match(
  surfaceProjection,
  /onSelectPane: params\.onSelectCommunitySettingsPane/,
  "community surface projection must pass route navigation for pane selection",
);

assert.match(
  settingsSection,
  /activePane: CommunitySettingsPane/,
  "settings section must receive the active pane as a controlled prop",
);
assert.match(
  settingsSection,
  /selectedSettingsPane === "workflows"[\s\S]*WebCommunityOnboardingWorkflowSection/,
  "the route-backed Workflows pane must render the onboarding workflow",
);
assert.match(
  settingsSection,
  /onSelectPane: \(pane: CommunitySettingsPane, opts\?: \{ replace\?: boolean \}\) => void/,
  "settings section must emit pane selection instead of owning route state",
);
assert.match(
  settingsSection,
  /if \(activePane !== pane\) onSelectPane\(pane\);/,
  "clicking the active pane must not add duplicate history entries",
);
assert.match(
  settingsSection,
  /onSelectPane\(availableSettingsPanes\[0\]!, \{ replace: true \}\)/,
  "invalid or unauthorized pane fallback must replace the current URL",
);
assert.match(
  settingsSection,
  /function CommunityMemberSettingsSection[\s\S]*Member settings[\s\S]*Mute community[\s\S]*Leave community/,
  "non-managers should see member-level community settings without owner/admin panes",
);
assert.match(
  settingsSection,
  /const availableSettingsPanes = canManageCommunitySettings \? ownerSettingsPanes : \[\]/,
  "community settings panes must be owner/admin-only",
);
assert.doesNotMatch(
  settingsSection,
  /memberSettingsPanes|CommunityPersonalSettingsSection|selectedSettingsPane === "personal"/,
  "member/personal community settings panes must be deleted",
);
assert.doesNotMatch(
  settingsSection,
  /useState<CommunitySettingsPane>/,
  "settings section must not keep pane selection in local component state",
);

assert.match(
  accessViewModel,
  /canViewSettings: canEnterCommunity/,
  "community settings nav visibility must be member-visible",
);
assert.match(
  accessViewModel,
  /const canEnterCommunity = access \? Boolean\(access\.can_enter_community \?\? access\.can_view\) : false/,
  "community settings visibility must fail closed until current-community access is loaded",
);

console.log("PASS: community settings has member view plus route-backed manager panes.");
