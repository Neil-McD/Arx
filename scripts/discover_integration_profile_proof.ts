import assert from "node:assert/strict";
import {
  DISCOVER_APP_CATALOG,
  buildDiscoverAppAdapterLabel,
  buildDiscoverAppIntegrationReadinessLabel,
  hasExplicitDiscoverAppIntegrationProfile,
  hasPlannedDiscoverAppIntegrationProfileKind,
  isDiscoverAppPersonallyConnectable,
  resolveDiscoverAppExecutionSurface,
  resolveDiscoverAppIntegrationProfile,
  resolveDiscoverAppMcpRequestHeadersForCatalogAppId,
  type DiscoverAppCatalogEntry,
  type DiscoverAppIntegrationProfile,
} from "../shared/discoverCatalog.ts";
import {
  DISCOVER_SKILL_CATALOG,
  deriveDiscoverSkillMentionToken,
  findRelatedDiscoverSkillForApp,
} from "../shared/discoverSkillCatalog.ts";

const READY_APP_IDS = new Set([
  "airtable",
  "github",
  "linear",
  "notion",
  "shopify",
  "stripe",
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
  assert.deepEqual(
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
    assert.ok(
      profile.oauthClient,
      `${app.id} ready OAuth app must declare how Polynet obtains an OAuth client`,
    );
    if (profile.oauthClient?.mode === "static_env") {
      assertNonEmpty(
        profile.oauthClient.clientIdEnv,
        `${app.id} static OAuth client id env`,
      );
      assertNonEmpty(
        profile.oauthClient.clientSecretEnv,
        `${app.id} static OAuth client secret env`,
      );
    }
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
      if (!hasExplicitDiscoverAppIntegrationProfile(app)) {
        assert.equal(
          hasPlannedDiscoverAppIntegrationProfileKind(app),
          true,
          `${app.id} planned app must have an explicit planned integration profile kind or profile override`,
        );
      }
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

  const github = DISCOVER_APP_CATALOG.find((app) => app.id === "github");
  assert.ok(github, "GitHub must exist in the Discover catalog");
  assert.equal(
    github.personalConnect.availability,
    "ready",
    "GitHub should be intentionally ready as a read-only token MCP",
  );
  assert.equal(
    github.personalConnect.endpointUrl,
    "https://api.githubcopilot.com/mcp/readonly",
    "GitHub must use the hosted read-only MCP endpoint",
  );
  const githubProfile = resolveDiscoverAppIntegrationProfile(github);
  assert.equal(githubProfile.runtimePolicy.defaultToolRisk, "sensitive");
  assert.deepEqual(
    resolveDiscoverAppMcpRequestHeadersForCatalogAppId("github"),
    {
      "X-MCP-Readonly": "true",
      "X-MCP-Toolsets": "repos,issues,pull_requests,users",
    },
    "GitHub ready profile must force read-only narrowed MCP toolsets",
  );
  for (const intent of githubProfile.runtimePolicy.declaredIntents) {
    assert.equal(
      intent.includes("write"),
      false,
      "GitHub ready profile should not declare write intent",
    );
  }

  const stripe = DISCOVER_APP_CATALOG.find((app) => app.id === "stripe");
  assert.ok(stripe, "Stripe must exist in the Discover catalog");
  assert.equal(
    stripe.personalConnect.availability,
    "ready",
    "Stripe should be intentionally ready through the restricted-key bearer path",
  );
  assert.equal(
    stripe.personalConnect.endpointUrl,
    "https://mcp.stripe.com/",
    "Stripe must use the hosted remote MCP endpoint",
  );
  assert.equal(
    stripe.personalConnect.authMethod,
    "token",
    "Stripe ready path should use user-owned restricted API keys",
  );
  assert.equal(
    stripe.personalConnect.authType,
    "bearer",
    "Stripe ready path should send restricted API keys as bearer tokens",
  );
  assert.ok(
    stripe.personalConnect.note.includes("does not become authoritative"),
    "Stripe copy must preserve the PolyNet billing authority boundary",
  );
  const stripeProfile = resolveDiscoverAppIntegrationProfile(stripe);
  assert.equal(stripeProfile.adapterKind, "remote_mcp_token");
  assert.equal(stripeProfile.readiness, "ready_token");
  assert.equal(stripeProfile.runtimePolicy.defaultToolRisk, "sensitive");
  assert.ok(stripeProfile.toolPolicy, "Stripe must declare a provider-owned tool policy");
  assert.equal(
    stripeProfile.toolPolicy.allowOnlyDefaultEnabled,
    true,
    "Stripe should positively allow only the default read/search/retrieve tool family",
  );
  assert.ok(
    stripeProfile.toolPolicy.defaultEnabledNamePrefixes?.includes("retrieve_"),
    "Stripe default-enabled tool policy should include read/retrieve style tools",
  );
  assert.ok(
    stripeProfile.toolPolicy.disabledNamePrefixes?.includes("create_"),
    "Stripe tool policy should disable mutation-shaped tools",
  );
  assert.ok(
    stripeProfile.credentialPolicy?.allowedSecretPrefixes?.includes("rk_live_"),
    "Stripe credential policy should require restricted API keys",
  );
  assert.ok(
    stripeProfile.resultPolicy.maxResultBytes <= 10_000,
    "Stripe MCP results should stay tightly bounded",
  );
  for (const intent of stripeProfile.runtimePolicy.declaredIntents) {
    assert.equal(
      intent.includes("write"),
      false,
      "Stripe ready profile should not declare write intent",
    );
  }

  const vercel = DISCOVER_APP_CATALOG.find((app) => app.id === "vercel");
  assert.ok(vercel, "Vercel must exist in the Discover catalog");
  assert.equal(
    vercel.personalConnect.availability,
    "later",
    "Vercel should stay non-connectable until client approval and operation safety are verified",
  );
  const vercelProfile = resolveDiscoverAppIntegrationProfile(vercel);
  assert.equal(vercelProfile.adapterKind, "remote_mcp_oauth");
  assert.equal(vercelProfile.readiness, "oauth_planned");
  assert.equal(vercelProfile.authMode, "oauth");

  const hyperframes = DISCOVER_APP_CATALOG.find((app) => app.id === "hyperframes");
  assert.ok(hyperframes, "HyperFrames must exist in the Discover catalog");
  assert.equal(
    hyperframes.personalConnect.availability,
    "later",
    "HyperFrames should stay non-connectable until the sandbox CLI bridge exists",
  );
  assert.equal(
    isDiscoverAppPersonallyConnectable(hyperframes),
    false,
    "HyperFrames must not expose a personal add button before sandbox execution exists",
  );
  assert.equal(
    hyperframes.docsUrl,
    "https://hyperframes.heygen.com/packages/cli",
    "HyperFrames catalog entry should point at the CLI docs",
  );
  assert.equal(
    hyperframes.relatedSkillCatalogId,
    "hyperframes",
    "HyperFrames app should point to the immediately installable HyperFrames skill",
  );
  const hyperframesSkill = findRelatedDiscoverSkillForApp(
    hyperframes,
    DISCOVER_SKILL_CATALOG,
  );
  assert.ok(hyperframesSkill, "HyperFrames related skill must exist");
  assert.ok(
    hyperframesSkill.installInput,
    "HyperFrames related skill must be installable",
  );
  assert.equal(
    deriveDiscoverSkillMentionToken(hyperframesSkill),
    "hyperframes",
    "HyperFrames related skill should derive the $hyperframes runtime token",
  );
  const hyperframesProfile = resolveDiscoverAppIntegrationProfile(hyperframes);
  assert.equal(hyperframesProfile.adapterKind, "cli_sandbox");
  assert.equal(hyperframesProfile.readiness, "cli_sandbox_planned");
  assert.equal(hyperframesProfile.contextStrategy, "artifact_reference");
  assert.ok(
    hyperframesProfile.runtimePolicy.declaredIntents.includes("video_render"),
    "HyperFrames profile should declare render intent as an artifact-producing sandbox action",
  );

  const higgsfield = DISCOVER_APP_CATALOG.find((app) => app.id === "higgsfield");
  assert.ok(higgsfield, "Higgsfield must exist in the Discover catalog");
  assert.equal(
    higgsfield.personalConnect.availability,
    "later",
    "Higgsfield should stay non-connectable until media job guardrails exist",
  );
  assert.equal(
    higgsfield.personalConnect.endpointUrl,
    "https://mcp.higgsfield.ai",
    "Higgsfield catalog entry should preserve the provider MCP URL without making it ready",
  );
  const higgsfieldProfile = resolveDiscoverAppIntegrationProfile(higgsfield);
  assert.equal(higgsfieldProfile.adapterKind, "remote_mcp_oauth");
  assert.equal(higgsfieldProfile.readiness, "oauth_planned");
  assert.equal(higgsfieldProfile.contextStrategy, "artifact_reference");
  assert.ok(
    higgsfieldProfile.runtimePolicy.declaredIntents.includes("credit_metered_generation"),
    "Higgsfield profile should preserve the media credit/cost guardrail requirement",
  );

  const heygen = DISCOVER_APP_CATALOG.find((app) => app.id === "heygen");
  assert.ok(heygen, "HeyGen must exist in the Discover catalog");
  const heygenProfile = resolveDiscoverAppIntegrationProfile(heygen);
  assert.equal(heygenProfile.contextStrategy, "artifact_reference");
  assert.ok(
    heygenProfile.runtimePolicy.declaredIntents.includes("media_job_poll"),
    "HeyGen profile should preserve async media job polling as a planned requirement",
  );

  console.log(
    "PASS: Discover apps have explicit integration profiles, and ready apps declare adapter, validation, and risk metadata.",
  );
}

main();
