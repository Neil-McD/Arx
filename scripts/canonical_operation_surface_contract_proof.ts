import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PLATFORM_OPERATION_CONTRACTS,
} from "../shared/platformOperationContract.ts";
import {
  getPolynetMcpToolDefinition,
  getPolynetMcpToolDefinitions,
} from "../shared/polynetMcp.ts";
import { POLYNET_PLATFORM_TOOL_SURFACE } from "../shared/polynetPlatformToolSurface.ts";
import { getFixedRuntimeToolPolicy } from "../shared/runtimeToolPolicy.ts";
import { getToolDefinition } from "../shared/toolRegistry.ts";
import { POLYNET_MCP_TOOL_COUNT_LABEL } from "../shared/polynetMcpSetup.ts";

const root = process.cwd();
const read = (relativePath: string): string =>
  readFileSync(join(root, relativePath), "utf8");

for (const retiredFacade of [
  "convex/community.ts",
  "convex/communityExperience.ts",
  "convex/billing.ts",
]) {
  assert.equal(
    existsSync(join(root, retiredFacade)),
    false,
    `${retiredFacade} must stay deleted`,
  );
}

const generatedApi = read("convex/_generated/api.d.ts");
const contractDoc = read("docs/canonical-platform-operation-contract-v1.md");
for (const retiredModule of ["community", "communityExperience", "billing"]) {
  assert.doesNotMatch(
    generatedApi,
    new RegExp(`(?:import type \\\\* as|${retiredModule}: typeof) ${retiredModule}`),
    `${retiredModule} must not remain in generated Convex API bindings`,
  );
}
assert.match(
  contractDoc,
  /Context-bound memory, chat, AI Feed, and resource tools remain outside v1/,
  "the contract must state its deliberate semantic admission boundary",
);

function sourceFiles(relativeDirectory: string): string[] {
  const directory = join(root, relativeDirectory);
  const files: string[] = [];
  for (const name of readdirSync(directory)) {
    const absolutePath = join(directory, name);
    const relativePath = join(relativeDirectory, name);
    if (statSync(absolutePath).isDirectory()) {
      if (name === "_generated" || name === "node_modules" || name === "dist") continue;
      files.push(...sourceFiles(relativePath));
      continue;
    }
    if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(name)) files.push(relativePath);
  }
  return files;
}

const firstPartySources = [
  ...sourceFiles("api"),
  ...sourceFiles("apps"),
  ...sourceFiles("convex"),
  ...sourceFiles("services"),
  ...sourceFiles("shared"),
].filter(
  (path) =>
    path !== "scripts/canonical_operation_surface_contract_proof.ts" &&
    !path.includes("/node_modules/"),
);

for (const path of firstPartySources) {
  const source = read(path);
  assert.doesNotMatch(
    source,
    /(?:api|internal)\.(?:community|communityExperience|billing)\./,
    `${path} must use canonical Convex domain owners`,
  );
  assert.doesNotMatch(
    source,
    /\.(?:query|mutation|action)\(\s*["'](?:community|communityExperience|billing):[A-Za-z]/,
    `${path} must not call a retired Convex facade address`,
  );
}

const operationIds = PLATFORM_OPERATION_CONTRACTS.map((contract) => contract.id);
assert.equal(new Set(operationIds).size, operationIds.length, "operation ids must be unique");
assert.equal(operationIds.length, 4, "the first canonical operation seam must stay deliberately small");

const nativeNames = PLATFORM_OPERATION_CONTRACTS.map(
  (contract) => contract.projections.native.name,
);
const mcpNames = PLATFORM_OPERATION_CONTRACTS.map(
  (contract) => contract.projections.mcp.name,
);
assert.equal(new Set(nativeNames).size, nativeNames.length, "native projections must be unique");
assert.equal(new Set(mcpNames).size, mcpNames.length, "MCP projections must be unique");

for (const operation of PLATFORM_OPERATION_CONTRACTS) {
  const nativeDefinition = getToolDefinition(operation.projections.native.name);
  assert.equal(nativeDefinition.description, operation.projections.native.description);
  assert.deepEqual(nativeDefinition.inputSchema, operation.projections.native.inputSchema);

  const mcpDefinition = getPolynetMcpToolDefinition(operation.projections.mcp.name);
  assert.ok(mcpDefinition, `${operation.id} MCP projection must exist`);
  assert.deepEqual(mcpDefinition, operation.projections.mcp);

  const policy = getFixedRuntimeToolPolicy(operation.projections.native.name);
  const mutatesState =
    operation.effects.domainState === "write" ||
    operation.effects.external !== "none" ||
    operation.effects.receipt === "write";
  assert.equal(policy.mutatesState, mutatesState);
  assert.equal(policy.readOnly, !mutatesState);
  assert.equal(
    policy.requiresCommunity,
    operation.projections.native.requiresCommunity,
  );

  const workerEntry = POLYNET_PLATFORM_TOOL_SURFACE.find(
    (entry) => entry.toolName === operation.projections.native.name,
  );
  assert.equal(
    Boolean(workerEntry),
    operation.projections.worker.enabled,
    `${operation.id} worker availability must come from the operation contract`,
  );
}

const mcpDefinitions = getPolynetMcpToolDefinitions();
assert.equal(mcpDefinitions.length, 24, "official Polynet MCP must retain all 24 tools");
assert.equal(
  POLYNET_MCP_TOOL_COUNT_LABEL,
  `${mcpDefinitions.length} Polynet tools`,
  "MCP setup copy must derive from the real tool count",
);

const mcpSource = read("shared/polynetMcp.ts");
const registrySource = read("shared/toolRegistry.ts");
const runtimeSource = read("convex/runtimeAgentLoop.ts");
const httpMcpSource = read("convex/httpMcp.ts");
assert.doesNotMatch(
  mcpSource,
  /(?:polynet_list_communities|polynet_get_community|polynet_product_docs_search|polynet_product_doc_read): \{/,
  "canonical MCP projections must not be redeclared in the MCP adapter",
);
assert.doesNotMatch(
  registrySource,
  /SEARCH_PRODUCT_DOCS_TOOL_SCHEMA|GET_PRODUCT_DOC_TOOL_SCHEMA|getPolynetMcpToolDefinition/,
  "native schemas must not be redeclared or sourced from the MCP adapter",
);
for (const operationId of operationIds) {
  assert.match(
    `${runtimeSource}\n${httpMcpSource}`,
    new RegExp(`operationId: "${operationId.replace(".", "\\.")}"`),
    `${operationId} must be invoked through the canonical executor`,
  );
}

console.log("canonical_operation_surface_contract_proof: ok");
