import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMUNITY_AGENT_CONCIERGE_TOOL_NAMES } from "../shared/communityAgentConciergeTools.ts";
import {
  POLYNET_CANONICAL_TOOL_DEFINITIONS,
  POLYNET_CANONICAL_TOOL_NAMES,
} from "../shared/polynetCanonicalToolContract.ts";
import {
  getPolynetMcpToolDefinition,
  getPolynetMcpToolDefinitions,
} from "../shared/polynetMcp.ts";
import { restrictToolNamesForInvocationSurface } from "../shared/runtimeInvocationSurface.ts";
import { getFixedRuntimeToolPolicy } from "../shared/runtimeToolPolicy.ts";
import { getToolDefinition } from "../shared/toolRegistry.ts";

const root = process.cwd();
const read = (relativePath: string): string =>
  readFileSync(join(root, relativePath), "utf8");

const architectureThesis = read("docs/agent-native-semantic-platform-thesis.md");
const operationContract = read("docs/canonical-platform-operation-contract-v1.md");
const docsIndex = read("docs/README.md");

assert.equal(
  existsSync(join(root, "docs/polynet-reduction-execution-contract-v1.md")),
  false,
  "execution status must come from source, proofs, release refs, and live evidence rather than a parallel status ledger",
);
assert.doesNotMatch(
  architectureThesis,
  /polynet-reduction-execution-contract-v1/,
  "the architecture thesis must not point to the deleted parallel status ledger",
);
assert.doesNotMatch(
  docsIndex,
  /polynet-reduction-execution-contract-v1/,
  "the docs index must not route execution truth through a parallel status ledger",
);
assert.match(
  architectureThesis,
  /exact source diff[\s\S]*executable proofs[\s\S]*`origin\/main`[\s\S]*deployment markers[\s\S]*live evidence/,
  "the architecture thesis must name the canonical execution truth layers",
);
assert.match(
  operationContract,
  /Status: active operation contract; dated release and acceptance evidence below\./,
  "the canonical operation contract must distinguish current policy from dated acceptance",
);
assert.doesNotMatch(operationContract, /^Status:.*current-SHA authenticated acceptance complete/m,
  "historical acceptance must not certify an unspecified current SHA");
assert.match(operationContract, /passed on 2026-08-16[\s\S]*a17e3104ec1f47e304d69dae5677d5d1698af1d6/,
  "the original acceptance must retain its date and actual source binding");
assert.match(
  operationContract,
  /tools\/list[\s\S]*semantic_not_found[\s\S]*every advancing `\/communities\/` cursor/,
  "completed MCP acceptance must retain positive, negative, and pagination evidence",
);

const expected = [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
] as const;

assert.deepEqual(
  POLYNET_CANONICAL_TOOL_NAMES,
  expected,
  "the canonical Polynet harness must contain exactly five verbs",
);
assert.deepEqual(
  getPolynetMcpToolDefinitions().map((tool) => tool.name),
  expected,
  "official MCP must be a direct five-tool canonical projection",
);
assert.equal(
  existsSync(join(root, "shared/polynetPlatformToolSurface.ts")),
  false,
  "the native harness must not keep a duplicate five-tool authority",
);
assert.deepEqual(
  COMMUNITY_AGENT_CONCIERGE_TOOL_NAMES,
  expected,
  "community agent must receive the same five tool names",
);
assert.deepEqual(
  restrictToolNamesForInvocationSurface({
    invocationSurface: "member_agent_dock",
    toolNames: [
      ...expected,
      "search_product_docs",
    ],
  }),
  expected,
  "community agent must expose only the canonical Polynet verbs from the Polynet family",
);

