import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isDesktopShellContextualBackPage } from "../shared/appShellNavigation.ts";
import { popDistinctNavSnapshot, type NavSnapshotBase } from "../shared/navSnapshot.ts";
import { readLegacyWorkspaceRouteContext } from "../shared/webAppRouteState.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const routes = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const launchSetupRoute = read("apps/web/src/communityLaunchSetupRoute.ts");
const mobileController = read("apps/web/src/controllers/useWebMobileShellController.ts");
const mobileTopBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const desktopHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const shellHost = read("apps/web/src/components/WebShellChromeHost.tsx");
const shellClassNames = read("apps/web/src/controllers/buildWebShellChromeClassNames.ts");
const webCss = read("apps/web/src/index.css");
const mainSurface = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const settingsSurface = read("apps/web/src/components/WebSettingsSurfaceHost.tsx");
const communityAgentSection = read("apps/web/src/components/WebCommunityAiAgentSection.tsx");
const communityAgentInstructions = read("apps/web/src/components/WebCommunityAiAgentInstructionsEditor.tsx");
const communityLaunchSetup = read("apps/web/src/components/WebCommunityLaunchSetupModal.tsx");
const mcp = read("convex/httpMcp.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const emailEvents = read("convex/emailEvents.ts");
const emailDigests = read("convex/emailDigests.ts");
const eventReminders = read("convex/eventReminders.ts");

assert.deepEqual(readLegacyWorkspaceRouteContext("/workspace"), {
  kind: "root",
  communitySlug: null,
});
assert.deepEqual(readLegacyWorkspaceRouteContext("/workspace/thread/legacy-thread"), {
  kind: "thread",
  communitySlug: null,
});
assert.deepEqual(readLegacyWorkspaceRouteContext("/m/workspace/polynet"), {
  kind: "community",
  communitySlug: "polynet",
});
assert.equal(readLegacyWorkspaceRouteContext("/discover"), null);
assert.doesNotThrow(() => readLegacyWorkspaceRouteContext("/workspace/%E0%A4%A"));

const workspaceRouteBranch =
  routes.match(/if \(segments\[0\] === "workspace"\) \{[\s\S]*?\n  \}\n\n  if \(segments\[0\] === "settings"\)/)?.[0] ?? "";
assert.match(
  workspaceRouteBranch,
  /page: "community"[\s\S]*communityTab: "settings"/,
  "legacy launch setup URLs must restore on the community settings surface",
);
assert.match(
  workspaceRouteBranch,
  /return \{[\s\S]*page: "landing"/,
  "ordinary legacy Workspace URLs must enter a non-Workspace holding state",
);
assert.doesNotMatch(
  workspaceRouteBranch,
  /page: "workspace"/,
  "legacy Workspace parsing must never mount the Workspace product surface",
);
assert.match(
  routeLifecycle,
  /isLegacyWorkspaceRoutePath\(window\.location\.pathname\)\) return/,
  "path canonicalization must wait for the auth-aware legacy redirect",
);
assert.match(
  app,
  /legacyWorkspaceRedirectRef[\s\S]*readLegacyWorkspaceRouteContext[\s\S]*resolveAndEnterMemberDestination[\s\S]*buildCommunityFunnelPath/,
  "App must route legacy URLs through authoritative member destination resolution",
);
assert.match(
  app,
  /session && isCommunityLaunchSetupRoutePath\(pathname\)\) return/,
  "only authenticated legacy setup routes may remain in place for restoration",
);
assert.match(
  app,
  /shouldHoldLandingForAuth[\s\S]*isLegacyWorkspaceRoutePath\(window\.location\.pathname/,
  "legacy redirects must render a neutral hold instead of flashing another product surface",
);
assert.doesNotMatch(
  app,
  /navigateTo\("\/workspace/,
  "first-party App navigation must not directly enter Workspace",
);
assert.doesNotMatch(
  operatorGateway,
  /path: "\/workspace"/,
  "operator deploy probes must not advertise Workspace as a product route",
);
for (const [label, source] of [
  ["transactional email", emailEvents],
  ["community digest", emailDigests],
  ["event reminder", eventReminders],
] as const) {
  assert.doesNotMatch(source, /["'`]\/workspace(?:[\/"'`]|$)/, `${label} links must not enter Workspace`);
}
assert.match(
  app,
  /useState<MobileRootPage>\("community"\)[\s\S]*forceCommunityRoot: showMobileShell/,
  "reachable mobile navigation must remain community-scoped",
);
assert.match(
  mobileController,
  /handleExitMobileSettings[\s\S]*openMobileCommunitySurface\(\)/,
  "mobile settings must exit to a community or Discover",
);
assert.match(
  mobileTopBar,
  /\{!forceCommunityRoot \? \([\s\S]*Agent[\s\S]*\) : null\}/,
  "the obsolete mobile Agent selector must be hidden on reachable routes",
);
for (const page of ["community", "discover", "docs", "workspace"] as const) {
  assert.equal(
    isDesktopShellContextualBackPage(page),
    false,
    `${page} must not render a desktop shell back action`,
  );
}
for (const page of ["settings", "operator"] as const) {
  assert.equal(
    isDesktopShellContextualBackPage(page),
    true,
    `${page} must retain a contextual desktop return action`,
  );
}
const baseSnapshot: NavSnapshotBase = {
  page: "community",
  view: "home",
  settingsPage: "profile",
  communitySlug: "polynet",
  communityTab: "chat",
  threadId: null,
};
const noOpStack = [
  { ...baseSnapshot, page: "discover" as const, routePath: "/discover" },
  { ...baseSnapshot, page: "workspace" as const, routePath: "/workspace" },
  { ...baseSnapshot, routePath: "/c/polynet/preview" },
];
assert.equal(
  popDistinctNavSnapshot(noOpStack, "/c/polynet/preview")?.routePath,
  "/discover",
  "back navigation must skip same-route and quarantined Workspace snapshots",
);
assert.equal(noOpStack.length, 0, "skipped snapshots must be consumed deterministically");
assert.match(
  desktopHeader,
  /isDesktopShellContextualBackPage\(props\.activePage\)[\s\S]*props\.activePage === "discover" && props\.hasBackTargetSnapshot[\s\S]*hasContextualAppBack \? \([\s\S]*props\.activePage === "settings"[\s\S]*props\.onBackFromSettings[\s\S]*props\.onBackToCommunity[\s\S]*\) : null/,
  "desktop header must add a Discover return action only when a prior surface exists",
);
assert.match(
  desktopHeader,
  /hasPublicFunnelBack[\s\S]*props\.isPublicFunnelPreviewRoute \|\| props\.hasBackTargetSnapshot/,
  "desktop header must preserve explicit funnel preview and return actions",
);
assert.match(
  shellHost,
  /reserveCommunityNavTopbarSpace:[\s\S]*props\.desktopHeader\.isPublicCommunityFunnel[\s\S]*props\.desktopHeader\.isPublicFunnelPreviewRoute[\s\S]*props\.desktopHeader\.hasBackTargetSnapshot/,
  "only public funnel return actions may reserve the community navigation header row",
);
assert.match(
  shellClassNames,
  /reserveCommunityNavTopbarSpace \? " community-nav-topbar-space" : ""/,
  "the shell must project public funnel header spacing as an explicit layout class",
);
assert.match(
  webCss,
  /\.app-root\.community-nav-topbar-space \.community-nav \{\s*padding-top: var\(--web-topbar-height\);\s*\}/,
  "community navigation must be flush unless a real public funnel return action occupies the header",
);
assert.doesNotMatch(
  desktopHeader,
  /activePage === "landing" \|\| props\.activePage === "onboarding"/,
  "public funnel actions must not be suppressed by stale app-page state",
);
assert.match(
  desktopHeader,
  /<a[\s\S]*href=\{props\.publicFunnelPreviewExitPath \?\? "\/"\}[\s\S]*title="Exit preview"/,
  "preview exit must be native navigation rather than a hydration-dependent callback",
);
assert.doesNotMatch(
  app,
  /handleExitPublicFunnelPreview/,
  "preview exit must not retain an ephemeral navigation callback",
);
assert.match(
  app,
  /publicFunnelPreviewExitPath:[\s\S]*buildCommunityTabPath\(publicRoute\.slug, "funnel"\)/,
  "preview exit must target the owning community's funnel editor",
);
assert.match(
  launchSetupRoute,
  /buildCommunityTabPath\(communitySlug, "settings", null, "community"\)[\s\S]*community_launch_setup/,
  "new launch setup URLs must live under community settings",
);
assert.doesNotMatch(
  launchSetupRoute,
  /buildWorkspace(?:Community)?DraftPath/,
  "new launch setup URLs must not be generated under Workspace",
);
assert.match(
  communityAgentSection,
  /\{ id: "instructions", label: "Instructions" \}/,
  "community agent settings must expose instructions as the canonical configuration surface",
);
assert.doesNotMatch(
  communityAgentSection,
  /\{ id: "workspace", label: "Workspace" \}/,
  "community agent settings must not expose the quarantined Workspace surface",
);
for (const legacyLandingCopy of ["Preview workspace", "Starter prompts", "DEFAULT_EMPTY_THREAD_LANDING"]) {
  assert.doesNotMatch(
    communityAgentInstructions,
    new RegExp(legacyLandingCopy),
    `community agent instructions must not expose legacy landing control: ${legacyLandingCopy}`,
  );
}
for (const legacyLaunchField of ["starterPrompts", "community-launch-starter-panel", "agent_starter_prompts"]) {
  assert.doesNotMatch(
    communityLaunchSetup,
    new RegExp(legacyLaunchField),
    `community launch setup must not expose legacy Workspace starter state: ${legacyLaunchField}`,
  );
}
assert.match(
  app,
  /communityAgentConfigLoadedCommunityIdRef\.current === community\.id[\s\S]*DEFAULT_EMPTY_THREAD_LANDING/,
  "launch setup must never copy hidden landing state across community boundaries",
);

assert.match(mainSurface, /activePage === "settings"[\s\S]*WebSettingsSurfaceHost/);
assert.doesNotMatch(
  mainSurface,
  /WebWorkspaceSurfaceHost|workspaceSurfaceHostProps|activePage === "workspace"/,
  "the app surface host must not import, accept, or mount a Workspace presentation",
);
for (const retiredPath of [
  "apps/web/src/components/WebWorkspaceSurfaceHost.tsx",
  "apps/web/src/components/WebWorkspaceShellPanels.tsx",
  "apps/web/src/components/WebWorkspaceShellPanelsHost.tsx",
  "apps/web/src/controllers/buildWebWorkspaceLandingProjection.tsx",
  "apps/web/src/controllers/buildWebWorkspaceSurfaceProjection.tsx",
]) {
  assert.equal(existsSync(retiredPath), false, `${retiredPath} must remain deleted`);
}
assert.match(
  settingsSurface,
  /WebSettingsPanels[\s\S]*SettingsNavList/,
  "global settings must own its renderer and navigation independently of Workspace",
);
assert.doesNotMatch(app, /WebWorkspaceSurfaceHost|WebWorkspaceShellPanelsHost/);
assert.match(
  mcp,
  /community_context: "workspace_context"/,
  "MCP wire compatibility must remain unchanged during UI quarantine",
);

console.log("workspace_surface_quarantine_contract_proof: ok");
