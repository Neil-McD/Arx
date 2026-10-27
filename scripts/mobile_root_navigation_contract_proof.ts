import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const appCompositionRoot = read(
  "apps/web/src/components/WebAppCompositionRoot.tsx",
);
const shellState = read("apps/web/src/controllers/useWebShellState.ts");
const shared = read("apps/web/src/components/webShellChromeShared.ts");
const controller = read("apps/web/src/controllers/useWebMobileShellController.ts");
const shellHost = read("apps/web/src/components/WebShellChromeHost.tsx");
const shellChromeProps = read(
  "apps/web/src/controllers/buildWebShellChromeHostProps.ts",
);
const shellClassNames = read(
  "apps/web/src/controllers/buildWebShellChromeClassNames.ts",
);
const shellProjection = read(
  "apps/web/src/controllers/buildWebShellProjection.ts",
);
const communityShell = read(
  "apps/web/src/components/WebMobileCommunityShell.tsx",
);
const mobileGlobalShell = read(
  "apps/web/src/components/WebMobileGlobalShell.tsx",
);
const communityNavSurface = read(
  "apps/web/src/components/WebCommunityNavSurface.tsx",
);
const communityNav = read("shared/CommunityNav.tsx");
const communityRail = read(
  "apps/web/src/components/WebCommunityRail.tsx",
);
const routeState = read("shared/webAppRouteState.ts");
const topBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const bottomRail = read("apps/web/src/components/WebMobileBottomRail.tsx");
const presenceFacepile = read("apps/web/src/components/CommunityPresenceFacepile.tsx");
const memberAgentDock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const memberAgentDockCss = read(
  "apps/web/src/components/WebMemberAgentDock.css",
);
const directMessagesHost = read(
  "apps/web/src/components/WebDirectMessagesHost.tsx",
);
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const communityHost = read("apps/web/src/components/WebCommunityHost.tsx");
const rosterPanel = read("apps/web/src/components/ChannelRosterPanel.tsx");
const communityRouteController = read(
  "apps/web/src/controllers/useWebCommunityRouteController.ts",
);
const interactionProjection = read(
  "apps/web/src/components/WebCommunityInteractionProjection.tsx",
);
const interactionProjectionController = read(
  "apps/web/src/controllers/useWebCommunityInteractionProjection.ts",
);
const mobileReadingModePolicy = read(
  "apps/web/src/components/mobileReadingModePolicy.ts",
);
const indexHtml = read("apps/web/index.html");
const indexCss = read("apps/web/src/index.css");
const baseCss = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const packageJson = read("package.json");

