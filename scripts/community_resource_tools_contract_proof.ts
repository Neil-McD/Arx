import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseCommunityResourceDirectoryUri,
} from "../shared/communityResourceDirectory.ts";
import {
  buildResponsesApiFunctionTools,
  normalizeToolArguments,
} from "../shared/toolRegistry.ts";
import {
  getFixedRuntimeToolPolicy,
} from "../shared/runtimeToolPolicy.ts";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const retrievalTools = read("shared/retrievalTools.ts");
const toolRegistry = read("shared/toolRegistry.ts");
const runtimeToolPolicy = read("shared/runtimeToolPolicy.ts");
const runtimePrompt = read("shared/runtimePrompt.ts");
const runtimeTurnResolution = read("convex/runtimeTurnResolution.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const resources = read("convex/communityResources.ts");
const httpMcp = read("convex/httpMcp.ts");
const polynetMcp = read("shared/polynetMcp.ts");
const timeline = read("shared/runtimeActivityTimeline.ts");
const timelineUi = read("shared/runtimeTimelineUi.ts");
const cognitionDocs = read("docs/community-agent-cognition-contract-v1.md");

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
  "resource directory URIs should be stable and parseable",
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
  "source inbox directory URIs should be stable and parseable",
);

assert.deepEqual(
  normalizeToolArguments("community_resources_list", {
    path: "/module/source-inbox",
    limit: 500,
  }),
  {
    path: "/module/source-inbox",
    limit: 100,
  },
  "resource listing arguments should be bounded",
);
assert.deepEqual(
  normalizeToolArguments("community_resources_map", {
    limit: 500,
    per_module_limit: 50,
  }),
  {
    limit: 250,
    perModuleLimit: 25,
  },
  "resource map arguments should be bounded and normalized",
);
assert.deepEqual(
  normalizeToolArguments("community_resources_read", {
    refs: ["resources://community/c/modules/m/resources/r", "/methodology/operating-model"],
    max_chars: 999999,
    per_resource_chars: 999999,
  }),
  {
    refs: ["resources://community/c/modules/m/resources/r", "/methodology/operating-model"],
    maxChars: 50000,
    perResourceChars: 20000,
  },
  "batch resource reads should bound refs and context budgets",
);
assert.deepEqual(
  normalizeToolArguments("community_resource_read", {
    ref: "resources://community/c/modules/m/resources/r",
    offset: 0,
    limit: 999999,
  }),
  {
    ref: "resources://community/c/modules/m/resources/r",
    offset: 0,
    limit: 20000,
  },
  "resource reads should support bounded content windows",
);
assert.deepEqual(
  normalizeToolArguments("community_resources_search", {
    query: "process swim lanes",
    limit: 500,
  }),
  {
    query: "process swim lanes",
    limit: 100,
  },
  "resource search arguments should be bounded",
);

const responseTools = buildResponsesApiFunctionTools([
  "community_resources_map",
  "community_resources_read",
  "community_resources_list",
  "community_resource_read",
  "community_resources_search",
]);
assert.equal(responseTools.length, 5);
for (const tool of responseTools) {
  assert.equal(tool.strict, true, `${tool.name} should be strict`);
  assert.equal(tool.parameters.type, "object", `${tool.name} should use an object schema`);
  assert.equal(
    tool.parameters.additionalProperties,
    false,
    `${tool.name} should reject extra input`,
  );
}

for (const toolName of [
  "community_resources_map",
  "community_resources_read",
  "community_resources_list",
  "community_resource_read",
  "community_resources_search",
] as const) {
  const policy = getFixedRuntimeToolPolicy(toolName);
  assert.equal(policy.category, "community");
  assert.equal(policy.readOnly, true);
  assert.equal(policy.parallelSafe, true);
  assert.equal(policy.requiresCommunity, true);
  assert.equal(policy.requiresWorkspace, false);
}

assert.match(
  retrievalTools,
  /"get_active_community_context"[\s\S]*"community_resources_map"[\s\S]*"community_resources_read"[\s\S]*"community_resources_list"[\s\S]*"community_resource_read"[\s\S]*"community_resources_search"[\s\S]*"community_search"[\s\S]*"community_write"/,
  "resource tools should live in the fixed community tool family before broad community search/write",
);
assert.match(toolRegistry, /COMMUNITY_RESOURCES_MAP_TOOL_SCHEMA/);
assert.match(toolRegistry, /COMMUNITY_RESOURCES_READ_TOOL_SCHEMA/);
assert.match(toolRegistry, /COMMUNITY_RESOURCES_LIST_TOOL_SCHEMA/);
assert.match(toolRegistry, /COMMUNITY_RESOURCE_READ_TOOL_SCHEMA/);
assert.match(toolRegistry, /COMMUNITY_RESOURCES_SEARCH_TOOL_SCHEMA/);
assert.match(runtimeToolPolicy, /community_resources_map:[\s\S]*requiresCommunity: true/);
assert.match(runtimeToolPolicy, /community_resources_read:[\s\S]*requiresCommunity: true/);
assert.match(runtimeToolPolicy, /community_resources_list:[\s\S]*requiresCommunity: true/);
assert.match(
  runtimeTurnResolution,
  /if \(params\.activeCapabilityFamilies\.includes\("community_tools"\)\)[\s\S]*"get_active_community_context"[\s\S]*"community_resources_map"[\s\S]*"community_resources_read"[\s\S]*"community_resources_list"[\s\S]*"community_resource_read"[\s\S]*"community_resources_search"[\s\S]*"community_search"[\s\S]*"community_write"/,
  "community resource tools should activate only through the backend-validated community_tools family",
);

