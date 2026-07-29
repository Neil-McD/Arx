import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  NON_SANDBOX_TOOL_NAMES,
  RETRIEVAL_TOOL_NAMES,
} from "../shared/retrievalTools.ts";
import {
  getToolDefinition,
  normalizeToolArguments,
} from "../shared/toolRegistry.ts";
import { getFixedRuntimeToolPolicy } from "../shared/runtimeToolPolicy.ts";
import { restrictToolNamesForInvocationSurface } from "../shared/runtimeInvocationSurface.ts";
import { buildRuntimeContextManifest } from "../shared/runtimeContextManifest.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readJson(path: string): Record<string, any> {
  return JSON.parse(read(path)) as Record<string, any>;
}

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextExport = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

const searchName = "community_memory_search";
const readName = "community_memory_read";

assert.ok(RETRIEVAL_TOOL_NAMES.includes(searchName));
assert.ok(RETRIEVAL_TOOL_NAMES.includes(readName));
assert.ok(NON_SANDBOX_TOOL_NAMES.includes(searchName));
assert.ok(NON_SANDBOX_TOOL_NAMES.includes(readName));

const searchDefinition = getToolDefinition(searchName);
const readDefinition = getToolDefinition(readName);
const searchProperties =
  (searchDefinition.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
const readProperties =
  (readDefinition.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
assert.ok("query" in searchProperties);
assert.ok("types" in searchProperties);
assert.ok("limit" in searchProperties);
assert.ok("node_id" in readProperties);
assert.ok("retrieval_log_id" in readProperties);
assert.ok(!("communityId" in searchProperties));
assert.ok(!("community_id" in searchProperties));
assert.ok(!("communityId" in readProperties));
assert.ok(!("community_id" in readProperties));

assert.deepEqual(
  normalizeToolArguments(searchName, {
    query: "  launch playbook  ",
    types: ["insight", "playbook", "insight"],
    limit: 99,
  }),
  {
    query: "launch playbook",
    types: ["insight", "playbook"],
    limit: 12,
  },
);
assert.throws(
  () => normalizeToolArguments(searchName, {}),
  /community_memory_search requires query/,
);
assert.throws(
  () => normalizeToolArguments(searchName, {
    query: "launch",
    types: ["not_a_memory_type"],
  }),
  /unsupported memory type/,
);
assert.deepEqual(
  normalizeToolArguments(readName, {
    node_id: "node_1",
    retrieval_log_id: "log_1",
  }),
  {
    nodeId: "node_1",
    retrievalLogId: "log_1",
  },
);
assert.throws(
  () => normalizeToolArguments(readName, {}),
  /community_memory_read requires node_id/,
);

for (const toolName of [searchName, readName] as const) {
  const policy = getFixedRuntimeToolPolicy(toolName);
  assert.equal(policy.category, "community");
  assert.equal(policy.riskLevel, "read");
  assert.equal(policy.readOnly, false);
  assert.equal(
    policy.mutatesState,
    true,
    "memory retrieval persists an auditable retrieval receipt",
  );
  assert.equal(policy.parallelSafe, false);
  assert.equal(policy.requiresCommunity, true);
  assert.equal(policy.requiresWorkspace, false);
}

assert.deepEqual(
  restrictToolNamesForInvocationSurface({
    invocationSurface: "member_agent_dock",
    toolNames: [searchName, readName, "community_write"],
  }),
  [searchName, readName],
);

const conciergeTools = read("shared/communityAgentConciergeTools.ts");
assert.match(
  conciergeTools,
  /COMMUNITY_AGENT_CONCIERGE_TOOL_NAMES = \[[\s\S]*"community_memory_search"[\s\S]*"community_memory_read"/,
);

const manifest = buildRuntimeContextManifest({
  communityId: "community_1",
  allowedToolNames: [searchName, readName, "community_search"],
});
assert.ok(
  manifest.resources.some((resource) => resource.id === "community_compiled_memory"),
);
assert.ok(
  manifest.resources.some((resource) => resource.id === "community_activity_archive"),
);
assert.equal(
  manifest.tools.find((tool) => tool.name === searchName)?.family,
  "community_memory",
);
assert.equal(
  manifest.tools.find((tool) => tool.name === "community_search")?.family,
  "community_activity",
);

const resolution = read("convex/runtimeTurnResolution.ts");
assert.match(
  resolution,
  /activeCapabilityFamilies\.includes\("community_tools"\)[\s\S]*"community_memory_search"[\s\S]*"community_memory_read"/,
);

const runtimeLoop = read("convex/runtimeAgentLoop.ts");
assert.match(
  runtimeLoop,
  /toolName === "community_memory_search"[\s\S]*runMutation\([\s\S]*communityIntelligenceDirectory\.searchCommunityMemoryInternal[\s\S]*communityId: params\.communityId/,
);
assert.match(
  runtimeLoop,
  /toolName === "community_memory_read"[\s\S]*runMutation\([\s\S]*communityIntelligenceDirectory\.readCommunityMemoryInternal[\s\S]*communityId: params\.communityId[\s\S]*nodeId/,
);

const directory = read("convex/communityIntelligenceDirectory.ts");
const searchBlock = exportedFunctionBlock(directory, "searchCommunityMemoryInternal");
const readBlock = exportedFunctionBlock(directory, "readCommunityMemoryInternal");
assert.match(
  searchBlock,
  /searchCommunityMemoryCore/,
);
assert.match(
  directory,
  /export async function searchCommunityMemoryCore[\s\S]*requireCommunityChatAccess[\s\S]*retrieveAcceptedCommunityMemoryNodes[\s\S]*createCommunityMemoryRetrievalReceipt/,
);
assert.match(
  readBlock,
  /requireCommunityChatAccess[\s\S]*node\.communityId[\s\S]*ACCEPTED_MEMBER_MEMORY_STATUSES\.includes\(node\.status\)[\s\S]*canViewerReadNode/,
);
assert.match(
  readBlock,
  /compilerMemoryEvidenceIsCurrentlyReadable\(\{ ctx, node, isManager \}\)/,
);
assert.match(
  readBlock,
  /requireCanonicalCommunityMemoryReceipt\([\s\S]*communityId: args\.communityId[\s\S]*userId[\s\S]*surface: args\.surface[\s\S]*requiredNodeState: "returned"/,
  "native memory read should delegate receipt ownership and surface validation to the canonical validator",
);
assert.match(
  readBlock,
  /ACCEPTED_MEMBER_MEMORY_STATUSES\.includes\(neighborNode\.status\)[\s\S]*if \(!neighbor\) continue/,
);
assert.doesNotMatch(
  `${searchBlock}\n${readBlock}`,
  /(?:insert|patch)\("communityIntelligence(?:Nodes|Edges)"/,
  "native memory reads may audit retrieval but must not mutate directory nodes or edges",
);

assert.doesNotMatch(
  directory,
  /if \(args\.isManager \|\| !\(args\.node\.tags \?\? \[\]\)\.includes\("compiler_memory"\)\) return true/,
  "manager authority must not bypass compiler-memory citation lifecycle checks",
);
assert.match(
  directory,
  /function canViewerReadTrace[\s\S]*if \(row\.sourceVisibility === "redacted"\) return false;[\s\S]*if \(isManager\) return true;/,
  "redaction must win before manager visibility expansion",
);
assert.match(
  directory,
  /compilerMemoryEvidenceIsCurrentlyReadable[\s\S]*canViewerReadTrace\(trace, args\.isManager\)/,
  "compiler-memory evidence must be revalidated with the viewer's visibility lane",
);

const httpMcp = read("convex/httpMcp.ts");
assert.match(
  httpMcp,
  /polynet_workspace_memory_search[\s\S]*communityIntelligenceDirectory\.searchCommunityMemoryInternal/,
);
assert.match(
  httpMcp,
  /polynet_workspace_memory_read[\s\S]*communityIntelligenceDirectory\.readCommunityMemoryInternal/,
);

const runtimePrompt = read("shared/runtimePrompt.ts");
assert.match(
  runtimePrompt,
  /community_memory_search for what the active community has learned and accepted/,
);
assert.match(runtimePrompt, /cite the memory title and status/);
assert.match(runtimePrompt, /community_search for broad raw recent community activity/);
assert.doesNotMatch(
  runtimePrompt,
  /community_search when active community activity, archive memory, or learned/,
);

const stagingAcceptance = readJson(
  "scripts/fixtures/community_memory_consumption_staging_acceptance_20260716.json",
);
assert.equal(
  stagingAcceptance.schema_version,
  "community_memory_consumption_staging_acceptance:v1",
);
for (const viewer of ["member", "manager"] as const) {
  assert.equal(stagingAcceptance[viewer]?.code, "community_memory_consumption_acceptance_passed");
  assert.deepEqual(stagingAcceptance[viewer]?.failures, []);
  assert.deepEqual(stagingAcceptance[viewer]?.surface_names, [
    "member_agent_dock",
    "community_concierge",
    "external_mcp",
  ]);
  assert.equal(stagingAcceptance[viewer]?.same_memory_identity_across_surfaces, true);
  assert.equal(stagingAcceptance[viewer]?.draft_neighbor_hidden, true);
  assert.equal(stagingAcceptance[viewer]?.revoked_search_hidden, true);
  assert.equal(stagingAcceptance[viewer]?.revoked_read_denied, true);
}
assert.equal(stagingAcceptance.outsider?.search_denied, true);
assert.equal(stagingAcceptance.lineage?.canonical_work_key_present, true);
assert.equal(stagingAcceptance.lineage?.evidence_policy_version, "citation_v1");
assert.equal(stagingAcceptance.lineage?.node_preserved_after_revocation, true);
assert.equal(stagingAcceptance.lineage?.trace_source_visibility_after_revocation, "redacted");
assert.equal(stagingAcceptance.cleanup?.probe_ok, true);
assert.equal(stagingAcceptance.cleanup?.acceptance_function_removed, true);
assert.equal(stagingAcceptance.cleanup?.acceptance_flag_removed, true);

console.log("community_memory_consumption_parity_contract_proof: ok");
