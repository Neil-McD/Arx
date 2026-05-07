import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertNotIncludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} not to include ${needle}`);
}

function main() {
  const root = process.cwd();
  const contract = readText(join(root, "docs/mcp-app-architecture-contract.md"));
  const schema = readText(join(root, "convex/schema.ts"));
  const httpDaytona = readText(join(root, "convex/httpDaytona.ts"));
  const runtimeHarnessComposition = readText(
    join(root, "convex/runtimeHarnessComposition.ts"),
  );
  const discoverPanel = readText(
    join(root, "apps/web/src/components/WebDiscoverPanel.tsx"),
  );
  const communitySettings = readText(
    join(root, "apps/web/src/components/WebCommunitySettingsSection.tsx"),
  );
  const communityAppsEditor = readText(
    join(root, "apps/web/src/components/WebCommunityAiAgentAppsEditor.tsx"),
  );

  assertIncludes(
    contract,
    "Communities grant access. Users own app state. Runtime executes only user harness tools.",
    "MCP app architecture contract first principle",
  );
  assertIncludes(contract, "### App Definition", "MCP app architecture contract");
  assertIncludes(contract, "### Integration Profile", "MCP app architecture contract");
  assertIncludes(contract, "### Community App Grant", "MCP app architecture contract");
  assertIncludes(contract, "### User App State", "MCP app architecture contract");
  assertIncludes(contract, "### Runtime Harness", "MCP app architecture contract");
  assertIncludes(
    contract,
    "Runtime MCP tools come only from user app state.",
    "MCP app architecture contract runtime rule",
  );
  assertIncludes(
    contract,
    "Ready apps must have an explicit profile override.",
    "MCP app architecture contract integration profile rule",
  );
  assertIncludes(
    contract,
    "A ready app profile must declare adapter kind, readiness, auth mode, validation kind, identity, context strategy, result policy, declared intents, and risk metadata.",
    "MCP app architecture contract profile metadata rule",
  );
  assertIncludes(
    contract,
    "Context strategy must say whether the harness should use manifest-only context, search-then-fetch, structured snapshots, or artifact references.",
    "MCP app architecture contract context strategy rule",
  );
  assertIncludes(
    contract,
    "Execution surface is derived from adapter kind: remote MCP and direct API use server HTTP, backplane uses connector backplane, sandboxed CLI uses sandboxed commands, and catalog-only has no executable surface.",
    "MCP app architecture contract execution surface rule",
  );
  assertIncludes(
    contract,
    "Result policy declares active tool-count and result-byte bounds; validation caps discovered tool snapshots and runtime truncates oversized tool output to the app profile budget.",
    "MCP app architecture contract result policy rule",
  );
  assertIncludes(
    contract,
    "Catalog app connection policy is server-authoritative",
    "MCP app architecture contract server-authoritative catalog policy rule",
  );
  assertIncludes(
    contract,
    "endpoint-instance apps, such as Shopify Storefront MCP, reuse by endpoint/auth identity.",
    "MCP app architecture contract endpoint-instance identity rule",
  );
  assertIncludes(
    contract,
    "Shopify's ready profile accepts only the standard Storefront MCP `/api/mcp` endpoint",
    "MCP app architecture contract Shopify standard Storefront MCP rule",
  );
  assertIncludes(
    contract,
    "Uncataloged remote MCP endpoints are blocked from public server-fetch paths",
    "MCP app architecture contract uncataloged endpoint fetch rule",
  );
  assertIncludes(
    contract,
    "Integration profile default risk is applied as a floor during MCP tool snapshot classification.",
    "MCP app architecture contract profile risk floor rule",
  );
  assertIncludes(
    contract,
    "OAuth remote MCP apps use server-side PKCE state, MCP `resource` audience binding, a passive callback that records the provider result, an authenticated user finalization action that exchanges the code, encrypted token bundles, token refresh, and the same MCP validation/runtime path as token-based remote MCP apps.",
    "MCP app architecture contract OAuth MCP rule",
  );
  assertIncludes(
    contract,
    "OAuth tokens live in encrypted user connection state and must not be stored in community grants; callback results must not attach provider tokens to a Polynet user until an authenticated finalization action verifies the state owner.",
    "MCP app architecture contract OAuth credential ownership rule",
  );
  assertIncludes(
    contract,
    "Operator MCP servers configured in Codex are not user-facing Discover integration profiles.",
    "MCP app architecture contract operator MCP separation rule",
  );
  assertIncludes(
    contract,
    "A community grant is a distribution path, not continuing ownership of the member's user app state.",
    "MCP app architecture contract community distribution rule",
  );
  assertIncludes(
    contract,
    "Removing the app from the community stops future distribution but does not uninstall existing user harness apps.",
    "MCP app architecture contract community removal rule",
  );
  assertIncludes(
    contract,
    "Do not expose `communityAppMounts` directly as Daytona runtime tools.",
    "MCP app architecture contract forbidden runtime pattern",
  );
  assertIncludes(
    contract,
    "Do not remove an existing user harness app just because a builder removes it from the community recommendation bundle.",
    "MCP app architecture contract forbidden uninstall pattern",
  );

  assertIncludes(schema, "developerApps: defineTable({", "app definition table");
  assertIncludes(schema, "communityAppMounts: defineTable({", "community app grant table");
  assertIncludes(schema, "userPlatformAppMounts: defineTable({", "user app state table");

  assertIncludes(
    httpDaytona,
    "internal.userPlatformAppMounts.listRuntimeUserPlatformMountedToolsInternal",
    "Daytona runtime user app tool query",
  );
  assertNotIncludes(
    httpDaytona,
    "internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal",
    "Daytona runtime community app tool query",
  );
  assertNotIncludes(
    httpDaytona,
    "community_app_tools_resolved",
    "Daytona runtime community app evidence event",
  );

  assertIncludes(
    runtimeHarnessComposition,
    "const runtimeMountedTools = [...args.personalMountedTools];",
    "resolved runtime harness personal-only MCP runtime",
  );
  for (const deletedRuntimeShape of [
    "communityMountedTools:",
    "runtimeMountedCommunityTools:",
    "mountedTools: [],",
    "runtimeMountedTools: [],",
  ]) {
    assertNotIncludes(
      runtimeHarnessComposition,
      deletedRuntimeShape,
      "resolved runtime harness deleted community MCP shape",
    );
  }

  assertIncludes(
    discoverPanel,
    "Recommend ${selectedApp.name} in ${communityTargetLabel}",
    "Discover community app grant copy",
  );
  assertNotIncludes(
    discoverPanel,
    "Add ${selectedApp.name} to ${communityTargetLabel}",
    "Discover legacy community install copy",
  );
  assertIncludes(
    communitySettings,
    "No apps are recommended for this community yet.",
    "Community Settings grant empty state",
  );
  assertNotIncludes(
    communitySettings,
    "No apps are attached to this community lens yet.",
    "Community Settings legacy lens empty state",
  );
  assertIncludes(
    communityAppsEditor,
    "onClick={onBrowseCatalog}",
    "Community agent apps editor catalog-only add path",
  );
  assertNotIncludes(
    communityAppsEditor,
    "Connect hosted MCP app",
    "Community agent apps editor generic hosted MCP fallback",
  );
  assertNotIncludes(
    communityAppsEditor,
    "Paste the app&apos;s direct hosted MCP endpoint.",
    "Community agent apps editor generic endpoint copy",
  );
  assertNotIncludes(
    communityAppsEditor,
    "What happens when you recommend it",
    "Community agent apps editor generic connect flow copy",
  );
  assertNotIncludes(
    communityAppsEditor,
    "The app is mounted into this community lens",
    "Community agent apps editor legacy lens copy",
  );

  console.log("mcp_app_architecture_contract_proof: ok");
}

main();
