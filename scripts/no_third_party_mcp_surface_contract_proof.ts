import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const deletedPaths = [
  "convex/appConnections.ts",
  "convex/appCore.ts",
  "convex/appFetchPolicy.ts",
  "convex/appOAuth.ts",
  "convex/appValidation.ts",
  "convex/communityAppMounts.ts",
  "convex/developerApps.ts",
  "convex/discoverMarketplace.ts",
  "convex/harnessMounts.ts",
  "convex/httpAppOAuth.ts",
  "convex/mcpHttpClient.ts",
  "convex/mcpSnapshotCodec.ts",
  "convex/runtimeMcpManager.ts",
  "convex/runtimeMountedToolExposure.ts",
  "convex/userPlatformAppMounts.ts",
  "shared/cloudCommunityAppMountGateway.ts",
  "shared/cloudDiscoverMarketplaceGateway.ts",
  "shared/cloudEffectiveMcpAppGateway.ts",
  "shared/cloudUserPlatformAppMountGateway.ts",
  "shared/communityAppMountTypes.ts",
  "shared/communityWorkflowImportMcpRegistry.ts",
  "shared/discoverCatalog.ts",
  "shared/effectiveMcpApps.ts",
  "shared/harnessMountTypes.ts",
  "shared/mcpHarnessProjection.ts",
  "shared/privateCommunityPluginManifest.ts",
  "shared/userPlatformAppMountTypes.ts",
  "apps/web/src/components/PersonalAppSetupModal.tsx",
  "apps/web/src/components/WebCommunityAiAgentAppsEditor.tsx",
  "apps/web/src/controllers/usePersonalAppSetupController.ts",
  "apps/web/src/controllers/useWebCommunityAppsController.ts",
  "apps/web/src/controllers/useWebEffectiveMcpAppsController.ts",
  "apps/web/src/controllers/useWebUserPlatformAppMountsController.ts",
  "docs/mcp-app-architecture-contract.md",
  "docs/mcp-gateway-reference-map.md",
  "docs/mcp-harness-projection-contract-v0.md",
] as const;

for (const path of deletedPaths) {
  assert.equal(existsSync(join(root, path)), false, `${path} must stay deleted`);
}

const activeSources = [
  "apps/web/src/App.tsx",
  "apps/web/src/components/WebCommunitySettingsSection.tsx",
  "apps/web/src/components/WebCommunityAiAgentSection.tsx",
  "apps/web/src/components/WebIntegrationsSettingsSection.tsx",
  "convex/http.ts",
  "convex/runtimeAgentLoop.ts",
  "convex/runtimeExecutionSession.ts",
  "convex/runtimeHarnessComposition.ts",
  "convex/runtimeHarnessShaping.ts",
  "convex/runtimeTurnHandlers.ts",
  "services/polynet-codex-worker/src/server.ts",
  "services/polynet-codex-worker/src/daytonaCodexConfig.ts",
  "services/polynet-codex-worker/src/workerToolSpecs.ts",
  "shared/runtimeContextManifest.ts",
  "shared/runtimePrompt.ts",
  "shared/runtimeToolPolicy.ts",
] as const;

const forbiddenActiveIdentifiers =
  /runtimeMcpManager|runtimeMountedToolExposure|mcpBridgeTools|resolve_mounted_tools|userPlatformAppMount|communityAppMount|EffectiveMcpApp|developerApps|appToolSnapshots|appConnections|appOAuthStates|setupImportedCommunityMcp|connected apps\/MCP/i;

for (const path of activeSources) {
  assert.doesNotMatch(
    read(path),
    forbiddenActiveIdentifiers,
    `${path} must not retain a third-party MCP consumer path`,
  );
}

const http = read("convex/http.ts");
assert.match(http, /registerRuntimeMcpRoutes/);
assert.doesNotMatch(http, /registerAppOAuthRoutes/);

const vercel = read("vercel.json");
assert.match(vercel, /"src": "\/runtime\/mcp", "dest": "\/api\/mcp\/runtime"/);
assert.doesNotMatch(vercel, /"src": "\/runtime\/mcp", "status": 404/);

const settings = read(
  "apps/web/src/components/WebIntegrationsSettingsSection.tsx",
);
assert.match(settings, /POLYNET_MCP_SETUP_BUNDLE/);
assert.match(settings, /WebSkillsSettingsSection/);
assert.doesNotMatch(
  settings,
  /Connected apps|PersonalAppSetupModal|EffectiveMcpApp/,
);

const provider = read("docs/polynet-workspace-mcp-contract-v0.md");
assert.match(provider, /Polynet Workspace MCP is a provider surface/);
assert.match(
  provider,
  /Polynet does not consume, connect, mount, proxy, or execute third-party MCP/,
);

const retiredTables = [
  "developerApps",
  "appConnections",
  "appOAuthStates",
  "appToolSnapshots",
  "communityAppMounts",
  "userPlatformAppMounts",
  "userPlatformAppMountSources",
] as const;
const schema = read("convex/schema.ts");
const cleanup = read("convex/anonymousUserCleanup.ts");
const retirementPath = join(root, "convex/thirdPartyMcpRetirement.ts");

if (existsSync(retirementPath)) {
  const retirement = read("convex/thirdPartyMcpRetirement.ts");
  for (const table of retiredTables) {
    assert.match(schema, new RegExp(`\\b${table}: defineTable\\(`));
    assert.match(retirement, new RegExp(`"${table}"`));
  }
  assert.match(
    cleanup,
    /developerApps|appOAuthStates|userPlatformAppMounts|communityAppMounts/,
  );
  console.log(
    "PASS: no active third-party MCP surface; retirement schema is isolated for bounded production cleanup",
  );
} else {
  for (const table of retiredTables) {
    assert.doesNotMatch(schema, new RegExp(`\\b${table}: defineTable\\(`));
  }
  assert.doesNotMatch(
    cleanup,
    /developerApps|appOAuthStates|userPlatformAppMounts|communityAppMounts/,
  );
  console.log(
    "PASS: no active third-party MCP surface and retirement schema is gone",
  );
}
