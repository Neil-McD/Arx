import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  communityResourceModuleId: null,
  communitySettingsPane: null,
  docsSlug: null,
});

assert.equal(
  buildAppRoutePath({
    page: "settings",
    view: "home",
    settingsPage: "integrations",
    communitySlug: null,
    communityTab: "chat",
  }),
  "/settings/integrations",
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
const routes = read("shared/webAppRouteState.ts");
const transitions = read("shared/appNavTransitions.ts");
const app = read("apps/web/src/App.tsx");
const mainSurface = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const settingsSurface = read("apps/web/src/components/WebSettingsSurfaceHost.tsx");
const mobileController = read("apps/web/src/controllers/useWebMobileShellController.ts");
const globalOverlays = read("apps/web/src/controllers/buildWebGlobalOverlayHostProps.ts");

assert.match(navigation, /\| "settings"/);
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
  app,
  /const openGlobalSettings = \(page: SettingsPage\)[\s\S]*activePage === "settings" && settingsPage === page[\s\S]*pushNavSnapshot\(\)[\s\S]*navigateTo\(buildSettingsPath\(page\)\)/,
);
assert.match(app, /activePage === "settings" && settingsPage === "integrations"/);
assert.doesNotMatch(app, /setActiveView\("settings"\)/);
assert.doesNotMatch(transitions, /ToggleWorkspaceSettings|deriveToggleWorkspaceSettingsTransition/);
assert.match(mobileController, /params\.openGlobalSettings\("agent"\)/);
assert.doesNotMatch(mobileController, /setActivePage\("workspace"\)/);
assert.match(globalOverlays, /params\.onOpenSettings\(/);

console.log("global_settings_surface_contract_proof: ok");
