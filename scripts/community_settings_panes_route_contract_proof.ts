import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  listCommunitySettingsPanesForAccess,
  normalizeCommunitySettingsPaneForAccess,
  parseCommunitySettingsPane,
} from "../shared/appShellNavigation.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const navigation = read("shared/appShellNavigation.ts");
const routeState = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const shellState = read("apps/web/src/controllers/useWebShellState.ts");
const shellNavigation = read(
  "apps/web/src/controllers/useWebShellNavigationController.ts",
);
const communityNavigation = read(
  "apps/web/src/controllers/useWebCommunityNavigationActions.ts",
);
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const surfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const settingsSection = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const secondaryPanels = read("apps/web/src/components/WebCommunitySecondaryPanels.tsx");
const modalHost = read("apps/web/src/components/WebCommunityModalHost.tsx");
const communityUiController = read(
  "apps/web/src/controllers/useWebCommunityUiController.ts",
);
const communitySettingsController = read(
  "apps/web/src/controllers/useWebCommunitySettingsController.ts",
);
const communityGateway = read("shared/cloudCommunityAdminGateway.ts");
const accessViewModel = read("shared/communityAccessViewModel.ts");
const communitySettingsPaneContract = navigation.slice(
  navigation.indexOf("export const COMMUNITY_SETTINGS_PANES"),
  navigation.indexOf("export type CommunitySettingsPane"),
);

for (const pane of ["community", "agent", "danger"] as const) {
  assert.match(navigation, new RegExp(`"${pane}"`), `navigation contract missing ${pane} pane slug`);
  assert.match(settingsSection, new RegExp(`${pane}`), `settings UI missing ${pane} pane`);
}

