import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const communityExports = readFileSync(join(root, "convex/community.ts"), "utf8");

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
const readEdges = asyncFunctionBlock(directory, "readPolynetOverviewEdges");
const mapNode = functionBlock(directory, "mapPolynetOverviewNode");
const mapEdge = functionBlock(directory, "mapPolynetOverviewEdge");
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

assert.match(readEdges, /by_fromNode/, "overview edges should be read from selected directory nodes");
assert.match(readEdges, /\.take\(POLYNET_OVERVIEW_EDGES_PER_NODE_LIMIT\)/, "overview edge reads should be per-node bounded");
assert.doesNotMatch(readEdges, /\.collect\(\)/, "overview edges should not collect all community edges");
assert.match(readEdges, /if \(!edge\.toNodeId\) continue/, "overview graph should only expose node-to-node directory edges");
assert.match(readEdges, /nodeIds\.has\(normalizeIdValue\(edge\.fromNodeId\)\)[\s\S]*nodeIds\.has\(normalizeIdValue\(edge\.toNodeId\)\)/, "overview edges should stay inside the selected visible node set");
assert.match(readEdges, /canViewerReadVisibility\(edge\.visibilityScope, args\.isManager\)/, "overview edges should keep visibility filtering");

assert.match(mapNode, /kind: "directory_node"/, "overview graph should expose real directory nodes as directory_node graph nodes");
assert.doesNotMatch(mapNode, /body_md|source_trace_ids|outcome_observation_ids/, "overview graph nodes should not expose source bodies or evidence ids");
assert.match(mapEdge, /kind: "directory_edge"/, "overview graph edges should expose real directory node-to-node edges");
assert.match(mapEdge, /from: directoryGraphNodeId\(row\.fromNodeId\)/, "overview edges should map from directory nodes");
assert.match(mapEdge, /to: directoryGraphNodeId\(row\.toNodeId\)/, "overview edges should map to directory nodes");

assert.match(overview, /communityGraphRootId\(args\.communityId\)/, "overview should include one synthetic community root node for UI layout");
assert.match(overview, /nodes: \[[\s\S]*kind: "community"[\s\S]*\.\.\.nodes\.map\(mapPolynetOverviewNode\)/, "overview graph should contain the community root plus real directory nodes");
assert.match(overview, /edges: edges\.map\(mapPolynetOverviewEdge\)/, "overview graph should expose mapped directory edges only");
assert.doesNotMatch(overview, /communityCompilerDigests|communitySourceTraces|communityIntelligenceChangeRequests|readCommunityCompilerWindow/, "overview should not expose compiler, raw trace, or airlock internals");
assert.doesNotMatch(overview, /wakeEvidence|errorMessage|body_md|source_trace_ids/, "overview should stay compact and member-safe");

assert.match(overview, /communityAgentRuns/, "overview should include community-agent run status");
assert.match(overview, /by_community_createdAt/, "overview should read recent agent runs through the community time index");
assert.match(overview, /\.take\(POLYNET_OVERVIEW_RUN_LIMIT \* 2\)/, "overview agent run read should be bounded");
assert.match(overview, /row\.agentKey === "community_agent"/, "overview should show only the canonical community agent");
assert.match(overview, /recent_actions_summary/, "overview should summarize recent community-agent actions for the future tab");
assert.match(overview, /summarizePolynetOverviewMemory/, "overview should expose memory health counts from visible directory nodes");

console.log("Community Polynet overview contract proof passed");
