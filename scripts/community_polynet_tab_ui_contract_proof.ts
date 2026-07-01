import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const controller = readFileSync(join(root, "apps/web/src/controllers/useWebCommunityPolynetController.ts"), "utf8");
const section = readFileSync(join(root, "apps/web/src/components/WebCommunityPolynetSection.tsx"), "utf8");
const gateway = readFileSync(join(root, "shared/cloudCommunityPolynetGateway.ts"), "utf8");
const activeCommunityShell = readFileSync(join(root, "apps/web/src/controllers/useWebActiveCommunityShellController.ts"), "utf8");
const contextPanel = readFileSync(join(root, "apps/web/src/components/CommunityContextPanel.tsx"), "utf8");
const interactionProjection = readFileSync(join(root, "apps/web/src/components/WebCommunityInteractionProjection.tsx"), "utf8");
const communityNav = readFileSync(join(root, "shared/CommunityNav.tsx"), "utf8");
const desktopChrome = readFileSync(join(root, "apps/web/src/components/WebShellChromeHost.tsx"), "utf8");
const mobileShell = readFileSync(join(root, "apps/web/src/components/WebMobileCommunityShell.tsx"), "utf8");
const app = readFileSync(join(root, "apps/web/src/App.tsx"), "utf8");
const surfaceProjection = readFileSync(join(root, "apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts"), "utf8");