assert.match(resources, /export const mapCommunityResourcesForToolInternal = internalQuery/);
assert.match(resources, /export const readCommunityResourcesForToolInternal = internalQuery/);
assert.match(resources, /export const listCommunityResourceDirectoryInternal = internalQuery/);
assert.match(resources, /export const readCommunityResourceDirectoryInternal = internalQuery/);
assert.match(resources, /export const searchCommunityResourceDirectoryInternal = internalQuery/);
assert.equal(
  (resources.match(/await requireCommunityResourceDirectoryToolAccess/g) ?? []).length,
  5,
  "each resource tool query should revalidate community chat access",
);
assert.match(resources, /resolveUserIdForAuthenticatedRequest/);
assert.match(resources, /requireCommunityChatAccess/);
assert.match(resources, /canManageCommunityResources[\s\S]*scope: canManage \? "builder" : "member"/);
assert.match(
  resources,
  /listResourceDirectoryLiveModules[\s\S]*listResourceDirectoryLivePageResources[\s\S]*communityResourceIsLiveModulePage/,
  "resource tools should use the live-module page boundary",
);
assert.match(
  resources,
  /parseCommunityResourceDirectoryUri[\s\S]*community_resource_directory_community_mismatch/,
  "directory URI reads should fail closed across community ids",
);
assert.match(
  resources,
  /directory_uri: `\$\{moduleDirectory\.directory_uri\}\/\$\{COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT\}`/,
  "source inbox directory entries should return their own navigable URI",
);
assert.match(
  resources,
  /directoryUri: sourceInbox[\s\S]*\? `\$\{candidate\.directory_uri\}\/\$\{COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT\}`[\s\S]*: candidate\.directory_uri/,
  "source inbox path resolution should return the source inbox URI, not the parent module URI",
);
assert.match(
  resources,
  /ambiguous_resource_ref[\s\S]*Use directory_uri or resource_id/,
  "readable path collisions should return an actionable ambiguity result",
);
assert.match(
  resources,
  /has_file: Boolean\(row\.fileKey\)/,
  "tool payloads should expose file presence without leaking storage keys",
);
assert.doesNotMatch(
  resources,
  /file_key:/,
  "resource tool payloads should not expose raw storage file keys",
);

assert.match(runtimeAgentLoop, /toolName === "community_resources_map"/);
assert.match(runtimeAgentLoop, /toolName === "community_resources_read"/);
assert.match(runtimeAgentLoop, /toolName === "community_resources_list"/);
assert.match(runtimeAgentLoop, /toolName === "community_resource_read"/);
assert.match(runtimeAgentLoop, /toolName === "community_resources_search"/);
assert.match(
  runtimeAgentLoop,
  /community_resources_map requires an active community context/,
);
assert.match(
  runtimeAgentLoop,
  /community_resources_read requires an active community context/,
);
assert.match(
  runtimeAgentLoop,
  /community_resources_list requires an active community context/,
);
assert.match(
  runtimeAgentLoop,
  /internal\.communityResources\.mapCommunityResourcesForToolInternal/,
);
assert.match(
  runtimeAgentLoop,
  /internal\.communityResources\.readCommunityResourcesForToolInternal/,
);
assert.match(
  runtimeAgentLoop,
  /internal\.communityResources\.listCommunityResourceDirectoryInternal/,
);
assert.match(
  runtimeAgentLoop,
  /internal\.communityResources\.readCommunityResourceDirectoryInternal/,
);
assert.match(
  runtimeAgentLoop,
  /internal\.communityResources\.searchCommunityResourceDirectoryInternal/,
);

assert.match(runtimePrompt, /When available, use community resource tools when canonical resource navigation/);
assert.match(runtimePrompt, /Use community_resources_map first/);
assert.match(runtimePrompt, /Use community_resources_read to batch-read/);
assert.match(runtimePrompt, /Use community_resources_list to inspect/);
assert.match(runtimePrompt, /Use community_resource_read to inspect one member-visible resource/);
assert.match(runtimePrompt, /Use community_resources_search for targeted lookup/);
assert.match(timeline, /community_resources_map/);
assert.match(timeline, /community_resources_read/);
assert.match(timeline, /community_resources_list/);
assert.match(timeline, /community_resource_read/);
assert.match(timeline, /community_resources_search/);
assert.match(timelineUi, /community_resources_map/);
assert.match(timelineUi, /community_resources_read/);
assert.match(timelineUi, /community_resources_list/);
assert.match(timelineUi, /community_resource_read/);
assert.match(timelineUi, /community_resources_search/);

