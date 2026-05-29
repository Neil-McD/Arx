import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildProductionWorkspacePointerPreflight,
} from "./workspace_provider_pointer_production_preflight.ts";
import type {
  CloudProjectAuditRow,
} from "./workspace_provider_pointer_production_audit.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const preflight = read("scripts/workspace_provider_pointer_production_preflight.ts");

assert.match(
  packageJson,
  /"preflight:workspace-provider-pointers:prod": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_provider_pointer_production_preflight\.ts --mode=gate"/,
  "package script must expose a production workspace pointer release gate",
);
assert.match(
  packageJson,
  /"plan:workspace-provider-pointer-clear:prod": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_provider_pointer_production_preflight\.ts --mode=plan"/,
  "package script must expose a dry-run legacy pointer clear plan",
);
assert.match(
  preflight,
  /runConvexProductionCloudProjects/,
  "preflight must reuse the read-only production audit data source",
);
assert.match(
  preflight,
  /dryRun: true/,
  "preflight must default to dry-run reporting",
);
assert.match(
  preflight,
  /writePathAvailable: false/,
  "preflight must not provide a write path",
);
assert.match(
  preflight,
  /writeCommand: null/,
  "preflight must not print a write command",
);
assert.match(
  preflight,
  /explicitAcceptanceRequired: true/,
  "preflight must require explicit acceptance before a future write path",
);
assert.match(
  preflight,
  /process\.exitCode = 1/,
  "gate mode must fail production preflight when active legacy pointers exist",
);
assert.match(
  preflight,
  /production_workspace_pointer_scan_truncated_increase_limit_before_release/,
  "gate mode must fail closed if the production scan is truncated",
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
  assert.ok(!preflight.includes(forbidden), `preflight must stay read-only and avoid ${forbidden}`);
}

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
    status: "deleted",
    providerVolumeId: "33333333-3333-3333-3333-333333333333",
  },
  {
    _id: "active-blaxel",
    ownerId: "owner-3",
    status: "active",
    providerVolumeId: "pn-p-active-blaxel-v",
    providerVolumeProviderId: "blaxel",
    providerSandboxId: "pn-p-active-blaxel",
    providerSandboxProviderId: "blaxel",
  },
];

const gate = buildProductionWorkspacePointerPreflight(rows, 100, "gate");
assert.equal(gate.ok, false);
assert.equal(gate.readOnly, true);
assert.equal(gate.dryRun, true);
assert.equal(gate.writePathAvailable, false);
assert.equal(gate.writeCommand, null);
assert.equal(gate.explicitAcceptanceRequired, true);
assert.equal(gate.releaseGate.blocksProduction, true);
assert.equal(gate.releaseGate.exitCodeWhenRunAsGate, 1);
assert.equal(gate.migrationPlan.activeLegacyOrUnknownRows, 1);
assert.equal(gate.migrationPlan.inactiveLegacyOrUnknownRows, 1);
assert.equal(gate.migrationPlan.activeCandidates[0]?.projectId, "active-legacy");
assert.equal(gate.migrationPlan.activeCandidates[0]?.volume.wouldClear, true);
assert.equal(gate.migrationPlan.activeCandidates[0]?.sandbox.wouldClear, true);
assert.deepEqual(
  gate.migrationPlan.activeCandidates[0]?.volume.fieldsToSet,
  {
    workspaceVolumeRetentionState: "deleted",
    workspaceVolumeDeletionReason: "legacy_or_unknown_workspace_provider_pointer_cleanup",
  },
);
assert.equal(gate.migrationPlan.activeCandidates[0]?.volume.resourceIdPreview?.prefix, "11111111-111");
assert.equal(gate.migrationPlan.activeCandidates[0]?.volume.resourceIdPreview?.length, 36);
assert.equal(gate.migrationPlan.activeCandidates[0]?.sandbox.resourceIdPreview?.prefix, "22222222-222");
assert.equal(gate.migrationPlan.inactiveCandidates[0]?.projectId, "inactive-legacy");

const clean = buildProductionWorkspacePointerPreflight([rows[2]!], 100, "gate");
assert.equal(clean.ok, true);
assert.equal(clean.releaseGate.blocksProduction, false);
assert.equal(clean.releaseGate.exitCodeWhenRunAsGate, 0);
assert.equal(clean.migrationPlan.proposedAction, "none");

const truncated = buildProductionWorkspacePointerPreflight([rows[2]!], 1, "gate");
assert.equal(truncated.ok, false);
assert.equal(truncated.releaseGate.blocksProduction, true);
assert.equal(truncated.releaseGate.exitCodeWhenRunAsGate, 1);
assert.equal(
  truncated.releaseGate.reason,
  "production_workspace_pointer_scan_truncated_increase_limit_before_release",
);

console.log("workspace_provider_pointer_production_preflight_proof: ok");
