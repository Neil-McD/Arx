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

function blockBetween(source: string, startToken: string, endToken: string, label: string): string {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${label} should exist`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `${label} should have an end token`);
  return source.slice(start, end);
}

function toolDispatchBlock(source: string, toolName: string): string {
  const startToken = `toolName === "${toolName}"`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${toolName} dispatch should exist`);
  const next = source.indexOf("\n  if (toolName ===", start + startToken.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const contract = read("docs/polynet-workspace-mcp-contract-v0.md");
const authSetup = read("docs/auth-runtime-setup-workos-authkit.md");
const httpMcp = read("convex/httpMcp.ts");
const authConfig = read("convex/auth.config.ts");
const sharedMcp = read("shared/polynetMcp.ts");
const packageJson = read("package.json");
const vercelConfig = read("vercel.json");
const mcpProxy = read("api/mcp/_proxy.js");
const mcpRuntimeProxy = read("api/mcp/runtime.js");
const mcpProtectedResourceProxy = read("api/mcp/oauth-protected-resource.js");
const mcpAuthorizationServerProxy = read("api/mcp/oauth-authorization-server.js");
const externalSmoke = read("scripts/polynet_workspace_mcp_external_smoke.ts");
const releasePreflight = read("scripts/polynet_workspace_mcp_release_preflight.ts");

assertIncludes(
  packageJson,
  "\"check:polynet-workspace-mcp-auth-proof\": \"node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_auth_contract_proof.ts\"",
  "package proof script",
);
assertIncludes(
  packageJson,
  "\"smoke:polynet-workspace-mcp-metadata\": \"node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_external_smoke.ts --mode=metadata\"",
  "metadata smoke script",
);
assertIncludes(
  packageJson,
  "\"preflight:polynet-workspace-mcp-release\": \"node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_release_preflight.ts --prod\"",
  "release preflight script",
);
assertIncludes(
  packageJson,
  "\"smoke:polynet-workspace-mcp-authenticated\": \"node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_external_smoke.ts --mode=authenticated\"",
  "authenticated smoke script",
);
assertIncludes(
  packageJson,
  "\"smoke:polynet-workspace-mcp-acceptance\": \"node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_external_smoke.ts --mode=acceptance\"",
  "acceptance smoke script",
);

assertIncludes(contract, "## Remote MCP Auth Model", "auth contract section");
assertIncludes(contract, "`/runtime/mcp` is an OAuth-protected remote MCP resource server.", "resource server model");
assertIncludes(contract, "initialize", "authenticated initialize contract");
assertIncludes(contract, "tools/list", "authenticated tool discovery contract");
assertIncludes(contract, "tools/call", "protected tool call contract");
assertIncludes(
  contract,
  "`initialize`, `tools/list`, and `tools/call` require authentication",
  "authenticated MCP method contract",
);
assertIncludes(
  contract,
  "unauthenticated MCP calls return a MCP-compatible OAuth `WWW-Authenticate` challenge",
  "unauthenticated MCP challenge contract",
);
assertIncludes(contract, "2025-11-25", "current MCP protocol contract");
assertIncludes(contract, "2025-06-18", "native Codex MCP protocol contract");
assertIncludes(contract, "2025-03-26", "legacy MCP protocol contract");
assertIncludes(
  contract,
  "challenges during `initialize`",
  "mcp-remote startup auth compatibility contract",
);
assertIncludes(contract, "WWW-Authenticate: Bearer", "oauth challenge contract");
assertIncludes(contract, "authorization_servers: [<upstream OAuth issuer/AuthKit domain>]", "issuer discovery contract");
assertIncludes(contract, "configured Resource Indicator must equal", "resource indicator contract");
assertIncludes(contract, "ARX_MCP_RESOURCE_URL", "canonical resource env contract");
assertIncludes(contract, "/runtime/mcp", "public MCP runtime route contract");
assertIncludes(contract, "/.well-known/oauth-protected-resource", "public MCP protected resource route contract");
assertIncludes(contract, "/.well-known/oauth-authorization-server", "public MCP authorization server route contract");
assertIncludes(contract, "Auth proves user identity only.", "auth versus authorization boundary");
assertIncludes(contract, "## OAuth Continuity Model", "OAuth continuity contract section");
assertIncludes(
  contract,
  "one OAuth login -> durable MCP access",
  "OAuth continuity target UX",
);
assertIncludes(
  contract,
  "PolyNet is the MCP resource server, WorkOS/AuthKit is the OAuth authorization server, and the external harness is the OAuth client",
  "OAuth role separation",
);
assertIncludes(
  contract,
  "The local OAuth callback completion page is owned by the external MCP client or adapter, not by PolyNet.",
  "OAuth callback UI ownership boundary",
);
assertIncludes(
  contract,
  "Authentication complete. You may close this window.",
  "OAuth callback completion copy boundary",
);
assertIncludes(
  contract,
  "close that tab, return to the harness",
  "OAuth callback close-tab next action",
);
assertIncludes(
  contract,
  "start a fresh chat or reconnect MCP",
  "OAuth callback reconnect guidance",
);
assertIncludes(
  contract,
  "codex mcp login polymcp --scopes openid,profile,email,offline_access",
  "native Codex OAuth fallback with offline access",
);
assertIncludes(
  contract,
  'mcp_oauth_credentials_store = "keyring"',
  "native Codex durable credential store",
);
assertIncludes(
  contract,
  "Recommended Codex credential persistence should be configured before OAuth",
  "native Codex durable credential store should precede OAuth",
);
assertIncludes(
  contract,
  "Run `add` first",
  "native Codex add command should be primary",
);
assertIncludes(
  contract,
  "Only if Codex does not open OAuth during `add`, run the login fallback",
  "native Codex login should be fallback only",
);
assertIncludes(
  contract,
  "`mcp-remote` is a compatibility fallback only",
  "mcp-remote non-canonical boundary",
);
assertIncludes(authSetup, "ARX_MCP_RESOURCE_URL", "MCP resource setup env");
assertIncludes(authSetup, "ARX_MCP_AUTH_JWT_AUDIENCE", "MCP audience setup env");
assertIncludes(authSetup, "Resource Indicator", "WorkOS MCP resource indicator setup");
assertIncludes(authSetup, "https://<POLYNET_ORIGIN>/runtime/mcp", "canonical MCP resource setup");
assertIncludes(authSetup, "## 4) Hosted MCP OAuth Continuity", "hosted MCP OAuth continuity setup section");
assertIncludes(
  authSetup,
  "one harness profile + one PolyMCP config + one successful OAuth login",
  "hosted MCP OAuth continuity invariant",
);
assertIncludes(authSetup, "Client ID Metadata Document", "WorkOS CIMD setup guidance");
assertIncludes(authSetup, "Dynamic Client Registration", "WorkOS DCR compatibility setup guidance");
assertIncludes(
  authSetup,
  "codex mcp login polymcp --scopes openid,profile,email,offline_access",
  "hosted MCP OAuth native Codex login fallback",
);
assertIncludes(
  authSetup,
  'mcp_oauth_credentials_store = "keyring"',
  "hosted MCP OAuth durable credential store",
);
assertIncludes(
  authSetup,
  "Recommended Codex credential persistence should be configured before OAuth",
  "hosted MCP OAuth durable credential store should precede OAuth",
);
assertIncludes(
  authSetup,
  "Run `add` first",
  "hosted MCP OAuth add command should be primary",
);
assertIncludes(
  authSetup,
  "Only if Codex does not open OAuth during `add`, run the login fallback",
  "hosted MCP OAuth login should be fallback only",
);
assertIncludes(
  authSetup,
  "A native Codex harness and an `mcp-remote` adapter can use different client registrations and credential stores.",
  "native Codex versus mcp-remote credential-store boundary",
);

assertIncludes(sharedMcp, 'POLYNET_MCP_PROTOCOL_VERSION = "2025-11-25"', "current MCP protocol constant");
assertIncludes(
  sharedMcp,
  'POLYNET_MCP_CODEX_PROTOCOL_VERSION = "2025-06-18"',
  "native Codex MCP protocol constant",
);
assertIncludes(
  sharedMcp,
  'POLYNET_MCP_COMPAT_PROTOCOL_VERSION = "2025-03-26"',
  "legacy MCP protocol constant",
);
assertIncludes(
  sharedMcp,
  "POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS",
  "central MCP protocol support list",
);
assertIncludes(
  sharedMcp,
  "isSupportedPolynetMcpProtocolVersion",
  "central MCP protocol support helper",
);

assertIncludes(contract, "## External Smoke Harness", "external smoke contract section");
assertIncludes(contract, "POLYNET_MCP_URL", "external smoke endpoint env");
assertIncludes(contract, "POLYNET_MCP_BEARER_TOKEN", "external smoke bearer token env");
assertIncludes(contract, "POLYNET_MCP_RECORD_OUTCOME=1", "external smoke outcome opt-in");
assertIncludes(contract, "POLYNET_MCP_RESOURCE_QUERY", "external smoke resource query env");
assertIncludes(contract, "POLYNET_MCP_REQUIRE_RESOURCES=1", "external smoke strict resource env");
assertIncludes(contract, "POLYNET_MCP_REQUIRE_BUILDER_RESOURCES=1", "external smoke strict builder resource env");
assertIncludes(contract, "POLYNET_MCP_EXPECT_RELATION", "external smoke expected relation env");
assertIncludes(contract, "POLYNET_MCP_EXPECT_AUTHORITY_LENS", "external smoke expected authority lens env");
assertIncludes(contract, "POLYNET_MCP_EXPECT_TOOLSETS", "external smoke expected toolsets env");
assertIncludes(contract, "resource map/list/search/read", "authenticated smoke resource contract");
assertIncludes(contract, "builder resource map/list/read", "authenticated smoke builder resource contract");
assertIncludes(
  contract,
  "Authenticated smoke proves token -> tools/list -> list/open/context/authority/product docs/search",
  "resource smoke acceptance proof",
);
assertIncludes(contract, "Acceptance smoke", "external acceptance smoke contract");

assertIncludes(externalSmoke, "--mode=metadata", "external metadata smoke mode");
assertIncludes(externalSmoke, "--mode=authenticated", "external authenticated smoke mode");
assertIncludes(externalSmoke, "--mode=acceptance", "external acceptance smoke mode");
assertIncludes(externalSmoke, "POLYNET_MCP_URL", "external smoke endpoint env");
assertIncludes(externalSmoke, "POLYNET_MCP_BEARER_TOKEN", "external smoke bearer token env");
assertIncludes(externalSmoke, "POLYNET_MCP_COMMUNITY_SLUG", "external smoke workspace selector env");
assertIncludes(externalSmoke, "POLYNET_MCP_MEMORY_QUERY", "external smoke memory query env");
assertIncludes(externalSmoke, "POLYNET_MCP_MEMORY_NODE_ID", "external smoke memory node override env");
assertIncludes(externalSmoke, "POLYNET_MCP_RETRIEVAL_LOG_ID", "external smoke retrieval log override env");
assertIncludes(externalSmoke, "POLYNET_MCP_RESOURCE_QUERY", "external smoke resource query env");
assertIncludes(externalSmoke, "POLYNET_MCP_EXPECT_RELATION", "external smoke expected relation env");
assertIncludes(externalSmoke, "POLYNET_MCP_EXPECT_AUTHORITY_LENS", "external smoke expected authority lens env");
assertIncludes(externalSmoke, "POLYNET_MCP_EXPECT_TOOLSETS", "external smoke expected toolsets env");
assertIncludes(externalSmoke, "POLYNET_MCP_REQUIRE_MEMORY", "external smoke strict memory env");
assertIncludes(externalSmoke, "POLYNET_MCP_REQUIRE_RESOURCES", "external smoke strict resource env");
assertIncludes(externalSmoke, "POLYNET_MCP_REQUIRE_BUILDER_RESOURCES", "external smoke strict builder resource env");
assertIncludes(externalSmoke, "POLYNET_MCP_RECORD_OUTCOME", "external smoke outcome opt-in env");
assertIncludes(externalSmoke, "POLYNET_MCP_TIMEOUT_MS", "external smoke timeout env");
assertIncludes(externalSmoke, "AbortController", "external smoke timeout controller");
assertIncludes(externalSmoke, "PROVIDER_TOOLS", "authenticated smoke provider tool inventory");
assertIncludes(externalSmoke, "tools_list", "authenticated smoke reports tool discovery");
assertIncludes(externalSmoke, "advertised_tool_count", "authenticated smoke reports advertised tool count");
assertIncludes(externalSmoke, "tools/list should advertise", "authenticated smoke verifies provider tools are advertised");
assertIncludes(externalSmoke, "function assertWorkspaceAuthority", "authenticated smoke authority assertion helper");
assertIncludes(externalSmoke, "function assertMatchingAuthority", "authenticated smoke authority stability helper");
assertIncludes(externalSmoke, "MCP_ACCESS_RELATIONS", "authenticated smoke canonical relation values");
assertIncludes(externalSmoke, "MCP_AUTHORITY_LENSES", "authenticated smoke canonical authority lenses");
assertIncludes(externalSmoke, "MCP_TOOLSETS", "authenticated smoke canonical toolsets");
assertIncludes(externalSmoke, '"workspace_context"', "authenticated smoke requires workspace context toolset");
assertIncludes(externalSmoke, "authority_relation", "authenticated smoke reports authority relation");
assertIncludes(externalSmoke, "authority_lens", "authenticated smoke reports authority lens");
assertIncludes(externalSmoke, "available_toolsets", "authenticated smoke reports available toolsets");
assertIncludes(externalSmoke, "function runProductDocsSmoke", "authenticated smoke product docs helper");
assertIncludes(externalSmoke, "product_docs_search", "authenticated smoke reports product docs search");
assertIncludes(externalSmoke, "product_doc_read", "authenticated smoke reports product doc read");
assertIncludes(externalSmoke, "function runResourceSmoke", "authenticated smoke resource helper");
assertIncludes(externalSmoke, "member_resources", "authenticated smoke gates resource calls on member_resources");
assertIncludes(externalSmoke, "function runBuilderResourceSmoke", "authenticated smoke builder resource helper");
assertIncludes(externalSmoke, "builder_resources", "authenticated smoke gates builder resource calls on builder_resources");
assertIncludes(externalSmoke, "resource_map", "authenticated smoke reports resource map status");
assertIncludes(externalSmoke, "resource_list", "authenticated smoke reports resource list status");
assertIncludes(externalSmoke, "resource_search", "authenticated smoke reports resource search status");
assertIncludes(externalSmoke, "resource_read", "authenticated smoke reports resource read status");
assertIncludes(externalSmoke, "resource_found", "authenticated smoke reports resource discovery");
assertIncludes(externalSmoke, "builder_resource_map", "authenticated smoke reports builder resource map status");
assertIncludes(externalSmoke, "builder_resource_list", "authenticated smoke reports builder resource list status");
assertIncludes(externalSmoke, "builder_resource_read", "authenticated smoke reports builder resource read status");
assertIncludes(externalSmoke, "builder_resource_scope", "authenticated smoke reports builder resource scope");
assertIncludes(externalSmoke, "POLYNET_MCP_REQUIRE_RESOURCES requires", "strict resource smoke failure");
assertIncludes(externalSmoke, "POLYNET_MCP_REQUIRE_BUILDER_RESOURCES requires", "strict builder resource smoke failure");
assertIncludes(
  externalSmoke,
  'requireMemoryRead: mode === "acceptance" || readBoolEnv("POLYNET_MCP_REQUIRE_MEMORY")',
  "acceptance smoke strict memory read",
);
assertIncludes(
  externalSmoke,
  'requireResources: readBoolEnv("POLYNET_MCP_REQUIRE_RESOURCES")',
  "authenticated smoke strict resource read",
);
assertIncludes(
  externalSmoke,
  'requireBuilderResources: readBoolEnv("POLYNET_MCP_REQUIRE_BUILDER_RESOURCES")',
  "authenticated smoke strict builder resource map",
);
assertIncludes(
  externalSmoke,
  'mcpUrl: args.mcpUrl,\n      token,\n      name: "polynet_workspace_memory_read"',
  "acceptance memory read uses selected MCP URL",
);
for (const productDocsToolName of [
  "polynet_product_docs_search",
  "polynet_product_doc_read",
]) {
  assertIncludes(
    externalSmoke,
    `name: "${productDocsToolName}"`,
    `${productDocsToolName} authenticated product docs smoke call`,
  );
}
for (const resourceToolName of [
  "polynet_workspace_resources_map",
  "polynet_workspace_resources_list",
  "polynet_workspace_resources_search",
  "polynet_workspace_resource_read",
]) {
  assertIncludes(
    externalSmoke,
    `name: "${resourceToolName}"`,
    `${resourceToolName} authenticated resource smoke call`,
  );
}
assertIncludes(
  externalSmoke,
  'name: "polynet_workspace_builder_resources_map"',
  "polynet_workspace_builder_resources_map authenticated builder resource smoke call",
);
assertIncludes(
  externalSmoke,
  'name: "polynet_workspace_builder_resources_list"',
  "polynet_workspace_builder_resources_list authenticated builder resource smoke call",
);
assertIncludes(
  externalSmoke,
  'name: "polynet_workspace_builder_resource_read"',
  "polynet_workspace_builder_resource_read authenticated builder resource smoke call",
);
assertIncludes(externalSmoke, "skipped_basic_mode", "authenticated smoke should not read memory by default");
assertIncludes(
  externalSmoke,
  "Acceptance smoke requires a readable memory node",
  "acceptance smoke cannot false-green empty memory",
);
assertIncludes(externalSmoke, "WWW-Authenticate", "external smoke auth challenge check");
assertIncludes(externalSmoke, "resource_metadata", "external smoke protected resource metadata check");
assertIncludes(releasePreflight, "ARX_MCP_RESOURCE_URL", "release preflight checks canonical resource env");
assertIncludes(releasePreflight, "ARX_MCP_AUTH_JWT_AUDIENCE", "release preflight checks MCP audience env");
assertIncludes(releasePreflight, "not_released_yet", "release preflight classifies unreleased public web origin");
assertIncludes(releasePreflight, "web_proxy_ready_but_convex_stale", "release preflight classifies stale Convex route");
assertIncludes(releasePreflight, "ready_for_smoke", "release preflight classifies live smoke readiness");
assertIncludes(releasePreflight, "oauth_challenge_ready", "release preflight classifies OAuth-protected live readiness");
assertIncludes(releasePreflight, "function hasOAuthResourceChallenge", "release preflight validates OAuth challenge shape");
assertIncludes(releasePreflight, "resource_metadata=", "release preflight requires protected resource metadata challenge");
assertIncludes(releasePreflight, "--require-live-ready", "release preflight has strict live-ready mode");
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
  assertIncludes(externalSmoke, toolName, `${toolName} external smoke`);
}

