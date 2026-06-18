import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(source: string, expected: string, label: string) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`);
}

function assertNotIncludes(source: string, forbidden: string, label: string) {
  assert.ok(!source.includes(forbidden), `${label} should not include ${forbidden}`);
}

function toolDefinitionBlock(source: string, toolName: string): string {
  const startToken = `${toolName}: {`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${toolName} definition should exist`);
  const next = source.indexOf("\n  polynet_", start + startToken.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function toolDispatchBlock(source: string, toolName: string): string {
  const startToken = `toolName === "${toolName}"`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${toolName} dispatch should exist`);
  const next = source.indexOf("\n  if (toolName ===", start + startToken.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const contract = read("docs/polynet-workspace-mcp-contract-v0.md");
const polynetMcp = read("shared/polynetMcp.ts");
const httpMcp = read("convex/httpMcp.ts");
const packageJson = read("package.json");
const integrationsSettings = read(
  "apps/web/src/components/WebIntegrationsSettingsSection.tsx",
);

assertIncludes(
  contract,
  "PolyNet Workspace MCP is a provider surface.",
  "workspace MCP contract first principle",
);
assertIncludes(
  contract,
  "It is not the existing PolyNet MCP app consumer path.",
  "workspace MCP provider/consumer boundary",
);
assertIncludes(
  contract,
  "`workspace_context_id` is a portable handle",
  "workspace MCP context handle",
);
assertIncludes(
  contract,
  "The MCP client must never provide a trusted `communityId`, user id, entitlement, or permission decision.",
  "workspace MCP authority boundary",
);
assertIncludes(
  contract,
  "authority.authority_lens",
  "workspace MCP authority projection",
);
assertIncludes(
  contract,
  "authority.available_toolsets",
  "workspace MCP authority toolset projection",
);
assertIncludes(
  contract,
  "normalize those to `no_access`",
  "workspace MCP no-access projection",
);
assertIncludes(
  contract,
  "## Resource Boundary",
  "workspace MCP resource boundary",
);
assertIncludes(
  contract,
  "## Product Docs Boundary",
  "workspace MCP product docs boundary",
);
assertIncludes(
  contract,
  "require the `member_resources` authority toolset",
  "workspace MCP member resource authority gate",
);
assertIncludes(
  contract,
  "use only bounded resource-tool internals",
  "workspace MCP member resource backend boundary",
);
assertIncludes(
  contract,
  "They must not expose resource batch read",
  "workspace MCP resource non-goals",
);
assertIncludes(
  contract,
  "provider implementation does not import or mutate the internal MCP consumer/runtime path.",
  "workspace MCP non-interference acceptance",
);

assertIncludes(
  packageJson,
  "\"check:polynet-workspace-mcp-proof\": \"node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_contract_proof.ts\"",
  "package proof script",
);

assertIncludes(
  integrationsSettings,
  "POLYMCP_CODEX_SETUP_COMMANDS",
  "PolyMCP Codex setup commands",
);
assertIncludes(
  integrationsSettings,
  "15 workspace tools",
  "PolyMCP integration tool count",
);
assertIncludes(
  integrationsSettings,
  "codex mcp add polymcp --url",
  "PolyMCP Codex add command",
);
assertIncludes(
  integrationsSettings,
  "codex mcp login polymcp",
  "PolyMCP Codex login command",
);
assertIncludes(
  integrationsSettings,
  "POLYMCP_GENERIC_HTTP_CONFIG",
  "PolyMCP generic HTTP config payload",
);
assertIncludes(
  integrationsSettings,
  "mcpServers",
  "PolyMCP harness config shape",
);
assertIncludes(
  integrationsSettings,
  'type: "http"',
  "PolyMCP generic HTTP config type",
);
assertIncludes(
  integrationsSettings,
  "POLYMCP_SETUP_INSTRUCTIONS",
  "PolyMCP copied setup instructions",
);
assertIncludes(
  integrationsSettings,
  "POLYMCP_SETUP_BUNDLE",
  "PolyMCP canonical setup bundle",
);
assertIncludes(
  integrationsSettings,
  "# PolyMCP Setup",
  "PolyMCP setup bundle heading",
);
assertIncludes(
  integrationsSettings,
  "```bash",
  "PolyMCP setup bundle includes Codex commands",
);
assertIncludes(
  integrationsSettings,
  "```json",
  "PolyMCP setup bundle includes a JSON config block",
);
assertIncludes(
  integrationsSettings,
  "Your harness starts OAuth",
  "PolyMCP setup copy should explain harness-owned OAuth",
);
assertIncludes(
  integrationsSettings,
  "open a new Codex thread",
  "PolyMCP setup copy should tell users how to activate the MCP server",
);
assertIncludes(
  integrationsSettings,
  "Use this if your harness asks for MCP JSON",
  "PolyMCP setup copy should support JSON-only harnesses",
);
assertIncludes(
  integrationsSettings,
  "List my PolyNet workspaces",
  "PolyMCP setup copy should give a smoke-test prompt",
);
assertIncludes(
  integrationsSettings,
  "Copy setup",
  "PolyMCP canonical setup copy action",
);
assertNotIncludes(
  integrationsSettings,
  "POLYNET_MCP_BEARER_TOKEN",
  "PolyMCP setup should not ask users to configure bearer tokens",
);
assertNotIncludes(
  integrationsSettings,
  "mcp-remote@latest",
  "PolyMCP should not make mcp-remote the canonical setup path",
);
assertNotIncludes(
  integrationsSettings,
  "Copy config",
  "PolyMCP should not split the config copy action",
);
assertNotIncludes(
  integrationsSettings,
  "Copy instructions",
  "PolyMCP should not split the instructions copy action",
);
assertNotIncludes(
  integrationsSettings,
  "handleCopyPolyMcpUrl",
  "PolyMCP should not copy only the endpoint URL",
);

for (const toolName of [
  "polynet_list_workspaces",
  "polynet_open_workspace",
  "polynet_get_workspace_context",
  "polynet_product_docs_search",
  "polynet_product_doc_read",
  "polynet_workspace_memory_search",
  "polynet_workspace_memory_read",
  "polynet_workspace_record_outcome",
  "polynet_workspace_resources_map",
  "polynet_workspace_resources_list",
  "polynet_workspace_resource_read",
  "polynet_workspace_resources_search",
  "polynet_workspace_builder_resources_map",
  "polynet_workspace_builder_resources_list",
  "polynet_workspace_builder_resource_read",
]) {
  assertIncludes(polynetMcp, `| "${toolName}"`, `${toolName} type union`);
  assertIncludes(polynetMcp, `name: "${toolName}"`, `${toolName} tool definition`);
  assertIncludes(httpMcp, `toolName === "${toolName}"`, `${toolName} HTTP dispatch`);
}

assertIncludes(
  polynetMcp,
  "const WORKSPACE_CONTEXT_ID_SCHEMA",
  "workspace context schema",
);
for (const toolName of [
  "polynet_get_workspace_context",
  "polynet_workspace_memory_search",
  "polynet_workspace_memory_read",
  "polynet_workspace_record_outcome",
  "polynet_workspace_resources_map",
  "polynet_workspace_resources_list",
  "polynet_workspace_resource_read",
  "polynet_workspace_resources_search",
  "polynet_workspace_builder_resources_map",
  "polynet_workspace_builder_resources_list",
  "polynet_workspace_builder_resource_read",
]) {
  const block = toolDefinitionBlock(polynetMcp, toolName);
  assertIncludes(block, "workspace_context_id", `${toolName} schema`);
}

for (const toolName of [
  "polynet_product_docs_search",
  "polynet_product_doc_read",
]) {
  const definition = toolDefinitionBlock(polynetMcp, toolName);
  assertIncludes(definition, "readOnlyHint: true", `${toolName} read-only annotation`);
  assertNotIncludes(definition, "workspace_context_id", `${toolName} platform docs scope`);
  const dispatch = toolDispatchBlock(httpMcp, toolName);
  assertNotIncludes(dispatch, "resolveWorkspaceContext", `${toolName} no workspace selector`);
  assertNotIncludes(dispatch, "requireWorkspaceAuthorityToolset", `${toolName} no workspace authority gate`);
}
assertIncludes(
  httpMcp,
  "executeSearchProductDocsTool",
  "product docs search runtime helper",
);
assertIncludes(
  httpMcp,
  "executeGetProductDocTool",
  "product docs read runtime helper",
);

const openWorkspaceDefinition = toolDefinitionBlock(polynetMcp, "polynet_open_workspace");
assertIncludes(openWorkspaceDefinition, "workspace: {", "open workspace context output");
assertIncludes(openWorkspaceDefinition, "additionalProperties: true", "open workspace context output");
assertIncludes(openWorkspaceDefinition, "authority: WORKSPACE_AUTHORITY_SCHEMA", "open workspace authority output");

const workspaceContextDefinition = toolDefinitionBlock(polynetMcp, "polynet_get_workspace_context");
assertIncludes(workspaceContextDefinition, "authority: WORKSPACE_AUTHORITY_SCHEMA", "workspace context authority output");
assertIncludes(polynetMcp, "const WORKSPACE_AUTHORITY_SCHEMA", "workspace authority schema");
assertIncludes(polynetMcp, "\"authority_lens\"", "workspace authority lens schema");
assertIncludes(polynetMcp, "\"available_toolsets\"", "workspace authority toolset schema");
assertIncludes(polynetMcp, "\"no_access\"", "workspace no-access relation schema");
assertNotIncludes(polynetMcp, "\"visitor\"", "MCP-facing relation schemas");

for (const toolName of [
  "polynet_workspace_memory_search",
  "polynet_workspace_memory_read",
]) {
  const block = toolDefinitionBlock(polynetMcp, toolName);
  assertNotIncludes(block, "readOnlyHint: true", `${toolName} retrieval-log side effect annotation`);
}

assertIncludes(
  httpMcp,
  "const WORKSPACE_CONTEXT_PREFIX = \"community:\";",
  "workspace context id shape",
);
assertIncludes(
  httpMcp,
  "function parseWorkspaceContextId",
  "workspace context parsing",
);
assertIncludes(
  httpMcp,
  "function sanitizeMcpAccessRelation",
  "MCP access relation projection",
);
assertIncludes(
  httpMcp,
  "function buildWorkspaceAuthority",
  "MCP authority projection",
);
assertIncludes(
  httpMcp,
  "authority_lens",
  "MCP authority lens output",
);
assertIncludes(
  httpMcp,
  "available_toolsets",
  "MCP authority toolset output",
);
assertIncludes(
  httpMcp,
  "async function resolveWorkspaceContext",
  "server-side workspace resolver",
);
const resolverBlockStart = httpMcp.indexOf("async function resolveWorkspaceContext");
const resolverBlockEnd = httpMcp.indexOf("\nfunction normalizeWorkspaceMemoryTypes", resolverBlockStart);
const resolverBlock = httpMcp.slice(resolverBlockStart, resolverBlockEnd);
assertIncludes(resolverBlock, "listAccessibleCommunities", "workspace resolver membership lookup");
assertIncludes(resolverBlock, "getMyCommunityAccessBySlug", "workspace resolver access lookup");
assertIncludes(resolverBlock, "workspaceAccessIsOpen", "workspace resolver capability gate");
assertNotIncludes(resolverBlock, "toolArgs.communityId", "workspace resolver");

const memorySearchDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_memory_search");
assertIncludes(memorySearchDispatch, "resolveWorkspaceContext", "memory search workspace revalidation");
assertIncludes(memorySearchDispatch, "searchCommunityMemoryInternal", "memory search accepted directory path");
assertNotIncludes(memorySearchDispatch, "searchCommunityKnowledgeInternal", "memory search raw archive path");
assertNotIncludes(memorySearchDispatch, "communityArchive", "memory search raw archive path");
assertNotIncludes(memorySearchDispatch, "runtimeMcpManager", "memory search internal MCP consumer boundary");

const memoryReadDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_memory_read");
assertIncludes(memoryReadDispatch, "resolveWorkspaceContext", "memory read workspace revalidation");
assertIncludes(memoryReadDispatch, "readCommunityMemoryInternal", "memory read accepted directory path");
assertIncludes(memoryReadDispatch, "node_id is required", "memory read node id validation");
assertNotIncludes(memoryReadDispatch, "communityArchive", "memory read raw archive path");

const outcomeDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_record_outcome");
assertIncludes(outcomeDispatch, "resolveWorkspaceContext", "outcome workspace revalidation");
assertIncludes(outcomeDispatch, "recordCommunityOutcomeObservationInternal", "outcome accepted memory feedback path");
assertIncludes(outcomeDispatch, "retrieval_log_id is required", "outcome retrieval provenance");
assertIncludes(outcomeDispatch, "result_status must be worked, failed, or mixed", "outcome status validation");
assertNotIncludes(outcomeDispatch, "communityIntelligenceNodes", "outcome direct node mutation");
assertNotIncludes(outcomeDispatch, "communityIntelligenceEdges", "outcome direct edge mutation");

for (const toolName of [
  "polynet_workspace_resources_list",
  "polynet_workspace_resource_read",
  "polynet_workspace_resources_search",
]) {
  const definition = toolDefinitionBlock(polynetMcp, toolName);
  assertIncludes(definition, "readOnlyHint: true", `${toolName} read-only annotation`);
  assertIncludes(definition, "member-visible", `${toolName} member-visible description`);
  const dispatch = toolDispatchBlock(httpMcp, toolName);
  assertIncludes(dispatch, "resolveWorkspaceContext", `${toolName} workspace revalidation`);
  assertIncludes(dispatch, "requireWorkspaceAuthorityToolset", `${toolName} authority toolset gate`);
  assertIncludes(dispatch, "\"member_resources\"", `${toolName} member resource toolset gate`);
  assertNotIncludes(dispatch, "mapCommunityResourcesForToolInternal", `${toolName} no resource map path`);
  assertNotIncludes(dispatch, "readCommunityResourcesForToolInternal", `${toolName} no batch read path`);
  assertNotIncludes(dispatch, "listCommunityResourceBuilderDirectory", `${toolName} no builder list path`);
  assertNotIncludes(dispatch, "readCommunityResourceBuilderResource", `${toolName} no builder read path`);
  assertNotIncludes(dispatch, "stageCommunityResourceBuilderChangeset", `${toolName} no staged mutation path`);
  assertNotIncludes(dispatch, "applyCommunityResourceBuilderChangeset", `${toolName} no apply mutation path`);
}

const resourceMapDefinition = toolDefinitionBlock(polynetMcp, "polynet_workspace_resources_map");
assertIncludes(resourceMapDefinition, "readOnlyHint: true", "resource map read-only annotation");
assertIncludes(resourceMapDefinition, "Members see live resources", "resource map member-visible description");
assertIncludes(resourceMapDefinition, "builders may receive builder-visible", "resource map builder authority description");

const resourceMapDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_resources_map");
assertIncludes(resourceMapDispatch, "resolveWorkspaceContext", "resource map workspace revalidation");
assertIncludes(resourceMapDispatch, "requireWorkspaceAuthorityToolset", "resource map authority toolset gate");
assertIncludes(resourceMapDispatch, "\"member_resources\"", "resource map member resource toolset gate");
assertIncludes(resourceMapDispatch, "mapCommunityResourcesForToolInternal", "resource map internal path");
assertIncludes(resourceMapDispatch, "perModuleLimit", "resource map per-module limit");
assertNotIncludes(resourceMapDispatch, "readCommunityResourcesForToolInternal", "resource map no batch read path");
assertNotIncludes(resourceMapDispatch, "listCommunityResourceBuilderDirectory", "resource map no builder list path");
assertNotIncludes(resourceMapDispatch, "readCommunityResourceBuilderResource", "resource map no builder read path");
assertNotIncludes(resourceMapDispatch, "stageCommunityResourceBuilderChangeset", "resource map no staged mutation path");
assertNotIncludes(resourceMapDispatch, "applyCommunityResourceBuilderChangeset", "resource map no apply mutation path");

const resourceListDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_resources_list");
assertIncludes(resourceListDispatch, "listCommunityResourceDirectoryInternal", "resource list member directory path");

const resourceReadDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_resource_read");
assertIncludes(resourceReadDispatch, "readCommunityResourceDirectoryInternal", "resource read member directory path");
assertIncludes(resourceReadDispatch, "ref is required", "resource read ref validation");

const resourceSearchDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_resources_search");
assertIncludes(resourceSearchDispatch, "searchCommunityResourceDirectoryInternal", "resource search member directory path");
assertIncludes(resourceSearchDispatch, "query is required", "resource search query validation");

const builderResourceMapDefinition = toolDefinitionBlock(polynetMcp, "polynet_workspace_builder_resources_map");
assertIncludes(builderResourceMapDefinition, "readOnlyHint: true", "builder resource map read-only annotation");
assertIncludes(builderResourceMapDefinition, "builder-visible", "builder resource map description");
assertIncludes(builderResourceMapDefinition, "draft/source", "builder resource map draft/source description");
assertIncludes(builderResourceMapDefinition, "resource health", "builder resource map health description");

const builderResourceMapDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_builder_resources_map");
assertIncludes(builderResourceMapDispatch, "resolveWorkspaceContext", "builder resource map workspace revalidation");
assertIncludes(builderResourceMapDispatch, "requireWorkspaceAuthorityToolset", "builder resource map authority toolset gate");
assertIncludes(builderResourceMapDispatch, "\"builder_resources\"", "builder resource map builder toolset gate");
assertIncludes(builderResourceMapDispatch, "mapCommunityResourcesForToolInternal", "builder resource map internal path");
assertIncludes(builderResourceMapDispatch, "perModuleLimit", "builder resource map per-module limit");
assertNotIncludes(builderResourceMapDispatch, "readCommunityResourcesForToolInternal", "builder resource map no batch read path");
assertNotIncludes(builderResourceMapDispatch, "listCommunityResourceBuilderDirectory", "builder resource map no builder list path");
assertNotIncludes(builderResourceMapDispatch, "readCommunityResourceBuilderResource", "builder resource map no builder read path");
assertNotIncludes(builderResourceMapDispatch, "stageCommunityResourceBuilderChangeset", "builder resource map no staged mutation path");
assertNotIncludes(builderResourceMapDispatch, "applyCommunityResourceBuilderChangeset", "builder resource map no apply mutation path");

const builderResourceListDefinition = toolDefinitionBlock(polynetMcp, "polynet_workspace_builder_resources_list");
assertIncludes(builderResourceListDefinition, "readOnlyHint: true", "builder resource list read-only annotation");
assertIncludes(builderResourceListDefinition, "builder-visible", "builder resource list description");

const builderResourceListDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_builder_resources_list");
assertIncludes(builderResourceListDispatch, "resolveWorkspaceContext", "builder resource list workspace revalidation");
assertIncludes(builderResourceListDispatch, "requireWorkspaceAuthorityToolset", "builder resource list authority toolset gate");
assertIncludes(builderResourceListDispatch, "\"builder_resources\"", "builder resource list builder toolset gate");
assertIncludes(builderResourceListDispatch, "listCommunityResourceBuilderDirectory", "builder resource list internal path");
assertNotIncludes(builderResourceListDispatch, "stageCommunityResourceBuilderChangeset", "builder resource list no staged mutation path");
assertNotIncludes(builderResourceListDispatch, "applyCommunityResourceBuilderChangeset", "builder resource list no apply mutation path");

const builderResourceReadDefinition = toolDefinitionBlock(polynetMcp, "polynet_workspace_builder_resource_read");
assertIncludes(builderResourceReadDefinition, "readOnlyHint: true", "builder resource read read-only annotation");
assertIncludes(builderResourceReadDefinition, "builder-visible", "builder resource read description");
assertIncludes(builderResourceReadDefinition, "ref", "builder resource read ref input");

const builderResourceReadDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_builder_resource_read");
assertIncludes(builderResourceReadDispatch, "resolveWorkspaceContext", "builder resource read workspace revalidation");
assertIncludes(builderResourceReadDispatch, "requireWorkspaceAuthorityToolset", "builder resource read authority toolset gate");
assertIncludes(builderResourceReadDispatch, "\"builder_resources\"", "builder resource read builder toolset gate");
assertIncludes(builderResourceReadDispatch, "readCommunityResourceBuilderResource", "builder resource read internal path");
assertIncludes(builderResourceReadDispatch, "ref is required", "builder resource read ref validation");
assertNotIncludes(builderResourceReadDispatch, "stageCommunityResourceBuilderChangeset", "builder resource read no staged mutation path");
assertNotIncludes(builderResourceReadDispatch, "applyCommunityResourceBuilderChangeset", "builder resource read no apply mutation path");

const rawSearchDispatch = toolDispatchBlock(httpMcp, "polynet_community_search");
assertIncludes(rawSearchDispatch, "searchCommunityKnowledgeInternal", "raw community search remains separate");
assertNotIncludes(rawSearchDispatch, "searchCommunityMemoryInternal", "raw community search should not masquerade as accepted memory");

assertNotIncludes(httpMcp, "runtimeMcpManager", "provider MCP HTTP adapter");
assertNotIncludes(httpMcp, "userPlatformAppMounts", "provider MCP HTTP adapter");
assertNotIncludes(httpMcp, "communityAppMounts", "provider MCP HTTP adapter");
assertNotIncludes(httpMcp, "appValidation", "provider MCP HTTP adapter");
assertNotIncludes(httpMcp, "appFetchPolicy", "provider MCP HTTP adapter");
assertNotIncludes(httpMcp, "runtimeHarnessComposition", "provider MCP HTTP adapter");

console.log("polynet_workspace_mcp_contract_proof: ok");
