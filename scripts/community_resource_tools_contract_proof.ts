import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseCommunityResourceDirectoryUri,
} from "../shared/communityResourceDirectory.ts";
import {
  POLYNET_CANONICAL_TOOL_NAMES,
} from "../shared/polynetCanonicalToolContract.ts";
import {
  getPolynetMcpToolDefinitions,
} from "../shared/polynetMcp.ts";
import {
  buildResponsesApiFunctionTools,
  normalizeToolArguments,
} from "../shared/toolRegistry.ts";
import { getFixedRuntimeToolPolicy } from "../shared/runtimeToolPolicy.ts";

const root = process.cwd();
const read = (path: string): string =>
  readFileSync(join(root, path), "utf8");

assert.deepEqual(
  parseCommunityResourceDirectoryUri(
    "resources://community/community%201/modules/module%201/resources/resource%201",
  ),
  {
    communityId: "community 1",
    moduleId: "module 1",
    sourceInbox: false,
    resourceId: "resource 1",
  },
);
assert.deepEqual(
  parseCommunityResourceDirectoryUri(
    "resources://community/community%201/modules/module%201/source-inbox",
  ),
  {
    communityId: "community 1",
    moduleId: "module 1",
    sourceInbox: true,
    resourceId: null,
  },
);

assert.deepEqual(
  getPolynetMcpToolDefinitions().map((tool) => tool.name),
  POLYNET_CANONICAL_TOOL_NAMES,
  "resources must be paths and capabilities behind the canonical five",
);
assert.deepEqual(
  buildResponsesApiFunctionTools([...POLYNET_CANONICAL_TOOL_NAMES]).map(
    (tool) => tool.name,
  ),
  POLYNET_CANONICAL_TOOL_NAMES,
);
assert.deepEqual(
  normalizeToolArguments("polynet_search", {
    path: "/communities/polynet/resources/",
    query: " process swim lanes ",
    limit: 500,
  }),
  {
    path: "/communities/polynet/resources/",
    query: "process swim lanes",
    limit: 20,
  },
);
assert.throws(
  () =>
    normalizeToolArguments("polynet_read", {
      path: "/communities/polynet/resources/module~m/page~r.md",
      offset: 0,
      limit: 999_999,
    }),
  /limit must be an integer between 1 and 20000/,
);

const listPolicy = getFixedRuntimeToolPolicy("polynet_list");
assert.equal(listPolicy.readOnly, true);
assert.equal(listPolicy.parallelSafe, true);
assert.equal(listPolicy.requiresCommunity, false);
for (const name of [
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
] as const) {
  const policy = getFixedRuntimeToolPolicy(name);
  assert.equal(policy.requiresCommunity, false);
  assert.equal(policy.mutatesState, true);
  assert.equal(policy.parallelSafe, false);
}

const resources = read("convex/communityResources.ts");
const evidence = read("convex/communityResourceEvidence.ts");
const executor = read("convex/polynetCanonicalExecutor.ts");
const authority = read("shared/polynetAuthority.ts");
const mcp = read("shared/polynetMcp.ts");
const httpMcp = read("convex/httpMcp.ts");
const contract = read("docs/canonical-platform-operation-contract-v1.md");

for (const required of [
  "readCommunityResourceDirectoryInternal",
  "listCommunityResourceBuilderDirectoryInternal",
  "readCommunityResourceBuilderResourceInternal",
  "stageCommunityResourceBuilderChangesetInternal",
]) {
  assert.match(resources, new RegExp(required));
}
assert.match(resources, /requireCommunityResourceDirectoryToolAccess/);
assert.match(resources, /requireCommunityManager/);
assert.match(resources, /community_resource_directory_community_mismatch/);
// Only the paywall redaction may name file keys, to blank them.
assert.doesNotMatch(resources, /file_key:(?! null)/);

assert.match(evidence, /searchCommunityResourceEvidenceInternal/);
assert.match(evidence, /readCommunityResourceEvidenceForToolInternal/);
assert.match(evidence, /capability: "community_resources_search"/);
assert.match(evidence, /capability: "community_resource_read"/);

assert.match(
  executor,
  /POLYNET_RESOURCES_DIRECTORY_PATH[\s\S]*searchCommunityResourceEvidenceInternal/,
  "member resource search must delegate through the canonical executor",
);
assert.match(
  executor,
  /community\.semantic\.read/,
  "member resource reads must use the canonical semantic repository owner",
);
assert.match(
  executor,
  /POLYNET_BUILDER_RESOURCES_DIRECTORY_PATH[\s\S]*stageCommunityResourceBuilderChangesetInternal/,
  "builder writes must stage changesets instead of directly mutating resources",
);
for (const forbiddenOperation of [
  "community.resources.changeset.status",
  "community.resources.changeset.approve",
  "community.resources.changeset.reject",
  "community.resources.changeset.apply",
]) {
  assert.doesNotMatch(
    executor,
    new RegExp(forbiddenOperation.replaceAll(".", "\\.")),
    `${forbiddenOperation} must remain a product-control-only command`,
  );
}
assert.match(authority, /relation === "owner" \|\| relation === "admin"/);
assert.match(authority, /canUseBuilderProjection: lane === "builder"/);

for (const source of [mcp, httpMcp]) {
  assert.doesNotMatch(
    source,
    /polynet_workspace_resources_|polynet_workspace_builder_resource/,
    "retired resource-specific MCP names must be physically absent",
  );
}
assert.match(httpMcp, /executePolynetCanonicalTool/);
assert.match(contract, /Owner\/admin authority additionally reveals `builder\/`/);
assert.match(contract, /staged as a changeset/);

console.log("community_resource_tools_contract_proof: ok");
