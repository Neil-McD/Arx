import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyDiscoverAppDefaultToolRiskFloor,
  applyDiscoverAppResultPolicyToText,
  buildDiscoverAppDefaultEnabledToolNames,
  filterDiscoverAppEnabledToolNames,
  getDiscoverAppDisabledToolReason,
  isDiscoverAppToolDisabledByPolicy,
  resolveDiscoverAppMcpRequestHeadersForCatalogAppId,
  resolveDiscoverAppResultPolicyForCatalogAppId,
  validateDiscoverAppSecretForCatalogAppId,
} from "../shared/discoverCatalog.ts";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function main() {
  assert.equal(
    applyDiscoverAppDefaultToolRiskFloor("supabase", "read"),
    "sensitive",
    "Supabase tools must not classify below the sensitive profile floor",
  );
  assert.equal(
    applyDiscoverAppDefaultToolRiskFloor("linear", "read"),
    "write",
    "Linear tools must not classify below the write profile floor",
  );
  assert.equal(
    applyDiscoverAppDefaultToolRiskFloor("airtable", "sensitive"),
    "sensitive",
    "Classifier escalation must survive the profile floor",
  );
  assert.equal(
    applyDiscoverAppDefaultToolRiskFloor(null, "read"),
    "read",
    "Uncataloged custom MCP apps keep classifier-derived risk",
  );
  assert.equal(
    applyDiscoverAppDefaultToolRiskFloor("notion", "read"),
    "write",
    "Notion tools must not classify below the write profile floor",
  );
  assert.equal(
    applyDiscoverAppDefaultToolRiskFloor("github", "read"),
    "sensitive",
    "GitHub read-only tools can still expose private repository data and must keep a sensitive floor",
  );
  assert.equal(
    applyDiscoverAppDefaultToolRiskFloor("stripe", "read"),
    "sensitive",
    "Stripe tools can expose payment and customer data and must keep a sensitive floor",
  );
  assert.equal(
    isDiscoverAppToolDisabledByPolicy("stripe", "create_customer"),
    true,
    "Stripe create tools must be provider-blocked",
  );
  assert.equal(
    isDiscoverAppToolDisabledByPolicy("stripe", "retrieve_balance"),
    false,
    "Stripe retrieve tools should remain available",
  );
  assert.equal(
    isDiscoverAppToolDisabledByPolicy("stripe", "archive_customer_portal"),
    true,
    "Stripe tools outside the positive read/search/retrieve allowlist must fail closed",
  );
  assert.equal(
    getDiscoverAppDisabledToolReason("stripe", "refund_payment"),
    "Stripe MCP mutation tools are disabled until Polynet has explicit per-tool approval and provider permission controls.",
    "Stripe blocked tools should explain the provider policy",
  );
  assert.deepEqual(
    buildDiscoverAppDefaultEnabledToolNames("stripe", [
      { tool_name: "list_customers" },
      { tool_name: "retrieve_balance" },
      { tool_name: "search_docs" },
      { tool_name: "create_customer" },
      { tool_name: "update_invoice" },
      { tool_name: "refund_payment" },
    ]),
    ["list_customers", "retrieve_balance", "search_docs"],
    "Stripe default-enabled tools should be read/search/retrieve only",
  );
  assert.deepEqual(
    filterDiscoverAppEnabledToolNames("stripe", [
      "list_customers",
      "create_customer",
      "retrieve_refund",
      "update_subscription",
      "archive_customer_portal",
    ]),
    ["list_customers", "retrieve_refund"],
    "Stripe policy must strip blocked or non-allowlisted tools even if stale mounts ask for them",
  );
  assert.deepEqual(
    validateDiscoverAppSecretForCatalogAppId("stripe", "rk_test_123"),
    { ok: true },
    "Stripe restricted test keys should be accepted",
  );
  assert.deepEqual(
    validateDiscoverAppSecretForCatalogAppId("stripe", "sk_test_123"),
    {
      ok: false,
      message:
        "Use a Stripe restricted API key that starts with rk_test_ or rk_live_. Secret and publishable keys are not accepted for Polynet's Stripe MCP harness.",
    },
    "Stripe full secret keys should be rejected",
  );
  assert.deepEqual(
    resolveDiscoverAppMcpRequestHeadersForCatalogAppId("github"),
    {
      "X-MCP-Readonly": "true",
      "X-MCP-Toolsets": "repos,issues,pull_requests,users",
    },
    "GitHub validation/runtime requests must include catalog-owned MCP narrowing headers",
  );
  assert.equal(
    applyDiscoverAppDefaultToolRiskFloor("vercel", "read"),
    "sensitive",
    "Vercel tools can expose deployment and project data and must keep a sensitive floor",
  );

  const notionPolicy = resolveDiscoverAppResultPolicyForCatalogAppId("notion");
  assert.equal(
    notionPolicy?.maxResultBytes,
    12_000,
    "Notion should have a bounded result budget",
  );
  const bounded = applyDiscoverAppResultPolicyToText(
    "notion",
    "x".repeat(13_000),
  );
  assert.equal(bounded.truncated, true, "Large Notion results must truncate");
  assert.ok(
    new TextEncoder().encode(bounded.outputText).byteLength <= 12_000,
    "Truncated result must fit the configured byte budget",
  );
  const stripePolicy = resolveDiscoverAppResultPolicyForCatalogAppId("stripe");
  assert.equal(
    stripePolicy?.maxResultBytes,
    10_000,
    "Stripe should have a tighter result budget than general OAuth MCP apps",
  );
  const boundedStripe = applyDiscoverAppResultPolicyToText(
    "stripe",
    "x".repeat(11_000),
  );
  assert.equal(boundedStripe.truncated, true, "Large Stripe results must truncate");
  assert.ok(
    new TextEncoder().encode(boundedStripe.outputText).byteLength <= 10_000,
    "Truncated Stripe result must fit the configured byte budget",
  );

  const validationSource = readText(new URL("../convex/appValidation.ts", import.meta.url));
  assert.ok(
    validationSource.includes("applyDiscoverAppDefaultToolRiskFloor"),
    "App validation must apply the profile risk floor before snapshots become runtime tools",
  );
  assert.ok(
    validationSource.includes("app.catalogAppId"),
    "Risk floor must be derived from the app catalog identity",
  );
  assert.ok(
    validationSource.includes("resolveDiscoverAppResultPolicyForCatalogAppId"),
    "App validation must cap discovered tool snapshots by profile result policy",
  );
  assert.ok(
    validationSource.includes("validateDiscoverAppSecretForCatalogAppId"),
    "App validation must reject persisted provider-disallowed secrets before remote MCP validation",
  );
  assert.ok(
    validationSource.includes("createErrorValidationReport"),
    "Credential policy validation failures must be persisted as normal validation reports",
  );

  const runtimeSource = readText(new URL("../convex/runtimeMcpManager.ts", import.meta.url));
  assert.ok(
    runtimeSource.includes("applyDiscoverAppResultPolicyToText"),
    "Runtime MCP execution must enforce result byte bounds",
  );
  assert.ok(
    runtimeSource.includes("getDiscoverAppDisabledToolReason"),
    "Runtime MCP execution must reject provider-blocked tools even if stale mounts expose them",
  );
  assert.ok(
    runtimeSource.includes("validateDiscoverAppSecretForCatalogAppId"),
    "Runtime MCP execution must reject provider-disallowed persisted secrets before session initialization",
  );
  assert.ok(
    runtimeSource.includes("mounted_app_connection_secret_policy_rejected"),
    "Runtime MCP execution must return a policy-specific error for rejected persisted secrets",
  );
  const userPlatformMountsSource = readText(
    new URL("../convex/userPlatformAppMounts.ts", import.meta.url),
  );
  assert.ok(
    userPlatformMountsSource.includes("buildDiscoverAppDefaultEnabledToolNames"),
    "Personal app mounting must apply provider default-enabled tool policy",
  );
  assert.ok(
    userPlatformMountsSource.includes("filterDiscoverAppEnabledToolNames"),
    "Personal app updates must strip provider-blocked tools from enabled tools",
  );
  assert.ok(
    userPlatformMountsSource.includes("validateDiscoverAppSecretForCatalogAppId"),
    "Personal app token setup must reject provider-disallowed secrets",
  );
  assert.ok(
    userPlatformMountsSource.includes("user_platform_app_connection_secret_policy_rejected"),
    "Direct mounted app execution must also reject provider-disallowed persisted secrets",
  );

  const mcpHttpSource = readText(new URL("../convex/mcpHttpClient.ts", import.meta.url));
  assert.ok(
    mcpHttpSource.includes("resolveDiscoverAppMcpRequestHeadersForCatalogAppId"),
    "MCP HTTP client must merge catalog-owned request headers into validation and runtime requests",
  );

  console.log(
    "PASS: Discover integration profile risk floors and result bounds are applied to MCP runtime paths.",
  );
}

main();
