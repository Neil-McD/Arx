import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertNotIncludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} not to include ${needle}`);
}

function assertOrdered(haystack: string, needles: string[], label: string) {
  let previousIndex = -1;
  for (const needle of needles) {
    const index = haystack.indexOf(needle);
    assert.ok(index >= 0, `expected ${label} to include ${needle}`);
    assert.ok(
      index > previousIndex,
      `expected ${needle} to appear after the previous marker in ${label}`,
    );
    previousIndex = index;
  }
}

function extractBetween(
  source: string,
  startMarker: string,
  endMarker: string,
  label: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `${label} start marker missing`);
  assert.ok(end > start, `${label} end marker missing`);
  return source.slice(start, end);
}

function extractActionArgs(actionSource: string): string {
  const start = actionSource.indexOf("args: {");
  const end = actionSource.indexOf("},\n  handler", start);
  assert.ok(start >= 0, "action args start missing");
  assert.ok(end > start, "action args end missing");
  return actionSource.slice(start, end);
}

function main() {
  const communityAppMounts = readText("convex/communityAppMounts.ts");
  const community = readText("convex/community.ts");
  const contract = readText("docs/private-community-plugin-manifest-contract-v1.md");
  const packageJson = readText("package.json");

  const optionMapper = extractBetween(
    communityAppMounts,
    "function mapPrivateCommunityMcpOption(",
    "function normalizeSnapshotTools(",
    "private MCP option mapper",
  );
  const optionsQuery = extractBetween(
    communityAppMounts,
    "export const listPrivateCommunityMcpOptions = query({",
    "export const addPrivateCommunityMcpApp = action({",
    "private MCP options query",
  );
  const addAction = extractBetween(
    communityAppMounts,
    "export const addPrivateCommunityMcpApp = action({",
    "export const applyPrivateCommunityPluginManifest = action({",
    "private MCP typed add action",
  );
  const addActionArgs = extractActionArgs(addAction);
  const productMapper = extractBetween(
    communityAppMounts,
    "function mapPrivateCommunityMcpProductAddResult(",
    "function buildPrivateCommunityMcpRegistryManifest(",
    "private MCP product add result mapper",
  );
  const applyHelper = extractBetween(
    communityAppMounts,
    "async function applyPrivateCommunityPluginManifestForManager(",
    "export const listPrivateCommunityMcpOptions = query({",
    "private manifest shared apply helper",
  );

  assertIncludes(
    communityAppMounts,
    "COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY",
    "private MCP backend imports reviewed registry",
  );
  assertIncludes(
    communityAppMounts,
    "PRIVATE_COMMUNITY_PLUGIN_SCHEMA",
    "private MCP backend imports internal manifest schema",
  );

  assertIncludes(
    optionMapper,
    'entry.connectionClass !== "hosted_remote"',
    "options hide non-hosted MCP registry entries",
  );
  assertIncludes(
    optionMapper,
    "resolveCommunityWorkflowImportMcpRegistryConnectPolicy",
    "options derive addability from reviewed registry policy",
  );
  assertIncludes(
    optionMapper,
    'addStatus = "needs_auth"',
    "options expose auth setup status without credentials",
  );
  assertIncludes(
    optionMapper,
    'addStatus = "needs_config"',
    "options expose config setup status without config values",
  );
  assertIncludes(
    optionMapper,
    'addStatus = "ready"',
    "options expose ready setup status",
  );
  assertNotIncludes(
    optionMapper,
    "endpoint_url:",
    "options must not expose endpoint fields to product UI",
  );
  assertNotIncludes(
    optionMapper,
    "default_endpoint_url",
    "options must not expose default endpoint fields to product UI",
  );
  for (const forbiddenSecretField of [
    "requiredSecretNames",
    "required_secret_names",
    "secret_names",
  ]) {
    assertNotIncludes(
      optionMapper,
      forbiddenSecretField,
      `options must not expose ${forbiddenSecretField} to product UI`,
    );
  }

  assertIncludes(
    optionsQuery,
    "resolveUserIdForAuthenticatedRequest",
    "private MCP options query resolves authenticated user",
  );
  assertIncludes(
    optionsQuery,
    "requireCommunityManager({",
    "private MCP options query is manager-gated",
  );
  assertOrdered(
    optionsQuery,
    [
      "COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY",
      ".map(mapPrivateCommunityMcpOption)",
      ".filter((option): option is NonNullable<typeof option> => Boolean(option))",
    ],
    "private MCP options query projects and filters registry entries server-side",
  );

  assertIncludes(
    addActionArgs,
    "mcpRegistryId: v.string()",
    "typed private MCP add accepts registry id",
  );
  for (const forbiddenArg of [
    "manifest",
    "endpointUrl",
    "authType",
    "secret",
    "command",
    "stdio",
  ]) {
    assertNotIncludes(
      addActionArgs,
      forbiddenArg,
      `typed private MCP add args must not include ${forbiddenArg}`,
    );
  }
  assertIncludes(
    addAction,
    "internal.communityAppMounts.assertCommunityManagerAccessInternal",
    "typed private MCP add is manager-gated",
  );
  assertIncludes(
    addAction,
    "buildPrivateCommunityMcpRegistryManifest({",
    "typed private MCP add builds the internal manifest server-side",
  );
  assertIncludes(
    addAction,
    "applyPrivateCommunityPluginManifestForManager({",
    "typed private MCP add uses shared apply helper",
  );
  assertIncludes(
    addAction,
    "return mapPrivateCommunityMcpProductAddResult({",
    "typed private MCP add returns the product-safe result mapper",
  );
  assertOrdered(
    addAction,
    [
      "const result = await applyPrivateCommunityPluginManifestForManager({",
      "return mapPrivateCommunityMcpProductAddResult({",
    ],
    "typed private MCP add maps the raw apply result before returning",
  );
  assertNotIncludes(
    addAction,
    "return await applyPrivateCommunityPluginManifestForManager({",
    "typed private MCP add must not return the raw apply result",
  );
  assertNotIncludes(
    addAction,
    "manifest: v.any()",
    "typed private MCP add does not expose raw manifest input",
  );

  for (const expectedProductField of [
    "ok:",
    "status,",
    "mcp_registry_id:",
    "name:",
    "community_app_mount_id:",
    "setup_required:",
    "setup_reason:",
    "error_message:",
  ]) {
    assertIncludes(
      productMapper,
      expectedProductField,
      `typed private MCP add product mapper returns ${expectedProductField}`,
    );
  }
  for (const forbiddenProductField of [
    "endpoint_url:",
    "auth_type:",
    "plugin:",
    "mcp_app_count:",
    "staged_count:",
    "connected_count:",
    "reused_count:",
    "failed_count:",
    "staged:",
    "connected:",
    "reused:",
    "failures:",
    "rejections:",
    "warnings:",
  ]) {
    assertNotIncludes(
      productMapper,
      forbiddenProductField,
      `typed private MCP add product mapper must not return ${forbiddenProductField}`,
    );
  }

  assertIncludes(
    communityAppMounts,
    "mcpServers: [{ mcpRegistryId: args.mcpRegistryId }]",
    "typed private MCP add manifest contains only reviewed registry id",
  );
  assertIncludes(
    applyHelper,
    "compilePrivateCommunityPluginManifest(args.manifest)",
    "typed private MCP add still flows through the private manifest compiler",
  );
  assertIncludes(
    applyHelper,
    "mountDeveloperAppForCommunity({",
    "typed private MCP add reuses canonical community app mount helper",
  );
  assertIncludes(
    applyHelper,
    "internal.communityAppMounts.stageCommunityMcpAppForSetupInternal",
    "typed private MCP add stages setup-needed MCPs",
  );
  assertIncludes(
    applyHelper,
    "internal.communityAppMounts.connectImportedCommunityMcpAppInternal",
    "typed private MCP add connects hosted no-auth MCPs through imported MCP path",
  );

  assertIncludes(
    community,
    "listPrivateCommunityMcpOptions as listPrivateCommunityMcpOptionsImpl",
    "community barrel imports private MCP options query",
  );
  assertIncludes(
    community,
    "addPrivateCommunityMcpApp as addPrivateCommunityMcpAppImpl",
    "community barrel imports typed private MCP add action",
  );
  assertIncludes(
    community,
    "export const listPrivateCommunityMcpOptions = listPrivateCommunityMcpOptionsImpl;",
    "community barrel exports private MCP options query",
  );
  assertIncludes(
    community,
    "export const addPrivateCommunityMcpApp = addPrivateCommunityMcpAppImpl;",
    "community barrel exports typed private MCP add action",
  );

  assertIncludes(
    contract,
    "## Product Backend API",
    "private manifest contract documents product backend API",
  );
  assertIncludes(
    contract,
    "`addPrivateCommunityMcpApp`",
    "private manifest contract documents typed private MCP add",
  );
  assertIncludes(
    contract,
    "must not accept endpoint URLs, auth modes, secrets, command config",
    "private manifest contract forbids technical product add inputs",
  );
  assertIncludes(
    contract,
    "must return product-safe fields only",
    "private manifest contract constrains typed private MCP add output",
  );
  assertIncludes(
    contract,
    "must not return operator/import fields",
    "private manifest contract forbids raw operator output from typed private MCP add",
  );
  assertIncludes(
    packageJson,
    "\"check:private-community-mcp-add-proof\"",
    "package script for private MCP add proof",
  );

  console.log("private_community_mcp_add_contract_proof: ok");
}

main();