assert.match(
  shared,
  /export type MobileRootPage = "agent" \| "community" \| "messages";/,
  "Community, AI, and Messages should be the three persistent mobile roots",
);
assert.match(
  shared,
  /export type MobileOverlay =[\s\S]*\| "community_selector"[\s\S]*\| "members"[\s\S]*\| null;/,
  "authenticated community overlays should remain dismissible",
);
assert.match(
  shellState,
  /useState<MobileRootPage>\("community"\);/,
  "the community-first app should keep Community as the initial mobile root",
);
assert.match(
  app,
  /const mobileThreadPageOpen = Boolean\([\s\S]*showMobileShell[\s\S]*mobileRootPage === "community"[\s\S]*selectedCommunityInteractionRootId[\s\S]*\);/,
  "a selected reply thread should become a page only inside the mobile Community root",
);
assert.doesNotMatch(
  interactionProjectionController,
  /readStoredSelectedRoot/,
  "mobile Community should not reopen a stale thread selection from storage",
);
assert.doesNotMatch(
  app,
  /mobileMembersOverlayOpen: showMobileShell && mobileOverlay === "members"[\s\S]*onCloseMobileMembersOverlay: \(\) => setMobileOverlay\(null\)/,
  "authenticated Members must not depend on the chat-owned overlay",
);
assert.doesNotMatch(
  app,
  /mobileMembersOverlayOpen:[\s\S]*community_funnel|canViewMembers:[\s\S]*shellPublicRoute\.kind === "community_funnel"/,
  "the public funnel must not retain authenticated-shell member controls",
);
assert.match(
  app,
  /canOpenDirectMessages: Boolean\(session\)/,
  "Messages should only be enabled for an authenticated session",
);
assert.match(
  shared,
  /canOpenDirectMessages: boolean;/,
  "the authenticated Messages capability should cross the mobile shell boundary explicitly",
);
assert.match(
  app,
  /memberAgentDockProps=\{\{[\s\S]*mobileShellActive: showMobileShell,[\s\S]*mobileRoot: showMobileShell && mobileRootPage === "agent"[\s\S]*directMessagesHostProps=\{\{[\s\S]*mobileRoot:[\s\S]*showMobileShell && mobileRootPage === "messages"/,
  "AI and Messages should reuse their existing surfaces as persistent mobile roots",
);
assert.match(
  appCompositionRoot,
  /<WebMemberAgentDock[\s\S]*\{\.\.\.props\.memberAgentDockProps\}[\s\S]*<WebDirectMessagesHost \{\.\.\.props\.directMessagesHostProps\} \/>/,
  "the composition root should mount both controlled persistent mobile-root surfaces",
);
assert.doesNotMatch(
  app,
  /forceCommunityRoot:[\s\S]{0,180}community_funnel/,
  "public funnel routes must not inherit the mobile community root",
);
assert.doesNotMatch(
  app,
  /forceCommunityRoot:[\s\S]{0,180}community_funnel_preview/,
  "the private funnel preview must not inherit the mobile community shell",
);

assert.match(
  controller,
  /if \(nextRootPage === "messages"\) \{[\s\S]*if \(!params\.canOpenDirectMessages\) return;[\s\S]*params\.setMobileRootPage\("messages"\);[\s\S]*params\.openDirectMessages\(\);/,
  "Messages should be a first-class mobile root backed by the existing DM host",
);
assert.match(
  controller,
  /if \(nextRootPage === "agent"\) \{[\s\S]*params\.setMobileRootPage\("agent"\);[\s\S]*return;/,
  "AI should select the member-agent root without reviving Workspace",
);
assert.doesNotMatch(
  controller,
  /handleTopbarBackToWorkspace|setActivePage|setActiveView|activePage === "workspace"/,
  "mobile AI must remain independent from the retired Workspace surface",
);
assert.match(
  controller,
  /prepareMobileGlobalNavigation\(\);[\s\S]*openMobileCommunitySurface\(\);/,
  "Community should open the selected community home or fall back to Discover",
);
assert.match(
  controller,
  /params\.openCommunityHome\(nextCommunitySlug\);/,
  "the Community root should target the route-backed directory instead of General chat",
);
assert.doesNotMatch(
  controller,
  /openMobileDrawer|"community"\s*:\s*"community_selector"/,
  "the deleted community drawer path should not survive in the mobile controller",
);
assert.match(
  controller,
  /const prepareMobileGlobalNavigation = useCallback\(\(\) => \{[\s\S]*if \(params\.isThreadPageOpen\) params\.closeThreadPage\(\);[\s\S]*params\.closeDirectMessages\(\);[\s\S]*params\.setMobileOverlay\(null\);[\s\S]*params\.setMobileRootPage\("community"\);/,
  "global navigation should atomically exit threads, DMs, and transient overlays before changing routes",
);
assert.match(
  controller,
  /if \(params\.canOpenDirectMessages \|\| params\.mobileRootPage !== "messages"\) return;[\s\S]*params\.setMobileRootPage\("community"\);/,
  "a lost session should fail closed from Messages back to Community",
);
assert.doesNotMatch(
  controller,
  /TouchEvent|touches|changedTouches|rootOrder|mobileShellSwipeStartRef|nextRootPage === "threads"|nextRootPage === "members"/,
  "no primary destination should depend on hidden swipe navigation",
);

assert.match(
  topBar,
  /isCommunityHome && !hasCommunityRail \? \([\s\S]*mobile-topbar-community-home-selector[\s\S]*onClick=\{onOpenCommunitySelector\}/,
  "forced visitor roots should retain the top-left selector while the authenticated rail removes it",
);
assert.match(
  shellHost,
  /const isMobileDiscoverRoot =[\s\S]*showMobileGlobalShell[\s\S]*destination\.kind === "discover";[\s\S]*isMobileDedicatedRoot \|\| isMobileDiscoverRoot \? null/,
  "Discover should omit the mobile top bar when the authenticated community rail is present",
);
assert.match(
  shellProjection,
  /const isCommunitySettings =[\s\S]*params\.destination\.kind === "community_settings"[\s\S]*showMobileGlobalShell =[\s\S]*isCommunitySettings/,
  "community settings should be the explicit community-detail exception that retains the outer shell",
);
assert.match(
  shellProjection,
  /isGlobalSettings \|\| isCommunitySettings[\s\S]*\? "settings"/,
  "global and community settings should share the settings header presentation",
);
assert.doesNotMatch(
  topBar,
  /isDiscover|selectorLabel/,
  "the shared top bar should not retain a second Discover navigation identity",
);
assert.match(
  topBar,
  /isCommunityHome && canOpenCommunitySettings[\s\S]*mobile-topbar-settings[\s\S]*onClick=\{onOpenCommunitySettings\}/,
  "authorized community settings should occupy the top-right home action",
);

assert.match(
  topBar,
  /communityDetailLabel \? \([\s\S]*mobile-topbar-channel-label[\s\S]*<Hash aria-hidden="true" \/>[\s\S]*\{communityDetailLabel\}/,
  "mobile chat detail should put the channel name in the route-level top bar",
);
assert.match(
  topBar,
  /const showMembers =[\s\S]*isCommunityHome &&[\s\S]*!hasCommunityRail &&[\s\S]*rootPage === "community"/,
  "the authenticated rail home should move Members out of the header while preserving the visitor affordance",
);
assert.doesNotMatch(
  shellProjection,
  /isMobileVisitorCommunity|showDesktopPublicFunnelNav/,
  "public funnels must remain standalone presentation canvases",
);
assert.match(
  topBar,
  /className="mobile-topbar-members"[\s\S]*onClick=\{onOpenMembers\}/,
  "Members should have an explicit header-right affordance",
);
assert.match(
  topBar,
  /<CommunityPresenceFacepile[\s\S]*<span className="mobile-topbar-member-count">\{memberCountLabel\}<\/span>/,
  "the mobile Members affordance should keep its total member count visible when presence faces render",
);
assert.doesNotMatch(
  topBar,
  /<CommunityPresenceFacepile\s[\s\S]{0,240}onlineCount=/,
  "the compact header facepile should not duplicate the separate visible total with its own overflow count",
);

assert.match(
  app,
  /activeCommunityMemberCount:[\s\S]*communityDirectoryMemberCount \?\?[\s\S]*activeCommunityPresenceSummary\?\.member_count \?\?[\s\S]*null/,
  "the header count should use canonical directory or presence membership totals",
);
assert.doesNotMatch(
  topBar,
  /onlineCount|onlineCountLabel|online`/,
  "the mobile Members affordance should not present online presence as total membership",
);
assert.match(
  topBar,
  /function formatMemberCount[\s\S]*return count\.toLocaleString\(\);/,
  "the mobile Members affordance should show the full localized membership total",
);
assert.match(
  indexCss,
  /\.mobile-topbar-member-count\s*\{[\s\S]*?font-size:\s*11px;[\s\S]*?text-overflow:\s*ellipsis;/,
  "the visible Members count should retain compact header typography and safe truncation",
);
assert.match(
  topBar,
  /isThreadPage \? \([\s\S]*mobile-topbar-context-label">Thread<[\s\S]*: isAgent \? \(/,
  "the mobile thread page should replace the community selector with a dedicated Thread title",
);
assert.match(
  shellChromeProps,
  /isThreadPage: params\.mobileThreadPageOpen,[\s\S]*showBackButton:[\s\S]*params\.mobileThreadPageOpen[\s\S]*isMobileCommunityDetail,[\s\S]*onBack: params\.mobileThreadPageOpen[\s\S]*params\.handleCloseMobileThreadPage[\s\S]*params\.openCommunityHome/,
  "the shared mobile header should own thread and community-detail Back navigation",
);
assert.doesNotMatch(
  topBar,
  /mobile-root-pager|mobile-topbar-mode|onSelectRootPage|onStartNewThread/,
  "the header should not duplicate rail navigation or revive Workspace thread controls",
);

assert.match(
  bottomRail,
  /import \{ House, MessageCircle, Sparkles \} from "lucide-react";/,
  "the rail should use the shared icon library",
);
assert.match(
  bottomRail,
  /<House className="mobile-bottom-rail-community-base" aria-hidden="true" \/>[\s\S]*mobile-bottom-rail-ai\$\{activeRoot === "agent" \? " active" : ""\}[\s\S]*aria-current=\{activeRoot === "agent" \? "page" : undefined\}[\s\S]*onClick=\{\(\) => communityShell\.onSelectMobileRootPage\("agent"\)\}[\s\S]*<Sparkles aria-hidden="true" \/>[\s\S]*<MessageCircle aria-hidden="true" \/>/,
  "Community, centered AI, and Messages should render in that order",
);
assert.match(
  bottomRail,
  /aria-label=\{[\s\S]*hasCommunityAttention \? "Community, updates available" : "Community"[\s\S]*\}[\s\S]*aria-label="Open Polynet AI"[\s\S]*: "Messages"/,
  "the icon-only rail should retain accessible names for all three actions",
);
assert.doesNotMatch(
  bottomRail,
  /<span>Community<\/span>|<span>AI<\/span>|<span>Messages<\/span>/,
  "the mobile rail should not render visible text labels",
);
assert.match(
  bottomRail,
  /activeRoot === "agent"|aria-current=\{activeRoot === "agent"/,
  "AI should own the selected page state while its root is active",
);
assert.doesNotMatch(
  bottomRail,
  /function RailIcon|<svg/,
  "the rail should not maintain a parallel handcrafted icon system",
);
assert.match(
  bottomRail,
  /disabled=\{!communityShell\.canOpenDirectMessages\}[\s\S]*onClick=\{\(\) => communityShell\.onSelectMobileRootPage\("messages"\)\}/,
  "Messages should expose signed-out unavailability",
);
assert.doesNotMatch(
  bottomRail,
  /name="discover"|name="more"|>Discover<|>More</,
  "Discover and Settings should not consume primary rail slots",
);

assert.match(
  communityShell,
  /mobile-community-selector-name">Discover<[\s\S]*mobile-community-selector-name">Create</,
  "Discover and Create should live in the community selector",
);
assert.doesNotMatch(
  communityShell,
  /mobile-community-selector-name">Messages</,
  "Messages should not be duplicated inside the community selector",
);
assert.match(
  communityShell,
  /communityShell\.onOpenCommunityHome\(nextCommunitySlug\)/,
  "community switching should land on the selected community home",
);
assert.doesNotMatch(
  communityShell,
  /<CommunityNav|mobile-community-drawer|mobileOverlay === "community"/,
  "the community directory should no longer be duplicated inside a drawer",
);
assert.match(
  mobileGlobalShell + shellHost + communityNavSurface + communityRail,
  /mobile-global-shell[\s\S]*WebCommunityRail[\s\S]*presentation="mobile-shell"[\s\S]*WebCommunityNavSurface[\s\S]*presentation="mobile-home"[\s\S]*<CommunityNav/,
  "one global mobile frame should compose the canonical community rail and CommunityNav adapter",
);
assert.match(
  communityRail,
  /presentation: "desktop" \| "mobile-shell";[\s\S]*isMobileShell[\s\S]*communityShell\.forceMobileCommunityRoot[\s\S]*onOpenCommunityHome\(communitySlug\)/,
  "one canonical rail should serve desktop and authenticated global mobile roots while failing closed for visitor roots",
);
assert.match(
  communityRail,
  /const bindings = isMobileShell[\s\S]*\? null[\s\S]*getCommunityRailItemBindings[\s\S]*!isMobileShell && communityShell\.canReorderCommunities/,
  "mobile community switching should not inherit desktop drag reordering",
);
assert.match(
  communityNavSurface,
  /const hasDestinationSelection =[\s\S]*!isMobileHome &&[\s\S]*webDestinationHasCommunityNavSelection\(communityShell\.destination\)[\s\S]*hideIdentitySettings=\{isMobileHome\}[\s\S]*activeSelectionMode=\{hasDestinationSelection \? "route" : "none"\}[\s\S]*onReorderChannels=\{[\s\S]*isMobileHome \? undefined : communityShell\.onReorderCommunityChannels[\s\S]*\}/,
  "mobile home should keep community identity without claiming an active destination or exposing reorder controls",
);
assert.match(
  communityNav,
  /activeSelectionMode = "route"[\s\S]*const showActiveSelection = activeSelectionMode === "route"[\s\S]*const isSelected =[\s\S]*showActiveSelection &&[\s\S]*communityTab === "chat"/,
  "the shared navigation should distinguish an actual route selection from the mobile directory's no-selection state",
);
assert.doesNotMatch(communityNavSurface, /onOpenMembers=|memberCount=/, "Members page navigation is retired");
assert.doesNotMatch(communityNav, /community-nav-members/, "no duplicate Members tab remains");


assert.doesNotMatch(
  shellProjection + shellChromeProps + shellHost + communityNavSurface + communityRail,
  /activeView/,
  "mobile shell consumers should not reconstruct destination semantics from activeView",
);

assert.doesNotMatch(communityHost, /WebCommunityMembersPanel/, "member management belongs to the roster");
assert.doesNotMatch(
  chatPanel,
  /mobileMembersOverlayOpen|mobile-members-drawer/,
  "chat must not retain authenticated Members overlay ownership",
);
assert.match(
  shellHost,
  /const isMobileDedicatedRoot =[\s\S]*mobileRootPage === "agent"[\s\S]*mobileRootPage === "messages"[\s\S]*const isMobileCommunityHome =[\s\S]*destination\.kind === "community_home"[\s\S]*const showMobileGlobalShell =[\s\S]*!props\.communityShell\.forceMobileCommunityRoot[\s\S]*<WebMobileGlobalShell/,
  "AI, Messages, Discover, Settings, and the community directory should share one global mobile frame",
);
assert.match(
  shellProjection,
  /const showMobileShell = showMobileAppShell;[\s\S]*const showMobileGlobalShell =[\s\S]*showMobileAppShell &&[\s\S]*params\.mobileRootPage !== "community"[\s\S]*!isCommunityAppDestination[\s\S]*params\.destination\.kind === "community_home"/,
  "the route projection should frame global roots while leaving community detail routes focused",
);
assert.match(
  shellChromeProps,
  /onOpenDiscover: \(\) => \{[\s\S]*prepareMobileGlobalNavigation[\s\S]*handleOpenDiscover[\s\S]*onOpenCommunityHome: \(communitySlug\) => \{[\s\S]*prepareMobileGlobalNavigation[\s\S]*openCommunityHome\(communitySlug\)[\s\S]*onOpenGlobalSettings: \(\) => \{[\s\S]*prepareMobileGlobalNavigation[\s\S]*handleOpenGlobalSettings/,
  "global rail actions should dismiss dedicated mobile roots before navigating",
);
assert.equal(
  existsSync("apps/web/src/components/WebMobileCommunityHome.tsx"),
  false,
  "the Community-Home-only shell wrapper should stay deleted",
);

assert.match(
  memberAgentDock,
  /mobileShellActive\?: boolean;[\s\S]*mobileRoot\?: boolean;[\s\S]*Boolean\(props\.mobileShellActive && props\.mobileRoot\)[\s\S]*props\.mobileRoot \? " mobile-root"/,
  "the existing member-agent should support controlled mobile-root presentation",
);
// The floating dock and its close action are retired: the Agent page is a page.
assert.doesNotMatch(memberAgentDock, /aria-label="Close"/, "the retired floating dock close action stays gone");
assert.match(
  memberAgentDockCss,
  /\.member-agent-dock\.mobile-root \{[\s\S]*var\(--mobile-bottom-rail-height\)[\s\S]*left: var\(--mobile-community-rail-width\);[\s\S]*\.member-agent-dock\.mobile-root \.member-agent-dock-panel \{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*border-radius: var\(--community-shell-radius\);/,
  "the member-agent root should fit the canonical framed surface beside the rail",
);
assert.match(
  directMessagesHost,
  /mobileRoot\?: boolean;[\s\S]*if \(!isOpen \|\| props\.mobileRoot\) return;[\s\S]*web-direct-messages-host\$\{props\.mobileRoot \? " mobile-root" : ""\}/,
  "DM root presentation should preserve the desktop host while disabling popover dismissal",
);
assert.match(rosterPanel, /useWebMemberDirectorySearch/, "right panel preserves community-wide search");

assert.match(
  interactionProjection,
  /const isMobileThreadPage = Boolean\(props\.mobileThreadPage && selectedRoot && !props\.profilePanel\);[\s\S]*const ThreadSurface = isMobileThreadPage \? "section" : "aside";[\s\S]*community-interaction-thread-page/,
  "mobile replies should reuse the canonical thread body as a page while desktop keeps its aside",
);
assert.match(
  chatPanel,
  /mainComposer=\{interactionProjection\.mobileThreadPage \? null : mainCommunityComposer\}[\s\S]*drawerComposer=\{drawerReplyComposer\}/,
  "the mobile thread page should mount only the reply composer",
);
assert.equal(
  existsSync("apps/web/src/components/WebWorkspaceShellPanels.tsx"),
  false,
  "the mobile slice must not restore retired Workspace panels",
);
assert.equal(
  existsSync("apps/web/src/components/WebWorkspaceShellPanelsHost.tsx"),
  false,
  "the mobile slice must not restore the retired Workspace panel host",
);
assert.doesNotMatch(
  shellChromeProps,
  /workspaceShellPanels|handleStartNewWorkspaceThreadFromShell/,
  "shell chrome must stay independent from retired Workspace panels",
);

assert.match(
  indexCss,
  /--mobile-bottom-rail-height: 54px;[\s\S]*\.mobile-bottom-rail-inner \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*align-items: center;[\s\S]*\.mobile-bottom-rail-action \{[\s\S]*height: 48px;/,
  "mobile CSS should reserve one compact three-column rail with accessible touch targets",
);
assert.match(
  indexCss,
  /--mobile-community-rail-width: 60px;[\s\S]*\.mobile-global-shell \{[\s\S]*grid-template-columns: var\(--mobile-community-rail-width\) minmax\(0, 1fr\);[\s\S]*\.mobile-global-shell-surface \{[\s\S]*border: 1px solid var\(--community-shell-stroke\);[\s\S]*border-radius: var\(--community-shell-radius\);/,
  "authenticated global roots should preserve a narrow rail around one inset framed surface",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell\.mobile-global-shell-active \.discover-hero \{[\s\S]*padding-top: 18px;/,
  "Discover should reclaim the header space after its redundant selector is removed",
);
assert.match(
  indexCss,
  /\.mobile-community-home\.has-community-rail \.community-nav \.nav-item \{[\s\S]*min-height: 44px;[\s\S]*\.mobile-bottom-rail\.has-community-rail \{[\s\S]*--mobile-bottom-rail-surface: var\(--surface-rail\);[\s\S]*left: var\(--mobile-community-rail-width\);[\s\S]*border-top-color: transparent;[\s\S]*@media \(max-width: 360px\) \{[\s\S]*--mobile-community-rail-width: 56px;/,
  "mobile directory rows and the continuous rail shell should remain compact and bounded at narrow widths",
);
assert.match(
  baseCss,
  /--accent-selection: var\(--accent-gold\);[\s\S]*--accent-agent: #a78bfa;[\s\S]*--accent-agent-strong: #8b5cf6;[\s\S]*--accent-attention: #7BAAD6;[\s\S]*--accent-global-attention: #EF4444;[\s\S]*--focus-ring:/,
  "selection, AI identity, community attention, global attention, and focus should have independent semantic roles",
);
assert.match(
  indexCss,
  /--mobile-floating-chrome-bg:\s*var\(--web-floating-chrome-surface\);[\s\S]*--web-floating-chrome-surface:\s*var\(--surface-workspace, var\(--bg-workspace\)\);[\s\S]*@supports[\s\S]*--web-floating-chrome-surface:\s*color-mix\([\s\S]*var\(--surface-workspace, var\(--bg-workspace\)\) 88%,[\s\S]*transparent[\s\S]*\.mobile-topbar-left \{[\s\S]*background: var\(--mobile-floating-chrome-bg\);[\s\S]*\.mobile-topbar-center \{[\s\S]*background: var\(--mobile-floating-chrome-bg\);[\s\S]*\.mobile-topbar-members \{[\s\S]*background: var\(--mobile-floating-chrome-bg\);/,
  "the three mobile header islands should share the canonical workspace-derived floating material",
);
assert.match(
  bottomRail,
  /<House className="mobile-bottom-rail-community-base" aria-hidden="true" \/>[\s\S]*<House className="mobile-bottom-rail-community-cutout" aria-hidden="true" \/>/,
  "the active Home state should reuse canonical House geometry with a dedicated cutout layer",
);
assert.match(
  indexCss,
  /\.mobile-bottom-rail-action\.active \{[\s\S]*color: var\(--text-primary\);[\s\S]*\.mobile-bottom-rail-action\.active \.mobile-bottom-rail-icon-wrap > svg \{[\s\S]*fill: currentColor;[\s\S]*\.mobile-bottom-rail-community-cutout \{[\s\S]*position: absolute;[\s\S]*display: none;[\s\S]*\.mobile-bottom-rail-community\.active \.mobile-bottom-rail-icon-wrap > \.mobile-bottom-rail-community-cutout \{[\s\S]*display: block;[\s\S]*fill: none;[\s\S]*\.mobile-bottom-rail-community\.active \.mobile-bottom-rail-community-cutout > path:first-child \{[\s\S]*fill: var\(--mobile-bottom-rail-surface\);[\s\S]*stroke: var\(--mobile-bottom-rail-surface\);[\s\S]*\.mobile-bottom-rail-unread \{[\s\S]*background: var\(--accent-global-attention\);[\s\S]*\.mobile-bottom-rail-dot \{[\s\S]*border: 2px solid var\(--mobile-bottom-rail-surface\);[\s\S]*background: var\(--accent-global-attention\);/,
  "routine selection should use solid white icon forms while outer-context attention uses the global red role",
);
assert.match(
  indexCss,
  /\.mobile-bottom-rail-ai \{[\s\S]*color: var\(--accent-selection\);[\s\S]*\.mobile-bottom-rail-ai\.active \{[\s\S]*color: var\(--accent-selection\);[\s\S]*\.mobile-bottom-rail-ai-icon \{[\s\S]*width: 28px;[\s\S]*height: 28px;[\s\S]*display: inline-flex;[\s\S]*\.mobile-bottom-rail-ai-icon svg \{[\s\S]*fill: none;[\s\S]*stroke: currentColor;[\s\S]*\.mobile-bottom-rail-ai\.active \.mobile-bottom-rail-ai-icon svg \{[\s\S]*fill: currentColor;/,
  "AI should inherit the active theme accent while switching from an outline to a selected fill",
);
assert.doesNotMatch(
  indexCss,
  /\.mobile-bottom-rail-ai-icon \{[^}]*(?:background|border|box-shadow):/,
  "AI should not regain a persistent tile, border, or glow",
);
assert.doesNotMatch(
  indexCss,
  /\.mobile-bottom-rail-ai \{[^}]*height:|\.mobile-bottom-rail-ai \{[^}]*padding|\.mobile-bottom-rail-ai-icon \{[^}]*margin-top:/,
  "the AI action should share the rail geometry instead of being pulled upward",
);
assert.match(
  indexCss,
  /\.mobile-bottom-rail-ai\.active/,
  "AI should fill only through the shared selected-root state",
);
assert.match(
  shellState,
  /const \[mobileChromeReadingMode, setMobileChromeReadingMode\] = useState\(false\);/,
  "the shell-state owner should retain the mobile reading-mode lifecycle",
);
assert.match(
  app,
  /const mobileChromeAutoHideEnabled = Boolean\([\s\S]*activePage === "community"[\s\S]*communityTab === "chat"[\s\S]*mobileRootPage === "community"[\s\S]*const mobileChromeScrollTrackingEnabled = Boolean\([\s\S]*!mobileOverlay[\s\S]*onMobileReadingModeChange: mobileChromeScrollTrackingEnabled[\s\S]*setMobileChromeReadingMode/,
  "mobile reading mode should be enabled only for the bottom-anchored Community chat root",
);
assert.match(
  interactionProjection,
  /advanceMobileReadingMode[\s\S]*beginMobileReadingModeGesture[\s\S]*suppressProgrammaticMobileScroll[\s\S]*requestAnimationFrame\(processFeedScroll\)[\s\S]*onTouchStart=\{handleFeedTouchStart\}/,
  "the feed should batch scroll evaluation and bind transitions to physical touch gestures",
);
assert.match(
  mobileReadingModePolicy,
  /hideTravelPx: 36[\s\S]*showTravelPx: 8[\s\S]*bottomLockEnterPx: 96[\s\S]*bottomLockExitPx: 160[\s\S]*scrollSettleMs: 240[\s\S]*directionAnchorScrollTop[\s\S]*travelDirection[\s\S]*programmaticLockedUntilMs/,
  "reading mode should use directional hysteresis, bottom locking, and programmatic suppression",
);
assert.match(
  indexCss,
  /mobile-chrome-auto-hide \.community-chat \.community-channel-pinned-root,[\s\S]*max-block-size 180ms[\s\S]*mobile-reading-mode \.community-chat \.community-channel-pinned-root,[\s\S]*max-block-size: 0;/,
  "the pinned surface should collapse with the rest of the mobile reading chrome",
);
assert.match(
  interactionProjection,
  /new ResizeObserver\(syncComposerHeight\)[\s\S]*isMainComposerFocusedRef\.current = true;[\s\S]*forceMobileReadingMode\(false\);/,
  "composer focus should force chrome visible while its measured overlay preserves feed space",
);
assert.match(
  shellClassNames,
  /params\.mobileChromeAutoHideEnabled \? " mobile-chrome-auto-hide"[\s\S]*params\.mobileChromeReadingMode \? " mobile-reading-mode"/,
  "the shell root should expose explicit enabled and active reading-mode states",
);
assert.match(
  indexCss,
  /\.app-root\.mobile-shell\.mobile-chrome-auto-hide \.community-chat \.community-interaction-main-composer \{[\s\S]*position: absolute;[\s\S]*\.app-root\.mobile-shell\.mobile-reading-mode \.mobile-topbar \{[\s\S]*translateY[\s\S]*\.app-root\.mobile-shell\.mobile-reading-mode \.mobile-bottom-rail \{[\s\S]*translateY\(100%\)[\s\S]*\.app-root\.mobile-shell\.mobile-reading-mode \.community-chat \.community-interaction-main-composer \{[\s\S]*pointer-events: none;[\s\S]*@media \(prefers-reduced-motion: reduce\)/,
  "reading mode should clear both rails and the composer while preserving the feed scroll state",
);
assert.match(
  indexCss,
  /mobile-reading-mode \.community-chat \.community-channel-header \{[^}]*flex-basis: 0;[^}]*height: 0;[^}]*min-height: 0;/,
  "mobile reading mode should release the hidden top bar's feed clearance",
);
assert.match(
  topBar,
  /import \{ ArrowLeft,[^}]*\} from "lucide-react";[\s\S]*<ArrowLeft aria-hidden="true" \/>/,
  "thread navigation should use the canonical shafted Back icon",
);

assert.doesNotMatch(
  topBar,
  /mobile-topbar-member-faces|mobile-topbar-member-face/,
  "the mobile header must not maintain a bespoke profile-picture container",
);
assert.match(
  indexCss,
  /\.mobile-bottom-rail-action:focus-visible \{[\s\S]*var\(--focus-ring\)[\s\S]*\.mobile-bottom-rail-action:disabled \{/,
  "rail controls should expose keyboard focus and unavailable states",
);
assert.doesNotMatch(
  indexCss,
  /--mobile-nav-accent|#ff3b93/,
  "the mobile shell should not collapse all roles into the old pink fallback",
);
assert.match(
  indexCss,
  /\.mobile-community-menu \{[\s\S]*left: var\(--mobile-topbar-side-inset\);/,
  "the selector sheet should be anchored to the top-left community trigger",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell \.community-chat \.community-channel-header \{[\s\S]*flex:\s*0 0 var\(--mobile-topbar-clearance\);[\s\S]*height:\s*var\(--mobile-topbar-clearance\);[\s\S]*\.community-channel-header-identity \{[\s\S]*clip:\s*rect\(0, 0, 0, 0\);[\s\S]*\.community-channel-header-actions \{[\s\S]*position:\s*fixed;/,
  "mobile chat should reserve one top band, remove the duplicate channel title, and retain manager actions",
);
assert.match(
  indexHtml,
  /name="viewport" content="[^"]*viewport-fit=cover[^"]*interactive-widget=resizes-content[^"]*"/,
  "the web viewport should expose iPhone safe areas and resize content around the software keyboard",
);
assert.match(
  indexCss + baseCss,
  /:has\(\.community-chat \.chat-input-bar:focus-within\) \.mobile-bottom-rail \{[\s\S]*transform:\s*translateY\(100%\);[\s\S]*\.community-interaction-main-composer:focus-within \.chat-input-bar \{[\s\S]*margin-bottom:\s*calc\(env\(safe-area-inset-bottom, 0px\) \+ 8px\);/,
  "focused chat composers should reclaim the bottom rail while retaining safe-area spacing",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell \.community-chat \.chat-input-bar \{[\s\S]*var\(--mobile-bottom-rail-height\)/,
  "the community composer should reserve the shared rail height",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell \.community-chat \.mobile-thread-page-open \.community-interaction-main \{[\s\S]*display: none;[\s\S]*\.community-interaction-thread-page \{[\s\S]*width: 100%;[\s\S]*\.community-interaction-thread-page \.community-interaction-drawer-scroll \{[\s\S]*flex: 1 1 auto;[\s\S]*\.community-interaction-thread-page \.community-interaction-drawer-composer \{[\s\S]*var\(--mobile-bottom-rail-height\)/,
  "the thread page should fill mobile width, own the scroll region, and anchor its composer above the rail",
);
assert.match(
  baseCss,
  /\.web-direct-messages-host\.mobile-root \.community-dm-panel \{[\s\S]*var\(--mobile-bottom-rail-height\)[\s\S]*left: var\(--mobile-community-rail-width\);[\s\S]*border-radius: var\(--community-shell-radius\);/,
  "Messages root should fit the canonical framed surface beside the rail",
);
assert.doesNotMatch(
  indexCss + baseCss,
  /mobile-root-pager|mobile-topbar-mode|mobile-threads-root-shell|community-mobile-members-root/,
  "obsolete root-page chrome should stay deleted",
);
assert.match(
  packageJson,
  /"check:mobile-root-navigation-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/mobile_root_navigation_contract_proof\.ts"/,
  "package scripts should expose the mobile navigation proof",
);

console.log("mobile_root_navigation_contract_proof: ok");
