import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const shared = read("apps/web/src/components/webShellChromeShared.ts");
const controller = read("apps/web/src/controllers/useWebMobileShellController.ts");
const shellHost = read("apps/web/src/components/WebShellChromeHost.tsx");
const communityShell = read("apps/web/src/components/WebMobileCommunityShell.tsx");
const topBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const bottomRail = read("apps/web/src/components/WebMobileBottomRail.tsx");
const directMessagesHost = read("apps/web/src/components/WebDirectMessagesHost.tsx");
const workspacePanels = read("apps/web/src/components/WebWorkspaceShellPanels.tsx");
const workspacePanelHost = read("apps/web/src/components/WebWorkspaceShellPanelsHost.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const interactionProjection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
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
  /export type MobileOverlay = "agent" \| "community" \| "community_selector" \| "members" \| null;/,
  "threads, community navigation, the selector, and Members should remain overlays",
);
assert.match(
  app,
  /const \[mobileRootPage, setMobileRootPage\] = useState<MobileRootPage>\("agent"\);/,
  "mobile shell should start on personal AI",
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
  /mobileRoot=\{showMobileShell && mobileRootPage === "messages"\}/,
  "the existing DM host should use root presentation only when Messages is the active mobile destination",
);
assert.match(
  app,
  /forceCommunityRoot:[\s\S]*showMobileShell[\s\S]*shellPublicRoute\.kind === "community_funnel"[\s\S]*shellPublicRoute\.kind === "community_funnel_preview"/,
  "mobile public community routes should keep their forced Community shell",
);

assert.match(
  controller,
  /if \(nextRootPage === "messages"\) \{[\s\S]*if \(!params\.canOpenDirectMessages\) return;[\s\S]*params\.setMobileOverlay\(null\);[\s\S]*params\.setMobileRootPage\("messages"\);[\s\S]*params\.openDirectMessages\(\);/,
  "Messages should be a first-class mobile root backed by the existing DM host",
);
assert.match(
  controller,
  /if \(params\.canOpenDirectMessages \|\| params\.mobileRootPage !== "messages"\) return;[\s\S]*params\.setMobileRootPage\("agent"\);/,
  "a lost session should fail closed from Messages back to AI",
);
assert.match(
  controller,
  /if \(params\.isDirectMessagesOpen && params\.canOpenDirectMessages\) \{[\s\S]*params\.setMobileRootPage\("messages"\);/,
  "DM synchronization should not reopen Messages after authentication is lost",
);
assert.match(
  controller,
  /if \(nextRootPage === "agent"\) \{[\s\S]*params\.setMobileRootPage\("agent"\);[\s\S]*params\.handleTopbarBackToWorkspace\(\);/,
  "AI should route through the canonical workspace surface",
);
assert.match(
  controller,
  /params\.setMobileRootPage\("community"\);[\s\S]*openMobileCommunitySurface\(\);/,
  "Community should open the selected community or fall back to Discover",
);
assert.doesNotMatch(
  controller,
  /TouchEvent|touches|changedTouches|rootOrder|mobileShellSwipeStartRef|nextRootPage === "threads"|nextRootPage === "members"/,
  "no primary destination should depend on hidden horizontal swipe navigation",
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
  /isAgent && onStartNewThread[\s\S]*className="new-session-header-btn mobile-topbar-new-thread"/,
  "new thread should remain contextual to personal AI",
);
assert.doesNotMatch(
  topBar,
  /mobile-root-pager|mobile-topbar-mode|onSelectRootPage/,
  "the header should not duplicate primary rail navigation",
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
  "Messages should route through the mobile state contract and expose signed-out unavailability",
);
assert.doesNotMatch(
  bottomRail,
  /name="discover"|name="more"|>Discover<|>More</,
  "Discover and Settings should not consume primary rail slots",
);
assert.match(
  bottomRail,
  /communityShell\.forceMobileCommunityRoot[\s\S]*return null;/,
  "the authenticated rail should stay off forced public funnel surfaces",
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
  /const isMobileMessagesRoot =[\s\S]*communityShell\.mobileRootPage === "messages";[\s\S]*isMobileMessagesRoot \? null : \([\s\S]*isMobileMessagesRoot \? null : props\.mainSurface/,
  "Messages should use its own header and hide the inactive root beneath it",
);

assert.match(
  directMessagesHost,
  /mobileRoot\?: boolean;[\s\S]*if \(!isOpen \|\| props\.mobileRoot\) return;[\s\S]*web-direct-messages-host\$\{props\.mobileRoot \? " mobile-root" : ""\}/,
  "DM root presentation should disable popover outside-click dismissal while preserving the desktop host",
);
assert.match(
  chatPanel,
  /<WebMobileDrawer[\s\S]*ariaLabel="Community members"[\s\S]*side="right"[\s\S]*className="mobile-members-drawer"[\s\S]*containerClassName="community-interaction-drawer community-context-panel mobile-members-overlay-panel"/,
  "Members should reuse the existing right-side community context drawer",
);
assert.match(
  interactionProjection,
  /export function CommunityInteractionContextPanelSurface[\s\S]*<CommunityContextPanel/,
  "member context should be reused without duplicating its data or management state",
);
assert.doesNotMatch(
  workspacePanels + workspacePanelHost,
  /WebMobileThreadsRootSurface|mobile-threads-root|onExitThreadsRoot/,
  "Threads should remain a drawer rather than a fourth root surface",
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
  "AI should retain a fixed violet identity independent of the selected theme",
);
assert.match(
  indexCss,
  /\.mobile-bottom-rail-action:focus-visible \{[\s\S]*var\(--focus-ring\)[\s\S]*\.mobile-bottom-rail-action:disabled \{/,
  "rail controls should expose keyboard focus and unavailable states",
);
assert.doesNotMatch(
  indexCss,
  /--mobile-nav-accent|#ff3b93/,
  "the mobile shell should not collapse selection, AI identity, and attention into the old pink fallback",
);
assert.match(
  indexCss,
  /\.mobile-topbar-members \{[\s\S]*\.mobile-topbar-member-faces \{[\s\S]*\.mobile-topbar-member-count \{/,
  "the mobile header should support member faces and a compact member count",
);
assert.match(
  indexCss,
  /\.mobile-community-menu \{[\s\S]*left: 50%;[\s\S]*transform: translateX\(-50%\);/,
  "the selector sheet should be anchored to the centered community trigger",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell \.workspace-composer-shell \{[\s\S]*var\(--mobile-bottom-rail-height\)[\s\S]*\.app-root\.mobile-shell \.community-chat \.chat-input-bar \{[\s\S]*var\(--mobile-bottom-rail-height\)/,
  "personal AI and community composers should reserve the shared rail height",
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
