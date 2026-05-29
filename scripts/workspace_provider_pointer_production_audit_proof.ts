import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  auditPointer,
  isBlaxelWorkspaceResourceId,
  parseConvexJsonArray,
  summarizeRows,
  type CloudProjectAuditRow,
} from "./workspace_provider_pointer_production_audit.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const audit = read("scripts/workspace_provider_pointer_production_audit.ts");

assert.match(
  packageJson,
  /"audit:workspace-provider-pointers:prod": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_provider_pointer_production_audit\.ts"/,
  "package script must expose the read-only production pointer audit",
);
assert.match(
  audit,
  /"convex"[\s\S]*"data"[\s\S]*"--prod"[\s\S]*"cloudProjects"[\s\S]*"--format"[\s\S]*"jsonArray"/,
  "audit must read production cloudProjects through convex data",
);
assert.match(
  audit,
  /startsWith\("pn-p-"\)/,
  "main-compatible audit must identify Blaxel resources by direct pn-p prefix",
);
assert.doesNotMatch(
  audit,
  /workspaceComputerProvider|workspaceResourceAdmission|workspaceProjectResources|providerVolumeProviderId|providerSandboxProviderId|workspaceVolumeRetentionState/,
  "main-compatible audit must not import or reference Blaxel-branch-only provider helpers or schema fields",
);

const rows: CloudProjectAuditRow[] = [
  {
    _id: "active-legacy",
    ownerId: "owner-1",
    name: "Legacy active",
    status: "active",
    createdAt: 1,
    updatedAt: 2,
    providerVolumeId: "11111111-1111-1111-1111-111111111111",
    providerSandboxId: "22222222-2222-2222-2222-222222222222",
  },
  {
    _id: "inactive-legacy",
    ownerId: "owner-2",
    status: "disabled",
    providerVolumeId: "33333333-3333-3333-3333-333333333333",
  },
  {
    _id: "active-blaxel",
    ownerId: "owner-3",
    status: "active",
    providerVolumeId: "pn-p-active-blaxel-v",
    providerSandboxId: "pn-p-active-blaxel",
  },
];

assert.equal(isBlaxelWorkspaceResourceId("pn-p-abc"), true);
assert.equal(isBlaxelWorkspaceResourceId("11111111-1111-1111-1111-111111111111"), false);
assert.equal(auditPointer(rows[0]!, "volume").legacyOrUnknownOwner, true);
assert.equal(auditPointer(rows[2]!, "volume").blaxelOwned, true);
assert.equal(auditPointer(rows[2]!, "volume").legacyOrUnknownOwner, false);

const parsed = parseConvexJsonArray(`prefix logs\n${JSON.stringify(rows)}\n`);
assert.equal(parsed.length, 3);

const summary = summarizeRows(rows, 100);
assert.equal(summary.readOnly, true);
assert.equal(summary.source.truncated, false);
assert.equal(summary.summary.activeProjectRows, 2);
assert.equal(summary.summary.inactiveProjectRows, 1);
assert.equal(summary.summary.legacyOrUnknownVolumePointers, 2);
assert.equal(summary.summary.legacyOrUnknownSandboxPointers, 1);
assert.equal(summary.summary.blaxelVolumePointers, 1);
assert.equal(summary.activeLegacyOrUnknown.length, 1);
assert.equal(summary.inactiveLegacyOrUnknown.length, 1);

console.log("workspace_provider_pointer_production_audit_proof: ok");
