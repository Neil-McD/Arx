import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const shared = read("apps/web/src/components/webShellChromeShared.ts");
const controller = read("apps/web/src/controllers/useWebMobileShellController.ts");
const topBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const workspacePanels = read("apps/web/src/components/WebWorkspaceShellPanels.tsx");
const workspacePanelHost = read("apps/web/src/components/WebWorkspaceShellPanelsHost.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const interactionProjection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const indexCss = read("apps/web/src/index.css");
const baseCss = read("apps/web/src/base.css");
const packageJson = read("package.json");

assert.match(
  shared,
  /export type MobileRootPage = "threads" \| "agent" \| "community" \| "members";/,
  "mobile root page should model the four root-level mobile destinations explicitly",
);
assert.match(
  shared,
  /export type MobileOverlay = "agent" \| "community" \| "community_selector" \| "members" \| null;/,
  "mobile overlay state should include Members as a drawer overlay",
);
assert.match(
  app,
  /const \[mobileRootPage, setMobileRootPage\] = useState<MobileRootPage>\("community"\);/,
  "mobile shell should start on the Community root page",
);
assert.match(
  app,
  /mobileMembersOverlayOpen: showMobileShell && mobileOverlay === "members"[\s\S]*onCloseMobileMembersOverlay: \(\) => setMobileOverlay\(null\)/,
  "mobile Members should be rendered by the community chat panel as an overlay",
);
assert.match(
  app,
  /canViewMembersRoot: hasSelectedCommunity && canViewMembersActiveCommunity/,
  "mobile controller should expose Members only when the current member can view the member surface",
);
assert.match(
  app,
  /forceCommunityRoot: showMobileShell/,
  "all reachable mobile shell routes should stay on the Community root while Workspace is quarantined",
);
assert.doesNotMatch(
  app,
  /mobileThreadsRootSurface|WebMobileThreadsRootSurfaceHost|mobileContextOnly|showMobileShell && mobileRootPage === "threads"/,
  "Threads and Members should not replace the main mobile surface with standalone root-page content",
);
assert.match(
  controller,
  /const rootOrder: MobileRootPage\[\] = params\.forceCommunityRoot[\s\S]*\? \["community"\][\s\S]*: params\.canViewMembersRoot[\s\S]*\? \["threads", "agent", "community", "members"\][\s\S]*: \["threads", "agent", "community"\];/,
  "mobile swipe order should be Threads, Agent, Community, Members when a community exists",
);
assert.match(
  controller,
  /if \(nextRootPage === "threads"\) \{[\s\S]*params\.setMobileRootPage\("agent"\);[\s\S]*params\.setMobileOverlay\("agent"\);[\s\S]*return;/,
  "mobile Threads should open the Agent-side thread drawer over the current Agent surface",
);
assert.match(
  controller,
  /if \(nextRootPage === "members"\) \{[\s\S]*if \(!params\.canViewMembersRoot\) \{[\s\S]*params\.setMobileOverlay\(null\);[\s\S]*params\.setMobileRootPage\("community"\);[\s\S]*openMobileCommunitySurface\(\);[\s\S]*params\.setMobileRootPage\("community"\);[\s\S]*params\.setMobileOverlay\("members"\);[\s\S]*return;/,
  "mobile Members should open the community surface and then overlay the Members drawer",
);
assert.match(
  controller,
  /const openMobileDrawer = useCallback\(\(\) => \{[\s\S]*if \(params\.forceCommunityRoot\) \{[\s\S]*params\.setMobileOverlay\("community"\);[\s\S]*return;[\s\S]*if \(params\.mobileRootPage === "agent" \|\| params\.mobileRootPage === "threads"\) \{[\s\S]*params\.setMobileOverlay\("agent"\);[\s\S]*return;/,
  "mobile drawer button should open the community drawer on forced community routes and the Agent drawer on Agent/Threads",
);
assert.match(
  topBar,
  /const isAgentModeActive = rootPage === "agent" \|\| rootPage === "threads";[\s\S]*const isRightModeActive = forceCommunityRoot \|\| rootPage === "community" \|\| rootPage === "members";/,
  "mobile topbar should keep the old Agent/Community segmented slider while mapping Threads to Agent and Members to Community",
);
assert.match(
  topBar,
  /\{!forceCommunityRoot \? \([\s\S]*mobile-topbar-center[\s\S]*Agent[\s\S]*\{rightModeLabel\}[\s\S]*\) : null\}/,
  "mobile topbar must hide the obsolete Agent selector on reachable community-only routes",
);
assert.doesNotMatch(
  topBar,
  /mobile-root-pager|mobile-topbar-root-title/,
  "mobile topbar should not render the replacement root-page title/dot UI",
);
assert.match(
  topBar,
  /rootPage === "agent" && onStartNewThread/,
  "new workspace thread action should stay scoped to the Agent root page",
);
assert.doesNotMatch(
  workspacePanels,
  /WebMobileThreadsRootSurface|mobile-root-surface|mobile-threads-root/,
  "workspace panels should not export or render a standalone mobile Threads page",
);
assert.doesNotMatch(
  workspacePanelHost,
  /WebMobileThreadsRootSurface|onExitThreadsRoot/,
  "workspace panel host should only host the drawer/sidebar state path",
);
assert.match(
  chatPanel,
  /mobileMembersOverlayOpen\?: boolean;[\s\S]*onCloseMobileMembersOverlay\?: \(\) => void;/,
  "community chat panel should accept a Members overlay contract",
);
assert.match(
  chatPanel,
  /<WebMobileDrawer[\s\S]*ariaLabel="Community members"[\s\S]*side="right"[\s\S]*className="mobile-members-drawer"[\s\S]*hideHeader[\s\S]*containerClassName="community-interaction-drawer community-context-panel mobile-members-overlay-panel"/,
  "community chat panel should render Members inside a right-side mobile drawer overlay",
);
assert.doesNotMatch(
  chatPanel,
  /mobileContextOnly|community-mobile-members-root|mobile-members-root-panel/,
  "community chat panel should not keep the old mobile Members root-page path",
);
assert.match(
  interactionProjection,
  /export function CommunityInteractionContextPanelSurface[\s\S]*<CommunityContextPanel/,
  "right rail context should be reusable without duplicating member management state",
);
assert.match(
  indexCss,
  /\.mobile-topbar-center \{[\s\S]*grid-template-columns: repeat\(2, auto\);[\s\S]*border-radius: 999px;[\s\S]*\.mobile-topbar-mode\.active/,
  "mobile topbar CSS should preserve the previous two-option segmented slider styling",
);
assert.match(
  indexCss,
  /--mobile-left-panel-width: min\(74vw, 304px\);[\s\S]*\.mobile-drawer\.mobile-agent-drawer,[\s\S]*\.mobile-drawer\.mobile-community-drawer,[\s\S]*\.mobile-drawer\.mobile-members-drawer \{[\s\S]*width: var\(--mobile-left-panel-width\);/,
  "mobile drawers should share the same left-panel geometry",
);
assert.match(
  indexCss,
  /\.mobile-drawer\.mobile-members-drawer \.mobile-members-overlay-panel \{[\s\S]*height: 100%;[\s\S]*background: transparent;[\s\S]*box-shadow: none;/,
  "mobile Members drawer should let the drawer own the surface chrome",
);
assert.doesNotMatch(
  indexCss,
  /mobile-root-pager|mobile-topbar-root-title|mobile-threads-root-shell|mobile-root-page-shell/,
  "mobile CSS should not keep the replacement root-page title/dot UI or Threads page shell",
);
assert.doesNotMatch(
  baseCss,
  /community-mobile-members-root|mobile-members-root-body|mobile-members-root-panel/,
  "mobile Members should not keep standalone root-page CSS",
);
assert.match(
  packageJson,
  /"check:mobile-root-navigation-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/mobile_root_navigation_contract_proof\.ts"/,
  "package scripts should expose the mobile root navigation contract proof",
);

console.log("mobile_root_navigation_contract_proof: ok");
