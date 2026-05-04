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
  assertIncludes(
    runtimeHarnessComposition,
    "mountedTools: [],",
    "resolved runtime harness empty community MCP projection",
  );
  assertIncludes(
    runtimeHarnessComposition,
    "runtimeMountedTools: [],",
    "resolved runtime harness empty community runtime MCP projection",
  );

  console.log("mcp_app_architecture_contract_proof: ok");
}

main();
