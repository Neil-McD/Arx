import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function main() {
  const communityAppMounts = readText("/Users/neilmcdevitt/code/arx/convex/communityAppMounts.ts");
  const httpDaytona = readText("/Users/neilmcdevitt/code/arx/convex/httpDaytona.ts");
  const appEditor = readText("/Users/neilmcdevitt/code/arx/apps/web/src/components/WebCommunityAiAgentAppsEditor.tsx");

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
    "if (mountedTool.risk_level !== \"read\")",
    "mounted tool risk gate",
  );
  assertIncludes(
    communityAppMounts,
    "assertCommunityManagerAccessInternal",
    "manager-only mounted tool guard",
  );

  assertIncludes(
    httpDaytona,
    "internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal",
    "runtime mounted-tool resolution",
  );
  assertIncludes(
    httpDaytona,
    "executeCommunityMountedAppToolInternal",
    "runtime mounted-tool execution",
  );
  assertIncludes(
    httpDaytona,
    "community_app_tools_resolved",
    "runtime mounted-tool evidence event",
  );

  assertIncludes(appEditor, "Refresh", "apps editor refresh control");
  assertIncludes(appEditor, "Reconnect", "apps editor reconnect control");

  console.log("community_app_lifecycle_contract_proof: ok");
}

main();
