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
  "POLYMCP_HARNESS_CONFIG",
  "PolyMCP copy config payload",
);
assertIncludes(
  integrationsSettings,
  "mcpServers",
  "PolyMCP harness config shape",
);
assertIncludes(
  integrationsSettings,
  "mcp-remote@latest",
  "PolyMCP mcp-remote adapter",
);
assertIncludes(
  integrationsSettings,
  "POLYMCP_AGENT_INSTRUCTIONS",
  "PolyMCP copied agent instructions",
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
  "```json",
  "PolyMCP setup bundle includes a JSON config block",
);
assertIncludes(
  integrationsSettings,
  "Open that harness's MCP server configuration",
  "PolyMCP setup copy should tell users where to configure MCP",
);
assertIncludes(
  integrationsSettings,
  "restart or reload the harness",
  "PolyMCP setup copy should tell users how to activate the MCP server",
);
assertIncludes(
  integrationsSettings,
  "Complete the PolyNet OAuth sign-in",
  "PolyMCP setup copy should explain auth completion",
);
assertIncludes(
  integrationsSettings,
  "If your harness only accepts raw JSON",
  "PolyMCP setup copy should support JSON-only harnesses",
);
assertIncludes(
  integrationsSettings,
  "Use PolyMCP when the user asks",
  "PolyMCP instruction trigger",
);
assertIncludes(
  integrationsSettings,
  "Treat workspace_context_id values as opaque selectors",
  "PolyMCP workspace selector instruction",
);
assertIncludes(
  integrationsSettings,
  "Copy setup",
  "PolyMCP canonical setup copy action",
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
]) {
  const block = toolDefinitionBlock(polynetMcp, toolName);
  assertIncludes(block, "workspace_context_id", `${toolName} schema`);
}

const openWorkspaceDefinition = toolDefinitionBlock(polynetMcp, "polynet_open_workspace");
assertIncludes(openWorkspaceDefinition, "workspace: {", "open workspace context output");
assertIncludes(openWorkspaceDefinition, "additionalProperties: true", "open workspace context output");

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
