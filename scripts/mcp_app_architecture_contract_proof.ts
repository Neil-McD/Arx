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
    "Do not expose `communityAppMounts` directly as Daytona runtime tools.",
    "MCP app architecture contract forbidden runtime pattern",
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
    "Discover community app mount copy",
  );
  assertIncludes(
    communitySettings,
    "No apps are recommended for this community yet.",
    "Community Settings grant empty state",
  );
  assertNotIncludes(
    communitySettings,
    "No apps are attached to this community lens yet.",
    "Community Settings legacy mount empty state",
  );
  assertIncludes(
    communityAppsEditor,
    "What happens when you recommend it",
    "Community agent apps editor recommendation copy",
  );
  assertNotIncludes(
    communityAppsEditor,
    "The app is mounted into this community lens",
    "Community agent apps editor legacy mount copy",
  );

  console.log("mcp_app_architecture_contract_proof: ok");
}

main();