assert.match(
  polynetMcp,
  /polynet_workspace_resources_map[\s\S]*polynet_workspace_resources_list[\s\S]*polynet_workspace_resource_read[\s\S]*polynet_workspace_resources_search[\s\S]*polynet_workspace_builder_resources_map[\s\S]*polynet_workspace_builder_resources_list[\s\S]*polynet_workspace_builder_resource_read/,
  "public Polynet MCP should expose read-only member resources plus read-only builder resource inspection",
);
for (const toolName of [
  "polynet_workspace_resources_map",
  "polynet_workspace_resources_list",
  "polynet_workspace_resource_read",
  "polynet_workspace_resources_search",
]) {
  assert.match(polynetMcp, new RegExp(`name: "${toolName}"[\\s\\S]*readOnlyHint: true`));
  assert.match(httpMcp, new RegExp(`toolName === "${toolName}"[\\s\\S]*requireWorkspaceAuthorityToolset[\\s\\S]*"member_resources"`));
}
assert.match(
  httpMcp,
  /polynet_workspace_resources_map[\s\S]*mapCommunityResourcesForToolInternal/,
  "PolyMCP resource map should use the read-only resource map internal",
);
assert.match(
  httpMcp,
  /polynet_workspace_resources_list[\s\S]*listCommunityResourceDirectoryInternal/,
  "PolyMCP resource list should use the member-visible directory list internal",
);
assert.match(
  httpMcp,
  /polynet_workspace_resource_read[\s\S]*readCommunityResourceDirectoryInternal/,
  "PolyMCP resource read should use the member-visible directory read internal",
);
assert.match(
  httpMcp,
  /polynet_workspace_resources_search[\s\S]*searchCommunityResourceDirectoryInternal/,
  "PolyMCP resource search should use the member-visible directory search internal",
);
assert.match(
  polynetMcp,
  /name: "polynet_workspace_builder_resources_map"[\s\S]*readOnlyHint: true/,
  "PolyMCP builder resource map should be read-only",
);
assert.match(
  httpMcp,
  /toolName === "polynet_workspace_builder_resources_map"[\s\S]*requireWorkspaceAuthorityToolset[\s\S]*"builder_resources"[\s\S]*mapCommunityResourcesForToolInternal/,
  "PolyMCP builder resource map should require builder resources and use the map internal",
);
assert.match(
  polynetMcp,
  /name: "polynet_workspace_builder_resources_list"[\s\S]*readOnlyHint: true/,
  "PolyMCP builder resource list should be read-only",
);
assert.match(
  httpMcp,
  /toolName === "polynet_workspace_builder_resources_list"[\s\S]*requireWorkspaceAuthorityToolset[\s\S]*"builder_resources"[\s\S]*listCommunityResourceBuilderDirectory/,
  "PolyMCP builder resource list should require builder resources and use the builder directory list API",
);
assert.match(
  polynetMcp,
  /name: "polynet_workspace_builder_resource_read"[\s\S]*readOnlyHint: true/,
  "PolyMCP builder resource read should be read-only",
);
assert.match(
  httpMcp,
  /toolName === "polynet_workspace_builder_resource_read"[\s\S]*requireWorkspaceAuthorityToolset[\s\S]*"builder_resources"[\s\S]*readCommunityResourceBuilderResource/,
  "PolyMCP builder resource read should require builder resources and use the builder resource read API",
);
assert.doesNotMatch(
  httpMcp,
  /toolName === "polynet_workspace_builder_resources_map"[\s\S]*readCommunityResourcesForToolInternal/,
  "PolyMCP builder resource map should not expose batch read",
);
assert.doesNotMatch(
  polynetMcp,
  /polynet_workspace_resources_read|polynet_workspace_resources_stage|polynet_workspace_resources_apply|polynet_workspace_builder_resources_stage|polynet_workspace_builder_resource_stage|polynet_workspace_builder_resources_apply|polynet_workspace_builder_resource_apply/,
  "public Polynet MCP should not expose resource batch read, stage, or apply tools",
);
assert.doesNotMatch(
  httpMcp,
  /toolName === "polynet_workspace_resources_(read|stage|apply)"|toolName === "polynet_workspace_builder_resources_(stage|apply)"|toolName === "polynet_workspace_builder_resource_(stage|apply)"/,
  "provider MCP should not dispatch resource batch read, stage, or apply tools",
);
assert.match(
  cognitionDocs,
  /platform-harness resource surface[\s\S]*map, batch-read, list, read, and search/i,
  "community cognition contract should describe the resource direct-read slice",
);

console.log("community_resource_tools_contract_proof: ok");
