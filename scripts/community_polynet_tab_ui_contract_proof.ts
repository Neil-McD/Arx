import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const controller = readFileSync(join(root, "apps/web/src/controllers/useWebCommunityPolynetController.ts"), "utf8");
const section = readFileSync(join(root, "apps/web/src/components/WebCommunityPolynetSection.tsx"), "utf8");
const gateway = readFileSync(join(root, "shared/cloudCommunityPolynetGateway.ts"), "utf8");
const activeCommunityShell = readFileSync(join(root, "apps/web/src/controllers/useWebActiveCommunityShellController.ts"), "utf8");

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
assert.match(controller, /activePage !== "community"[\s\S]*communityTab !== "polynet"/, "Polynet controller should only load in the active Polynet tab");
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
