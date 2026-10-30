import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  buildAppRoutePath,
  buildSettingsIndexPath,
  readAppRouteFromLocation,
} from "../shared/webAppRouteState.ts";
import { buildWebShellProjection } from "../apps/web/src/controllers/buildWebShellProjection.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const originalWindow = globalThis.window;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: {
      pathname: "/settings/billing",
      search: "",
    },
  },
});

assert.deepEqual(readAppRouteFromLocation(), {
  page: "settings",
  view: "home",
  settingsPage: "billing",
  communitySlug: null,
  communityTab: "chat",
  communityChannelSlug: null,
  communityResourceModuleId: null,
  communitySettingsPane: null,
  docsSlug: null,
});

assert.equal(
  buildAppRoutePath({
    page: "settings",
    view: "home",
    settingsPage: "account",
    communitySlug: null,
    communityTab: "chat",
  }),
  "/settings/account",
);

assert.equal(buildSettingsIndexPath(), "/settings");
assert.equal(
  buildAppRoutePath({
    page: "settings",
    view: "home",
    settingsPage: "profile",
    settingsIndex: true,
    communitySlug: null,
    communityTab: "chat",
  }),
  "/settings",
  "the settings index must have a durable route distinct from Profile detail",
);

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: {
      pathname: "/m/settings",
      search: "",
    },
  },
});
assert.equal(
  readAppRouteFromLocation().settingsIndex,
  true,
  "the mobile settings index must survive refresh and popstate",
);

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: {
      pathname: "/settings/agent",
      search: "",
    },
  },
});
assert.equal(
  readAppRouteFromLocation().settingsPage,
  "apps",
  "legacy Agent routes must canonicalize to Apps, where agents connect",
);

if (originalWindow === undefined) {
  Reflect.deleteProperty(globalThis, "window");
} else {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
}

const desktopProjection = buildWebShellProjection({
  publicRouteKind: "app",
  shellVariant: "standard",
  destination: { kind: "global_settings", page: "profile", index: false },
  mobileRootPage: "community",
  mobileSettingsView: "detail",
  isPublicCommunityFunnel: false,
});
assert.equal(desktopProjection.isGlobalSettings, true);
assert.equal(desktopProjection.showDesktopCommunityRail, true);
assert.equal(desktopProjection.hasLeftPanel, true);

const mobileProjection = buildWebShellProjection({
  publicRouteKind: "app",
  shellVariant: "mobile",
  destination: { kind: "global_settings", page: "profile", index: true },
  mobileRootPage: "community",
  mobileSettingsView: "index",
  isPublicCommunityFunnel: false,
});
assert.equal(mobileProjection.isGlobalSettings, true);
assert.equal(mobileProjection.showMobileAppShell, true);
assert.equal(mobileProjection.showMobileSettingsShell, true);
assert.equal(mobileProjection.showMobileSettingsIndex, true);
assert.equal(mobileProjection.showMobileShell, true);
assert.equal(mobileProjection.showMobileGlobalShell, true);

const mobileCommunitySettingsProjection = buildWebShellProjection({
  publicRouteKind: "app",
  shellVariant: "mobile",
  destination: { kind: "community_settings", slug: "polynet", pane: "community" },
  mobileRootPage: "community",
  mobileSettingsView: "detail",
  isPublicCommunityFunnel: false,
});
assert.equal(
  mobileCommunitySettingsProjection.showMobileGlobalShell,
  true,
  "community settings must retain the authenticated outer shell",
);
assert.equal(mobileCommunitySettingsProjection.mobileShellMode, "settings");

for (const communityTab of ["chat", "resources", "events"] as const) {
  const destination = communityTab === "chat"
    ? { kind: "community_chat" as const, slug: "polynet", channelSlug: null }
    : communityTab === "resources"
      ? { kind: "community_resources" as const, slug: "polynet", moduleId: null }
      : { kind: "community_events" as const, slug: "polynet" };
  const contentProjection = buildWebShellProjection({
    publicRouteKind: "app",
    shellVariant: "mobile",
    destination,
    mobileRootPage: "community",
    mobileSettingsView: "detail",
    isPublicCommunityFunnel: false,
  });
  assert.equal(
    contentProjection.showMobileGlobalShell,
    false,
    `${communityTab} must remain an immersive community-content route`,
  );
}

