import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeDeveloperAppEndpointUrl } from "../convex/appCore.ts";
import { postMcpJson } from "../convex/mcpHttpClient.ts";
import {
  resolveDiscoverAppCatalogConnectPolicy,
} from "../shared/discoverCatalog.ts";
import {
  resolveCommunityWorkflowImportMcpRegistryConnectPolicy,
} from "../shared/communityWorkflowImportMcpRegistry.ts";
import { assertDeveloperAppServerFetchAllowed } from "../convex/appFetchPolicy.ts";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

async function withFetchStub<T>(
  fetchStub: typeof fetch,
  fn: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  for (const endpoint of [
    "http://example.com/mcp",
    "https://localhost/mcp",
    "https://127.0.0.1/mcp",
    "https://10.1.2.3/mcp",
    "https://192.168.1.10/mcp",
    "https://172.16.0.1/mcp",
    "https://[::1]/mcp",
    "https://[::ffff:127.0.0.1]/mcp",
    "https://user:pass@example.com/mcp",
    "https://internal/mcp",
  ]) {
    assert.equal(
      normalizeDeveloperAppEndpointUrl(endpoint),
      "",
      `${endpoint} must be rejected as a developer app endpoint`,
    );
  }
  assert.equal(
    normalizeDeveloperAppEndpointUrl("https://mcp.example.com/mcp"),
    "https://mcp.example.com/mcp",
    "public HTTPS MCP endpoint should still normalize",
  );
  const uncatalogedPolicy = resolveDiscoverAppCatalogConnectPolicy({
    endpointUrl: "https://mcp.example.com/mcp",
    name: "Custom MCP",
    authType: "none",
  });
  assert.equal(
    uncatalogedPolicy.ok,
    false,
    "uncataloged remote MCP endpoints must not be server-fetched from public connect flows",
  );
  const importedContext7Policy = resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
    mcpRegistryId: "context7",
    name: "Context7",
    endpointUrl: "https://mcp.context7.com/mcp",
    authType: "api_key",
  });
  assert.equal(
    importedContext7Policy.ok,
    true,
    "vetted imported remote MCP registry entries should be setup-connectable with provider-supported auth outside Discover",
  );
  assert.equal(
    resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
      mcpRegistryId: "context7",
      name: "Context7",
      endpointUrl: "https://mcp.context7.com/mcp",
      authType: "none",
    }).ok,
    false,
    "setup-needed imported MCP registry entries must reject unsupported no-auth setup",
  );
  assert.equal(
    resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
      mcpRegistryId: "posthog",
      name: "PostHog",
      endpointUrl: "https://mcp.posthog.com/mcp",
      authType: "oauth",
    }).ok,
    true,
    "reviewed hosted OAuth MCP registry entries should accept OAuth setup",
  );
  assert.equal(
    resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
      mcpRegistryId: "sentry",
      name: "Sentry",
      endpointUrl: "https://mcp.sentry.dev",
      authType: "oauth",
    }).ok,
    true,
    "reviewed hosted OAuth MCP registry entries should accept OAuth setup without Discover publication",
  );
  assert.equal(
    resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
      mcpRegistryId: "sentry",
      name: "Sentry",
      endpointUrl: "https://attacker.example/mcp",
      authType: "oauth",
    }).ok,
    false,
    "OAuth imported MCP setup must still be bound to reviewed endpoint hosts",
  );
  assert.doesNotThrow(
    () =>
      assertDeveloperAppServerFetchAllowed({
        catalogAppId: null,
        mcpRegistryId: "context7",
        name: "Context7",
        endpointUrl: "https://mcp.context7.com/mcp",
        authType: "api_key",
      }),
    "vetted imported remote MCP registry entries should pass server-fetch policy",
  );
  assert.equal(
    resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
      mcpRegistryId: "fly",
      name: "Fly",
      endpointUrl: "https://fly.io/mcp",
      authType: "none",
    }).ok,
    false,
    "runtime-only imported MCP registry entries must not become server-fetchable",
  );
  assert.throws(
    () =>
      assertDeveloperAppServerFetchAllowed({
        catalogAppId: null,
        mcpRegistryId: "fly",
        name: "Fly",
        endpointUrl: "https://fly.io/mcp",
        authType: "none",
      }),
    /runtime|not available|remote/i,
    "runtime-only imported MCP registry entries should stay blocked from server fetch",
  );

  await withFetchStub(
    async () =>
      new Response("", {
        status: 302,
        headers: { location: "https://127.0.0.1/mcp" },
      }),
    async () => {
      const response = await postMcpJson({
        url: "https://mcp.example.com/mcp",
        headers: {},
        body: "{}",
      });
      assert.equal(response.status, 302);
      assert.equal(response.rawText, "MCP endpoint redirects are not allowed.");
    },
  );

  await withFetchStub(
    async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-length": "1000001" },
      }),
    async () => {
      await assert.rejects(
        () =>
          postMcpJson({
            url: "https://mcp.example.com/mcp",
            headers: {},
            body: "{}",
          }),
        /mcp_response_too_large/,
      );
    },
  );

  const clientSource = readText(new URL("../convex/mcpHttpClient.ts", import.meta.url));
  const validationSource = readText(new URL("../convex/appValidation.ts", import.meta.url));
  const runtimeManagerSource = readText(new URL("../convex/runtimeMcpManager.ts", import.meta.url));
  assert.ok(
    clientSource.includes('redirect: "manual"'),
    "MCP HTTP client must not follow redirects automatically",
  );
  assert.ok(
    clientSource.includes("MCP_HTTP_MAX_RESPONSE_BYTES"),
    "MCP HTTP client must cap response body size",
  );
  assert.ok(
    validationSource.includes("assertDeveloperAppServerFetchAllowed"),
    "validation fetches must enforce catalog server-fetch policy",
  );
  assert.ok(
    validationSource.includes("getSetupRequiredValidationError") &&
      validationSource.indexOf("const setupRequiredError") <
        validationSource.indexOf("validateStreamableHttpApp({"),
    "setup-needed imported MCP apps must fail validation before any remote fetch",
  );
  assert.ok(
    runtimeManagerSource.includes("assertDeveloperAppServerFetchAllowed"),
    "runtime MCP fetches must enforce catalog server-fetch policy",
  );

  console.log(
    "PASS: MCP endpoint guard rejects local/private endpoints, disallows redirects, caps response bodies, blocks uncataloged server fetches, and only allows vetted imported remote MCP registry entries.",
  );
}

void main();
