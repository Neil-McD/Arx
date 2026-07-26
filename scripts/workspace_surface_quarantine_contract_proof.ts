import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isDesktopShellContextualBackPage } from "../shared/appShellNavigation.ts";
import { popDistinctNavSnapshot, type NavSnapshotBase } from "../shared/navSnapshot.ts";
import { readLegacyWorkspaceRouteContext } from "../shared/webAppRouteState.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const routes = read("shared/webAppRouteState.ts");
const navigation = read("shared/appShellNavigation.ts");
const app = read("apps/web/src/App.tsx");
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const workspaceCore = read("apps/web/src/controllers/useWebWorkspaceCoreController.ts");
const threadSidebarSelectors = read("shared/threadSidebarSelectors.ts");
const shellProjection = read("apps/web/src/controllers/buildWebShellProjection.ts");
const launchSetupRoute = read("apps/web/src/communityLaunchSetupRoute.ts");
const mobileController = read("apps/web/src/controllers/useWebMobileShellController.ts");
const mobileTopBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const desktopHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const shellHost = read("apps/web/src/components/WebShellChromeHost.tsx");
const shellClassNames = read("apps/web/src/controllers/buildWebShellChromeClassNames.ts");
const webCss = read("apps/web/src/index.css");
const baseCss = read("apps/web/src/base.css");
const mainSurface = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const settingsSurface = read("apps/web/src/components/WebSettingsSurfaceHost.tsx");
const communityAgentSection = read("apps/web/src/components/WebCommunityAiAgentSection.tsx");
const communityAgentInstructions = read("apps/web/src/components/WebCommunityAiAgentInstructionsEditor.tsx");
const communityLaunchSetup = read("apps/web/src/components/WebCommunityLaunchSetupModal.tsx");
const globalOverlay = read("apps/web/src/components/WebGlobalOverlayHost.tsx");
const globalOverlayProps = read("apps/web/src/controllers/buildWebGlobalOverlayHostProps.ts");
const cloudProjectsGateway = read("shared/cloudProjectsGateway.ts");
const accountCommerceGateway = read("shared/cloudAccountCommerceGateway.ts");
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
  navigation,
  /\| "workspace"/,
  "AppPage must not be able to represent Workspace",
);
assert.doesNotMatch(
  routes,
  /buildWorkspaceDraftPath|buildWorkspaceCommunityDraftPath|buildWorkspaceThreadPath|WORKSPACE_DRAFT_PROJECT_SEARCH_PARAM/,
  "shared routing must not expose any Workspace route producer",
);
assert.equal(
  existsSync("apps/web/src/controllers/useWebWorkspaceRouteController.ts"),
  false,
  "the outbound Workspace route controller must remain deleted",
);
assert.doesNotMatch(
  app,
  /setActivePage\("workspace"\)|page: "workspace"|activePage === "workspace"|activePage !== "workspace"/,
  "App orchestration must not represent or branch on Workspace navigation state",
);
assert.doesNotMatch(
  workspaceCore,
  /useWebWorkspaceRouteController|route:/,
  "the retained runtime core must not own browser navigation",
);
assert.match(
  app,
  /adoptWorkspaceThreadSelection[\s\S]*setActiveProjectId[\s\S]*syncWorkspaceSelection/,
  "retained thread adoption must mutate runtime selection without changing page or URL",
);
assert.doesNotMatch(
  shellProjection,
  /activePage === "workspace"|sessionsDrawerEnabled|isSessionsDrawerOpen|showHeaderIslands/,
  "shell projection must not retain impossible Workspace-only chrome",
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
  /useState<MobileRootPage>\("community"\)[\s\S]*mobileRoot=\{showMobileShell && mobileRootPage === "agent"\}/,
  "mobile navigation may open the global member agent without restoring Workspace",
);
assert.doesNotMatch(
  mobileController,
  /handleTopbarBackToWorkspace|setActivePage|setActiveView|activePage === "workspace"/,
  "the mobile AI root must remain independent from the quarantined Workspace surface",
);
assert.match(
  mobileController,
  /if \(nextRootPage === "agent"\) \{[\s\S]*setMobileRootPage\("agent"\)[\s\S]*return/,
  "the AI rail destination must select the member-agent presentation only",
);
assert.match(
  mobileController,
  /handleExitMobileSettings[\s\S]*openMobileCommunitySurface\(\)/,
  "mobile settings must exit to a community or Discover",
);
assert.match(
  mobileTopBar,
  /mobile-topbar-community-selector/,
  "the community header must retain the centered community selector",
);
assert.doesNotMatch(
  mobileTopBar,
  /mobile-topbar-mode|onSelectRootPage|onStartNewThread/,
  "the obsolete Workspace-era Agent selector and thread action must remain deleted",
);
for (const page of ["community", "discover", "docs"] as const) {
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
};
const noOpStack = [
  { ...baseSnapshot, page: "discover" as const, routePath: "/discover" },
  { ...baseSnapshot, routePath: "/c/polynet/preview" },
];
assert.equal(
  popDistinctNavSnapshot(noOpStack, "/c/polynet/preview")?.routePath,
  "/discover",
  "back navigation must skip a same-route snapshot",
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
  "apps/web/src/components/WebWorkspaceHost.tsx",
  "apps/web/src/components/WebWorkspaceSurfaceHost.tsx",
  "apps/web/src/components/WebWorkspaceShellPanels.tsx",
  "apps/web/src/components/WebWorkspaceShellPanelsHost.tsx",
  "apps/web/src/components/WebWorkspaceRightPanel.tsx",
  "apps/web/src/components/WebWorkspaceUserDataPanel.tsx",
  "apps/web/src/components/useWorkspaceRightPanelController.ts",
  "apps/web/src/components/workspaceRightPanelData.ts",
  "apps/web/src/components/workspaceRightPanelModel.ts",
  "apps/web/src/controllers/buildWebWorkspaceLandingProjection.tsx",
  "apps/web/src/controllers/buildWebWorkspaceSurfaceProjection.tsx",
  "shared/workspaceInspectorGateway.ts",
  "apps/web/src/components/WebWorkspaceAppPreview.tsx",
  "apps/web/src/components/WebWorkspaceSidebarStateHost.tsx",
  "apps/web/src/components/WebThreadSidebarPanel.tsx",
  "apps/web/src/components/threadSidebarContracts.ts",
  "apps/web/src/components/WebWorkspaceStreamingMessage.tsx",
  "apps/web/src/components/WebWorkspaceThreadError.tsx",
  "apps/web/src/components/WebWorkspaceThreadMessageList.tsx",
  "apps/web/src/components/webWorkspaceThreadViews.ts",
  "shared/useWorkspaceAutoScroll.ts",
  "apps/web/src/components/RuntimeWebSources.tsx",
  "shared/MessageFooterActions.tsx",
  "apps/web/src/components/WebCreateProjectModal.tsx",
  "apps/web/src/components/WebDeleteProjectModal.tsx",
  "apps/web/src/components/WebProjectModalHost.tsx",
  "apps/web/src/controllers/useWebProjectUiController.ts",
  "shared/threadPanelController.ts",
  "shared/workspaceSandboxStatus.ts",
]) {
  assert.equal(existsSync(retiredPath), false, `${retiredPath} must remain deleted`);
}
for (const protectedDormantPath of [
  "apps/web/src/components/DaytonaRuntimeAppPreview.tsx",
  "apps/web/src/components/RuntimeComputerUseViewer.tsx",
  "apps/web/src/components/WebBackgroundTerminalRail.tsx",
]) {
  assert.equal(
    existsSync(protectedDormantPath),
    true,
    `${protectedDormantPath} must remain isolated for a separate protected harness presentation decision`,
  );
}
assert.doesNotMatch(
  app,
  /useWorkspaceRightPanelController|turnOnWorkspaceComputer|turnOffWorkspaceComputer|startProjectWorkspaceComputer|stopProjectWorkspaceComputer|useWebProjectUiController|projectUiController|projectModalHostProps|openWorkspaceStorageBillingModal|startWorkspaceCardSetupCheckout/,
  "App must not retain right-panel, project-modal, or card-setup state for the deleted Workspace presentation",
);
assert.doesNotMatch(
  globalOverlay + globalOverlayProps,
  /WebProjectModalHost|projectModalHostProps/,
  "the global overlay boundary must not retain a permanently closed project modal host",
);
assert.doesNotMatch(
  cloudProjectsGateway,
  /ensureDefaultMappedCloudProject|createMappedCloudProject|updateMappedCloudProject|deleteMappedCloudProject|importCloudProjectZip/,
  "the browser project gateway must expose read projection only",
);
assert.doesNotMatch(
  accountCommerceGateway,
  /startCloudWorkspaceCardSetupCheckout|refreshCloudWorkspaceCardOnFileStatus|loadCloudWorkspaceCardOnFileStatus/,
  "the browser account gateway must not expose Workspace card-setup adapters",
);
assert.match(
  accountCommerceGateway,
  /startCloudPremiumSubscriptionCheckout|startCloudConnectOnboarding/,
  "Premium checkout and provider onboarding must remain available",
);
assert.doesNotMatch(
  baseCss,
  /\.workspace-right-panel|\.workspace-user-data-panel|\.workspace-summary-|\.workspace-community-preview|\.workspace-files-|\.workspace-file-preview|\.workspace-code-preview|\.create-project-|\.delete-project-/,
  "base CSS must not retain selectors owned only by deleted Workspace, project-modal, or files-browser presentation",
);
assert.doesNotMatch(
  baseCss + webCss,
  /\.workspace-expanded-preview-shell\b|\.workspace-app-preview-copy\b|\.workspace-app-preview-button\.icon-only\b|\.workspace-app-preview-frame-stage\.fit-active\b|\.workspace-(?:body|composer-shell)\.preview-expanded\b|\.message-item(?:[\s.:{])|\.message-footer\b|\.message-meta\b|\.message-copy-btn\b|\.message-premium-upgrade|\.message-attachments-preview\b|\.streaming-caret\b|\.auth-error-(?:action|link)\b|\.thread-lane-switch\b|\.session-search\b|\.project-toolbar\b|\.project-group\b/,
  "web CSS must not retain selectors owned only by the deleted preview, thread-browser, and Workspace message presentation",
);
assert.doesNotMatch(
  threadSidebarSelectors,
  /filterVisibleThreads|groupThreadsByDate|searchThreads|buildProjectThreadGroups/,
  "shared thread/project selectors must not retain helpers owned only by the deleted thread browser",
);
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
