import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const shared = read("apps/web/src/components/webShellChromeShared.ts");
const controller = read("apps/web/src/controllers/useWebMobileShellController.ts");
const shellHost = read("apps/web/src/components/WebShellChromeHost.tsx");
const shellChromeProps = read(
  "apps/web/src/controllers/buildWebShellChromeHostProps.ts",
);
const shellClassNames = read(
  "apps/web/src/controllers/buildWebShellChromeClassNames.ts",
);
const communityShell = read(
  "apps/web/src/components/WebMobileCommunityShell.tsx",
);
const topBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const bottomRail = read("apps/web/src/components/WebMobileBottomRail.tsx");
const presenceFacepile = read("apps/web/src/components/CommunityPresenceFacepile.tsx");
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const memberAgentDock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const memberAgentDockCss = read(
  "apps/web/src/components/WebMemberAgentDock.css",
);
const directMessagesHost = read(
  "apps/web/src/components/WebDirectMessagesHost.tsx",
);
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const interactionProjection = read(
  "apps/web/src/components/WebCommunityInteractionProjection.tsx",
);
const indexCss = read("apps/web/src/index.css");
const baseCss = read("apps/web/src/base.css");
const packageJson = read("package.json");

assert.match(
  shared,
  /export type MobileRootPage = "agent" \| "community" \| "messages";/,
  "Community, AI, and Messages should be the three persistent mobile roots",
);
assert.match(
  shared,
  /export type MobileOverlay = "community" \| "community_selector" \| "members" \| null;/,
  "community navigation, the selector, and Members should remain dismissible overlays",
);
assert.match(
  app,
  /const \[mobileRootPage, setMobileRootPage\] = useState<MobileRootPage>\("community"\);/,
  "the community-first app should keep Community as the initial mobile root",
);
assert.match(
  app,
  /const mobileThreadPageOpen = Boolean\([\s\S]*showMobileShell[\s\S]*mobileRootPage === "community"[\s\S]*selectedCommunityInteractionRootId[\s\S]*\);/,
  "a selected reply thread should become a page only inside the mobile Community root",
);
assert.match(
  app,
  /if \(!COMMUNITY_INTERACTION_PROJECTION_ENABLED \|\| !activeCommunityId\) return;[\s\S]*if \(shellVariant === "mobile"\) return;[\s\S]*readStoredInteractionSelectedRoot/,
  "mobile Community should not reopen a stale thread selection from storage",
);
assert.match(
  app,
  /mobileMembersOverlayOpen: showMobileShell && mobileOverlay === "members"[\s\S]*onCloseMobileMembersOverlay: \(\) => setMobileOverlay\(null\)/,
  "the existing Members drawer should remain the canonical mobile member surface",
);
assert.match(
  app,
  /canViewMembers:[\s\S]*hasSelectedCommunity && canViewMembersActiveCommunity[\s\S]*shellPublicRoute\.kind === "community_funnel"[\s\S]*Boolean\(resolvedPublicCommunity\)/,
  "the Members affordance should follow member capability or the public community funnel",
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
  /mobileShellActive=\{showMobileShell\}[\s\S]*mobileRoot=\{showMobileShell && mobileRootPage === "agent"\}[\s\S]*<WebDirectMessagesHost[\s\S]*mobileRoot=\{showMobileShell && mobileRootPage === "messages"\}/,
  "AI and Messages should reuse their existing surfaces as persistent mobile roots",
);
assert.match(
  app,
  /forceCommunityRoot:[\s\S]*showMobileShell[\s\S]*shellPublicRoute\.kind === "community_funnel"[\s\S]*shellPublicRoute\.kind === "community_funnel_preview"/,
  "public community funnels should remain forced to the Community root",
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
  /params\.setMobileRootPage\("community"\);[\s\S]*openMobileCommunitySurface\(\);/,
  "Community should open the selected community or fall back to Discover",
);
assert.match(
  controller,
  /if \(params\.isThreadPageOpen\) params\.closeThreadPage\(\);[\s\S]*if \(params\.forceCommunityRoot\)/,
  "selecting any persistent mobile root should exit the transient thread page first",
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
  /className="mobile-topbar-community-selector"[\s\S]*onClick=\{onOpenCommunitySelector\}/,
  "the centered community identity should own community switching and Discover access",
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
  shellChromeProps,
  /activeCommunityMemberCount: number \| null;[\s\S]*memberFaces: params\.activeCommunityMemberFaces,[\s\S]*memberCount: params\.activeCommunityMemberCount,/,
  "the mobile top bar should receive total membership independently from online faces",
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
  /isThreadPage: params\.mobileThreadPageOpen,[\s\S]*showBackButton: params\.showMobileSettingsIndex \|\| params\.mobileThreadPageOpen,[\s\S]*onBack: params\.mobileThreadPageOpen[\s\S]*params\.handleCloseMobileThreadPage/,
  "the shared mobile header should own thread Back navigation",
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
  shellHost,
  /const isMobileDedicatedRoot =[\s\S]*mobileRootPage === "agent"[\s\S]*mobileRootPage === "messages"[\s\S]*isMobileDedicatedRoot \? null : props\.mainSurface/,
  "AI and Messages should replace, not stack over, the inactive community surface",
);

