import assert from "node:assert/strict";
import {
  DISCOVER_APP_CATALOG,
  buildDiscoverAppAdapterLabel,
  buildDiscoverAppIntegrationReadinessLabel,
  hasExplicitDiscoverAppIntegrationProfile,
  hasPlannedDiscoverAppIntegrationProfileKind,
  resolveDiscoverAppExecutionSurface,
  resolveDiscoverAppIntegrationProfile,
  type DiscoverAppCatalogEntry,
  type DiscoverAppIntegrationProfile,
} from "../shared/discoverCatalog.ts";

const READY_APP_IDS = new Set([
  "airtable",
  "linear",
  "notion",
  "shopify",
  "supabase",
]);

function assertNonEmpty(value: string, label: string) {
  assert.ok(value.trim().length > 0, `${label} must be non-empty`);
}

function assertNonEmptyArray(value: string[], label: string) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(value.length > 0, `${label} must be non-empty`);
  for (const item of value) {
    assertNonEmpty(item, `${label} item`);
  }
}

function assertHttpsEndpoint(app: DiscoverAppCatalogEntry) {
  if (app.personalConnect.connectionKind === "custom") return;
  assert.equal(app.personalConnect.availability, "ready");
  assert.ok(
    app.personalConnect.endpointUrl.startsWith("https://"),
    `${app.id} ready endpoint must be HTTPS`,
  );
}

function assertReadyProfileMatchesConnection(
  app: DiscoverAppCatalogEntry,
  profile: DiscoverAppIntegrationProfile,
) {
  assert.ok(
    READY_APP_IDS.has(app.id),
    `${app.id} is marked ready but is not in the explicit ready app allowlist`,
  );
  assert.equal(
    hasExplicitDiscoverAppIntegrationProfile(app),
    true,
    `${app.id} ready app must have an explicit integration profile override`,
  );
  assert.equal(
    profile.validationKind,
    "mcp_initialize_tools_list",
    `${app.id} ready app must validate by MCP initialize + tools/list`,
  );

  if (app.personalConnect.connectionKind === "custom") {
    assert.equal(profile.adapterKind, "custom_remote_mcp");
    assert.equal(profile.readiness, "custom_endpoint");
    assert.equal(profile.authMode, "custom");
    assert.equal(
      app.personalConnect.supportedAuthTypes.some((option) => option.value === "none"),
      true,
      `${app.id} custom ready app should state supported auth types`,
    );
    return;
  }

  assert.equal(app.personalConnect.connectionKind, "known");
  if (app.personalConnect.authMethod === "oauth") {
    assert.equal(profile.adapterKind, "remote_mcp_oauth");
    assert.equal(profile.readiness, "ready_oauth");
    assert.equal(profile.authMode, "oauth");
    assert.equal(app.personalConnect.authType, "oauth");
  } else {
    assert.equal(app.personalConnect.authMethod, "token");
    assert.equal(profile.adapterKind, "remote_mcp_token");
    assert.equal(profile.readiness, "ready_token");
    assert.equal(profile.authMode, "token");
    assert.ok(
      app.personalConnect.authType === "bearer" ||
        app.personalConnect.authType === "api_key",
      `${app.id} token-ready app must use a supported secret auth type`,
    );
    assertNonEmpty(app.personalConnect.secretLabel, `${app.id} secret label`);
  }
  assertHttpsEndpoint(app);
}

function assertPlannedProfileIsNotExecutable(
  app: DiscoverAppCatalogEntry,
  profile: DiscoverAppIntegrationProfile,
) {
  assert.equal(
    app.personalConnect.availability,
    "later",
    `${app.id} planned profile assertion only applies to later apps`,
  );
  assert.notEqual(profile.readiness, "ready_token", `${app.id} must not be token-ready`);
  assert.notEqual(profile.readiness, "ready_oauth", `${app.id} must not be OAuth-ready`);
  assert.notEqual(profile.readiness, "ready_no_auth", `${app.id} must not be no-auth ready`);
  assert.notEqual(
    profile.readiness,
    "custom_endpoint",
    `${app.id} must not be custom-endpoint ready`,
  );
}