assertIncludes(vercelConfig, '"src": "/runtime/mcp"', "Vercel MCP runtime route");
assertIncludes(vercelConfig, '"dest": "/api/mcp/runtime"', "Vercel MCP runtime proxy destination");
assertIncludes(
  vercelConfig,
  '"src": "/\\\\.well-known/oauth-protected-resource"',
  "Vercel MCP protected resource route",
);
assertIncludes(
  vercelConfig,
  '"dest": "/api/mcp/oauth-protected-resource"',
  "Vercel MCP protected resource proxy destination",
);
assertIncludes(
  vercelConfig,
  '"src": "/\\\\.well-known/oauth-authorization-server"',
  "Vercel MCP authorization server route",
);
assertIncludes(
  vercelConfig,
  '"dest": "/api/mcp/oauth-authorization-server"',
  "Vercel MCP authorization server proxy destination",
);
assert.ok(
  vercelConfig.indexOf('"src": "/runtime/mcp"') < vercelConfig.indexOf('{ "handle": "filesystem" }'),
  "MCP runtime route should be before filesystem fallback.",
);
assertIncludes(mcpProxy, "VITE_CONVEX_SITE_URL", "MCP proxy explicit Convex site URL");
assertIncludes(mcpProxy, "VITE_CONVEX_URL", "MCP proxy Convex cloud URL fallback");
assertIncludes(mcpProxy, ".convex.site", "MCP proxy derives Convex site URL");
assertIncludes(mcpProxy, "VITE_CONVEX_PUBLIC_KEY", "MCP proxy forwards optional public key");
assertIncludes(mcpProxy, "headers.set(\"x-forwarded-host\"", "MCP proxy forwards public host");
assertIncludes(mcpProxy, "headers.set(\"x-forwarded-proto\"", "MCP proxy forwards public protocol");
assertIncludes(mcpProxy, "Buffer.from(await upstream.arrayBuffer())", "MCP proxy preserves upstream response body");
assertIncludes(mcpProxy, "ARX_MCP_PROXY_TIMEOUT_MS", "MCP proxy timeout env");
assertNotIncludes(mcpProxy, "ARX_AUTH_BRIDGE_SECRET", "MCP proxy must not use auth bridge secret");
assertIncludes(mcpProxy, '"cookie"', "MCP proxy should explicitly skip browser cookies");
assertIncludes(mcpRuntimeProxy, '"/runtime/mcp"', "MCP runtime proxy target");
assertIncludes(
  mcpProtectedResourceProxy,
  '"/.well-known/oauth-protected-resource"',
  "MCP protected resource proxy target",
);
assertIncludes(
  mcpAuthorizationServerProxy,
  '"/.well-known/oauth-authorization-server"',
  "MCP authorization server proxy target",
);

