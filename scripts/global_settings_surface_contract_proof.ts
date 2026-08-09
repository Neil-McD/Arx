import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  buildAppRoutePath,
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
  "account",
  "legacy Agent routes must canonicalize to Account",
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
  activePage: "settings",
  mobileSettingsView: "detail",
  isPublicCommunityFunnel: false,
});
assert.equal(desktopProjection.isGlobalSettings, true);
assert.equal(desktopProjection.showDesktopCommunityRail, true);
assert.equal(desktopProjection.hasLeftPanel, true);

const mobileProjection = buildWebShellProjection({
  publicRouteKind: "app",
  shellVariant: "mobile",
  activePage: "settings",
  mobileSettingsView: "index",
  isPublicCommunityFunnel: false,
});
assert.equal(mobileProjection.isGlobalSettings, true);
assert.equal(mobileProjection.showMobileAppShell, true);
assert.equal(mobileProjection.showMobileSettingsShell, true);
assert.equal(mobileProjection.showMobileSettingsIndex, true);
assert.equal(mobileProjection.showMobileShell, false);

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
assert.match(mobileController, /params\.openGlobalSettings\("profile"\)/);
assert.doesNotMatch(mobileController, /setActivePage\("workspace"\)/);
assert.doesNotMatch(globalOverlays, /Premium|onOpenPremiumBilling/);

console.log("global_settings_surface_contract_proof: ok");
