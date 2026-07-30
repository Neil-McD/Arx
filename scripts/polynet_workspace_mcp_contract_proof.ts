import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  POLYNET_CANONICAL_TOOL_NAMES,
  getPolynetCanonicalToolDefinitions,
} from "../shared/polynetCanonicalToolContract.ts";
import {
  getPolynetMcpToolDefinition,
  getPolynetMcpToolDefinitions,
} from "../shared/polynetMcp.ts";
import {
  buildPolynetMcpSetup,
  buildPolynetMcpSetupForOrigin,
} from "../shared/polynetMcpSetup.ts";

const root = process.cwd();
const read = (path: string): string =>
  readFileSync(join(root, path), "utf8");

const expected = [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
] as const;

assert.deepEqual(POLYNET_CANONICAL_TOOL_NAMES, expected);
assert.deepEqual(
  getPolynetMcpToolDefinitions(),
  getPolynetCanonicalToolDefinitions(),
);
assert.deepEqual(
  getPolynetMcpToolDefinitions().map((definition) => definition.name),
  expected,
);
for (const name of expected) {
  const definition = getPolynetMcpToolDefinition(name);
  assert.ok(definition);
  assert.equal(definition.name, name);
  assert.equal(definition.inputSchema.type, "object");
  assert.equal(definition.outputSchema.type, "object");
}

const setup = buildPolynetMcpSetupForOrigin("https://polynet.ai");
assert.equal(setup.endpointUrl, "https://www.polynet.ai/runtime/mcp");
assert.match(setup.codexAddCommand, /codex mcp add polynet --url/);
assert.match(setup.setupBundle, /runtime\/mcp/);
const staging = buildPolynetMcpSetup({
  environment: "staging",
  endpointUrl: "https://polynet-staging.vercel.app/runtime/mcp",
  serverAlias: "polynet-stage",
});
assert.equal(
  staging.endpointUrl,
  "https://polynet-staging.vercel.app/runtime/mcp",
);
assert.equal(staging.environment, "staging");

const mcpSource = read("shared/polynetMcp.ts");
const httpSource = read("convex/httpMcp.ts");
const executorSource = read("convex/polynetCanonicalExecutor.ts");
const setupSource = read("shared/polynetMcpSetup.ts");
const mcpAccountSource = read(
  "apps/web/src/components/WebPolynetMcpAccountSection.tsx",
);

assert.match(mcpSource, /getPolynetCanonicalToolDefinitions\(\)/);
assert.doesNotMatch(
  mcpSource,
  /polynet_workspace_|polynet_list_workspaces|polynet_open_workspace/,
);
assert.match(httpSource, /method === "tools\/list"/);
assert.match(httpSource, /getPolynetMcpToolDefinitions\(\)/);
assert.match(httpSource, /method === "tools\/call"/);
assert.match(httpSource, /executePolynetCanonicalTool\(/);
assert.match(httpSource, /principalKind: "external_mcp"/);
assert.doesNotMatch(
  httpSource,
  /polynet_workspace_|polynet_list_communities|polynet_open_workspace/,
  "retired MCP dispatch code must be physically absent",
);
assert.match(executorSource, /normalizeToolArguments\(args\.toolName/);
assert.match(executorSource, /derivePolynetHumanAuthority/);
assert.match(executorSource, /idempotencyKey/);
assert.match(setupSource, /POLYNET_MCP_PATH = "\/runtime\/mcp"/);
assert.match(setup.setupBundle, /polynet_list/);
assert.match(setup.setupBundle, /polynet_read/);
assert.match(setup.setupBundle, /polynet_search/);
assert.match(setup.setupBundle, /polynet_write/);
assert.match(setup.setupBundle, /polynet_call/);
assert.doesNotMatch(
  setup.setupBundle,
  /polynet_workspace_|polynet_get_my_profile|polynet_confirm_my_profile_facts|workspace_context_id/,
  "setup packets must teach only the canonical repository contract",
);
assert.match(mcpAccountSource, /OAuth protected/);
assert.doesNotMatch(mcpAccountSource, /\b26\b|Polynet tools/);

console.log("polynet_workspace_mcp_contract_proof: ok");
