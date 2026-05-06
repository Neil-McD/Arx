import assert from "node:assert/strict";
import {
  DISCOVER_APP_CATALOG,
  buildDiscoverAppAdapterLabel,
  buildDiscoverAppIntegrationReadinessLabel,
  hasExplicitDiscoverAppIntegrationProfile,
  hasPlannedDiscoverAppIntegrationProfileKind,
  resolveDiscoverAppIntegrationProfile,
  type DiscoverAppCatalogEntry,
  type DiscoverAppIntegrationProfile,
} from "../shared/discoverCatalog.ts";

const READY_APP_IDS = new Set(["airtable", "linear", "shopify", "supabase"]);

function assertNonEmpty(value: string, label: string) {
  assert.ok(value.trim().length > 0, `${label} must be non-empty`);
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
  assert.notEqual(profile.readiness, "ready_no_auth", `${app.id} must not be no-auth ready`);
  assert.notEqual(
    profile.readiness,
    "custom_endpoint",
    `${app.id} must not be custom-endpoint ready`,
  );
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
