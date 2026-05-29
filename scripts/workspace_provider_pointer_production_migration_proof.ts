import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const projects = read("convex/projects.ts");
const migration = read("scripts/workspace_provider_pointer_production_migration.ts");
const preflight = read("scripts/workspace_provider_pointer_production_preflight.ts");

assert.match(
  packageJson,
  /"migrate:workspace-provider-pointer-clear:prod": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_provider_pointer_production_migration\.ts"/,
  "package script must expose the explicit production pointer migration command",
);
assert.match(
  packageJson,
  /"check:workspace-provider-pointer-production-migration-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_provider_pointer_production_migration_proof\.ts"/,
  "package script must expose the production pointer migration proof",
);

assert.match(
  projects,
  /clearLegacyWorkspaceProjectProviderPointersForMaintenance = mutation\(/,
  "maintenance cleanup must be an explicit callable mutation",
);
assert.match(
  projects,
  /ARX_WORKSPACE_PROVIDER_POINTER_MIGRATION_SECRET/,
  "maintenance cleanup must be protected by a production migration secret",
);
assert.match(
  projects,
  /args\.confirm !== WORKSPACE_PROVIDER_POINTER_MIGRATION_CONFIRMATION/,
  "maintenance cleanup must require exact confirmation",
);
assert.match(
  projects,
  /expectedStatus: v\.optional\(v\.string\(\)\)[\s\S]*expectedUpdatedAt: v\.number\(\)[\s\S]*expectedProviderVolumeId: v\.optional\(v\.string\(\)\)[\s\S]*expectedProviderSandboxId: v\.optional\(v\.string\(\)\)/,
  "maintenance cleanup must require expected-value guard inputs",
);
assert.match(
  projects,
  /expected_status_mismatch[\s\S]*expected_updated_at_mismatch[\s\S]*expected_provider_volume_id_mismatch[\s\S]*expected_provider_sandbox_id_mismatch/,
  "maintenance cleanup must skip on expected-value mismatches",
);
assert.match(
  projects,
  /providerVolumeProviderId === "blaxel"[\s\S]*blaxel_volume_pointer_refused[\s\S]*providerSandboxProviderId === "blaxel"[\s\S]*blaxel_sandbox_pointer_refused/,
  "maintenance cleanup must refuse Blaxel-owned pointers",
);
assert.match(
  projects,
  /workspaceVolumeRetentionState: active[\s\S]*DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE[\s\S]*\("deleted" as const\)/,
  "active cleanup must keep active retention, while inactive cleanup may mark deleted",
);
assert.match(
  projects,
  /workspaceVolumeDeletedAt: active \? undefined : nowMs[\s\S]*workspaceVolumeDeletionReason: active[\s\S]*\? undefined[\s\S]*inactive_legacy_provider_pointer_cleanup/,
  "active cleanup must clear deletion scheduling and reason fields",
);

assert.match(
  preflight,
  /ACTIVE_VOLUME_FIELDS_TO_SET_ON_CLEAR[\s\S]*workspaceVolumeRetentionState: "active"/,
  "dry-run plan must show active candidates stay active",
);
assert.match(
  preflight,
  /INACTIVE_VOLUME_FIELDS_TO_SET_ON_CLEAR[\s\S]*workspaceVolumeRetentionState: "deleted"/,
  "dry-run plan may show inactive candidates as deleted",
);

assert.match(
  migration,
  /workspace_pointer_candidate_missing_updated_at/,
  "migration script must refuse apply candidates that lack updatedAt",
);
assert.match(
  migration,
  /expectedUpdatedAt: params\.candidate\.expectedUpdatedAt,/,
  "migration script must always pass the expected updatedAt guard",
);
assert.doesNotMatch(
  migration,
  /expectedUpdatedAt: params\.candidate\.expectedUpdatedAt \?\? undefined/,
  "migration script must not downgrade missing updatedAt into an omitted guard",
);
assert.match(
  migration,
  /const CONFIRMATION = "clear-legacy-workspace-pointers"/,
  "migration script must use the exact confirmation phrase",
);
assert.match(
  migration,
  /const SECRET_ENV = "ARX_WORKSPACE_PROVIDER_POINTER_MIGRATION_SECRET"/,
  "migration script must read the dedicated production migration secret",
);
assert.match(
  migration,
  /if \(!apply\)[\s\S]*dryRun: true[\s\S]*return;/,
  "migration script must default to dry-run before any apply path",
);
assert.match(
  migration,
  /if \(confirm !== CONFIRMATION\)[\s\S]*missing_exact_confirmation/,
  "migration script must require exact confirmation before applying",
);
assert.match(
  migration,
  /if \(preflight\.audit\.source\.truncated\)[\s\S]*production_workspace_pointer_scan_truncated_increase_limit_before_apply/,
  "migration script must fail closed on truncated production scans",
);
assert.match(
  migration,
  /if \(!secret\)[\s\S]*missing_\$\{SECRET_ENV\}/,
  "migration script must require the production migration secret before applying",
);
assert.match(
  migration,
  /"convex"[\s\S]*"run"[\s\S]*"--prod"[\s\S]*"projects:clearLegacyWorkspaceProjectProviderPointersForMaintenance"/,
  "apply path must call the dedicated production maintenance mutation",
);

console.log("workspace_provider_pointer_production_migration_proof: ok");
