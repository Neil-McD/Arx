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
  "mobile root page should model the four root-level mobile pages explicitly",
);
assert.match(
  app,
  /const \[mobileRootPage, setMobileRootPage\] = useState<MobileRootPage>\("agent"\);/,
  "mobile shell should start on the Agent root page",
);
assert.match(
  app,
  /showMobileShell && mobileRootPage === "threads" \? \([\s\S]*mobileThreadsRootSurface[\s\S]*\) : \(/,
  "mobile Threads should render as a root surface instead of only as a drawer",
);
assert.match(
  app,
  /mobileContextOnly: showMobileShell && mobileRootPage === "members"/,
  "mobile Members should render the community context rail as the root community surface",
);
assert.match(
  app,
  /canViewMembersRoot: hasSelectedCommunity && canViewMembersActiveCommunity/,
  "mobile controller should expose Members only when the current member can view the member surface",
);
assert.match(
  app,
  /forceCommunityRoot:[\s\S]*showMobileShell[\s\S]*shellPublicRoute\.kind === "community_funnel"[\s\S]*shellPublicRoute\.kind === "community_funnel_preview"/,
  "mobile public community routes should force the Community root instead of inheriting the Agent default",
);
assert.match(
  controller,
  /const rootOrder: MobileRootPage\[\] = params\.forceCommunityRoot[\s\S]*\? \["community"\][\s\S]*: params\.canViewMembersRoot[\s\S]*\? \["threads", "agent", "community", "members"\][\s\S]*: \["threads", "agent", "community"\];/,
  "mobile swipe order should be Threads, Agent, Community, Members when a community exists",
);
assert.match(
  controller,
  /const openMobileCommunitySurface = useCallback\(\(\) => \{[\s\S]*params\.openCommunityChat\(nextCommunitySlug, \{ clearUnread: true \}\);[\s\S]*params\.handleOpenDiscover\(\);[\s\S]*if \(params\.forceCommunityRoot\) \{[\s\S]*params\.setMobileRootPage\("community"\);[\s\S]*return;[\s\S]*if \(nextRootPage === "members"\) \{[\s\S]*if \(!params\.canViewMembersRoot\) \{[\s\S]*params\.setMobileRootPage\("community"\);[\s\S]*openMobileCommunitySurface\(\);[\s\S]*params\.setMobileRootPage\("members"\);/,
  "Members root should fail back to Community without a selected community and open the community surface otherwise",
);
assert.match(
  controller,
  /const openMobileDrawer = useCallback\(\(\) => \{[\s\S]*if \(params\.forceCommunityRoot\) \{[\s\S]*params\.setMobileOverlay\("community"\);[\s\S]*return;/,
  "forced public-community roots should open the community panel instead of Agent or Threads drawer logic",
);
assert.match(
  topBar,
  /const isAgentModeActive = rootPage === "agent" \|\| rootPage === "threads";[\s\S]*const isRightModeActive = forceCommunityRoot \|\| rootPage === "community" \|\| rootPage === "members";/,
  "mobile topbar should keep the old Agent/Community segmented slider while mapping Threads to Agent and Members to Community",
);
assert.match(
  topBar,
  /<div className="mobile-topbar-center" role="tablist" aria-label="View mode">[\s\S]*className=\{`mobile-topbar-mode\$\{isAgentModeActive \? " active" : ""\}`\}[\s\S]*Agent[\s\S]*className=\{`mobile-topbar-mode\$\{isRightModeActive \? " active" : ""\}`\}[\s\S]*\{rightModeLabel\}/,
  "mobile topbar center should render the previous two-button segmented control, not the root-page dot pager",
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
assert.match(
  workspacePanels,
  /export function WebMobileThreadsRootSurface[\s\S]*aria-label="Threads"[\s\S]*className="thread-sidebar-panel mobile-threads-root-panel"/,
  "Threads root should reuse the workspace thread sidebar inside an explicit mobile root panel",
);
assert.match(
  workspacePanelHost,
  /export function WebMobileThreadsRootSurfaceHost/,
  "Threads root should have a state host like the existing drawer shell",
);
assert.match(
  chatPanel,
  /mobileContextOnly\?: boolean;[\s\S]*if \(mobileContextOnly\) \{[\s\S]*<CommunityInteractionContextPanelSurface/,
  "community chat panel should support a mobile context-only Members root",
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
assert.doesNotMatch(
  indexCss,
  /mobile-root-pager|mobile-topbar-root-title/,
  "mobile topbar CSS should not keep the replacement root-page title/dot UI",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell \.community-mobile-members-root/,
  "mobile Members root should override the hidden desktop context rail layout",
);
assert.match(
  packageJson,
  /"check:mobile-root-navigation-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/mobile_root_navigation_contract_proof\.ts"/,
  "package scripts should expose the mobile root navigation contract proof",
);

console.log("mobile_root_navigation_contract_proof: ok");
