import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isDesktopShellContextualBackPage } from "../shared/appShellNavigation.ts";
import { popDistinctNavSnapshot, type NavSnapshotBase } from "../shared/navSnapshot.ts";
import { readLegacyWorkspaceRouteContext } from "../shared/webAppRouteState.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readSourceCorpus(path: string): string {
  const chunks: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      chunks.push(readSourceCorpus(entryPath));
      continue;
    }
    if (/\.(?:html|js|jsx|ts|tsx)$/.test(entry.name)) {
      chunks.push(read(entryPath));
    }
  }
  return chunks.join("\n");
}

const routes = read("shared/webAppRouteState.ts");
const navigation = read("shared/appShellNavigation.ts");
const app = read("apps/web/src/App.tsx");
const shellNavigation = read(
  "apps/web/src/controllers/useWebShellNavigationController.ts",
);
const shellState = read("apps/web/src/controllers/useWebShellState.ts");
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const memberAgentDock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const voiceController = read("shared/useWebVoiceInputController.ts");
const exportController = read("shared/useWebAccountDataExportController.ts");
const shellProjection = read("apps/web/src/controllers/buildWebShellProjection.ts");
const mobileController = read("apps/web/src/controllers/useWebMobileShellController.ts");
const mobileTopBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const desktopHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const shellHost = read("apps/web/src/components/WebShellChromeHost.tsx");
const shellClassNames = read("apps/web/src/controllers/buildWebShellChromeClassNames.ts");
const webCss = read("apps/web/src/index.css");
const baseCss = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const globalBaseCss = read("apps/web/src/base.css");
const landingPage = read("apps/web/src/components/WebLandingPage.tsx");
const landingCss = read("apps/web/src/components/polynetLanding/ConversionLanding.css");
const accountOnboarding = read("apps/web/src/components/WebOnboardingPage.tsx");
const mainSurface = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const settingsSurface = read("apps/web/src/components/WebSettingsSurfaceHost.tsx");
const communityAgentSection = read("apps/web/src/components/WebCommunityAiAgentSection.tsx");
const communityAgentInstructions = read("apps/web/src/components/WebCommunityAiAgentInstructionsEditor.tsx");
const globalOverlay = read("apps/web/src/components/WebGlobalOverlayHost.tsx");
const globalOverlayProps = read("apps/web/src/controllers/buildWebGlobalOverlayHostProps.ts");
const accountCommerceGateway = read("shared/cloudAccountCommerceGateway.ts");
const mcp = read("convex/httpMcp.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const emailEvents = read("convex/emailEvents.ts");
const emailDigests = read("convex/emailDigests.ts");
const eventReminders = read("convex/eventReminders.ts");
const webSourceCorpus = readSourceCorpus("apps/web/src");

assert.ok(
  globalBaseCss.split("\n").length < 500,
  "base.css must remain a bounded global tokens/reset stylesheet",
);
assert.doesNotMatch(
  globalBaseCss,
  /\.app-root|\.app-shell|\.community-|\.settings-|\.modal/,
  "feature and shell presentation must not return to global base.css",
);
assert.match(
  webCss,
  /@import "\.\/base\.css";[\s\S]*@import "\.\/styles\/shell-and-onboarding\.css";[\s\S]*@import "\.\/styles\/community-and-content\.css";[\s\S]*@import "\.\/styles\/settings-runtime-and-theme-overrides\.css";/,
  "the web entry stylesheet must preserve explicit feature stylesheet cascade order",
);

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
  "legacy community-scoped Workspace URLs must restore on the community settings surface",
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
  shellNavigation,
  /legacyWorkspaceRedirectRef[\s\S]*readLegacyWorkspaceRouteContext[\s\S]*resolveAndEnter[\s\S]*buildCommunityFunnelPath/,
  "the shell navigation controller must route legacy URLs through authoritative member destination resolution",
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
  app,
  /activeThreadId|activeThreadProjectId|workspaceWantsNewChat|threadMessages|threadStreamingStateById|runtimeEventsByRunId|useWebSendFlowController|useWebRuntimeRunLifecycle|useWebWorkspaceCoreController/,
  "App must not retain a second browser conversation, project, send, or runtime authority",
);
assert.match(
  memberAgentDock,
  /useWebTurnRunnerController[\s\S]*ensureCloudMemberAgentGlobalChannel[\s\S]*syncThreadCommunityLensCloud/,
  "the mounted member-agent dock must remain the browser conversation owner",
);
assert.doesNotMatch(
  voiceController,
  /"workspace"|appendWorkspaceTranscript|focusWorkspaceInput|workspaceVoice/,
  "the shared voice controller must expose only mounted community, direct-message, and member-agent surfaces",
);
assert.match(
  exportController,
  /exportThreadsCsv[\s\S]*exportMessagesCsv[\s\S]*exportMemoryCsv/,
  "Settings data exports must remain independently owned after Workspace orchestration deletion",
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
  shellState,
  /useState<MobileRootPage>\("community"\)/,
  "the shell state owner must retain the mobile community root default",
);
assert.match(
  app,
  /mobileRoot=\{showMobileShell && mobileRootPage === "agent"\}/,
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
  "apps/web/src/controllers/useWebWorkspaceProjectStateController.ts",
  "apps/web/src/controllers/useWebWorkspaceModelStateController.ts",
  "apps/web/src/controllers/useWebWorkspaceSurfaceController.ts",
  "apps/web/src/controllers/workspaceSurfaceLifecycle.ts",
  "shared/cloudProjectsGateway.ts",
  "shared/workspaceActiveProjectSelector.ts",
  "shared/threadSidebarSelectors.ts",
  "apps/web/src/controllers/useWebWorkspaceCoreController.ts",
  "apps/web/src/controllers/useWebRuntimeRunLifecycle.ts",
  "apps/web/src/controllers/useWebGuestThreadLifecycle.ts",
  "apps/web/src/controllers/useWebThreadMessagesLifecycle.ts",
  "shared/useWebSendFlowController.ts",
  "shared/webSendFlowCore.ts",
  "shared/useWebThreadDataController.ts",
  "shared/useWebThreadMutationController.ts",
  "shared/threadContextController.ts",
  "shared/threadTitleUi.ts",
  "shared/useCommunityAgentLandingLifecycle.ts",
  "shared/messageContextUi.ts",
  "shared/cloudModelRegistryGateway.ts",
  "shared/modelRegistry.ts",
  "apps/web/src/components/WebMessageContextModal.tsx",
  "apps/web/src/components/WebPreviewAccessGateModal.tsx",
  "apps/web/src/components/WebInferenceIssueModal.tsx",
  "shared/useWebWorkspaceActionsController.ts",
  "shared/useWebWorkspaceUiActionsController.ts",
  "apps/web/src/components/WebBackgroundTerminalRail.tsx",
  "shared/workspaceTerminalsGateway.ts",
]) {
  assert.equal(existsSync(retiredPath), false, `${retiredPath} must remain deleted`);
}
for (const protectedDormantPath of [
  "apps/web/src/components/DaytonaRuntimeAppPreview.tsx",
  "apps/web/src/components/RuntimeComputerUseViewer.tsx",
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
  /WebProjectModalHost|projectModalHostProps|WebMessageContextModal|WebPreviewAccessGateModal|WebInferenceIssueModal|messageContextModalProps|previewAccessGateModalProps|inferenceIssueModalProps/,
  "the global overlay boundary must not retain zero-producer Workspace-era modal hosts",
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
assert.match(
  landingPage,
  /import \{ ConversionLanding \} from "\.\/polynetLanding\/ConversionLanding";[\s\S]*import "\.\/polynetLanding\/ConversionLanding\.css";[\s\S]*return <ConversionLanding onJoin=\{props\.onTryFree\} \/>;/,
  "the public entry surface must remain owned by ConversionLanding and its dedicated stylesheet",
);
assert.match(
  landingCss,
  /\.pn-landing\s*\{/,
  "the mounted ConversionLanding stylesheet must retain its scoped root",
);
assert.doesNotMatch(
  baseCss + webCss,
  /\.polynet-landing-/,
  "web CSS must not retain the retired pre-ConversionLanding selector family",
);
for (const retiredLandingKeyframe of [
  "polynet-memory-feedback-orbit",
  "polynet-memory-flow-in",
  "polynet-memory-flow-out",
  "polynet-memory-pulse",
  "polynet-motif-pulse",
  "polynet-motif-spin",
  "polynet-motif-shuttle",
  "polynet-motif-draw",
  "polynet-motif-pulse-dot",
  "polynet-agent-stream-scroll",
  "polynet-community-thread-scroll",
  "polynet-directory-scroll",
  "polynet-directory-digest-dot",
  "polynet-agent-type",
  "polynet-agent-event-in",
  "polynet-agent-caret-show",
  "polynet-agent-caret-hide",
  "polynet-agent-caret-blink",
  "polynet-usage-event-in",
  "polynet-usage-stream-scroll",
]) {
  assert.doesNotMatch(
    baseCss,
    new RegExp(`@keyframes\\s+${retiredLandingKeyframe}\\b`),
    `${retiredLandingKeyframe} must remain deleted with its exclusive landing owner`,
  );
}
assert.match(
  baseCss,
  /\.setup-section-kicker\s*\{[\s\S]*?letter-spacing:\s*0\.08em;/,
  "account setup must retain its neutral kicker presentation",
);
assert.equal(
  accountOnboarding.match(/className="setup-section-kicker"/g)?.length,
  1,
  "account onboarding must remain the sole setup-kicker emitter",
);
assert.doesNotMatch(
  accountOnboarding,
  /polynet-landing-kicker/,
  "account setup must not retain the retired landing ownership name",
);
assert.match(
  baseCss,
  /\.polynet-onboarding-shell,\s*\.polynet-onboarding-provider-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
  "the live mobile onboarding selector arms must survive legacy landing cleanup",
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
  baseCss + webCss,
  /\.message-list\b|\.web-empty-thread\b|\.scroll-to-bottom\b|\.ask-engine-|\.ask-(?:bar|input|footer|actions)-landing\b|\.success-toast\b|\.memory-toast\b|\.modal-auth-gate\b|\.auth-gate-google-button\b|\.memory-blocks\b|\.memory-block-group-title\b|\.memory-block-desc\b|\.workspace-billing-modal-copy\b|\.inference-issue-modal\b|\.workspace-attachment-drop-surface\b|\.workspace-drop-overlay\b/,
  "web CSS must not retain presentation whose only renderer was deleted with the Workspace host or its zero-producer overlays",
);
assert.match(
  baseCss,
  /\.community-attachment-drop-surface\.drag-over[\s\S]*\.community-drop-overlay/,
  "community attachment drag presentation must survive removal of the shared Workspace selector arms",
);
assert.match(
  webCss,
  /\.workspace\s*\{[\s\S]*padding:\s*0;/,
  "the mounted main surface must retain the web Workspace layout rule after its obsolete scroll-button exclusion is removed",
);
const retiredAuxiliarySurfacePattern =
  /\b(?:web-thread-loading|web-starter|web-download|session-resume)(?:[\w-]*)\b/;
assert.doesNotMatch(
  baseCss + webCss,
  retiredAuxiliarySurfacePattern,
  "web CSS must not retain loading, starter, download, or session-resume presentation with no source renderer",
);
assert.doesNotMatch(
  webSourceCorpus,
  retiredAuxiliarySurfacePattern,
  "web source must not resurrect loading, starter, download, or session-resume emitters after their presentation is retired",
);
for (const [stylesheetName, stylesheet] of [
  ["base.css", baseCss],
  ["index.css", webCss],
] as const) {
  assert.match(
    stylesheet,
    /\.web-skeleton-(?:block|pill|row)\b/,
    `${stylesheetName} must retain the generic skeleton primitives used by mounted MVP surfaces`,
  );
  assert.match(
    stylesheet,
    /@keyframes\s+webShimmer\b/,
    `${stylesheetName} must retain the shared skeleton animation`,
  );
}
assert.match(
  webSourceCorpus,
  /\bweb-skeleton-(?:block|pill|row)\b/,
  "mounted web source must retain an emitter for the shared skeleton primitives",
);
for (const protectedDormantStyleRoot of [
  ".runtime-computer-viewer",
  ".workspace-app-preview-card",
]) {
  assert.ok(
    baseCss.includes(protectedDormantStyleRoot),
    `${protectedDormantStyleRoot} must remain styled until the protected viewer mount-or-delete decision`,
  );
}
for (const retiredTerminalPresentationStem of [
  ".workspace-rail-card",
  ".background-terminal",
]) {
  assert.ok(
    !baseCss.includes(retiredTerminalPresentationStem),
    `${retiredTerminalPresentationStem} must remain absent after the background-terminal presentation closure`,
  );
  assert.ok(
    !webSourceCorpus.includes(retiredTerminalPresentationStem.slice(1)),
    `${retiredTerminalPresentationStem} must not regain a web source emitter`,
  );
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