function assertProfileHarnessContract(app: DiscoverAppCatalogEntry, profile: DiscoverAppIntegrationProfile) {
  assertNonEmpty(profile.contextStrategy, `${app.id} context strategy`);
  const executionSurface = resolveDiscoverAppExecutionSurface(profile);
  assertNonEmpty(executionSurface, `${app.id} execution surface`);
  assert.ok(
    Number.isInteger(profile.resultPolicy.maxToolCount) &&
      profile.resultPolicy.maxToolCount >= 0,
    `${app.id} result policy max tool count must be a non-negative integer`,
  );
  assert.ok(
    Number.isInteger(profile.resultPolicy.maxResultBytes) &&
      profile.resultPolicy.maxResultBytes >= 0,
    `${app.id} result policy max result bytes must be a non-negative integer`,
  );
  assert.equal(
    typeof profile.resultPolicy.summarizeLargeResults,
    "boolean",
    `${app.id} result policy summarize flag must be boolean`,
  );
  assertNonEmptyArray(profile.runtimePolicy.declaredIntents, `${app.id} declared intents`);

  if (profile.adapterKind === "cli_sandbox") {
    assert.equal(
      executionSurface,
      "sandbox_cli",
      `${app.id} sandbox adapters must execute through sandbox CLI`,
    );
    assert.equal(
      profile.contextStrategy,
      "artifact_reference",
      `${app.id} sandbox adapters should pass artifact references, not raw process output`,
    );
  }
  if (profile.adapterKind === "backplane_mcp") {
    assert.equal(
      executionSurface,
      "connector_backplane",
      `${app.id} backplane adapters must execute through the connector backplane`,
    );
  }
  if (
    profile.adapterKind === "remote_mcp_token" ||
    profile.adapterKind === "remote_mcp_no_auth" ||
    profile.adapterKind === "remote_mcp_oauth" ||
    profile.adapterKind === "custom_remote_mcp" ||
    profile.adapterKind === "direct_api"
  ) {
    assert.equal(
      executionSurface,
      "server_http",
      `${app.id} remote/API adapters must execute through server HTTP`,
    );
  }
  if (profile.adapterKind === "catalog_only") {
    assert.equal(
      executionSurface,
      "catalog_only",
      `${app.id} catalog-only adapters must not declare an executable surface`,
    );
    assert.equal(
      profile.resultPolicy.maxToolCount,
      0,
      `${app.id} catalog-only adapters must expose no tools`,
    );
  } else {
    assert.ok(
      profile.resultPolicy.maxToolCount > 0,
      `${app.id} executable/planned adapters should declare a positive tool budget`,
    );
    assert.ok(
      profile.resultPolicy.maxResultBytes > 0,
      `${app.id} executable/planned adapters should declare a positive result budget`,
    );
  }
}

function main() {
  const seenIds = new Set<string>();
  for (const app of DISCOVER_APP_CATALOG) {
    assert.ok(!seenIds.has(app.id), `duplicate Discover app id: ${app.id}`);
    seenIds.add(app.id);

    const profile = resolveDiscoverAppIntegrationProfile(app);
    assertNonEmpty(profile.adapterKind, `${app.id} adapter kind`);
    assertNonEmpty(profile.readiness, `${app.id} readiness`);
    assertNonEmpty(profile.identityScope, `${app.id} identity scope`);
    assertNonEmpty(profile.authMode, `${app.id} auth mode`);
    assertNonEmpty(profile.validationKind, `${app.id} validation kind`);
    assertNonEmpty(profile.runtimePolicy.defaultToolRisk, `${app.id} tool risk`);
    assertProfileHarnessContract(app, profile);
    assertNonEmpty(buildDiscoverAppIntegrationReadinessLabel(app), `${app.id} readiness label`);
    assertNonEmpty(buildDiscoverAppAdapterLabel(app), `${app.id} adapter label`);

    if (app.personalConnect.availability === "ready") {
      assertReadyProfileMatchesConnection(app, profile);
    } else {
      assert.equal(
        hasPlannedDiscoverAppIntegrationProfileKind(app),
        true,
        `${app.id} planned app must have an explicit planned integration profile kind`,
      );
      assertPlannedProfileIsNotExecutable(app, profile);
    }
  }

  assert.deepEqual(
    [...DISCOVER_APP_CATALOG]
      .filter((app) => app.personalConnect.availability === "ready")
      .map((app) => app.id)
      .sort(),
    [...READY_APP_IDS].sort(),
    "ready Discover app set should stay intentional",
  );

  console.log(
    "PASS: Discover apps have explicit integration profiles, and ready apps declare adapter, validation, and risk metadata.",
  );
}

main();
