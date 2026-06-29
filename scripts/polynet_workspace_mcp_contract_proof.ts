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
  "Polynet Workspace MCP is a provider surface.",
  "workspace MCP contract first principle",
);
assertIncludes(
  contract,
  "It is not the existing Polynet MCP app consumer path.",
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
  contract,
  "The local OAuth callback completion page is owned by the external MCP client or adapter, not by Polynet.",
  "workspace MCP contract should assign callback UI ownership to the harness",
);
assertIncludes(
  contract,
  "Authentication complete. You may close this window.",
  "workspace MCP contract should describe the plain local callback page",
);
assertIncludes(
  contract,
  "start a fresh chat or reconnect MCP",
  "workspace MCP contract should document reconnect guidance after login",
);
assertIncludes(
  contract,
  "The copied setup should be a self-contained setup packet for the receiving agent.",
  "workspace MCP contract should define the setup packet model",
);
assertIncludes(
  contract,
  "The packet must keep the receiving agent focused on the Polynet connection.",
  "workspace MCP contract should constrain receiving-agent setup behavior",
);
assertIncludes(
  contract,
  "It should not repair unrelated shell aliases, package managers, or local installs unless the user explicitly asks.",
  "workspace MCP contract should keep setup from detouring into unrelated CLI repair",
);
assertIncludes(
  contract,
  "New harness setup should use `polynet` as the canonical local server alias.",
  "workspace MCP contract should define canonical polynet alias",
);
assertIncludes(
  contract,
  "Existing harnesses that already have `polymcp` configured should treat it as the same Polynet MCP server.",
  "workspace MCP contract should preserve legacy polymcp alias",
);
assertIncludes(
  contract,
  "must not tell users to install both aliases unless the user explicitly wants to migrate",
  "workspace MCP contract should prevent duplicate alias installs",
);
assertIncludes(
  contract,
  "[Sign in to Polynet](AUTHORIZATION_URL)",
  "workspace MCP contract should define clean OAuth link presentation",
);
assertIncludes(
  contract,
  "It should not paste the raw full OAuth URL unless no cleaner link path is available.",
  "workspace MCP contract should discourage raw OAuth URL dumps",
);
assertIncludes(
  contract,
  "only ask the user to paste the localhost callback URL back if the browser callback fails",
  "workspace MCP contract should reserve callback URL paste for failure recovery",
);
assertIncludes(
  contract,
  "Claude Code setup should use native remote HTTP MCP",
  "workspace MCP contract should include Claude Code setup",
);
assertIncludes(
  contract,
  "claude mcp add --transport http polynet https://www.polynet.ai/runtime/mcp",
  "workspace MCP contract should include the Claude Code remote HTTP command",
);
assertIncludes(
  contract,
  "codex mcp add polynet --url https://www.polynet.ai/runtime/mcp",
  "workspace MCP contract should include the canonical Codex add command",
);
assertIncludes(
  contract,
  "codex mcp login polynet --scopes openid,profile,email,offline_access",
  "workspace MCP contract should include the canonical Codex login fallback",
);

assertIncludes(
  packageJson,
  "\"check:polynet-workspace-mcp-proof\": \"node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_contract_proof.ts\"",
  "package proof script",
);