assert.match(
  navigation,
  /export const COMMUNITY_SETTINGS_PANES = \[[\s\S]*"community"[\s\S]*"agent"[\s\S]*"danger"[\s\S]*\] as const/,
  "community settings panes must be a shared slug union",
);
assert.doesNotMatch(
  communitySettingsPaneContract,
  /"integrations"/,
  "third-party integrations must not remain a community settings pane",
);
assert.equal(
  parseCommunitySettingsPane("danger"),
  "danger",
  "the owner archive pane must survive refresh and popstate",
);
assert.equal(parseCommunitySettingsPane("ai_agent"), "agent");
assert.equal(
  parseCommunitySettingsPane("funnel"),
  "community",
  "Funnel must not remain selectable as a Settings pane",
);
assert.deepEqual(
  listCommunitySettingsPanesForAccess({
    canViewSettings: true,
    canManageSettings: false,
    canManageMembers: false,
    isOwner: false,
  }),
  ["community"],
  "members must receive only member-safe community settings",
);
assert.equal(
  normalizeCommunitySettingsPaneForAccess("agent", {
    canViewSettings: true,
    canManageSettings: false,
    canManageMembers: false,
    isOwner: false,
  }),
  "community",
  "unauthorized Agent deep links must fail closed to member settings",
);
assert.doesNotMatch(
  settingsSection,
  /Delete community|openDeleteCommunityModal|canDeleteCommunity/,
  "the archive pane must not resurrect quarantined deletion",
);
assert.match(
  settingsSection,
  /selectedSettingsPane === "danger" && isOwnerSettingsLayer[\s\S]*CommunityArchiveCard/,
  "Danger must be an owner-only archive surface",
);
assert.match(
  settingsSection,
  /Freezes the community, removes member access[\s\S]*Restoring it later[\s\S]*\$79\/month/,
  "the archive confirmation must state the frozen and paid-restoration consequences",
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
assert.match(
  communityGateway,
  /archiveCloudCommunity[\s\S]*communityColdArchive:archiveCommunity[\s\S]*authSubject[\s\S]*communityId/,
  "the browser must use one authenticated gateway to the canonical archive command",
);
assert.match(
  communitySettingsController,
  /handleArchiveCommunity[\s\S]*archiveCloudCommunity\([\s\S]*params\.onCommunityArchived/,
  "the settings controller must delegate lifecycle authority before leaving the shell",
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
  /export function parseCommunitySettingsPane\(\s*value: string \| null \| undefined,?\s*\): CommunitySettingsPane/,
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
  /communityTab === "settings"[\s\S]*\? parseCommunitySettingsPane\(legacyAgentSettingsPane \?\? segments\[3\] \?\? null\)/,
  "settings routes must restore the pane slug from the path",
);
assert.match(
  routeState,
  /tabSegment === "settings" && String\(segments\[3\] \?\? ""\)\.trim\(\) === "funnel"[\s\S]*tabSegment === "funnel" \|\| isLegacyFunnelSettingsRoute[\s\S]*\? "settings"/,
  "retired Funnel URLs must resolve to community Settings",
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
  /const shellState = useWebShellState\(\)/,
  "App must compose the shell state controller",
);
assert.match(
  shellState,
  /resolveInitialAppShellVariant\(\{[\s\S]*pathname: window\.location\.pathname[\s\S]*oauthShellVariant: readOAuthCallbackShellVariantFromLocation\(\)[\s\S]*readPublicRouteFromLocation\(\)[\s\S]*readAppRouteFromLocation\(\)/,
  "the shell state controller must own initial route and shell-variant hydration",
);
assert.match(
  shellNavigation,
  /nextAppRoute\.communityTab === "settings"\s*\?\s*nextAppRoute\.communitySettingsPane \?\? "community"\s*:\s*"community"/,
  "refresh and popstate must restore the settings pane from parsed route state",
);
assert.match(
  communityNavigation,
  /buildCommunityTabPath\(\s*slug,\s*"settings",\s*null,\s*pane,\s*\)/,
  "pane selection must navigate to the pane-specific settings route",
);
assert.match(
  communityNavigation,
  /params\.navigateTo\(\s*path,\s*options\?\.replace \? \{ replace: true \} : \{\},\s*\)/,
  "unauthorized pane normalization must replace history instead of creating a back-button loop",
);
assert.match(
  shellNavigation,
  /communitySettingsPane:[\s\S]*current\.activePage === "community" &&\s*current\.communityTab === "settings"\s*\?\s*current\.communitySettingsPane\s*:\s*null/,
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
assert.doesNotMatch(
  settingsSection,
  /WebCommunityOnboardingWorkflowSection|selectedSettingsPane === "workflows"/,
  "retired deterministic onboarding must not survive as a settings pane",
);
assert.match(
  settingsSection,
  /selectedSettingsPane === "agent"[\s\S]*WebCommunityAiAgentSection/,
  "Agent must render inside the route-backed Settings panes",
);
assert.doesNotMatch(
  settingsSection,
  /WebCommunityFunnelSection|selectedSettingsPane === "funnel"/,
  "Funnel must not remain embedded in Settings",
);
assert.doesNotMatch(
  secondaryPanels,
  /communityTab === "funnel"[\s\S]*<WebCommunityFunnelSection/,
  "retired Funnel must not render as a community surface",
);
assert.match(
  settingsSection,
  /onSelectPane: \(pane: CommunitySettingsPane, opts\?: \{ replace\?: boolean \}\) => void/,
  "settings section must emit pane selection instead of owning route state",
);
assert.match(
  settingsSection,
  /if \(pane !== selectedSettingsPane\) onSelectPane\(pane\)/,
  "clicking the active pane must not add duplicate history entries",
);
assert.match(
  settingsSection,
  /onSelectPane\(availableSettingsPanes\[0\]!, \{ replace: true \}\)/,
  "invalid or unauthorized pane fallback must replace the current URL",
);
assert.match(
  settingsSection,
  /function CommunityMemberSettings\b[\s\S]*Mute this community[\s\S]*Leave community/,
  "non-managers should see member-level community settings without owner/admin panes",
);
assert.match(
  settingsSection,
  /listCommunitySettingsPanesForAccess\(settingsPaneAccess\)/,
  "settings pane visibility must come from the centralized access contract",
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