const navigation = read("shared/appShellNavigation.ts");
const settingsNav = read("shared/SettingsNavList.tsx");
const routes = read("shared/webAppRouteState.ts");
const navSnapshot = read("shared/navSnapshot.ts");
const transitions = read("shared/appNavTransitions.ts");
const app = read("apps/web/src/App.tsx");
const shellNavigation = read(
  "apps/web/src/controllers/useWebShellNavigationController.ts",
);
const settingsPanels = read("apps/web/src/components/WebSettingsPanels.tsx");
const onboardingProfile = read(
  "apps/web/src/controllers/useWebOnboardingProfileController.ts",
);
const mainSurface = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const settingsSurface = read("apps/web/src/components/WebSettingsSurfaceHost.tsx");
const mobileController = read("apps/web/src/controllers/useWebMobileShellController.ts");
const mobileCommunityShell = read("apps/web/src/components/WebMobileCommunityShell.tsx");
const globalOverlays = read("apps/web/src/controllers/buildWebGlobalOverlayHostProps.ts");

assert.match(navigation, /\| "settings"/);
assert.match(
  navigation,
  /export type SettingsPage =[\s\S]*"profile"[\s\S]*"account"[\s\S]*"billing"[\s\S]*"appearance"/,
);
assert.doesNotMatch(navigation, /\| "partners"/);
assert.doesNotMatch(settingsNav, /Builder Partner|Partner payouts/);
assert.doesNotMatch(navigation, /\| "agent"|\| "integrations"/);
assert.doesNotMatch(navigation, /AppView = "home" \| "settings"/);
assert.doesNotMatch(navSnapshot, /snapshot\.view === "settings"/);
assert.doesNotMatch(
  settingsNav,
  /Platform Analytics|showOperatorConsole|onOpenOperatorConsole/,
);
assert.match(
  routes,
  /segments\[0\] === "settings"[\s\S]*page: "settings"[\s\S]*view: "home"/,
);
assert.match(
  mainSurface,
  /activePage === "settings"[\s\S]*WebSettingsSurfaceHost/,
);
assert.match(settingsSurface, /SettingsNavList[\s\S]*WebSettingsPanels/);
assert.doesNotMatch(mainSurface, /WebWorkspaceSurfaceHost|workspaceSurfaceHostProps/);
assert.match(
  shellNavigation,
  /const openGlobalSettings = useCallback[\s\S]*current\.activePage === "settings" && current\.settingsPage === page[\s\S]*pushNavSnapshot\(\)[\s\S]*navigateTo\(buildSettingsPath\(page\)\)/,
);
assert.match(
  shellNavigation,
  /current\.setMobileSettingsView\([\s\S]*nextAppRoute\.page === "settings" && nextAppRoute\.settingsIndex[\s\S]*\? "index"[\s\S]*: "detail"/,
  "settings index and detail state must hydrate from the canonical route",
);
assert.match(
  app,
  /shellVariant === "mobile"[\s\S]*navigateTo\(buildSettingsIndexPath\(\)\)[\s\S]*openGlobalSettings\("profile"\)/,
  "the mobile global gear must enter the settings index while desktop retains Profile detail",
);
assert.equal(
  existsSync("apps/web/src/controllers/useWebSkillsModel.ts"),
  false,
  "the retired community skill configuration model must not remain in the web client",
);
assert.match(
  settingsPanels,
  /case "account":[\s\S]*WebAccountSettingsSection[\s\S]*WebPolynetMcpAccountSection/,
  "Account must compose identity, inference, and official Polynet MCP access",
);
assert.doesNotMatch(
  settingsPanels,
  /WebPersonalAccountSettingsSection|WebPersonalSkillsAccountSection|personalAccount|personalMemory|dataExport/,
  "Account must not compose retired personal-agent, export, memory, or skills surfaces",
);
assert.equal(
  existsSync("apps/web/src/controllers/useWebProviderConnectionsController.ts"),
  false,
  "global settings must not initialize the retired personal-provider lifecycle",
);
assert.doesNotMatch(
  app,
  /useWebProviderConnectionsController|providerConnectionUi|connectChatgpt/,
  "App must not retain personal-provider orchestration",
);
assert.match(
  onboardingProfile,
  /const getSessionRef = useRef\(params\.getSession\);[\s\S]*getSessionRef\.current = params\.getSession;/,
  "account setup callbacks must not churn when App supplies a render-local session getter",
);
assert.doesNotMatch(app, /setActiveView\("settings"\)/);
assert.doesNotMatch(transitions, /ToggleWorkspaceSettings|deriveToggleWorkspaceSettingsTransition/);
assert.match(
  mobileCommunityShell,
  /communityShell\.onOpenGlobalSettings\(\)[\s\S]*mobile-community-selector-name">Settings</,
  "global Settings should remain reachable from the mobile community selector",
);
assert.doesNotMatch(mobileController, /setActivePage\("workspace"\)/);
assert.doesNotMatch(globalOverlays, /Premium|onOpenPremiumBilling/);

console.log("global_settings_surface_contract_proof: ok");
