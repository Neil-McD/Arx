import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { POLYNET_CANONICAL_TOOL_NAMES } from "../shared/polynetCanonicalToolContract.ts";
import { getPolynetMcpToolDefinitions } from "../shared/polynetMcp.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const includes = (source: string, value: string, label: string) =>
  assert.ok(source.includes(value), `${label} should include ${value}`);
const excludes = (source: string, value: string, label: string) =>
  assert.ok(!source.includes(value), `${label} should not include ${value}`);

function blockBetween(
  source: string,
  startToken: string,
  endToken: string,
  label: string,
) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${label} should exist`);
  return source.slice(start, end);
}

const contract = read("docs/polynet-workspace-mcp-contract-v0.md");
const authSetup = read("docs/auth-runtime-setup-workos-authkit.md");
const httpMcp = read("convex/httpMcp.ts");
const executor = read("convex/polynetCanonicalExecutor.ts");
const receipts = read("convex/polynetCanonicalReceipts.ts");
const authority = read("shared/polynetAuthority.ts");
const sharedMcp = read("shared/polynetMcp.ts");
const packageJson = read("package.json");
const vercelConfig = read("vercel.json");
const mcpProxy = read("api/mcp/_proxy.js");
const externalSmoke = read("scripts/polynet_workspace_mcp_external_smoke.ts");
const releasePreflight = read(
  "scripts/polynet_workspace_mcp_release_preflight.ts",
);

assert.deepEqual(
  getPolynetMcpToolDefinitions().map((definition) => definition.name),
  [...POLYNET_CANONICAL_TOOL_NAMES],
  "Official MCP must project exactly the canonical five in canonical order.",
);
includes(
  sharedMcp,
  "getPolynetCanonicalToolDefinitions",
  "MCP definition projection",
);
excludes(sharedMcp, "polynet_workspace_", "MCP legacy public tool names");
includes(
  httpMcp,
  "executePolynetCanonicalTool",
  "MCP shared canonical executor",
);
const canonicalDispatch = httpMcp.slice(
  httpMcp.indexOf("async function handleToolCall"),
  httpMcp.indexOf("export async function handleMcpPost"),
);
includes(
  canonicalDispatch,
  'message: "Unknown tool."',
  "direct legacy tool invocation denial",
);
excludes(
  httpMcp,
  "polynet_workspace_",
  "physically retired legacy MCP dispatch code",
);
includes(httpMcp, 'principalKind: "external_mcp"', "MCP principal boundary");
includes(
  executor,
  "resolveCommunityCapabilityContextInternal",
  "per-call community authorization",
);
includes(
  executor,
  "derivePolynetHumanAuthority",
  "server-derived human authority",
);
includes(
  authority,
  'relation === "owner" || relation === "admin"',
  "owner/admin builder rule",
);
includes(
  authority,
  'principalKind: "community_agent"',
  "community-owned agent authority",
);
includes(
  authority,
  "canUseBuilderProjection: false",
  "community agent builder denial",
);
includes(
  executor,
  "reserveMutatingOperation",
  "canonical idempotency reservation",
);
includes(receipts, "idempotency_key_conflict", "conflicting retry rejection");
includes(receipts, 'status: "completed"', "completed operation receipt");

includes(
  packageJson,
  '"smoke:polynet-workspace-mcp-acceptance"',
  "live acceptance script",
);
includes(externalSmoke, "CANONICAL_TOOLS", "smoke canonical inventory");
includes(
  externalSmoke,
  "Official MCP must advertise exactly the canonical five tools.",
  "smoke exact tool assertion",
);
for (const toolName of POLYNET_CANONICAL_TOOL_NAMES) {
  includes(externalSmoke, `"${toolName}"`, `${toolName} live smoke`);
}
includes(
  externalSmoke,
  "Stage acceptance: the official Polynet MCP used the canonical five-tool harness",
  "real participation use case",
);
includes(externalSmoke, "retry_deduped", "live retry acceptance");
includes(
  externalSmoke,
  "rejected_without_apply",
  "builder call acceptance without applying test data",
);
for (const acceptanceInput of [
  "POLYNET_MCP_COMMUNITY_SLUG",
  "POLYNET_MCP_DENIED_COMMUNITY_SLUG",
  "POLYNET_MCP_EXPECT_AUTHORITY_LANE",
  "POLYNET_MCP_ACCEPTANCE_RUN_ID",
]) {
  includes(
    externalSmoke,
    acceptanceInput,
    `${acceptanceInput} fail-closed acceptance input`,
  );
}
includes(
  externalSmoke,
  "refusing to substitute another community",
  "requested community substitution denial",
);
includes(
  externalSmoke,
  'expectedErrorCode: "semantic_not_found"',
  "non-enumerating path denial assertion",
);
includes(
  externalSmoke,
  'expectedErrorCode: "builder_authority_required"',
  "member builder-write denial assertion",
);
includes(
  externalSmoke,
  'expectedErrorCode: "operation_not_found"',
  "member builder-call denial assertion",
);
includes(
  externalSmoke,
  "Retired AI Feed directory must not be projected.",
  "retired AI Feed projection denial",
);
includes(
  externalSmoke,
  'purpose: "retired-ai-feed-write-denied"',
  "retired AI Feed write denial",
);
includes(externalSmoke, "retired_ai_feed", "retired AI Feed acceptance receipt");
excludes(externalSmoke, "AI Feed retry must reuse", "retired AI Feed write acceptance");
excludes(
  externalSmoke,
  "Date.now().toString(36)",
  "timestamp-generated acceptance identities",
);
excludes(
  externalSmoke,
  '"polynet_workspace_',
  "external smoke legacy double-quoted tool names",
);
excludes(
  externalSmoke,
  "'polynet_workspace_",
  "external smoke legacy single-quoted tool names",
);
includes(
  releasePreflight,
  "POLYNET_CANONICAL_TOOL_NAMES",
  "preflight canonical inventory",
);
includes(
  releasePreflight,
  "executePolynetCanonicalTool",
  "preflight shared executor assertion",
);

includes(contract, "## Canonical Five-Tool Surface", "five-tool contract");
for (const toolName of POLYNET_CANONICAL_TOOL_NAMES) {
  includes(contract, `\`${toolName}\``, `${toolName} documentation`);
}
includes(contract, "## Remote MCP Auth Model", "OAuth contract");
includes(contract, "`/runtime/mcp`", "canonical MCP endpoint");
includes(contract, "WWW-Authenticate: Bearer", "OAuth challenge");
includes(contract, "ARX_MCP_RESOURCE_URL", "resource indicator");
includes(contract, "Auth proves user identity only.", "auth boundary");
includes(
  contract,
  "The server revalidates community access on",
  "per-call authorization contract",
);
includes(contract, "owner or admin", "builder authority contract");
includes(
  contract,
  "community-owned agent",
  "community agent authority contract",
);
includes(
  contract,
  "separate control",
  "real inaccessible-community control actor",
);
includes(
  contract,
  "identity successfully opened",
  "real inaccessible-community control proof",
);
includes(
  contract,
  "exact candidate Git SHA",
  "candidate-scoped acceptance identity",
);
includes(authSetup, "ARX_MCP_AUTH_JWT_AUDIENCE", "MCP JWT audience setup");

