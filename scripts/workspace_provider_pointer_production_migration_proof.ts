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
  /expectedStatus: v\.optional\(v\.string\(\)\)[\s\S]*expectedUpdatedAt: v\.optional\(v\.number\(\)\)[\s\S]*expectedProviderVolumeId: v\.optional\(v\.string\(\)\)[\s\S]*expectedProviderSandboxId: v\.optional\(v\.string\(\)\)/,
  "maintenance cleanup must require expected-value guard inputs",
);
assert.match(
  projects,
  /expected_status_mismatch[\s\S]*expected_updated_at_mismatch[\s\S]*expected_provider_volume_id_mismatch[\s\S]*expected_provider_sandbox_id_mismatch/,
  "maintenance cleanup must fail closed on expected-value mismatches",
);
assert.match(
  projects,
  /isBlaxelWorkspaceResourceId\(currentVolumeId\)[\s\S]*blaxel_volume_pointer_refused[\s\S]*isBlaxelWorkspaceResourceId\(currentSandboxId\)[\s\S]*blaxel_sandbox_pointer_refused/,
  "maintenance cleanup must refuse pn-p Blaxel-owned pointers",
);
assert.match(
  projects,
  /providerVolumeId: undefined[\s\S]*providerVolumeName: undefined[\s\S]*providerVolumeState: undefined[\s\S]*providerVolumeLastSeenAt: undefined/,
  "maintenance cleanup must clear only existing main-compatible volume pointer fields",
);
assert.match(
  projects,
  /providerSandboxId: undefined[\s\S]*providerSandboxState: undefined[\s\S]*providerSandboxLastSeenAt: undefined[\s\S]*providerSandboxLastActivityAt: undefined[\s\S]*providerSandboxStartedAt: undefined[\s\S]*providerSandboxIdleExpiresAt: undefined/,
  "maintenance cleanup must clear existing main-compatible sandbox pointer fields",
);
assert.doesNotMatch(
  projects,
  /workspaceVolumeRetentionState|workspaceVolumeDeletedAt|providerVolumeProviderId|providerSandboxProviderId|blaxelWorkspace|workspaceComputerProvider/,
  "main-compatible mutation must not reference Blaxel-branch-only provider helpers or schema fields",
);

assert.doesNotMatch(
  preflight,
  /workspaceVolumeRetentionState|workspaceVolumeDeletedAt|providerVolumeProviderId|providerSandboxProviderId/,
  "dry-run plan must not mention fields unavailable on current main",
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
