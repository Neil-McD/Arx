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
  "require the `member_resources` authority toolset",
  "workspace MCP member resource authority gate",
);
assertIncludes(
  contract,
  "use only the member-visible directory internals",
  "workspace MCP member resource backend boundary",
);
assertIncludes(
  contract,
  "must not expose resource map, batch read",
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
  "9 workspace tools",
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
  "polynet_workspace_memory_search",
  "polynet_workspace_memory_read",
  "polynet_workspace_record_outcome",
  "polynet_workspace_resources_list",
  "polynet_workspace_resource_read",
  "polynet_workspace_resources_search",
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
  "polynet_workspace_resources_list",
  "polynet_workspace_resource_read",
  "polynet_workspace_resources_search",
]) {
  const block = toolDefinitionBlock(polynetMcp, toolName);
  assertIncludes(block, "workspace_context_id", `${toolName} schema`);
}

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

const resourceListDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_resources_list");
assertIncludes(resourceListDispatch, "listCommunityResourceDirectoryInternal", "resource list member directory path");

const resourceReadDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_resource_read");
assertIncludes(resourceReadDispatch, "readCommunityResourceDirectoryInternal", "resource read member directory path");
assertIncludes(resourceReadDispatch, "ref is required", "resource read ref validation");

const resourceSearchDispatch = toolDispatchBlock(httpMcp, "polynet_workspace_resources_search");
assertIncludes(resourceSearchDispatch, "searchCommunityResourceDirectoryInternal", "resource search member directory path");
assertIncludes(resourceSearchDispatch, "query is required", "resource search query validation");

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
