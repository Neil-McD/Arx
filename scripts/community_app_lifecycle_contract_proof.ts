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
  const communityAppMounts = readText(join(root, "convex/communityAppMounts.ts"));
  const userPlatformAppMounts = readText(
    join(root, "convex/userPlatformAppMounts.ts"),
  );
  const httpDaytona = readText(join(root, "convex/httpDaytona.ts"));
  const runtimeExecutionSession = readText(
    join(root, "convex/runtimeExecutionSession.ts"),
  );
  const runtimeMcpManager = readText(
    join(root, "convex/runtimeMcpManager.ts"),
  );
  const appEditor = readText(join(root, "apps/web/src/components/WebCommunityAiAgentAppsEditor.tsx"));

  for (const exportedName of [
    "export const connectCommunityApp = action({",
    "export const refreshCommunityApp = action({",
    "export const reconnectCommunityApp = action({",
    "export const updateCommunityAppMount = mutation({",
    "export const unmountCommunityApp = mutation({",
    "export const listRuntimeCommunityMountedToolsInternal = internalQuery({",
    "export const executeCommunityMountedAppToolInternal = internalAction({",
  ]) {
    assertIncludes(communityAppMounts, exportedName, "community app lifecycle surface");
  }

  assertIncludes(
    communityAppMounts,
    "internal.appValidation.validateDeveloperAppInternal",
    "community app validation lifecycle",
  );
  assertIncludes(
    communityAppMounts,
    "toolSnapshotId: v.optional(v.id(\"appToolSnapshots\"))",
    "community setup-needed mounts allow missing snapshots",
  );
  assertIncludes(
    userPlatformAppMounts,
    "toolSnapshotId: v.optional(v.id(\"appToolSnapshots\"))",
    "personal setup-needed mounts allow missing snapshots",
  );
  assertIncludes(
    communityAppMounts,
    "deriveCommunityMountLiveState",
    "community mounts expose live/not-live state",
  );
  assertIncludes(
    userPlatformAppMounts,
    "deriveUserPlatformMountLiveState",
    "personal mounts expose live/not-live state",
  );
  assertIncludes(
    communityAppMounts,
    "return await mountDeveloperAppForCommunity({",
    "community failed setup preserves mount intent",
  );
  assertIncludes(
    userPlatformAppMounts,
    "mountSetupNeededDeveloperAppForUser({",
    "personal failed setup preserves mount intent",
  );
  assertIncludes(
    communityAppMounts,
    "if (!app) continue;",
    "community list keeps snapshotless setup-needed mounts",
  );
  assertIncludes(
    userPlatformAppMounts,
    "if (!app) continue;",
    "personal list keeps snapshotless setup-needed mounts",
  );
  assertIncludes(
    communityAppMounts,
    "if (!app || !snapshot) continue;",
    "community runtime skips non-live snapshotless mounts",
  );
  assertIncludes(
    userPlatformAppMounts,
    "if (!app || !snapshot) continue;",
    "personal runtime skips non-live snapshotless mounts",
  );
  assertIncludes(
    communityAppMounts,
    "if (mountedTool.risk_level !== \"read\")",
    "mounted tool risk gate",
  );
  assertIncludes(
    communityAppMounts,
    "assertCommunityManagerAccessInternal",
    "manager-only mounted tool guard",
  );

  assertNotIncludes(
    httpDaytona,
    "internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal",
    "runtime mounted-tool resolution",
  );
  assertIncludes(
    httpDaytona,
    "createPolyNetExecutionSession({",
    "runtime personal mounted-tool execution session composition",
  );
  assertIncludes(
    httpDaytona,
    "executionSession.executeMountedTool({",
    "runtime personal mounted-tool execution dispatch",
  );
  assertNotIncludes(
    httpDaytona,
    "community_app_tools_resolved",
    "runtime mounted-tool evidence event",
  );
  assertNotIncludes(
    httpDaytona,
    "mountedTool.scope === \"community\" && mountedTool.risk_level !== \"read\"",
    "community mounted write/sensitive runtime guard",
  );
  assertIncludes(
    runtimeExecutionSession,
    "createRuntimeMcpManager({",
    "execution session owns MCP manager",
  );
  assertIncludes(
    runtimeExecutionSession,
    "async executeMountedTool(params:",
    "execution session exposes mounted tool execution",
  );
  assertIncludes(
    runtimeMcpManager,
    "callTool:",
    "runtime MCP manager calls remote mounted tools",
  );

  assertIncludes(appEditor, "Refresh", "apps editor refresh control");
  assertIncludes(appEditor, "Reconnect", "apps editor reconnect control");

  console.log("community_app_lifecycle_contract_proof: ok");
}

main();