const initializeIndex = httpMcp.indexOf('method === "initialize"');
const toolsListIndex = httpMcp.indexOf('method === "tools/list"');
const toolsCallIndex = httpMcp.indexOf('method === "tools/call"');
const connectionAuthIndex = httpMcp.indexOf("const auth = await requireAuthenticatedActor(ctx, req);");
assert.ok(initializeIndex >= 0, "initialize handler should exist");
assert.ok(toolsListIndex >= 0, "tools/list handler should exist");
assert.ok(toolsCallIndex >= 0, "tools/call handler should exist");
assert.ok(connectionAuthIndex >= 0, "authenticated MCP connection gate should exist");
assert.ok(connectionAuthIndex < initializeIndex, "initialize should require auth");
assert.ok(connectionAuthIndex < toolsListIndex, "tools/list should require auth");
assert.ok(connectionAuthIndex < toolsCallIndex, "tools/call should require auth");
assert.ok(initializeIndex < toolsCallIndex, "initialize should be handled before protected tool calls");
assert.ok(toolsListIndex < toolsCallIndex, "tools/list should be handled before protected tool calls");

const connectionAuthBlock = httpMcp.slice(connectionAuthIndex, initializeIndex);
assertIncludes(connectionAuthBlock, "mcpUnauthorizedResponse", "authenticated MCP connection challenge");
assertIncludes(
  connectionAuthBlock,
  "Authorization required to connect to PolyNet MCP.",
  "authenticated MCP connection challenge message",
);

