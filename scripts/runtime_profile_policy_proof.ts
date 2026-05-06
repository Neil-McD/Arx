import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyDiscoverAppDefaultToolRiskFloor } from "../shared/discoverCatalog.ts";

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

  const validationSource = readText(new URL("../convex/appValidation.ts", import.meta.url));
  assert.ok(
    validationSource.includes("applyDiscoverAppDefaultToolRiskFloor"),
    "App validation must apply the profile risk floor before snapshots become runtime tools",
  );
  assert.ok(
    validationSource.includes("app.catalogAppId"),
    "Risk floor must be derived from the app catalog identity",
  );

  console.log(
    "PASS: Discover integration profile risk floors are applied to MCP tool snapshot classification.",
  );
}

main();
