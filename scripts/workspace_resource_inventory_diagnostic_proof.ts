import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const client = read("convex/blaxelWorkspaceClient.ts");
const inventory = read("convex/blaxelWorkspaceResourceInventory.ts");
const projects = read("convex/projects.ts");
const docs = read("docs/workspace-computer-provider-contract.md");
const packageJson = read("package.json");
const diagnosticCore = inventory.match(
  /async function diagnoseBlaxelWorkspaceResourceInventoryCore[\s\S]*$/,
)?.[0] ?? "";

assert.match(
  client,
  /export async function listBlaxelWorkspaceSandboxes\(\)/,
  "Blaxel client must expose a read-only sandbox inventory wrapper",
);
assert.match(
  client,
  /await loadedCore\.mod\.SandboxInstance\.list\(\)/,
  "sandbox inventory wrapper must call the provider list API",
);
assert.match(
  client,
  /export async function listBlaxelWorkspaceVolumes\(\)/,
  "Blaxel client must expose a read-only volume inventory wrapper",
);
assert.match(
  client,
  /await loadedCore\.mod\.VolumeInstance\.list\(\)/,
  "volume inventory wrapper must call the provider list API",
);

assert.match(
  inventory,
  /"use node";/,
  "provider inventory diagnostic must run in the Node runtime",
);
assert.match(
  inventory,
  /deploymentKind !== "staging"/,
  "provider inventory diagnostic must be staging-only",
);
assert.match(
  inventory,
  /authSubject: v\.string\(\)/,
  "provider inventory diagnostic must require an auth subject",
);
assert.match(
  inventory,
  /operatorAccess\.getMyOperatorAccessOptional/,
  "provider inventory diagnostic must check operator access",
);
assert.match(
  inventory,
  /blaxel_resource_inventory_operator_access_required/,
  "provider inventory diagnostic must fail closed without operator access",
);
assert.match(
  inventory,
  /diagnoseBlaxelWorkspaceResourceInventory/,
  "provider inventory diagnostic action must be exported",
);
assert.match(
  inventory,
  /diagnoseBlaxelWorkspaceResourceInventoryInternal = internalAction/,
  "provider inventory diagnostic must expose a staging-only internal action for admin CLI diagnostics",
);
assert.match(
  inventory,
  /diagnoseBlaxelWorkspaceResourceInventoryCore/,
  "public and internal inventory diagnostics must share the same read-only implementation",
);
assert.match(
  inventory,
  /listBlaxelWorkspaceSandboxes/,
  "provider inventory diagnostic must list provider sandboxes",
);
assert.match(
  inventory,
  /listBlaxelWorkspaceVolumes/,
  "provider inventory diagnostic must list provider volumes",
);
assert.match(
  inventory,
  /reconcileBlaxelWorkspaceSandboxPointersInternal = internalAction/,
  "stale Blaxel sandbox pointer reconciliation must be staging-only and internal",
);
assert.match(
  inventory,
  /dryRun = args\.dryRun !== false/,
  "stale Blaxel sandbox pointer reconciliation must default to dry-run",
);
assert.match(
  inventory,
  /listBlaxelWorkspaceSandboxes/,
  "stale Blaxel sandbox pointer reconciliation must read provider sandbox truth",
);
assert.match(
  inventory,
  /clearProjectBackgroundSandboxInternal/,
  "stale Blaxel sandbox pointer reconciliation must use the scoped project sandbox clear mutation",
);
assert.match(
  inventory,
  /providerSandboxProviderId: "blaxel"/,
  "stale Blaxel sandbox pointer reconciliation must clear only Blaxel-owned sandbox pointers",
);
assert.match(
  inventory,
  /reconcileInactiveLegacyWorkspaceProjectPointersInternal = internalAction/,
  "inactive legacy workspace pointer reconciliation must be staging-only and internal",
);
assert.match(
  inventory,
  /isWorkspaceProjectInactiveStatus/,
  "inactive legacy workspace pointer reconciliation must target inactive project rows only",
);
assert.match(
  inventory,
  /clear_inactive_legacy_provider_pointers/,
  "inactive legacy workspace pointer reconciliation must use an explicit action marker",
);
assert.match(
  inventory,
  /clearInactiveLegacyWorkspaceProjectProviderPointersInternal/,
  "inactive legacy workspace pointer reconciliation must use the scoped project pointer clear mutation",
);
assert.match(
  projects,
  /active_project_legacy_pointer_cleanup_forbidden/,
  "inactive legacy pointer cleanup mutation must refuse active project rows",
);
assert.match(
  projects,
  /workspaceVolumeRetentionState: "deleted"/,
  "inactive legacy pointer cleanup must mark cleared legacy volume pointers as deleted",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes = action/,
  "orphan provider volume cleanup must expose an operator action for staging repair",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes[\s\S]*deploymentKind !== "staging"/,
  "orphan provider volume cleanup must be staging-only",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes[\s\S]*authSubject: v\.string\(\)[\s\S]*operatorAccess\.getMyOperatorAccessOptional[\s\S]*blaxel_orphan_volume_cleanup_operator_access_required/,
  "orphan provider volume cleanup must require operator access",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes[\s\S]*dryRun = args\.dryRun !== false/,
  "orphan provider volume cleanup must default to dry-run",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes[\s\S]*!dryRun && requestedVolumeNames\.size === 0[\s\S]*blaxel_orphan_volume_cleanup_requires_explicit_volume_names/,
  "destructive orphan provider volume cleanup must require exact volume names",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes[\s\S]*protectedVolumeNames\.add\(expectedNames\.volumeName\)[\s\S]*protectedVolumeNames\.add\(recordedVolumeId\)/,
  "orphan provider volume cleanup must protect expected and recorded project volumes",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes[\s\S]*projectRows\.length >= projectLimit[\s\S]*blaxel_orphan_volume_cleanup_project_inventory_truncated/,
  "orphan provider volume cleanup must refuse truncated project inventory",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes[\s\S]*classification === "orphan_volume"[\s\S]*!resource\.attachedTo/,
  "orphan provider volume cleanup must target only unattached orphan volumes",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes[\s\S]*requestedUnsafe[\s\S]*blaxel_orphan_volume_cleanup_requested_volume_not_eligible/,
  "orphan provider volume cleanup must fail closed when requested volumes are not eligible",
);
assert.match(
  inventory,
  /cleanupBlaxelWorkspaceOrphanVolumes[\s\S]*destroyBlaxelWorkspaceVolume/,
  "orphan provider volume cleanup must use the scoped Blaxel volume destroy wrapper",
);
assert.match(
  inventory,
  /listCloudProjectsForWorkspaceResourceInventoryInternal/,
  "provider inventory diagnostic must compare provider truth against PolyNet project truth",
);
assert.match(
  inventory,
  /provider_owner_mismatch/,
  "provider inventory diagnostic must classify provider ownership mismatches",
);
assert.match(
  inventory,
  /attached_mismatch/,
  "provider inventory diagnostic must classify volume attachment or provider label mismatches",
);
assert.match(
  inventory,
  /missing_provider_volume/,
  "provider inventory diagnostic must classify missing provider volumes",
);
assert.match(
  inventory,
  /missing_provider_sandbox/,
  "provider inventory diagnostic must classify missing provider sandboxes",
);
assert.match(
  inventory,
  /orphan_volume/,
  "provider inventory diagnostic must classify orphan volumes",
);
assert.match(
  inventory,
  /orphan_sandbox/,
  "provider inventory diagnostic must classify orphan sandboxes",
);
assert.match(
  inventory,
  /probe_resource/,
  "provider inventory diagnostic must distinguish known probe resources",
);
assert.match(
  inventory,
  /unknown_unowned_resource/,
  "provider inventory diagnostic must classify unowned provider resources separately",
);
assert.match(
  inventory,
  /resolveProviderVolumeQuotaSummary[\s\S]*providerVolumeLimit[\s\S]*providerVolumeSafetyBuffer[\s\S]*safeProviderVolumeLimit[\s\S]*availableVolumeSlots[\s\S]*quotaRisk/,
  "provider inventory diagnostic must summarize Blaxel volume quota headroom",
);
assert.match(
  inventory,
  /increment\(classificationCounts, "quota_risk"\)/,
  "provider inventory diagnostic must classify provider volume quota risk",
);
assert.match(
  inventory,
  /quota: providerVolumeQuota/,
  "provider inventory diagnostic must return sanitized provider volume quota evidence",
);
assert.doesNotMatch(
  diagnosticCore,
  /destroyBlaxel|ensureBlaxel|createBlaxel|\.delete\(|\.create\(/,
  "provider inventory diagnostic must not create, ensure, or delete provider resources",
);
assert.match(
  client,
  /function sanitizedInventoryLabelsFrom/,
  "provider inventory labels must be sanitized before returning diagnostic output",
);
assert.match(
  client,
  /allowed = new Set/,
  "provider inventory labels must use an allowlist",
);

assert.match(
  projects,
  /listCloudProjectsForWorkspaceResourceInventoryInternal/,
  "PolyNet project inventory rows must come from a dedicated internal query",
);
assert.match(
  projects,
  /\.query\("cloudProjects"\)/,
  "project inventory query must read PolyNet project truth",
);

assert.match(
  docs,
  /Blaxel Validation Gate/,
  "workspace provider contract must keep the Blaxel validation gate documented",
);
assert.match(
  docs,
  /Inactive legacy pointer reconciliation/,
  "workspace provider contract must document inactive legacy pointer reconciliation",
);
assert.match(
  docs,
  /Orphan provider volume cleanup/,
  "workspace provider contract must document orphan provider volume cleanup",
);
assert.match(
  docs,
  /attached_mismatch[\s\S]*quota_risk/,
  "workspace provider contract must document provider drift and quota-risk diagnostic classifications",
);
assert.match(
  packageJson,
  /"check:workspace-resource-inventory-diagnostic-proof"/,
  "package scripts must expose the workspace resource inventory diagnostic proof",
);

console.log("workspace_resource_inventory_diagnostic_proof: ok");