const authenticatedProtocolBlock = httpMcp.slice(initializeIndex, toolsCallIndex);
assertIncludes(authenticatedProtocolBlock, "getPolynetMcpToolDefinitions()", "authenticated tool discovery");

const protectedToolCallBlock = blockBetween(
  httpMcp,
  'if (method === "tools/call")',
  "\n  return jsonRpcErrorResponse(req, jsonResponse, id, -32601, \"Method not found.\");",
  "protected tools/call block",
);
assertIncludes(protectedToolCallBlock, "handleToolCall", "authenticated tool dispatch");

const challengeBlock = blockBetween(
  httpMcp,
  "function mcpUnauthorizedResponse",
  "\nfunction emptyAcceptedResponse",
  "MCP unauthorized challenge",
);
assertIncludes(challengeBlock, "status: 401", "unauthorized status");
assertIncludes(challengeBlock, '"WWW-Authenticate"', "authenticate header");
assertIncludes(challengeBlock, 'Bearer error="invalid_token"', "bearer error challenge");
assertIncludes(challengeBlock, 'resource_metadata="', "resource metadata challenge");
assertIncludes(
  challengeBlock,
  "authMetadata.protectedResourceMetadataUrl",
  "protected resource metadata challenge URL",
);

assertIncludes(httpMcp, 'function resolveMcpServerUrl(req: Request): string | null', "resource resolver");
assertIncludes(httpMcp, 'readEnv("ARX_MCP_RESOURCE_URL")', "canonical MCP resource URL env");
assertIncludes(httpMcp, "normalizeMcpResourceUrl", "canonical MCP resource URL normalization");
assertIncludes(httpMcp, "resolveRequestMcpServerUrl", "request-origin MCP resource fallback");
assertIncludes(httpMcp, "configuredResource.value ?? resolveRequestMcpServerUrl(req)", "canonical MCP resource URL fallback");
assertIncludes(
  httpMcp,
  'function resolveProtectedResourceMetadataUrl(req: Request): string | null',
  "protected resource metadata URL resolver",
);
assertIncludes(
  httpMcp,
  "buildProtectedResourceMetadataUrl(resourceServerUrl)",
  "protected resource metadata URL",
);

