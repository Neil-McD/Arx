import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getToolDefinition, normalizeToolArguments } from "../shared/toolRegistry.ts";
import { getFixedRuntimeToolPolicy } from "../shared/runtimeToolPolicy.ts";
import { restrictToolNamesForInvocationSurface } from "../shared/runtimeInvocationSurface.ts";
import { buildRuntimeContextManifest } from "../shared/runtimeContextManifest.ts";
import { POLYNET_CANONICAL_TOOL_NAMES } from "../shared/polynetCanonicalToolContract.ts";

const read = (path: string) => readFileSync(path, "utf8");
const searchName = "polynet_search" as const;
const readName = "polynet_read" as const;
const callName = "polynet_call" as const;
const memoryRoot = "/communities/community-one/memory/";

assert.deepEqual(POLYNET_CANONICAL_TOOL_NAMES, [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
]);
for (const name of [searchName, readName, callName]) {
  assert.equal(getToolDefinition(name)?.name, name);
}
assert.deepEqual(
  normalizeToolArguments(searchName, {
    path: memoryRoot,
    query: "  launch playbook  ",
    types: ["insight", "playbook", "insight"],
    limit: 99,
  }),
  {
    path: memoryRoot,
    query: "launch playbook",
    types: ["insight", "playbook"],
    limit: 20,
  },
);
assert.deepEqual(
  normalizeToolArguments(readName, {
    path: `${memoryRoot}node_1.md`,
  }),
  {
    path: `${memoryRoot}node_1.md`,
  },
);
assert.deepEqual(
  normalizeToolArguments(callName, {
    operation: "community.memory.record_outcome",
    version: 1,
    target:
      "/communities/community-one/capabilities/community.memory.record_outcome.json",
    input: {
      retrieval_log_id: "log_1",
      node_id: "node_1",
      result_status: "worked",
    },
    idempotency_key: "outcome-1",
  }),
  {
    operation: "community.memory.record_outcome",
    version: 1,
    target:
      "/communities/community-one/capabilities/community.memory.record_outcome.json",
    input: {
      retrieval_log_id: "log_1",
      node_id: "node_1",
      result_status: "worked",
    },
    idempotencyKey: "outcome-1",
  },
);

for (const toolName of [searchName, readName]) {
  const policy = getFixedRuntimeToolPolicy(toolName);
  assert.equal(policy.category, "community");
  assert.equal(policy.riskLevel, "read");
  assert.equal(policy.readOnly, false);
  assert.equal(policy.mutatesState, true);
  assert.equal(policy.parallelSafe, false);
  assert.equal(policy.requiresCommunity, false);
}
assert.deepEqual(
  restrictToolNamesForInvocationSurface({
    invocationSurface: "member_agent_dock",
    toolNames: [
      searchName,
      readName,
      callName,
    ],
  }),
  [searchName, readName, callName],
);

const conciergeTools = read("shared/communityAgentConciergeTools.ts");
assert.match(
  conciergeTools,
  /"polynet_list"[\s\S]*"polynet_read"[\s\S]*"polynet_search"[\s\S]*"polynet_write"[\s\S]*"polynet_call"/,
);
assert.doesNotMatch(
  conciergeTools,
  /"community_memory_search"|"community_memory_read"/,
);

const manifest = buildRuntimeContextManifest({
  communityId: "community_1",
  allowedToolNames: [searchName, readName, callName],
  promptSections: [],
});
assert.equal(
  manifest.tools.find((tool) => tool.name === searchName)?.family,
  "community_context",
);
assert.equal(
  manifest.tools.find((tool) => tool.name === callName)?.effect,
  "write",
);

const executor = read("convex/polynetCanonicalExecutor.ts");
assert.match(
  executor,
  /POLYNET_MEMORY_DIRECTORY_PATH[\s\S]*searchCommunityMemoryInternal/,
);
assert.match(
  executor,
  /memoryMatch[\s\S]*readCommunityMemoryInternal/,
);
assert.match(
  executor,
  /community\.memory\.record_outcome[\s\S]*recordCommunityOutcomeObservationInternal/,
);
assert.match(
  executor,
  /principalKind[\s\S]*mountedCommunityId[\s\S]*resolveCommunityCapabilityContextInternal/,
);

const directory = read("convex/communityIntelligenceDirectory.ts");
assert.match(
  directory,
  /searchCommunityMemoryCore[\s\S]*requireCommunityChatAccess[\s\S]*retrieveAcceptedCommunityMemoryNodes[\s\S]*createCommunityMemoryRetrievalReceipt/,
);
assert.match(
  directory,
  /readCommunityMemoryInternal[\s\S]*requireCanonicalCommunityMemoryReceipt[\s\S]*requiredNodeState: "returned"/,
);
assert.match(
  directory,
  /resolveExistingReceiptOutcomeForNode[\s\S]*deduplicated: true/,
);
assert.doesNotMatch(
  directory,
  /if \(args\.isManager \|\| !\(args\.node\.tags \?\? \[\]\)\.includes\("compiler_memory"\)\) return true/,
);
assert.match(
  directory,
  /function canViewerReadTrace[\s\S]*sourceVisibility === "redacted"[\s\S]*if \(isManager\) return true/,
);

console.log("community_memory_consumption_parity_contract_proof: ok");
