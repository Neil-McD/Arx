import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const client = read("convex/blaxelWorkspaceClient.ts");
const inventory = read("convex/blaxelWorkspaceResourceInventory.ts");
const operatorAccess = read("convex/operatorAccess.ts");
const authIdentity = read("convex/authIdentity.ts");
const projects = read("convex/projects.ts");
const docs = read("docs/workspace-computer-provider-contract.md");
const packageJson = read("package.json");
const publicDiagnosticAction = sliceBetween(
  inventory,
  "export const diagnoseBlaxelWorkspaceResourceInventory = action",
  "export const diagnoseBlaxelWorkspaceResourceInventoryInternal = internalAction",
);
const internalDiagnosticAction = sliceBetween(
  inventory,
  "export const diagnoseBlaxelWorkspaceResourceInventoryInternal = internalAction",
  "export const reconcileBlaxelWorkspaceSandboxPointersInternal = internalAction",
);
const diagnosticCoreStart = inventory.indexOf(
  "async function diagnoseBlaxelWorkspaceResourceInventoryCore",
);
assert.notEqual(diagnosticCoreStart, -1, "missing diagnostic core");
const diagnosticCore = inventory.slice(diagnosticCoreStart);

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
assert.doesNotMatch(
  publicDiagnosticAction,
  /deploymentKind !== "staging"|blaxel_resource_inventory_staging_only/,
  "public provider inventory diagnostic must not be staging-only because production quota failures need read-only diagnosis",
);
assert.match(
  publicDiagnosticAction,
  /operatorAccess\.getMyOperatorAccessOptional[\s\S]*return await diagnoseBlaxelWorkspaceResourceInventoryCore/,
  "public provider inventory diagnostic must remain operator-gated before running provider inventory",
);
assert.match(
  internalDiagnosticAction,
  /deploymentKind !== "staging"[\s\S]*blaxel_resource_inventory_internal_staging_only/,
  "internal provider inventory diagnostic must remain staging-only because it has no operator auth subject",
);
assert.doesNotMatch(
  diagnosticCore,
  /deploymentKind !== "staging"|blaxel_resource_inventory_staging_only/,
  "shared provider inventory diagnostic core must be deployment-agnostic and read-only",
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
  operatorAccess,
  /resolveAuthenticatedActor[\s\S]*readOperatorRole/,
  "operator access must resolve the authenticated actor before reading operator roles",
);
assert.match(
  authIdentity,
  /ctx\.auth\.getUserIdentity\(\)[\s\S]*auth_subject_mismatch[\s\S]*verified_identity_required/,
  "operator auth subjects must be tied to the verified Convex identity in production",
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
  inventory,
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
  /attached_mismatch[\s\S]*quota_risk/,
  "workspace provider contract must document provider drift and quota-risk diagnostic classifications",
);
assert.match(
  packageJson,
  /"check:workspace-resource-inventory-diagnostic-proof"/,
  "package scripts must expose the workspace resource inventory diagnostic proof",
);

console.log("workspace_resource_inventory_diagnostic_proof: ok");
