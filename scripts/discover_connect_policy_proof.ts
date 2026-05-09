import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveDiscoverAppCatalogConnectPolicy,
} from "../shared/discoverCatalog.ts";
import {
  buildMcpAppIdentityAliases,
  mcpAppIdentitySourcesOverlap,
} from "../shared/effectiveMcpApps.ts";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertRejected(
  args: Parameters<typeof resolveDiscoverAppCatalogConnectPolicy>[0],
  code: string,
) {
  const result = resolveDiscoverAppCatalogConnectPolicy(args);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

function main() {
  assertRejected(
    {
      name: "Custom MCP",
      endpointUrl: "https://custom.example.com/mcp",
      authType: "none",
    },
    "catalog_app_connection_invalid",
  );

  const supabase = resolveDiscoverAppCatalogConnectPolicy({
    catalogAppId: "supabase",
    name: "Not Supabase",
    endpointUrl: "https://mcp.supabase.com/mcp",
    authType: "bearer",
  });
  assert.equal(supabase.ok, true);
  assert.deepEqual(
    supabase,
    {
      ok: true,
      catalogAppId: "supabase",
      name: "Supabase",
      endpointUrl: "https://mcp.supabase.com/mcp",
      authType: "bearer",
      identityScope: "catalog_singleton",
    },
    "Supabase catalog policy should be server-authoritative",
  );
  assertRejected(
    {
      catalogAppId: "supabase",
      name: "Supabase",
      endpointUrl: "https://evil.example/mcp",
      authType: "bearer",
    },
    "catalog_app_endpoint_mismatch",
  );
  assertRejected(
    {
      catalogAppId: "supabase",
      name: "Supabase",
      endpointUrl: "https://mcp.supabase.com/mcp",
      authType: "none",
    },
    "catalog_app_auth_mismatch",
  );
  const github = resolveDiscoverAppCatalogConnectPolicy({
    catalogAppId: "github",
    name: "Not GitHub",
    endpointUrl: "https://api.githubcopilot.com/mcp/readonly",
    authType: "bearer",
  });
  assert.equal(github.ok, true);
  assert.deepEqual(
    github,
    {
      ok: true,
      catalogAppId: "github",
      name: "GitHub",
      endpointUrl: "https://api.githubcopilot.com/mcp/readonly",
      authType: "bearer",
      identityScope: "catalog_singleton",
    },
    "GitHub catalog policy should force the read-only hosted MCP endpoint",
  );
  assertRejected(
    {
      catalogAppId: "github",
      name: "GitHub",
      endpointUrl: "https://api.githubcopilot.com/mcp/",
      authType: "bearer",
    },
    "catalog_app_endpoint_mismatch",
  );
  assertRejected(
    {
      catalogAppId: "github",
      name: "GitHub",
      endpointUrl: "https://api.githubcopilot.com/mcp/readonly",
      authType: "oauth",
    },
    "catalog_app_auth_mismatch",
  );

  assertRejected(
    {
      catalogAppId: "vercel",
      name: "Not Vercel",
      endpointUrl: "https://mcp.vercel.com",
      authType: "oauth",
    },
    "catalog_app_not_ready",
  );
  assertRejected(
    {
      catalogAppId: "vercel",
      name: "Vercel",
      endpointUrl: "https://mcp.vercel.com",
      authType: "bearer",
    },
    "catalog_app_not_ready",
  );

  const notion = resolveDiscoverAppCatalogConnectPolicy({
    catalogAppId: "notion",
    name: "Not Notion",
    endpointUrl: "https://mcp.notion.com/mcp",
    authType: "oauth",
  });
  assert.equal(notion.ok, true);
  assert.deepEqual(
    notion,
    {
      ok: true,
      catalogAppId: "notion",
      name: "Notion",
      endpointUrl: "https://mcp.notion.com/mcp",
      authType: "oauth",
      identityScope: "catalog_singleton",
    },
    "Notion OAuth catalog policy should be server-authoritative",
  );
  assertRejected(
    {
      catalogAppId: "notion",
      name: "Notion",
      endpointUrl: "https://mcp.notion.com/mcp",
      authType: "bearer",
    },
    "catalog_app_auth_mismatch",
  );

  assertRejected(
    {
      catalogAppId: "asana",
      name: "Not Asana",
      endpointUrl: "https://mcp.asana.com/v2/mcp",
      authType: "oauth",
    },
    "catalog_app_not_ready",
  );

  const shopify = resolveDiscoverAppCatalogConnectPolicy({
    catalogAppId: "shopify",
    name: "Anything",
    endpointUrl: "https://demo-store.myshopify.com/api/mcp/",
    authType: "none",
  });
  assert.equal(shopify.ok, true);
  if (shopify.ok) {
    assert.equal(shopify.catalogAppId, "shopify");
    assert.equal(shopify.name, "demo-store Shopify");
    assert.equal(shopify.endpointUrl, "https://demo-store.myshopify.com/api/mcp");
    assert.equal(shopify.authType, "none");
    assert.equal(shopify.identityScope, "endpoint_instance");
  }
  for (const endpointUrl of [
    "https://evil.example/api/mcp",
    "https://demo-store.myshopify.com/admin/api/mcp",
    "https://demo-store.myshopify.com/api/ucp/mcp",
    "https://demo-store.myshopify.com/api/mcp?redirect=https://evil.example",
    "http://demo-store.myshopify.com/api/mcp",
  ]) {
    assertRejected(
      {
        catalogAppId: "shopify",
        name: "Shopify",
        endpointUrl,
        authType: "none",
      },
      "catalog_app_custom_endpoint_invalid",
    );
  }

  const shopifyLeft = {
    app: {
      catalog_app_id: "shopify",
      endpoint_url: "https://left-store.myshopify.com/api/mcp",
      auth_type: "none",
    },
  };
  const shopifyRight = {
    app: {
      catalog_app_id: "shopify",
      endpoint_url: "https://right-store.myshopify.com/api/mcp",
      auth_type: "none",
    },
  };
  assert.equal(
    mcpAppIdentitySourcesOverlap(shopifyLeft, shopifyRight),
    false,
    "Different Shopify Storefront MCP endpoints must not collapse by catalog id",
  );
  assert.deepEqual(
    buildMcpAppIdentityAliases(shopifyLeft),
    ["endpoint:https://left-store.myshopify.com/api/mcp:auth:none"],
    "Shopify identity should use endpoint instance alias only",
  );

  const linearLeft = {
    app: {
      catalog_app_id: "linear",
      endpoint_url: "https://mcp.linear.app/mcp",
      auth_type: "bearer",
    },
  };
  const linearRight = {
    app: {
      catalog_app_id: "linear",
      endpoint_url: "https://mcp.linear.app/mcp",
      auth_type: "bearer",
    },
  };
  assert.equal(
    mcpAppIdentitySourcesOverlap(linearLeft, linearRight),
    true,
    "Linear should still reuse one catalog singleton identity",
  );

  const userMounts = readText(new URL("../convex/userPlatformAppMounts.ts", import.meta.url));
  const communityMounts = readText(new URL("../convex/communityAppMounts.ts", import.meta.url));
  assert.ok(
    userMounts.includes("resolveDiscoverAppCatalogConnectPolicy"),
    "personal app connects must use server-side catalog policy",
  );
  assert.ok(
    communityMounts.includes("resolveDiscoverAppCatalogConnectPolicy"),
    "community app grants must use server-side catalog policy",
  );
  assert.ok(
    userMounts.includes("isDiscoverAppCatalogSingletonIdentity"),
    "personal app identity lookup must respect endpoint-instance catalog apps",
  );
  assert.ok(
    communityMounts.includes("isDiscoverAppCatalogSingletonIdentity"),
    "community app identity lookup must respect endpoint-instance catalog apps",
  );

  console.log(
    "PASS: Discover connect policy is server-authoritative and Shopify is endpoint-instance scoped.",
  );
}

main();
