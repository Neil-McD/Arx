import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const audit = read("scripts/workspace_provider_pointer_production_audit.ts");
const packageJson = read("package.json");

assert.match(
  packageJson,
  /"audit:workspace-provider-pointers:prod": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_provider_pointer_production_audit\.ts"/,
  "package script must expose the production workspace provider pointer audit",
);
assert.match(
  audit,
  /"convex"[\s\S]*"data"[\s\S]*"--prod"[\s\S]*"cloudProjects"[\s\S]*"--format"[\s\S]*"jsonArray"/,
  "production pointer audit must use read-only Convex data export for cloudProjects",
);
assert.match(
  audit,
  /readOnly: true/,
  "production pointer audit must report that it is read-only",
);
assert.match(
  audit,
  /resolveRecordedWorkspaceResourceProviderId/,
  "production pointer audit must use canonical workspace provider resolution",
);
assert.match(
  audit,
  /isWorkspaceProjectInactiveStatus/,
  "production pointer audit must split active and inactive project rows",
);
assert.match(
  audit,
  /active_legacy_or_unknown_workspace_pointers_require_migration_or_compatibility_before_production/,
  "production pointer audit must block production on active legacy or unknown pointers",
);
for (const forbidden of [
  "convex deploy",
  "convex run",
  "convex import",
  "ctx.db",
  ".insert(",
  ".patch(",
  ".replace(",
  ".delete(",
  "runMutation",
  "mutation(",
  "internalMutation",
]) {
  assert.ok(!audit.includes(forbidden), `audit script must stay read-only and avoid ${forbidden}`);
}

console.log("workspace_provider_pointer_production_audit_proof: ok");