assert.match(
  memberAgentDock,
  /mobileShellActive\?: boolean;[\s\S]*mobileRoot\?: boolean;[\s\S]*Boolean\(props\.mobileRoot\)[\s\S]*props\.mobileRoot \? " mobile-root"/,
  "the existing member-agent should support controlled mobile-root presentation",
);
assert.match(
  memberAgentDock,
  /\{!props\.mobileShellActive \? \([\s\S]*onClick=\{\(\) => setIsOpen\(false\)\}[\s\S]*aria-label="Close"/,
  "only the desktop agent dock should expose a close action",
);
assert.match(
  memberAgentDockCss,
  /\.member-agent-dock\.mobile-root \{[\s\S]*var\(--mobile-bottom-rail-height\)[\s\S]*\.member-agent-dock\.mobile-root \.member-agent-dock-panel \{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*border-radius: 0;/,
  "the member-agent root should fill the viewport above the persistent rail",
);
assert.match(
  directMessagesHost,
  /mobileRoot\?: boolean;[\s\S]*if \(!isOpen \|\| props\.mobileRoot\) return;[\s\S]*web-direct-messages-host\$\{props\.mobileRoot \? " mobile-root" : ""\}/,
  "DM root presentation should preserve the desktop host while disabling popover dismissal",
);
assert.match(
  chatPanel,
  /<WebMobileDrawer[\s\S]*ariaLabel="Community members"[\s\S]*side="right"[\s\S]*className="mobile-members-drawer"[\s\S]*containerClassName="community-interaction-drawer community-context-panel mobile-members-overlay-panel"/,
  "Members should reuse the existing right-side community context drawer",
);
assert.match(
  interactionProjection,
  /export function CommunityInteractionContextPanelSurface[\s\S]*<CommunityContextPanel/,
  "member context should be reused without duplicating its state",
);
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
  /--mobile-bottom-rail-height: 62px;[\s\S]*\.mobile-bottom-rail-inner \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*align-items: center;/,
  "mobile CSS should reserve one restrained three-column rail",
);
assert.match(
  baseCss,
  /--accent-selection: var\(--accent-gold\);[\s\S]*--accent-agent: #a78bfa;[\s\S]*--accent-agent-strong: #8b5cf6;[\s\S]*--accent-attention: var\(--accent-brand\);[\s\S]*--focus-ring:/,
  "selection, AI identity, attention, and focus should have independent semantic roles",
);
assert.match(
  bottomRail,
  /<House className="mobile-bottom-rail-community-base" aria-hidden="true" \/>[\s\S]*<House className="mobile-bottom-rail-community-cutout" aria-hidden="true" \/>/,
  "the active Home state should reuse canonical House geometry with a dedicated cutout layer",
);
assert.match(
  indexCss,
  /\.mobile-bottom-rail-action\.active \{[\s\S]*color: var\(--text-primary\);[\s\S]*\.mobile-bottom-rail-action\.active \.mobile-bottom-rail-icon-wrap > svg \{[\s\S]*fill: currentColor;[\s\S]*\.mobile-bottom-rail-community-cutout \{[\s\S]*position: absolute;[\s\S]*display: none;[\s\S]*\.mobile-bottom-rail-community\.active \.mobile-bottom-rail-icon-wrap > \.mobile-bottom-rail-community-cutout \{[\s\S]*display: block;[\s\S]*fill: none;[\s\S]*\.mobile-bottom-rail-community\.active \.mobile-bottom-rail-community-cutout > path:first-child \{[\s\S]*fill: color-mix[\s\S]*stroke: color-mix[\s\S]*\.mobile-bottom-rail-unread \{[\s\S]*background: var\(--accent-attention\);[\s\S]*\.mobile-bottom-rail-dot \{[\s\S]*background: var\(--accent-attention\);/,
  "routine selection should use solid white icon forms with a real Home cutout while attention retains its semantic accent",
);
assert.match(
  indexCss,
  /\.mobile-bottom-rail-ai \{[\s\S]*color: var\(--accent-agent\);[\s\S]*\.mobile-bottom-rail-ai\.active \{[\s\S]*color: var\(--accent-agent\);[\s\S]*\.mobile-bottom-rail-ai-icon \{[\s\S]*width: 28px;[\s\S]*height: 28px;[\s\S]*display: inline-flex;[\s\S]*\.mobile-bottom-rail-ai-icon svg \{[\s\S]*fill: none;[\s\S]*stroke: currentColor;[\s\S]*\.mobile-bottom-rail-ai\.active \.mobile-bottom-rail-ai-icon svg \{[\s\S]*fill: currentColor;/,
  "AI should remain violet while switching from an outline to a selected fill",
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
  app,
  /const \[mobileChromeReadingMode, setMobileChromeReadingMode\] = useState\(false\);[\s\S]*const mobileChromeAutoHideEnabled = Boolean\([\s\S]*activePage === "community"[\s\S]*communityTab === "chat"[\s\S]*mobileRootPage === "community"[\s\S]*onMobileReadingModeChange: mobileChromeAutoHideEnabled[\s\S]*setMobileChromeReadingMode/,
  "mobile reading mode should be enabled only for the bottom-anchored Community chat root",
);
assert.match(
  interactionProjection,
  /MOBILE_READING_MODE_HIDE_TRAVEL_PX = 36;[\s\S]*MOBILE_READING_MODE_SHOW_TRAVEL_PX = 12;[\s\S]*MOBILE_READING_MODE_BOTTOM_LOCK_PX = 96;[\s\S]*direction === -1[\s\S]*setMobileReadingMode\(true\)[\s\S]*direction === 1[\s\S]*setMobileReadingMode\(false\)/,
  "upward history travel should hide chrome with hysteresis while downward travel restores it quickly",
);
assert.match(
  interactionProjection,
  /new ResizeObserver\(syncComposerHeight\)[\s\S]*isMainComposerFocusedRef\.current = true;[\s\S]*setMobileReadingMode\(false\);/,
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
  "reading mode should clear both rails and the composer without shifting the scroll container",
);
assert.match(
  topBar,
  /import \{ ArrowLeft \} from "lucide-react";[\s\S]*<ArrowLeft aria-hidden="true" \/>/,
  "thread navigation should use the canonical shafted Back icon",
);
assert.match(
  presenceFacepile + contextPanel + topBar,
  /export function CommunityPresenceFacepile[\s\S]*<CommunityPresenceFacepile[\s\S]*<CommunityPresenceFacepile/,
  "the context panel and compact mobile header should share one presence facepile",
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
  /\.mobile-community-menu \{[\s\S]*left: 50%;[\s\S]*transform: translateX\(-50%\);/,
  "the selector sheet should be anchored to the centered community trigger",
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
  /\.web-direct-messages-host\.mobile-root \.community-dm-panel \{[\s\S]*bottom: calc\(var\(--mobile-bottom-rail-height\) \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*border-radius: 0;/,
  "Messages root should fill the mobile workspace above the persistent rail",
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
