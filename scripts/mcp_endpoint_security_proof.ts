import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeDeveloperAppEndpointUrl } from "../convex/appCore.ts";
import { postMcpJson } from "../convex/mcpHttpClient.ts";
import {
  resolveDiscoverAppCatalogConnectPolicy,
} from "../shared/discoverCatalog.ts";

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
    runtimeManagerSource.includes("assertDeveloperAppServerFetchAllowed"),
    "runtime MCP fetches must enforce catalog server-fetch policy",
  );

  console.log(
    "PASS: MCP endpoint guard rejects local/private endpoints, disallows redirects, caps response bodies, and blocks uncataloged server fetches.",
  );
}

void main();
