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
  const discoverCatalog = readText(join(root, "shared/discoverCatalog.ts"));
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
  const integrationsSettings = readText(
    join(root, "apps/web/src/components/WebIntegrationsSettingsSection.tsx"),
  );
  const personalAppSetupModal = readText(
    join(root, "apps/web/src/components/PersonalAppSetupModal.tsx"),
  );
  const personalAppSetupController = readText(
    join(root, "apps/web/src/controllers/usePersonalAppSetupController.ts"),
  );
  const discoverCatalogMatching = readText(
    join(root, "apps/web/src/lib/discoverCatalogMatching.ts"),
  );
  const integrationSurfaceRows = readText(
    join(root, "apps/web/src/lib/integrationSurfaceRows.ts"),
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
  assertIncludes(contract, "### Community App Add", "MCP app architecture contract");
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
    "A ready app profile must declare adapter kind, readiness, auth mode, validation kind, identity, context strategy, result policy, declared intents, risk metadata, and any provider-owned MCP request headers.",
    "MCP app architecture contract profile metadata rule",
  );
  assertIncludes(
    contract,
    "Context strategy must say whether the harness should use manifest-only context, search-then-fetch, structured snapshots, or artifact references.",
    "MCP app architecture contract context strategy rule",
  );
  assertIncludes(
    contract,
    "Execution surface is derived from adapter kind: remote MCP and direct API use server HTTP, backplane uses connector backplane, workspace CLI uses the existing project-bound Daytona workspace tools, and catalog-only has no executable surface.",
    "MCP app architecture contract execution surface rule",
  );
  assertIncludes(
    contract,
    "Result policy declares active tool-count and result-byte bounds; validation caps discovered tool snapshots and runtime truncates oversized tool output to the app profile budget.",
    "MCP app architecture contract result policy rule",
  );
  assertIncludes(
    contract,
    "Tool policy uses the Codex-style irreducible model: default-enabled tools, disabled tools, and a final execution-time deny check.",
    "MCP app architecture contract tool policy rule",
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
    "GitHub's ready profile is intentionally read-only and must use `https://api.githubcopilot.com/mcp/readonly` with catalog-owned read-only and toolset headers",
    "MCP app architecture contract GitHub narrowed read-only rule",
  );
  assertIncludes(
    contract,
    "Stripe's ready profile uses `https://mcp.stripe.com` with a user-owned restricted API key",
    "MCP app architecture contract Stripe restricted-key rule",
  );
  assertIncludes(
    contract,
    "Vercel's MCP profile stays planned until Polynet's client approval and operation-safety path are verified.",
    "MCP app architecture contract Vercel planned rule",
  );
  assertIncludes(
    contract,
    "Media-production apps must use an artifact/job contract.",
    "MCP app architecture contract media production artifact rule",
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
    "OAuth remote MCP apps use server-side PKCE state, provider-aware MCP `resource` handling, a passive callback that records the provider result, an authenticated user finalization action that exchanges the code, encrypted token bundles, token refresh, and the same MCP validation/runtime path as token-based remote MCP apps.",
    "MCP app architecture contract OAuth MCP rule",
  );
  assertIncludes(
    contract,
    "OAuth tokens live in encrypted user connection state and must not be stored in community app bundle records; callback results must not attach provider tokens to a Polynet user until an authenticated finalization action verifies the state owner.",
    "MCP app architecture contract OAuth credential ownership rule",
  );
  assertIncludes(
    contract,
    "Personal setup UX in Discover, Integrations, and Community Settings must route through one setup controller",
    "MCP app architecture contract canonical setup controller rule",
  );
  assertIncludes(
    contract,
    "Operator MCP servers configured in Codex are not user-facing Discover integration profiles.",
    "MCP app architecture contract operator MCP separation rule",
  );
  assertIncludes(
    contract,
    "A community app add is a distribution path, not continuing ownership of the member's user app state.",
    "MCP app architecture contract community distribution rule",
  );
  assertIncludes(
    contract,
    "Removing the app from the community stops future distribution, removes or promotes the community source row, and does not uninstall existing user harness apps.",
    "MCP app architecture contract community removal rule",
  );
  assertIncludes(
    contract,
    "Source rows explain why a user app exists: direct personal add or community seed.",
    "MCP app architecture contract source provenance rule",
  );
  assertIncludes(
    contract,
    "Do not expose `communityAppMounts` directly as Daytona runtime tools.",
    "MCP app architecture contract forbidden runtime pattern",
  );
  assertIncludes(
    contract,
    "Do not remove an existing user harness app just because a builder removes it from the community app bundle.",
    "MCP app architecture contract forbidden uninstall pattern",
  );
  assertIncludes(
    contract,
    "keeping obsolete grant/recommend frontend aliases and copy out of app management surfaces",
    "MCP app architecture contract ongoing copy drift rule",
  );

  assertIncludes(schema, "developerApps: defineTable({", "app definition table");
  assertIncludes(schema, "communityAppMounts: defineTable({", "community app bundle table");
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
    "Add ${selectedApp.name} to ${communityTargetLabel}",
    "Discover community app add copy",
  );
  assertNotIncludes(
    discoverPanel,
    "Recommend ${selectedApp.name} in ${communityTargetLabel}",
    "Discover legacy community recommend copy",
  );
  assertIncludes(
    communitySettings,
    "No apps have been added to this community yet.",
    "Community Settings app empty state",
  );
  assertIncludes(
    communitySettings,
    "usePersonalAppSetupController",
    "Community Settings uses canonical personal app setup controller",
  );
  assertIncludes(
    communitySettings,
    "personalAppSetup.open",
    "Community Settings can open personal setup for a community app",
  );
  assertIncludes(
    communitySettings,
    "PersonalAppSetupModal",
    "Community Settings uses canonical personal app setup modal",
  );
  assertIncludes(
    integrationsSettings,
    "usePersonalAppSetupController",
    "Integrations Settings uses canonical personal app setup controller",
  );
  assertIncludes(
    integrationsSettings,
    "PersonalAppSetupModal",
    "Integrations Settings uses canonical personal app setup modal",
  );
  assertIncludes(
    personalAppSetupController,
    "onBeginOAuth",
    "Canonical personal app setup controller can start personal OAuth",
  );
  assertIncludes(
    personalAppSetupController,
    "personalAppSetupTargetsExistingPersonalMount",
    "Canonical personal app setup controller reuses existing personal app identity",
  );
  assertNotIncludes(
    communitySettings,
    "const handleConfirmSetup",
    "Community Settings should not duplicate personal app setup branching",
  );
  assertNotIncludes(
    integrationsSettings,
    "const handleConfirmSetup",
    "Integrations Settings should not duplicate personal app setup branching",
  );
  assertIncludes(
    communitySettings,
    "integration-mounted-setup-action",
    "Community Settings renders setup action for setup-needed community apps",
  );
  assertIncludes(
    personalAppSetupModal,
    "buildDiscoverAppPersonalConnectRequirements",
    "Canonical personal app setup modal renders catalog-driven requirements",
  );
  assertIncludes(
    discoverCatalogMatching,
    "findDiscoverCatalogEntryForAppIdentity",
    "Canonical Discover catalog identity matcher",
  );
  assertIncludes(
    integrationSurfaceRows,
    "findDiscoverCatalogEntryForAppIdentity",
    "Shared integration surface row mapper uses canonical Discover catalog identity matcher",
  );
  for (const appSurface of [
    ["Community Settings", communitySettings],
    ["Integrations Settings", integrationsSettings],
  ] as const) {
    assertIncludes(
      appSurface[1],
      "findDiscoverCatalogEntryForAppIdentity",
      `${appSurface[0]} uses canonical Discover catalog identity matcher`,
    );
  }
  assertIncludes(
    communityAppsEditor,
    "buildIntegrationSurfaceRowFromCommunityMount",
    "Community app editor uses shared integration surface row mapper",
  );
  for (const duplicatedCatalogLookup of [
    "function findCatalogEntryForCommunityMount",
    "function findCatalogEntryForApp",
  ]) {
    assertNotIncludes(
      communitySettings,
      duplicatedCatalogLookup,
      "Community Settings local duplicate Discover catalog lookup helper",
    );
    assertNotIncludes(
      integrationsSettings,
      duplicatedCatalogLookup,
      "Integrations Settings local duplicate Discover catalog lookup helper",
    );
    assertNotIncludes(
      communityAppsEditor,
      duplicatedCatalogLookup,
      "Community app editor local duplicate Discover catalog lookup helper",
    );
  }
  assertNotIncludes(
    communitySettings,
    "function setupTargetsExistingPersonalMount",
    "Community Settings local duplicate personal setup identity helper",
  );
  assertNotIncludes(
    integrationsSettings,
    "function setupTargetsExistingPersonalMount",
    "Integrations Settings local duplicate personal setup identity helper",
  );
  for (const legacyCopy of [
    "recommended by this community",
    "Recommended by community",
    "No apps are recommended",
    "Members can add recommended apps",
    "Recommend",
  ]) {
    assertNotIncludes(communitySettings, legacyCopy, "Community Settings legacy recommend copy");
    assertNotIncludes(integrationsSettings, legacyCopy, "Integrations Settings legacy recommend copy");
    assertNotIncludes(communityAppsEditor, legacyCopy, "Community app editor legacy recommend copy");
  }
  for (const catalogDriftCopy of [
    "Community recommendations",
    "commerce recommendations",
    "recommended long-term",
  ]) {
    assertNotIncludes(
      discoverCatalog,
      catalogDriftCopy,
      "Discover catalog app/community copy drift",
    );
  }
  assertIncludes(
    discoverCatalog,
    "id: \"higgsfield\"",
    "Discover catalog includes Higgsfield as a planned media MCP app",
  );
  assertIncludes(
    discoverCatalog,
    "https://mcp.higgsfield.ai",
    "Discover catalog preserves Higgsfield provider MCP URL",
  );
  assertIncludes(
    discoverCatalog,
    "docsUrl: \"https://hyperframes.heygen.com/packages/cli\"",
    "Discover catalog points HyperFrames at CLI docs",
  );
  assertIncludes(
    discoverCatalog,
    "No separate app credentials are required. Add the HyperFrames skill, then use it in a project-bound thread where workspace tools can run the CLI in Daytona and return artifact references.",
    "Discover catalog routes HyperFrames through skill plus existing project workspace tools",
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
