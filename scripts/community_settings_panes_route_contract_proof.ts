import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const navigation = read("shared/appShellNavigation.ts");
const routeState = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const settingsSection = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const accessViewModel = read("shared/communityAccessViewModel.ts");

for (const pane of ["community", "integrations", "danger"] as const) {
  assert.match(navigation, new RegExp(`"${pane}"`), `navigation contract missing ${pane} pane slug`);
  assert.match(settingsSection, new RegExp(`${pane}`), `settings UI missing ${pane} pane`);
}

assert.match(
  navigation,
  /export const COMMUNITY_SETTINGS_PANES = \[[\s\S]*"community"[\s\S]*"integrations"[\s\S]*"danger"[\s\S]*\] as const/,
  "community settings panes must be a shared slug union",
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
  app,
  /const \[communitySettingsPane, setCommunitySettingsPane\] = useState<CommunitySettingsPane>/,
  "App must keep the settings pane in route-level state",
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