assertIncludes(
  integrationsSettings,
  "POLYNET_MCP_CLAUDE_CODE_ADD_COMMAND",
  "Polynet Claude Code add command constant",
);
assertIncludes(
  integrationsSettings,
  "POLYNET_MCP_CODEX_ADD_COMMAND",
  "Polynet Codex primary add command",
);
assertIncludes(
  integrationsSettings,
  "POLYNET_MCP_CODEX_LOGIN_FALLBACK_COMMAND",
  "Polynet Codex login fallback command",
);
assertIncludes(
  integrationsSettings,
  "15 workspace tools",
  "PolyMCP integration tool count",
);
assertIncludes(
  integrationsSettings,
  "claude mcp add --transport http polynet",
  "Polynet Claude Code remote HTTP add command",
);
assertIncludes(
  integrationsSettings,
  "/mcp",
  "PolyMCP Claude Code OAuth flow command",
);
assertIncludes(
  integrationsSettings,
  "codex mcp add polynet --url",
  "Polynet Codex add command",
);
assertIncludes(
  integrationsSettings,
  "codex mcp login polynet",
  "Polynet Codex login fallback command",
);
assertIncludes(
  integrationsSettings,
  "--scopes openid,profile,email,offline_access",
  "PolyMCP Codex login requests refresh-capable scopes",
);
assertIncludes(
  integrationsSettings,
  'mcp_oauth_credentials_store = "keyring"',
  "PolyMCP Codex durable credential store recommendation",
);
assertIncludes(
  integrationsSettings,
  "before OAuth",
  "PolyMCP setup copy should put durable credential storage before OAuth",
);
assertIncludes(
  integrationsSettings,
  "Add Polynet:",
  "Polynet setup copy should make add the primary Codex setup command",
);
assertIncludes(
  integrationsSettings,
  "Only if Codex does not open OAuth during add, run:",
  "PolyMCP setup copy should make Codex login a fallback",
);
assertIncludes(
  integrationsSettings,
  "POLYNET_MCP_GENERIC_HTTP_CONFIG",
  "Polynet generic HTTP config payload",
);
assertIncludes(
  integrationsSettings,
  "mcpServers",
  "PolyMCP harness config shape",
);
assertIncludes(
  integrationsSettings,
  "polynet: {",
  "Polynet generic JSON config should use the canonical polynet key",
);
assertIncludes(
  integrationsSettings,
  'type: "http"',
  "PolyMCP generic HTTP config type",
);
assertIncludes(
  integrationsSettings,
  "POLYNET_MCP_SETUP_BUNDLE",
  "Polynet canonical setup bundle",
);
assertIncludes(
  integrationsSettings,
  "# Polynet Setup Packet",
  "Polynet setup packet heading",
);
assertIncludes(
  integrationsSettings,
  "You are helping the user connect this AI harness to Polynet.",
  "PolyMCP setup packet should address the receiving agent",
);
assertIncludes(
  integrationsSettings,
  "Connect Polynet so this harness can access the user's Polynet communities, resources, and workspace memory.",
  "Polynet setup packet should define the goal",
);
assertIncludes(
  integrationsSettings,
  "Polynet MCP endpoint:",
  "Polynet setup packet should include the endpoint label",
);
assertIncludes(
  integrationsSettings,
  "## Operating Rules",
  "PolyMCP setup packet should include operating rules",
);
assertIncludes(
  integrationsSettings,
  "Do not ask for or paste access tokens.",
  "PolyMCP setup packet should forbid token-paste setup",
);
assertIncludes(
  integrationsSettings,
  "Do not repair unrelated shell aliases, package managers, or local installs unless the user explicitly asks.",
  "PolyMCP setup packet should avoid unrelated CLI repair detours",
);
assertIncludes(
  integrationsSettings,
  "give the user the exact next command or click path and stop",
  "PolyMCP setup packet should make blocked auth handoff concise",
);
assertIncludes(
  integrationsSettings,
  "Use `polynet` as the server alias for new setup.",
  "Polynet setup packet should canonicalize new installs to polynet",
);
assertIncludes(
  integrationsSettings,
  "authenticate that existing server instead of adding a duplicate",
  "Polynet setup packet should prevent duplicate server installs",
);
assertIncludes(
  integrationsSettings,
  "## OAuth Link Handling",
  "PolyMCP setup packet should include OAuth link handling",
);
assertIncludes(
  integrationsSettings,
  "do not paste the raw full URL unless there is no other option",
  "PolyMCP setup packet should discourage raw OAuth URL dumps",
);
assertIncludes(
  integrationsSettings,
  "Open the authorization URL automatically if this harness can open browser links.",
  "PolyMCP setup packet should prefer automatic browser opening",
);
assertIncludes(
  integrationsSettings,
  "[Sign in to Polynet](AUTHORIZATION_URL)",
  "PolyMCP setup packet should prefer a clean markdown auth link",
);
assertIncludes(
  integrationsSettings,
  "Only ask the user to paste the localhost callback URL back if the browser callback fails",
  "PolyMCP setup packet should reserve callback URL paste for failure recovery",
);
assertIncludes(
  integrationsSettings,
  "treat it as a one-time OAuth credential",
  "PolyMCP setup packet should treat callback codes as sensitive",
);
assertIncludes(
  integrationsSettings,
  "## What To Do",
  "PolyMCP setup packet should include agent workflow instructions",
);
assertIncludes(
  integrationsSettings,
  "Identify which harness you are running in.",
  "PolyMCP setup packet should tell the receiving agent to identify its harness",
);
assertIncludes(
  integrationsSettings,
  "Add Polynet with the matching setup path below, unless Polynet is already configured.",
  "Polynet setup packet should not duplicate existing MCP registration",
);
assertIncludes(
  integrationsSettings,
  "If authentication is needed, give the user one clear sign-in action for this harness.",
  "PolyMCP setup packet should keep auth handoff to one clear action",
);
assertIncludes(
  integrationsSettings,
  "verify the connection by listing the user's Polynet workspaces",
  "PolyMCP setup packet should require connection verification",
);
assertIncludes(
  integrationsSettings,
  "## Claude Code",
  "PolyMCP setup packet should include Claude Code instructions",
);
assertIncludes(
  integrationsSettings,
  "Do not troubleshoot Claude installation paths unless the user asks.",
  "PolyMCP setup packet should avoid Claude local-install debugging detours",
);
assertIncludes(
  integrationsSettings,
  "Run `/mcp`, select `polynet`, then complete Polynet sign-in in the browser.",
  "Polynet setup packet should explain Claude Code sign-in",
);
assertIncludes(
  integrationsSettings,
  "show it as [Sign in to Polynet](AUTHORIZATION_URL), not as a raw URL block",
  "PolyMCP Claude Code instructions should avoid raw authorization URL blocks",
);
assertIncludes(
  integrationsSettings,
  "If Polynet already appears as `Needs authentication`, do not re-add it.",
  "Polynet setup packet should route configured Claude Code servers directly to auth",
);
assertIncludes(
  integrationsSettings,
  "## Codex",
  "PolyMCP setup packet should include Codex instructions",
);
assert.ok(
  integrationsSettings.indexOf("## Claude Code") < integrationsSettings.indexOf("## Codex"),
  "PolyMCP setup packet should put Claude Code before Codex",
);
assertIncludes(
  integrationsSettings,
  "```bash",
  "PolyMCP setup packet includes shell commands",
);
assertIncludes(
  integrationsSettings,
  "Add Polynet:",
  "Polynet setup bundle should label the primary add command",
);
assertIncludes(
  integrationsSettings,
  "Only if Codex does not open OAuth during add, run:",
  "PolyMCP setup bundle should label the login fallback",
);
assertIncludes(
  integrationsSettings,
  "If Polynet is already configured, do not add it again.",
  "Polynet setup packet should avoid duplicate Codex registration",
);
assertIncludes(
  integrationsSettings,
  "## Cursor Or Other JSON-Based Harnesses",
  "PolyMCP setup packet should include JSON-based harness instructions",
);
assertIncludes(
  integrationsSettings,
  "```json",
  "PolyMCP setup packet includes a JSON config block",
);
assertIncludes(
  integrationsSettings,
  "Use this HTTP MCP config:",
  "PolyMCP setup packet should support JSON-only harnesses",
);
assertIncludes(
  integrationsSettings,
  "## After Sign-In",
  "PolyMCP setup packet should include after-sign-in instructions",
);
assertIncludes(
  integrationsSettings,
  "Authentication complete. You may close this window.",
  "PolyMCP setup packet should normalize the local callback completion page",
);
assertIncludes(
  integrationsSettings,
  "Close that tab and return to this harness.",
  "PolyMCP setup packet should explain the callback handoff next action",
);
assertIncludes(
  integrationsSettings,
  "start a fresh chat or reconnect tools",
  "PolyMCP setup packet should tell users how to activate the connection",
);
assertIncludes(
  integrationsSettings,
  "One successful sign-in should persist for that harness profile or device.",
  "PolyMCP setup packet should set credential persistence expectation",
);
assertIncludes(
  integrationsSettings,
  "## Verify",
  "PolyMCP setup packet should include a verification section",
);
assertIncludes(
  integrationsSettings,
  "Do not repeat OAuth unless the harness still says authentication is required.",
  "PolyMCP setup packet should avoid unnecessary repeated OAuth",
);
assertIncludes(
  integrationsSettings,
  "Polynet is connected. I can now use your Polynet communities, resources, and workspace memory.",
  "Polynet setup packet should give a success response",
);
assertIncludes(
  integrationsSettings,
  "## Usage Guidance",
  "PolyMCP setup packet should include usage guidance",
);
assertIncludes(
  integrationsSettings,
  "Before using workspace-specific memory, list or open the relevant Polynet workspace.",
  "PolyMCP setup packet should require workspace selection before memory use",
);
assertIncludes(
  integrationsSettings,
  "Treat workspace context IDs as opaque selectors. Do not invent them.",
  "PolyMCP setup packet should preserve workspace context selector rules",
);
assertIncludes(
  integrationsSettings,
  "Copy one setup packet",
  "Polynet integration card should frame the copied text as one packet",
);
assertIncludes(
  integrationsSettings,
  "Codex, Claude Code",
  "PolyMCP integration card should name target harnesses",
);
assertIncludes(
  integrationsSettings,
  "another AI harness",
  "Polynet user-facing copy should say AI harness instead of MCP harness",
);
assertIncludes(
  integrationsSettings,
  "Copy setup",
  "Polynet canonical setup copy action",
);
assertIncludes(
  integrationsSettings,
  "name=\"Polynet\"",
  "Polynet visible integration logo name",
);
assertIncludes(
  integrationsSettings,
  "<strong>Polynet</strong>",
  "Polynet visible integration title",
);
assertIncludes(
  integrationsSettings,
  "aria-label=\"Copy Polynet setup\"",
  "Polynet visible setup copy action label",
);
assertNotIncludes(
  integrationsSettings,
  "PolyMCP",
  "Polynet setup/UI source after compatibility rename",
);
assertNotIncludes(
  integrationsSettings,
  "claude mcp add --transport http polymcp",
  "Polynet setup should not make polymcp the canonical Claude Code alias",
);
assertNotIncludes(
  integrationsSettings,
  "codex mcp add polymcp",
  "Polynet setup should not make polymcp the canonical Codex alias",
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