for (const name of expected) {
  const canonical = POLYNET_CANONICAL_TOOL_DEFINITIONS[name];
  const registry = getToolDefinition(name);
  const mcp = getPolynetMcpToolDefinition(name);
  assert.ok(registry, `${name} must be registered natively`);
  assert.ok(mcp, `${name} must be registered in MCP`);
  assert.equal(registry.description, canonical.description);
  assert.deepEqual(registry.inputSchema, canonical.inputSchema);
  assert.deepEqual(mcp, canonical);

  const policy = getFixedRuntimeToolPolicy(name);
  const writesRuntimeState = name !== "polynet_list";
  assert.equal(
    policy.mutatesState,
    writesRuntimeState,
    `${name} runtime scheduling must account for domain effects or retrieval receipts`,
  );
  assert.equal(policy.readOnly, !writesRuntimeState);
  assert.equal(policy.parallelSafe, !writesRuntimeState);
}

const searchResultSchema = (
  POLYNET_CANONICAL_TOOL_DEFINITIONS.polynet_search.outputSchema.properties
    ?.results as {
    items?: { required?: string[] };
  }
)?.items;
assert.deepEqual(
  searchResultSchema?.required,
  ["path"],
  "every successful canonical search result must carry a follow-up path",
);

for (const retiredPublicName of [
  "polynet_list_communities",
  "polynet_get_community",
  "polynet_list_workspaces",
  "polynet_open_workspace",
  "polynet_get_workspace_context",
  "polynet_workspace_memory_search",
  "polynet_workspace_ai_feed_search",
  "polynet_workspace_resources_list",
  "polynet_workspace_builder_resources_list",
  "polynet_product_docs_search",
]) {
  assert.equal(
    getPolynetMcpToolDefinition(retiredPublicName),
    null,
    `${retiredPublicName} must not remain public`,
  );
}

const mcpContract = read("shared/polynetMcp.ts");
const executor = read("convex/polynetCanonicalExecutor.ts");
const repositorySearch = read("convex/communityRepositorySearch.ts");
const nativeRuntime = read("convex/runtimeAgentLoop.ts");
const mcpRuntime = read("convex/httpMcp.ts");
const authority = read("shared/polynetAuthority.ts");

assert.match(
  mcpContract,
  /getPolynetCanonicalToolDefinitions\(\)/,
  "MCP definitions must come from the canonical contract",
);
assert.doesNotMatch(
  mcpContract,
  /polynet_workspace_|polynet_list_communities|polynet_get_community/,
  "MCP adapter must not redeclare retired public tools",
);
assert.match(nativeRuntime, /executePolynetCanonicalTool\(/);
assert.match(mcpRuntime, /executePolynetCanonicalTool\(/);
assert.match(executor, /derivePolynetHumanAuthority\(/);
assert.match(executor, /derivePolynetCommunityAgentAuthority\(\)/);
assert.match(executor, /createCommunityInteractionComposerMessage/);
assert.match(executor, /searchCommunityRepositoryInternal/);
assert.doesNotMatch(
  executor,
  /communityRecentContext/,
  "canonical repository search must not use the prompt-context aggregator",
);
assert.match(repositorySearch, /searchRecentCommunityInteractionEvidenceInternal/);
assert.match(repositorySearch, /searchRecentCommunityResourceEvidenceInternal/);
assert.match(repositorySearch, /searchCommunityMemoryInternal/);
assert.match(repositorySearch, /community_repository_search/);
assert.doesNotMatch(
  repositorySearch,
  /communityAiFeed|source_type:\s*"ai_feed"|\/ai-feed\//,
  "canonical repository search must not expose the retired AI Feed domain",
);
assert.match(executor, /stageCommunityResourceBuilderChangesetInternal/);
assert.doesNotMatch(
  executor,
  /approveCommunityResourceBuilderChangeset|rejectCommunityResourceBuilderChangeset|applyCommunityResourceBuilderChangeset/,
  "canonical agent operations must not cross the product approval boundary",
);
assert.match(
  authority,
  /relation === "owner" \|\| relation === "admin"/,
  "only owners and admins may derive builder authority",
);
assert.match(
  authority,
  /principalKind: "community_agent"[\s\S]*lane: "member"/,
  "community agent authority must be fixed to the member lane",
);

console.log("canonical_operation_surface_contract_proof: ok");