const protectedResourceRoute = blockBetween(
  httpMcp,
  'path: "/.well-known/oauth-protected-resource"',
  '\n  http.route({\n    path: "/.well-known/oauth-authorization-server"',
  "protected resource metadata route",
);
assertIncludes(protectedResourceRoute, "resource: authMetadata.resourceServerUrl", "resource metadata resource");
assertIncludes(
  protectedResourceRoute,
  "authorization_servers: [authMetadata.issuer]",
  "resource metadata upstream issuer",
);
assertNotIncludes(
  protectedResourceRoute,
  "resolveRequestOrigin(req) ?? authMetadata.issuer",
  "resource metadata must not point at compatibility proxy",
);
assertIncludes(
  protectedResourceRoute,
  'bearer_methods_supported: ["header"]',
  "bearer header support",
);
assertIncludes(
  protectedResourceRoute,
  "scopes_supported: authMetadata.scopesSupported",
  "bounded scope metadata",
);

const authServerRoute = blockBetween(
  httpMcp,
  'path: "/.well-known/oauth-authorization-server"',
  '\n  http.route({\n    path: "/runtime/mcp"',
  "authorization server compatibility route",
);
assertIncludes(authServerRoute, "issuer: authMetadata.issuer", "issuer metadata");
assertIncludes(
  authServerRoute,
  "authorization_endpoint: authMetadata.authorizationEndpoint",
  "authorization endpoint metadata",
);
assertIncludes(authServerRoute, "token_endpoint: authMetadata.tokenEndpoint", "token endpoint metadata");
assertIncludes(authServerRoute, "registration_endpoint", "explicit dynamic registration compatibility metadata");
assertIncludes(authServerRoute, 'response_types_supported: ["code"]', "authorization code response type");
assertIncludes(
  authServerRoute,
  'grant_types_supported: ["authorization_code", "refresh_token"]',
  "authorization and refresh grants",
);
assertIncludes(authServerRoute, 'code_challenge_methods_supported: ["S256"]', "PKCE support");
assertIncludes(authServerRoute, 'token_endpoint_auth_methods_supported: ["none"]', "public client token exchange");

