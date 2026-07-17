import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const communityExports = readFileSync(join(root, "convex/community.ts"), "utf8");
const gateway = readFileSync(join(root, "shared/cloudCommunityPolynetGateway.ts"), "utf8");

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextConst = source.indexOf("\nexport const ", start + startToken.length);
  const nextAsync = source.indexOf("\nexport async function ", start + startToken.length);
  const nextCandidates = [nextConst, nextAsync].filter((index) => index !== -1);
  const next = nextCandidates.length ? Math.min(...nextCandidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function functionBlock(source: string, functionName: string): string {
  const startToken = `function ${functionName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + startToken.length);
  const nextAsyncFunction = source.indexOf("\nasync function ", start + startToken.length);
  const nextExport = source.indexOf("\nexport const ", start + startToken.length);
  const nextCandidates = [nextFunction, nextAsyncFunction, nextExport].filter((index) => index !== -1);
  const next = nextCandidates.length ? Math.min(...nextCandidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function asyncFunctionBlock(source: string, functionName: string): string {
  const startToken = `async function ${functionName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + startToken.length);
  const nextAsyncFunction = source.indexOf("\nasync function ", start + startToken.length);
  const nextExport = source.indexOf("\nexport const ", start + startToken.length);
  const nextCandidates = [nextFunction, nextAsyncFunction, nextExport].filter((index) => index !== -1);
  const next = nextCandidates.length ? Math.min(...nextCandidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

const overview = exportedFunctionBlock(directory, "getCommunityPolynetOverview");
const readNodes = asyncFunctionBlock(directory, "readPolynetOverviewNodes");
const readResources = asyncFunctionBlock(directory, "readPolynetOverviewResources");
const readEdges = asyncFunctionBlock(directory, "readPolynetOverviewEdges");
const mapNode = functionBlock(directory, "mapPolynetOverviewNode");
const mapResourceNode = functionBlock(directory, "mapPolynetOverviewResourceNode");
const mapEdge = functionBlock(directory, "mapPolynetOverviewEdge");
const mapResourceEdge = functionBlock(directory, "mapPolynetOverviewResourceEdge");
const overviewStatusesStart = directory.indexOf("const POLYNET_OVERVIEW_STATUSES");
const overviewStatusesEnd = directory.indexOf("];", overviewStatusesStart);
const overviewStatuses = directory.slice(overviewStatusesStart, overviewStatusesEnd);

assert.match(overview, /export const getCommunityPolynetOverview = query/, "Polynet overview should be a read-only query");
assert.match(overview, /communityId: v\.id\("communities"\)/, "overview should be scoped by one explicit community id");
assert.match(overview, /requireCommunityChatAccess/, "overview should require member community chat access");
assert.match(overview, /const isManager = await viewerCanManageCommunity\(ctx, args\.communityId, userId\)/, "overview should compute manager status after the member access gate");
assert.doesNotMatch(overview, /const isManager = true/, "overview should not treat every authorized viewer as a manager");
assert.doesNotMatch(overview, /await requireCommunityManager\(\{ ctx, communityId: args\.communityId, userId \}\)/, "overview should not require owner/admin access");
assert.match(communityExports, /getCommunityPolynetOverview as getCommunityPolynetOverviewImpl/, "community module should import the overview query");
assert.match(communityExports, /export const getCommunityPolynetOverview = getCommunityPolynetOverviewImpl/, "community module should export the overview query");

assert.match(readNodes, /by_community_status_updatedAt/, "overview nodes should use freshness-aware status indexes");
assert.match(readNodes, /\.take\(args\.limit\)/, "overview node reads should be bounded");
assert.doesNotMatch(readNodes, /\.collect\(\)/, "overview node reads should not collect all community nodes");
assert.match(readNodes, /canViewerReadNode/, "overview nodes should reuse directory readability rules");
assert.match(readNodes, /POLYNET_OVERVIEW_STATUSES/, "overview should use a deliberately narrow accepted-memory status set");
assert.doesNotMatch(overviewStatuses, /"draft"|"candidate"|"archived"|"deprecated"/, "overview should not expose draft, candidate, archived, or deprecated nodes");

assert.match(readResources, /communityResourceModules/, "resource nodes should be discovered through canonical resource modules");
assert.match(readResources, /communityResourceModuleIsLive/, "resource node discovery should require live modules");
assert.match(readResources, /by_community_module/, "resource node discovery should use the canonical module index");
assert.match(readResources, /communityResourceIsLiveModulePage/, "resource node discovery should reuse canonical member visibility");
assert.match(readResources, /scanLimit/, "resource node discovery should keep one explicit bounded row budget");
assert.doesNotMatch(readResources, /\.collect\(\)/, "resource node reads should never collect an unbounded community corpus");

assert.doesNotMatch(
  overview,
  /formingNodes|forming_node|forming_memory|communityIntelligenceChangeRequests/,
  "member-facing Polynet should not project the deleted approval plane as forming memory",
);

assert.match(readEdges, /by_fromNode/, "overview edges should be read from selected directory nodes");
assert.match(readEdges, /\.take\(POLYNET_OVERVIEW_EDGES_PER_NODE_LIMIT\)/, "overview edge reads should be per-node bounded");
assert.doesNotMatch(readEdges, /\.collect\(\)/, "overview edges should not collect all community edges");
assert.match(readEdges, /if \(!edge\.toNodeId\) continue/, "overview graph should only expose node-to-node directory edges");
assert.match(readEdges, /nodeIds\.has\(normalizeIdValue\(edge\.fromNodeId\)\)[\s\S]*nodeIds\.has\(normalizeIdValue\(edge\.toNodeId\)\)/, "overview edges should stay inside the selected visible node set");
assert.match(readEdges, /canViewerReadVisibility\(edge\.visibilityScope, args\.isManager\)/, "overview edges should keep visibility filtering");

assert.match(mapNode, /kind: "directory_node"/, "overview graph should expose real directory nodes as directory_node graph nodes");
assert.match(mapNode, /row\.originChangeRequestId[\s\S]*communityMemoryLineageId\(row\.originChangeRequestId\)/, "retained memory should preserve its forming-node lineage");
assert.doesNotMatch(mapNode, /body_md|source_trace_ids|outcome_observation_ids/, "overview graph nodes should not expose source bodies or evidence ids");
assert.match(mapResourceNode, /kind: "resource_node"/, "overview should expose canonical resources as first-class graph nodes");
assert.match(mapResourceNode, /lineage_id: resourceMemoryLineageId\(row\._id\)/, "resource nodes should use stable resource lineage");
assert.match(mapResourceNode, /type: "resource"[\s\S]*status: "source"/, "resource nodes should retain source ontology without claiming learned validation");
assert.doesNotMatch(mapResourceNode, /bodyMd|url|createdByUserId|confidence|evidence_strength/, "resource graph nodes should stay metadata-minimal");
assert.match(mapEdge, /kind: "directory_edge"/, "overview graph edges should expose real directory node-to-node edges");
assert.match(mapEdge, /from: directoryGraphNodeId\(row\.fromNodeId\)/, "overview edges should map from directory nodes");
assert.match(mapEdge, /to: directoryGraphNodeId\(row\.toNodeId\)/, "overview edges should map to directory nodes");
assert.match(mapResourceEdge, /kind: "resource_edge"/, "resource containment should be a typed read-model edge");
assert.match(mapResourceEdge, /from: communityGraphRootId\(communityId\)/, "resource containment should start at the community root");
assert.match(mapResourceEdge, /to: resourceGraphNodeId\(row\._id\)/, "resource containment should end at the resource node");

assert.match(overview, /communityGraphRootId\(args\.communityId\)/, "overview should include one synthetic community root node for UI layout");
assert.match(overview, /readPolynetOverviewResources/, "overview should project canonical resources without waiting for compiler promotion");
assert.match(overview, /selectPolynetOverviewItems/, "learned and source nodes should share one bounded graph budget");
assert.match(overview, /nodes: \[[\s\S]*kind: "community"[\s\S]*\.\.\.selectedItems\.map\(mapPolynetOverviewSelectionNode\)/, "overview graph should contain the community root plus learned and source nodes");
assert.match(overview, /resources\.map\(\(row\) => mapPolynetOverviewResourceEdge/, "overview should connect every selected resource to the community root");
assert.doesNotMatch(overview, /communityCompilerDigests|communitySourceTraces|readCommunityCompilerWindow/, "overview should not expose compiler or raw-trace internals");
assert.doesNotMatch(overview, /wakeEvidence|errorMessage|body_md|source_trace_ids/, "overview should stay compact and member-safe");
assert.match(overview, /summarizePolynetOverviewMemory\(selectedItems, hasMoreNodes, hasMoreEdges\)/, "memory counts should include learned and resource source nodes");

assert.match(overview, /communityAgentRuns/, "overview should include community-agent run status");
assert.match(overview, /by_community_createdAt/, "overview should read recent agent runs through the community time index");
assert.match(overview, /\.take\(POLYNET_OVERVIEW_RUN_LIMIT \* 2\)/, "overview agent run read should be bounded");
assert.match(overview, /row\.agentKey === "community_agent"/, "overview should show only the canonical community agent");
assert.match(overview, /recent_actions_summary/, "overview should summarize recent community-agent actions for the future tab");
assert.doesNotMatch(
  `${overview}\n${gateway}`,
  /candidate_proposal_count|accepted_change_request_count|rejected_change_request_count|proposed:\s*number|accepted:\s*number|rejected:\s*number/,
  "Polynet overview should expose applied writes without restoring approval-plane counters",
);
assert.match(overview, /summarizePolynetOverviewMemory/, "overview should expose memory health counts from visible directory nodes");

console.log("Community Polynet overview contract proof passed");
