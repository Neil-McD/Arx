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
assert.match(
  interactionProjection,
  /function CommunityMemoryDrawer/,
  "Interaction projection should render a native memory drawer inside the right rail",
);
assert.match(
  interactionProjection,
  /isCommunityMemoryOpen/,
  "Interaction projection should track memory drawer state locally",
);
assert.match(
  interactionProjection,
  /onOpenMemory=\{\(\) => setIsCommunityMemoryOpen\(true\)\}/,
  "Community context rail memory open should stay inside the right rail",
);
assert.match(
  interactionProjection,
  /onOpenFullView=\{props\.onOpenCommunityMemory\}/,
  "Native memory drawer should keep the full Polynet graph as a secondary fallback",
);
assert.doesNotMatch(
  interactionProjection,
  /onOpenMemory=\{props\.onOpenCommunityMemory\}/,
  "Community context rail should not jump directly to the left Polynet tab",
);

const css = readFileSync(join(root, "apps/web/src/base.css"), "utf8");
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
  /\.community-memory-drawer-scroll/,
  "Community memory drawer should have native right-rail styling",
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