assertIncludes(httpMcp, 'function resolveOAuthRegistrationUrl(): string', "registration endpoint resolver");
assertIncludes(httpMcp, 'readEnv("ARX_AUTH_REGISTRATION_URL")', "explicit registration endpoint env");
assertNotIncludes(httpMcp, 'parsed.pathname = "/oauth2/register";', "registration endpoint must not be inferred");
assertNotIncludes(httpMcp, '/oauth2/register', "registration endpoint must only come from explicit env");

assertIncludes(authConfig, "ARX_AUTH_JWT_AUDIENCE", "Convex JWT audience configuration");
assertIncludes(authConfig, "ARX_MCP_AUTH_JWT_AUDIENCE", "Convex MCP JWT audience configuration");
assertNotIncludes(authConfig, "ARX_AUTH_JWT_ADDITIONAL_AUDIENCES", "Convex auth should not use generic audience lists");
assertIncludes(authConfig, "applicationIDs", "Convex JWT application/audience binding");
assertIncludes(authConfig, "for (const applicationID of applicationIDs)", "Convex multi-audience providers");
assertIncludes(
  authConfig,
  "ARX_MCP_AUTH_JWT_AUDIENCE is required for hosted MCP JWT audience binding.",
  "Convex MCP JWT audience should be required when auth is configured",
);

const resolverBlock = blockBetween(
  httpMcp,
  "async function resolveWorkspaceContext",
  "\nfunction normalizeWorkspaceMemoryTypes",
  "workspace authorization resolver",
);
assertIncludes(resolverBlock, "listAccessibleCommunities", "workspace membership lookup");
assertIncludes(resolverBlock, "getMyCommunityAccessBySlug", "workspace access lookup");
assertIncludes(resolverBlock, "workspaceAccessIsOpen", "workspace capability gate");

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
  const block = toolDispatchBlock(httpMcp, toolName);
  assertIncludes(block, "resolveWorkspaceContext", `${toolName} per-call workspace authorization`);
}

console.log("polynet_workspace_mcp_auth_contract_proof: ok");
