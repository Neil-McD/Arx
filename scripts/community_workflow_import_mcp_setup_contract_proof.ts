import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveCommunityWorkflowImportMcpCatalogMatch,
} from "../shared/communityWorkflowImportCatalogResolver.ts";
import {
  findCommunityWorkflowImportMcpRegistryEntryById,
  resolveCommunityWorkflowImportMcpRegistryConnectPolicy,
} from "../shared/communityWorkflowImportMcpRegistry.ts";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function mcpMatch(name: string, record: Record<string, unknown> = {}) {
  return resolveCommunityWorkflowImportMcpCatalogMatch({ name, record });
}

function proveContext7IsRegistryReadyWithoutRequiredAuth() {
  const entry = findCommunityWorkflowImportMcpRegistryEntryById("context7");
  assert.ok(entry, "Context7 must be in the workflow import MCP registry");
  assert.equal(entry.status, "ready");
  assert.equal(entry.connectionClass, "hosted_remote");
  assert.equal(entry.defaultEndpointUrl, "https://mcp.context7.com/mcp");
  assert.equal(entry.defaultAuthType, "none");
  assert.deepEqual(entry.requiredSecretNames, []);

  const match = mcpMatch("Context7");
  assert.equal(match.app, null, "Context7 should not require a Discover catalog app");
  assert.equal(match.registryId, "context7");
  assert.equal(match.catalogAppId, null);
  assert.equal(match.endpointUrl, "https://mcp.context7.com/mcp");
  assert.equal(match.authType, "none");
  assert.equal(match.status, "ready");
  assert.equal(match.connectable, true);

  const policy = resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
    mcpRegistryId: "context7",
    name: "Context7",
    endpointUrl: "https://mcp.context7.com/mcp",
    authType: "none",
  });
  assert.equal(policy.ok, true, "Context7 no-auth MCP should be connectable");

  const apiKeyMatch = mcpMatch("Context7", { auth_type: "api_key" });
  assert.equal(
    apiKeyMatch.connectable,
    false,
    "Context7 API-key imports should stage setup instead of pretending community-level secrets are connected",
  );
  assert.equal(apiKeyMatch.status, "ready");
  assert.equal(apiKeyMatch.authType, "api_key");

  console.log("PASS: Context7 is registry-ready without required auth");
}

function proveOAuthProvidersStageForAuth() {
  for (const id of ["vercel", "posthog", "sentry"] as const) {
    const entry = findCommunityWorkflowImportMcpRegistryEntryById(id);
    assert.ok(entry, `${id} must be in the workflow import MCP registry`);
    assert.equal(entry.status, "needs_auth", `${id} should need user auth`);
    assert.equal(entry.connectionClass, "hosted_remote");
    assert.equal(entry.defaultAuthType, "oauth");
    assert.ok(entry.defaultEndpointUrl, `${id} must have a default endpoint`);

    const match = mcpMatch(entry.name);
    assert.equal(match.registryId, id);
    assert.equal(match.endpointUrl, entry.defaultEndpointUrl);
    assert.equal(match.authType, "oauth");
    assert.equal(match.status, "needs_auth");
    assert.equal(match.connectable, false);
  }

  console.log("PASS: OAuth providers stage for imported setup");
}

function proveRuntimeProvidersDoNotUseRemoteSetup() {
  for (const id of ["fly", "convex"] as const) {
    const entry = findCommunityWorkflowImportMcpRegistryEntryById(id);
    assert.ok(entry, `${id} must be in the workflow import MCP registry`);
    assert.equal(entry.status, "needs_runtime");
    assert.equal(entry.connectionClass, "managed_runtime");
    assert.equal(entry.defaultEndpointUrl, null);

    const match = mcpMatch(entry.name);
    assert.equal(match.registryId, id);
    assert.equal(match.status, "needs_runtime");
    assert.equal(match.connectable, false);

    const rejected = resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
      mcpRegistryId: id,
      name: entry.name,
      endpointUrl: "https://example.com/mcp",
      authType: entry.supportedAuthTypes[0],
    });
    assert.equal(rejected.ok, false, `${id} must reject remote connect policy`);
    if (!rejected.ok) {
      assert.equal(rejected.code, "mcp_registry_entry_not_remote");
    }
  }

  console.log("PASS: runtime providers stay out of remote setup");
}

function proveRegistryOnlyConnectPathExists() {
  const importSource = readText(
    new URL("../convex/communityWorkflowImports.ts", import.meta.url),
  );
  const communityMountSource = readText(
    new URL("../convex/communityAppMounts.ts", import.meta.url),
  );
  const settingsRowsSource = readText(
    new URL("../apps/web/src/lib/integrationSurfaceRows.ts", import.meta.url),
  );
  const settingsPageSource = readText(
    new URL(
      "../apps/web/src/components/WebIntegrationsSettingsSection.tsx",
      import.meta.url,
    ),
  );
  const setupControllerSource = readText(
    new URL(
      "../apps/web/src/controllers/usePersonalAppSetupController.ts",
      import.meta.url,
    ),
  );

  assert.match(
    importSource,
    /\(!args\.item\.catalogAppId && !args\.item\.mcpRegistryId\)/,
    "workflow import apply must allow vetted registry-only MCPs",
  );
  assert.match(
    importSource,
    /connectImportedCommunityMcpAppInternal/,
    "workflow import apply must route registry-only ready MCPs through the imported MCP connect path",
  );
  assert.match(
    communityMountSource,
    /export const connectImportedCommunityMcpAppInternal/,
    "community app mounts must expose an internal imported MCP connect path",
  );
  assert.match(
    communityMountSource,
    /policy\.authType !== "none"/,
    "imported registry-only community connect must not silently share user secrets",
  );
  assert.match(
    settingsRowsSource,
    /fallbackSetupStatus:[\s\S]*effectiveApp\.community_mount\?\.app\.setup_status/,
    "effective settings rows must preserve selected-community setup status",
  );
  assert.match(
    settingsPageSource,
    /setup_status === "needs_auth"[\s\S]*setup_status === "needs_config"/,
    "settings setup CTA must remain limited to auth/config rows",
  );
  assert.equal(
    /setup_status === "needs_runtime"/.test(setupControllerSource),
    false,
    "runtime-backed MCPs must not enter the remote setup modal",
  );

  console.log("PASS: registry-only connect path and runtime UI semantics exist");
}

proveContext7IsRegistryReadyWithoutRequiredAuth();
proveOAuthProvidersStageForAuth();
proveRuntimeProvidersDoNotUseRemoteSetup();
proveRegistryOnlyConnectPathExists();

console.log("community_workflow_import_mcp_setup_contract_proof: ok");