function readCssRuleBody(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

// Desktop reaches memory through the rail preview (click -> full graph), so its
// left nav hides the Polynet item. Mobile has no right rail yet, so it keeps the
// nav item as its only memory path until a mobile memory surface exists.
assert.match(
  communityNav,
  /showPolynetItem = true/,
  "CommunityNav should keep the Polynet item available by default (mobile path)",
);
assert.match(
  communityNav,
  /const showPolynetButton = canViewActiveCommunityPolynet && showPolynetItem;/,
  "CommunityNav should gate the Polynet item on both access and surface visibility",
);
assert.match(
  desktopChrome,
  /showPolynetItem=\{false\}/,
  "Desktop community nav should hide the Polynet tab (memory opens from the rail preview)",
);
assert.doesNotMatch(
  mobileShell,
  /showPolynetItem=\{false\}/,
  "Mobile community nav must keep the Polynet item until mobile has a memory surface",
);

assert.match(
  gateway,
  /client\.query\("community:getCommunityPolynetOverview" as any/,
  "Polynet gateway should read the overview projection",
);
assert.doesNotMatch(
  gateway,
  /mutation\(|action\(|getCommunityArchiveHealth|requestCommunityArchiveBackfill|processCommunityArchivePending|retryCommunityArchiveFailures/,
  "Polynet gateway should stay read-only and should not call archive operations",
);

assert.match(controller, /fetchCloudCommunityPolynetOverview/, "Polynet controller should load the overview projection");
assert.match(controller, /canViewPolynet/, "Polynet controller should model view access, not manage access");
assert.match(
  controller,
  /communityTab === "chat" \|\| communityTab === "polynet"/,
  "Polynet controller should hydrate for the chat context rail and the full Polynet tab",
);
assert.match(
  controller,
  /COMMUNITY_POLYNET_RAIL_NODE_LIMIT = 12/,
  "Polynet controller should use a compact node limit for the chat rail",
);
assert.match(
  controller,
  /communityTab === "chat" \? COMMUNITY_POLYNET_RAIL_NODE_LIMIT : undefined/,
  "Polynet controller should only apply the compact limit to the chat rail",
);
assert.match(
  controller,
  /current\.communityTab !== communityTab/,
  "Polynet controller should invalidate pending compact requests when switching tabs",
);
assert.doesNotMatch(
  controller,
  /ArchiveHealth|archiveHealth|Backfill|backfill|processPending|retryFailed|getCommunityArchiveHealth|requestCommunityArchiveBackfill|processCommunityArchivePending|retryCommunityArchiveFailures/,
  "Polynet controller should not expose archive health or archive mutation controls",
);

assert.match(section, /community-polynet-graph/, "Polynet section should render the memory graph workspace");
assert.match(section, /community-polynet-detail/, "Polynet section should render selected node details");
assert.match(section, /selectedNodeId/, "Polynet section should support local node selection");
assert.match(section, /onBackToChat\?: \(\) => void/, "Polynet section should accept a deterministic back-to-chat action");
assert.match(section, /aria-label="Back to community chat"/, "Polynet section should expose an accessible back-to-chat control");
assert.match(section, /community-polynet-header\$\{hasBackToChat \? " has-back" : ""\}/, "Polynet back control should be a real header grid cell");
assert.match(section, /strokeWidth="2"/, "Polynet back control should set SVG stroke width directly");
assert.match(section, /<path d="M19 12H5M12 19l-7-7 7-7" \/>/, "Polynet back control should render a visible inline arrow");
assert.doesNotMatch(section, /ArrowLeft/, "Polynet back control should not depend on a collapsed external icon render");
assert.doesNotMatch(
  section,
  /community-polynet-title-row/,
  "Polynet title text should not be shifted away from the kicker/subtitle by an inline back button",
);
assert.match(
  surfaceProjection,
  /onBackToChat: params\.onBackToCommunityChat/,
  "Polynet section should receive the back-to-chat action through the community surface projection",
);
assert.match(
  app,
  /openCommunityChat\(nextCommunitySlug, \{ clearUnread: true, pushSnapshot: false \}\)/,
  "Polynet back action should route to the same community chat without relying on browser history",
);
assert.match(section, /overview\.graph\.nodes\.map/, "Polynet graph should render backend-projected nodes");
assert.match(section, /overview\.graph\.edges\.map/, "Polynet graph should render backend-projected edges");
assert.match(
  section,
  /className=\{`cp-node-label/,
  "Polynet node label should be a text annotation around the node, not the node body",
);
assert.match(
  section,
  /cp-node-circle|cp-root-circle/,
  "Polynet graph nodes should render as circle dot primitives",
);
assert.doesNotMatch(
  section,
  /Backfill archive|Process pending|Retry failed|Total docs|Embedded|PDF docs|archive health|archive memory/i,
  "Polynet section should not be the old archive-health panel",
);
assert.doesNotMatch(
  section,
  /textarea|contentEditable|onSubmit|mutation|createCommunityIntelligence|applyCommunityIntelligence|decideCommunityIntelligence/,
  "Polynet tab should remain read-only in this slice",
);

assert.match(
  contextPanel,
  /memoryOverview\?: CloudCommunityPolynetOverview \| null/,
  "Community context rail should accept the Polynet overview projection",
);
assert.match(
  contextPanel,
  /Memory — \$\{memoryCountLabel\}/,
  "Community context rail should project a compact memory count",
);
assert.match(
  contextPanel,
  /onOpenMemory/,
  "Community context rail should expose memory as the member-facing entry point",
);
assert.match(
  interactionProjection,
  /memoryOverview=\{props\.communityMemoryOverview \?\? null\}/,
  "Interaction projection should pass memory state into the right rail",
);
// Memory is embedded inline in the rail as a live graph preview; there is no
// intermediate drawer — clicking the preview opens the full graph directly.
assert.match(
  contextPanel,
  /CommunityMemoryGraphPreview/,
  "Community context rail should render the live memory graph preview inline",
);
assert.match(
  interactionProjection,
  /onOpenMemory=\{props\.onOpenCommunityMemory\}/,
  "Rail memory should open the full graph directly (no intermediate drawer)",
);
assert.doesNotMatch(
  interactionProjection,
  /CommunityMemoryDrawer/,
  "The intermediate memory drawer should be removed",
);
assert.doesNotMatch(
  interactionProjection,
  /isCommunityMemoryOpen/,
  "The local memory drawer state should be removed",
);

const css = readFileSync(join(root, "apps/web/src/base.css"), "utf8");
const polynetBackRule = readCssRuleBody(css, ".community-polynet-back");
assert.match(
  css,
  /\.cp-root-circle \{[\s\S]*fill: var\(--accent-gold\)/,
  "Polynet root node should be a compact dot in the theme accent",
);
assert.doesNotMatch(
  css,
  /min-width: 92px;[\s\S]{0,80}padding: 0 14px;/,
  "Polynet root node should not regress to the old rectangular pill shape",
);
assert.match(
  css,
  /\.community-context-memory-preview/,
  "Community memory should render as an inline live graph preview in the rail",
);
assert.match(
  css,
  /\.community-polynet-back/,
  "Polynet page should style the back-to-chat control",
);
assert.match(
  css,
  /\.community-polynet-header\.has-back/,
  "Polynet page should keep the back control inside the header grid instead of hanging outside the copy container",
);
assert.match(
  css,
  /\.community-polynet-heading/,
  "Polynet page should keep the kicker, title, and subtitle in one aligned copy stack",
);
assert.match(
  css,
  /stroke: currentColor/,
  "Polynet back arrow should have explicit SVG stroke styling",
);
assert.match(
  css,
  /\.settings-panel button:[^{]+:not\(\.community-polynet-back\)/,
  "Polynet back control should be excluded from the broad settings-panel button reset",
);
assert.match(polynetBackRule, /padding: 0;/, "Polynet back control should reserve its full 28px box for the SVG");
assert.doesNotMatch(polynetBackRule, /position:\s*absolute/, "Polynet back control should not use fragile absolute positioning");
assert.doesNotMatch(polynetBackRule, /left:\s*-/, "Polynet back control should not hang outside the header with a negative left offset");
assert.doesNotMatch(
  css,
  /\.community-polynet-title-row/,
  "Polynet page should not use a title-only row that misaligns the header copy",
);
assert.doesNotMatch(
  css,
  /\.community-memory-drawer/,
  "The removed memory drawer should leave no dead styling behind",
);

assert.match(
  activeCommunityShell,
  /canViewActiveCommunityPolynet = communityAccessCapabilities\.canViewCommunity/,
  "Polynet nav access should follow member community access",
);
assert.doesNotMatch(
  activeCommunityShell,
  /canViewActiveCommunityPolynet = canManageCommunitySettings/,
  "Polynet nav access must not follow the owner/admin community management gate",
);
assert.doesNotMatch(
  activeCommunityShell,
  /canViewActiveCommunityPolynet = canViewActiveCommunitySettings/,
  "Polynet nav access must not follow member-visible settings access",
);

console.log("Community Polynet tab UI contract proof passed");
