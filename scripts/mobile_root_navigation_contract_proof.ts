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
const communityShell = read(
  "apps/web/src/components/WebMobileCommunityShell.tsx",
);
const topBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const bottomRail = read("apps/web/src/components/WebMobileBottomRail.tsx");
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
  "mobile root state should contain exactly the three persistent rail destinations",
);
assert.match(
  shared,
  /export type MobileOverlay = "community" \| "community_selector" \| "members" \| null;/,
  "community navigation, the selector, and Members should remain overlays",
);
assert.match(
  app,
  /const \[mobileRootPage, setMobileRootPage\] = useState<MobileRootPage>\("community"\);/,
  "the community-first app should keep Community as the initial mobile root",
);
assert.match(
  app,
  /mobileMembersOverlayOpen: showMobileShell && mobileOverlay === "members"[\s\S]*onCloseMobileMembersOverlay: \(\) => setMobileOverlay\(null\)/,
  "the existing Members drawer should remain the canonical mobile member surface",
);
assert.match(
  app,
  /canViewMembers: hasSelectedCommunity && canViewMembersActiveCommunity/,
  "the Members affordance should follow the existing community capability",
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
  "AI and Messages should reuse the current member-agent and DM surfaces as mobile roots",
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
  "AI should select the global member-agent root without reviving Workspace",
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
  /<House aria-hidden="true" \/>[\s\S]*mobile-bottom-rail-ai[\s\S]*<Sparkles aria-hidden="true" \/>[\s\S]*<MessageCircle aria-hidden="true" \/>/,
  "Community, centered AI, and Messages should render in that order",
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
  /mobileShellActive\?: boolean;[\s\S]*mobileRoot\?: boolean;[\s\S]*const isOpenSurface = props\.mobileShellActive[\s\S]*Boolean\(props\.mobileRoot\)[\s\S]*props\.mobileRoot \? " mobile-root"[\s\S]*!props\.mobileShellActive \? \(/,
  "the existing global member-agent should support controlled mobile-root presentation without a duplicate launcher",
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
  /--mobile-bottom-rail-height: 70px;[\s\S]*\.mobile-bottom-rail-inner \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  "mobile CSS should reserve one restrained three-column rail",
);
assert.match(
  baseCss,
  /--accent-selection: var\(--accent-gold\);[\s\S]*--accent-agent: #a78bfa;[\s\S]*--accent-agent-strong: #8b5cf6;[\s\S]*--accent-attention: var\(--accent-brand\);[\s\S]*--focus-ring:/,
  "selection, AI identity, attention, and focus should have independent semantic roles",
);
assert.match(
  indexCss,
  /\.mobile-bottom-rail-action\.active \{[\s\S]*color: var\(--accent-selection\);[\s\S]*\.mobile-bottom-rail-unread \{[\s\S]*background: var\(--accent-attention\);[\s\S]*\.mobile-bottom-rail-dot \{[\s\S]*background: var\(--accent-attention\);/,
  "routine selection and attention indicators should use different semantic roles",
);
assert.match(
  indexCss,
  /\.mobile-bottom-rail-ai \{[\s\S]*color: var\(--accent-agent-foreground\);[\s\S]*\.mobile-bottom-rail-ai-icon \{[\s\S]*background: var\(--accent-agent-surface\);[\s\S]*color: var\(--accent-agent\);[\s\S]*\.mobile-bottom-rail-ai\.active \.mobile-bottom-rail-ai-icon \{[\s\S]*background: var\(--accent-agent-strong\);/,
  "AI should retain a fixed violet identity independent of theme selection",
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