const initializeIndex = httpMcp.indexOf('method === "initialize"');
const toolsListIndex = httpMcp.indexOf('method === "tools/list"');
const toolsCallIndex = httpMcp.indexOf('method === "tools/call"');
const connectionAuthIndex = httpMcp.indexOf(
  "const auth = await requireAuthenticatedActor(ctx, req);",
);
assert.ok(connectionAuthIndex >= 0);
assert.ok(connectionAuthIndex < initializeIndex);
assert.ok(connectionAuthIndex < toolsListIndex);
assert.ok(connectionAuthIndex < toolsCallIndex);
assert.ok(initializeIndex < toolsListIndex && toolsListIndex < toolsCallIndex);
includes(
  httpMcp.slice(initializeIndex, toolsCallIndex),
  "getPolynetMcpToolDefinitions()",
  "authenticated tool discovery",
);
includes(
  blockBetween(
    httpMcp,
    'if (method === "tools/call")',
    '\n  return jsonRpcErrorResponse(req, jsonResponse, id, -32601, "Method not found.");',
    "protected tools/call",
  ),
  "handleToolCall",
  "protected dispatch",
);

const challenge = blockBetween(
  httpMcp,
  "function mcpUnauthorizedResponse",
  "\nfunction emptyAcceptedResponse",
  "OAuth challenge",
);
includes(challenge, "status: 401", "OAuth challenge status");
includes(challenge, '"WWW-Authenticate"', "OAuth challenge header");
includes(challenge, 'resource_metadata="', "OAuth resource metadata");
includes(
  httpMcp,
  'readEnv("ARX_AUTH_REGISTRATION_URL")',
  "explicit registration endpoint",
);
excludes(httpMcp, "/oauth2/register", "inferred registration endpoint");

includes(vercelConfig, '"src": "/runtime/mcp"', "public MCP route");
includes(vercelConfig, '"dest": "/api/mcp/runtime"', "public MCP proxy target");
includes(
  vercelConfig,
  '"/\\\\.well-known/oauth-protected-resource"',
  "protected-resource route",
);
includes(mcpProxy, "VITE_CONVEX_SITE_URL", "Convex site target");
includes(mcpProxy, 'headers.set("x-forwarded-host"', "forwarded public host");
excludes(mcpProxy, "ARX_AUTH_BRIDGE_SECRET", "browser auth bridge secret");

console.log("polynet_workspace_mcp_auth_contract_proof: ok");
