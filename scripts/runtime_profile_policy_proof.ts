import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyDiscoverAppDefaultToolRiskFloor,
  applyDiscoverAppResultPolicyToText,
  resolveDiscoverAppMcpRequestHeadersForCatalogAppId,
  resolveDiscoverAppResultPolicyForCatalogAppId,
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

  const runtimeSource = readText(new URL("../convex/runtimeMcpManager.ts", import.meta.url));
  assert.ok(
    runtimeSource.includes("applyDiscoverAppResultPolicyToText"),
    "Runtime MCP execution must enforce result byte bounds",
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
