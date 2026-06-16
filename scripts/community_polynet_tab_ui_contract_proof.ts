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
  "PolyNet gateway should read the overview projection",
);
assert.doesNotMatch(
  gateway,
  /mutation\(|action\(|getCommunityArchiveHealth|requestCommunityArchiveBackfill|processCommunityArchivePending|retryCommunityArchiveFailures/,
  "PolyNet gateway should stay read-only and should not call archive operations",
);

assert.match(controller, /fetchCloudCommunityPolynetOverview/, "PolyNet controller should load the overview projection");
assert.match(controller, /canViewPolynet/, "PolyNet controller should model view access, not manage access");
assert.match(controller, /activePage !== "community"[\s\S]*communityTab !== "polynet"/, "PolyNet controller should only load in the active PolyNet tab");
assert.doesNotMatch(
  controller,
  /ArchiveHealth|archiveHealth|Backfill|backfill|processPending|retryFailed|getCommunityArchiveHealth|requestCommunityArchiveBackfill|processCommunityArchivePending|retryCommunityArchiveFailures/,
  "PolyNet controller should not expose archive health or archive mutation controls",
);

assert.match(section, /community-polynet-graph/, "PolyNet section should render the memory graph workspace");
assert.match(section, /community-polynet-agent/, "PolyNet section should render the community-agent status panel");
assert.match(section, /community-polynet-detail/, "PolyNet section should render selected node details");
assert.match(section, /selectedNodeId/, "PolyNet section should support local node selection");
assert.match(section, /overview\.graph\.nodes\.map/, "PolyNet graph should render backend-projected nodes");
assert.match(section, /overview\.graph\.edges\.map/, "PolyNet graph should render backend-projected edges");
assert.doesNotMatch(
  section,
  /Backfill archive|Process pending|Retry failed|Total docs|Embedded|PDF docs|archive health|archive memory/i,
  "PolyNet section should not be the old archive-health panel",
);
assert.doesNotMatch(
  section,
  /textarea|contentEditable|onSubmit|mutation|createCommunityIntelligence|applyCommunityIntelligence|decideCommunityIntelligence/,
  "PolyNet tab should remain read-only in this slice",
);

assert.match(
  activeCommunityShell,
  /canViewActiveCommunityPolynet = Boolean\([\s\S]*currentActiveCommunityAccess[\s\S]*communityAccessCapabilities\.canViewCommunity/,
  "PolyNet nav access should follow community view access, not owner/admin-only management",
);

console.log("Community PolyNet tab UI contract proof passed");
