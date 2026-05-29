import { pathToFileURL } from "node:url";

import {
  auditPointer,
  normalizeOptionalString,
  previewResourceId,
  readArg,
  readLimit,
  runConvexProductionCloudProjects,
  summarizeRows,
  type CloudProjectAuditRow,
  type PointerAudit,
} from "./workspace_provider_pointer_production_audit.ts";
import {
  isWorkspaceProjectInactiveStatus,
} from "../shared/workspaceProjectResources.ts";
import {
  isWorkspaceProjectCountableForAdmission,
} from "../shared/workspaceResourceAdmission.ts";

const VOLUME_FIELDS_TO_CLEAR = [
  "providerVolumeId",
  "providerVolumeProviderId",
  "providerVolumeName",
  "providerVolumeState",
  "providerVolumeLastSeenAt",
  "workspaceVolumeRetainUntil",
  "workspaceVolumeDeleteAfter",
  "workspaceVolumeDeletionWarningSentAt",
  "workspaceVolumeDeletedAt",
  "workspaceVolumeDeletionReason",
] as const;

const ACTIVE_VOLUME_FIELDS_TO_SET_ON_CLEAR = {
  workspaceVolumeRetentionState: "active",
} as const;

const INACTIVE_VOLUME_FIELDS_TO_SET_ON_CLEAR = {
  workspaceVolumeRetentionState: "deleted",
  workspaceVolumeDeletionReason: "legacy_or_unknown_workspace_provider_pointer_cleanup",
} as const;

const SANDBOX_FIELDS_TO_CLEAR = [
  "providerSandboxId",
  "providerSandboxProviderId",
  "providerSandboxState",
  "providerSandboxLastSeenAt",
  "providerSandboxLastActivityAt",
  "providerSandboxStartedAt",
  "providerSandboxIdleExpiresAt",
  "providerSandboxCreditReservationKey",
  "providerSandboxCreditBudgetCredits",
  "providerSandboxCreditBudgetExpiresAt",
] as const;

type PreflightMode = "gate" | "plan";

type PointerPlan = {
  hasPointer: boolean;
  wouldClear: boolean;
  resourceIdPreview: { prefix: string; length: number } | null;
  explicitProviderId: string | null;
  resolvedProviderId: string | null;
  legacyOrUnknownOwner: boolean;
  missingProviderId: boolean;
  legacyShapeHint: "uuid_or_unknown" | "explicit_non_blaxel" | "unknown" | null;
  fieldsToClear: readonly string[];
  fieldsToSet: Record<string, string>;
};

type ProjectPointerPlan = {
  projectId: string | null;
  name: string | null;
  status: string;
  active: boolean;
  countable: boolean;
  createdAt: number | null;
  updatedAt: number | null;
  volume: PointerPlan;
  sandbox: PointerPlan;
};

function readMode(): PreflightMode {
  const mode = readArg("--mode", "gate").trim().toLowerCase();
  return mode === "plan" ? "plan" : "gate";
}

function normalizeOptionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function legacyShapeHint(pointer: PointerAudit): PointerPlan["legacyShapeHint"] {
  if (!pointer.hasPointer || !pointer.legacyOrUnknownOwner) return null;
  if (pointer.explicitNonBlaxel) return "explicit_non_blaxel";
  if (pointer.missingProviderId) return "uuid_or_unknown";
  return "unknown";
}

function pointerPlan(params: {
  pointer: PointerAudit;
  fieldsToClear: readonly string[];
  fieldsToSet?: Record<string, string>;
}): PointerPlan {
  return {
    hasPointer: params.pointer.hasPointer,
    wouldClear: params.pointer.legacyOrUnknownOwner,
    resourceIdPreview: previewResourceId(params.pointer.resourceId),
    explicitProviderId: params.pointer.explicitProviderId,
    resolvedProviderId: params.pointer.resolvedProviderId,
    legacyOrUnknownOwner: params.pointer.legacyOrUnknownOwner,
    missingProviderId: params.pointer.missingProviderId,
    legacyShapeHint: legacyShapeHint(params.pointer),
    fieldsToClear: params.pointer.legacyOrUnknownOwner ? params.fieldsToClear : [],
    fieldsToSet: params.pointer.legacyOrUnknownOwner ? (params.fieldsToSet ?? {}) : {},
  };
}

function buildProjectPointerPlan(row: CloudProjectAuditRow): ProjectPointerPlan | null {
  const volume = auditPointer(row, "volume");
  const sandbox = auditPointer(row, "sandbox");
  if (!volume.legacyOrUnknownOwner && !sandbox.legacyOrUnknownOwner) {
    return null;
  }
  const status = normalizeOptionalString(row.status) ?? "active";
  const active = !isWorkspaceProjectInactiveStatus(status);
  return {
    projectId: normalizeOptionalString(row._id),
    name: normalizeOptionalString(row.name),
    status,
    active,
    countable: isWorkspaceProjectCountableForAdmission(row),
    createdAt: normalizeOptionalNumber(row.createdAt),
    updatedAt: normalizeOptionalNumber(row.updatedAt),
    volume: pointerPlan({
      pointer: volume,
      fieldsToClear: VOLUME_FIELDS_TO_CLEAR,
      fieldsToSet: active
        ? ACTIVE_VOLUME_FIELDS_TO_SET_ON_CLEAR
        : INACTIVE_VOLUME_FIELDS_TO_SET_ON_CLEAR,
    }),
    sandbox: pointerPlan({
      pointer: sandbox,
      fieldsToClear: SANDBOX_FIELDS_TO_CLEAR,
    }),
  };
}

export function buildProductionWorkspacePointerPreflight(rows: CloudProjectAuditRow[], limit: number, mode: PreflightMode) {
  const audit = summarizeRows(rows, limit);
  const plans = rows
    .map(buildProjectPointerPlan)
    .filter((plan): plan is ProjectPointerPlan => plan !== null);
  const activePlans = plans.filter((plan) => plan.active);
  const inactivePlans = plans.filter((plan) => !plan.active);
  const truncated = audit.source.truncated;
  const blocksProduction = truncated || activePlans.length > 0;

  return {
    ok: !blocksProduction,
    readOnly: true,
    dryRun: true,
    writePathAvailable: false,
    writeCommand: null,
    explicitAcceptanceRequired: true,
    mode,
    releaseGate: {
      blocksProduction,
      exitCodeWhenRunAsGate: blocksProduction ? 1 : 0,
      reason: truncated
        ? "production_workspace_pointer_scan_truncated_increase_limit_before_release"
        : activePlans.length > 0
        ? "active_legacy_or_unknown_workspace_pointers_must_be_cleared_or_migrated_before_blaxel_only_runtime"
        : "no_active_legacy_or_unknown_workspace_pointers_detected",
    },
    audit,
    migrationPlan: {
      proposedAction: activePlans.length > 0 || inactivePlans.length > 0
        ? "clear legacy or unknown workspace provider pointers, then allow Blaxel to recreate workspace resources on next use"
        : "none",
      activeLegacyOrUnknownRows: activePlans.length,
      inactiveLegacyOrUnknownRows: inactivePlans.length,
      activeCandidates: activePlans,
      inactiveCandidates: inactivePlans,
    },
  };
}

function main() {
  const mode = readMode();
  const limit = readLimit();
  const rows = runConvexProductionCloudProjects(limit);
  const preflight = buildProductionWorkspacePointerPreflight(rows, limit, mode);
  console.log(JSON.stringify(preflight, null, 2));
  if (mode === "gate" && preflight.releaseGate.blocksProduction) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  main();
}
