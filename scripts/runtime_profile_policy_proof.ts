import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyDiscoverAppDefaultToolRiskFloor,
  applyDiscoverAppResultPolicyToText,
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

  console.log(
    "PASS: Discover integration profile risk floors and result bounds are applied to MCP runtime paths.",
  );
}

main();
