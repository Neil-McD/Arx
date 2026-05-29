import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  resolveRecordedWorkspaceResourceProviderId,
} from "../shared/workspaceComputerProvider.ts";
import {
  isWorkspaceProjectInactiveStatus,
} from "../shared/workspaceProjectResources.ts";
import {
  isWorkspaceProjectCountableForAdmission,
} from "../shared/workspaceResourceAdmission.ts";

export type CloudProjectAuditRow = {
  _id?: unknown;
  ownerId?: unknown;
  name?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  providerVolumeId?: unknown;
  providerVolumeProviderId?: unknown;
  providerVolumeName?: unknown;
  providerVolumeState?: unknown;
  providerVolumeLastSeenAt?: unknown;
  providerSandboxId?: unknown;
  providerSandboxProviderId?: unknown;
  providerSandboxState?: unknown;
  providerSandboxLastSeenAt?: unknown;
  providerSandboxLastActivityAt?: unknown;
  providerSandboxStartedAt?: unknown;
  providerSandboxIdleExpiresAt?: unknown;
  providerSandboxCreditReservationKey?: unknown;
  providerSandboxCreditBudgetCredits?: unknown;
  providerSandboxCreditBudgetExpiresAt?: unknown;
  workspaceVolumeRetentionState?: unknown;
  workspaceVolumeRetainUntil?: unknown;
  workspaceVolumeDeleteAfter?: unknown;
  workspaceVolumeDeletionWarningSentAt?: unknown;
  workspaceVolumeDeletedAt?: unknown;
  workspaceVolumeDeletionReason?: unknown;
};

export type PointerKind = "volume" | "sandbox";

export type PointerAudit = {
  resourceId: string | null;
  explicitProviderId: string | null;
  resolvedProviderId: string | null;
  hasPointer: boolean;
  explicitBlaxel: boolean;
  implicitBlaxelName: boolean;
  explicitNonBlaxel: boolean;
  legacyOrUnknownOwner: boolean;
  missingProviderId: boolean;
  daytonaHint: boolean;
};

export function readArg(name: string, fallback: string): string {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

export function readLimit(): number {
  const raw = readArg("--limit", process.env.WORKSPACE_PROVIDER_POINTER_AUDIT_LIMIT || "10000");
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50000) : 10000;
}

export function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function incrementNullable(counts: Record<string, number>, raw: unknown, fallback = "missing") {
  const key = normalizeOptionalString(raw) ?? fallback;
  increment(counts, key);
}

export function previewResourceId(value: string | null): { prefix: string; length: number } | null {
  if (!value) return null;
  return {
    prefix: value.slice(0, 12),
    length: value.length,
  };
}

export function parseConvexJsonArray(raw: string): CloudProjectAuditRow[] {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  const json = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("convex_data_output_not_array");
  }
  return parsed as CloudProjectAuditRow[];
}

export function runConvexProductionCloudProjects(limit: number): CloudProjectAuditRow[] {
  let lastFailure: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = spawnSync(
      "npx",
      [
        "convex",
        "data",
        "--prod",
        "cloudProjects",
        "--format",
        "jsonArray",
        "--limit",
        String(limit),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );

    if (result.status !== 0) {
      const message = String(result.stderr || result.stdout || "convex_data_failed").slice(0, 1000);
      throw new Error(message);
    }

    try {
      return parseConvexJsonArray(String(result.stdout ?? ""));
    } catch (error) {
      lastFailure = error;
      if (attempt >= 2) break;
    }
  }

  throw lastFailure instanceof Error ? lastFailure : new Error("convex_data_parse_failed");
}

export function auditPointer(row: CloudProjectAuditRow, kind: PointerKind): PointerAudit {
  const resourceId = kind === "volume"
    ? normalizeOptionalString(row.providerVolumeId)
    : normalizeOptionalString(row.providerSandboxId);
  const explicitProviderId = kind === "volume"
    ? normalizeOptionalString(row.providerVolumeProviderId)
    : normalizeOptionalString(row.providerSandboxProviderId);
  const resolvedProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: explicitProviderId,
    resourceId,
  });
  const explicitBlaxel = explicitProviderId === "blaxel";
  const explicitNonBlaxel = Boolean(explicitProviderId && explicitProviderId !== "blaxel");
  const implicitBlaxelName = Boolean(resourceId && !explicitProviderId && resolvedProviderId === "blaxel");
  const legacyOrUnknownOwner = Boolean(resourceId && resolvedProviderId !== "blaxel");
  const daytonaHint = Boolean(
    resourceId &&
      (
        explicitProviderId === "daytona" ||
        /daytona/i.test(resourceId) ||
        (!resourceId.startsWith("pn-p-") && resolvedProviderId !== "blaxel")
      ),
  );

  return {
    resourceId,
    explicitProviderId,
    resolvedProviderId,
    hasPointer: Boolean(resourceId),
    explicitBlaxel,
    implicitBlaxelName,
    explicitNonBlaxel,
    legacyOrUnknownOwner,
    missingProviderId: Boolean(resourceId && !explicitProviderId),
    daytonaHint,
  };
}

export function summarizeRows(rows: CloudProjectAuditRow[], limit: number) {
  const statusCounts: Record<string, number> = {};
  const retentionCounts: Record<string, number> = {};
  const volumeProviderCounts: Record<string, number> = {};
  const sandboxProviderCounts: Record<string, number> = {};
  const activeLegacyOrUnknown: unknown[] = [];
  const inactiveLegacyOrUnknown: unknown[] = [];
  const missingProviderButBlaxelNamed: unknown[] = [];

  let activeProjectRows = 0;
  let inactiveProjectRows = 0;
  let countableProjectRows = 0;
  let projectsWithAnyPointer = 0;
  let projectsWithVolumePointer = 0;
  let projectsWithSandboxPointer = 0;
  let explicitBlaxelVolumePointers = 0;
  let explicitBlaxelSandboxPointers = 0;
  let explicitNonBlaxelVolumePointers = 0;
  let explicitNonBlaxelSandboxPointers = 0;
  let legacyOrUnknownVolumePointers = 0;
  let legacyOrUnknownSandboxPointers = 0;
  let daytonaHintVolumePointers = 0;
  let daytonaHintSandboxPointers = 0;

  for (const row of rows) {
    const status = normalizeOptionalString(row.status) ?? "active";
    increment(statusCounts, status);
    incrementNullable(retentionCounts, row.workspaceVolumeRetentionState);
    const inactive = isWorkspaceProjectInactiveStatus(status);
    if (inactive) inactiveProjectRows += 1;
    else activeProjectRows += 1;
    if (isWorkspaceProjectCountableForAdmission(row)) countableProjectRows += 1;

    const volume = auditPointer(row, "volume");
    const sandbox = auditPointer(row, "sandbox");
    if (volume.hasPointer || sandbox.hasPointer) projectsWithAnyPointer += 1;
    if (volume.hasPointer) projectsWithVolumePointer += 1;
    if (sandbox.hasPointer) projectsWithSandboxPointer += 1;
    if (volume.explicitBlaxel) explicitBlaxelVolumePointers += 1;
    if (sandbox.explicitBlaxel) explicitBlaxelSandboxPointers += 1;
    if (volume.explicitNonBlaxel) explicitNonBlaxelVolumePointers += 1;
    if (sandbox.explicitNonBlaxel) explicitNonBlaxelSandboxPointers += 1;
    if (volume.legacyOrUnknownOwner) legacyOrUnknownVolumePointers += 1;
    if (sandbox.legacyOrUnknownOwner) legacyOrUnknownSandboxPointers += 1;
    if (volume.daytonaHint) daytonaHintVolumePointers += 1;
    if (sandbox.daytonaHint) daytonaHintSandboxPointers += 1;
    incrementNullable(volumeProviderCounts, volume.explicitProviderId);
    incrementNullable(sandboxProviderCounts, sandbox.explicitProviderId);

    const hasLegacyOrUnknown = volume.legacyOrUnknownOwner || sandbox.legacyOrUnknownOwner;
    const hasMissingBlaxelNamed =
      volume.implicitBlaxelName ||
      sandbox.implicitBlaxelName;
    const sanitized = {
      projectId: normalizeOptionalString(row._id),
      status,
      active: !inactive,
      countable: isWorkspaceProjectCountableForAdmission(row),
      volume: {
        hasPointer: volume.hasPointer,
        resourceIdPreview: previewResourceId(volume.resourceId),
        explicitProviderId: volume.explicitProviderId,
        resolvedProviderId: volume.resolvedProviderId,
        legacyOrUnknownOwner: volume.legacyOrUnknownOwner,
        missingProviderId: volume.missingProviderId,
        daytonaHint: volume.daytonaHint,
      },
      sandbox: {
        hasPointer: sandbox.hasPointer,
        resourceIdPreview: previewResourceId(sandbox.resourceId),
        explicitProviderId: sandbox.explicitProviderId,
        resolvedProviderId: sandbox.resolvedProviderId,
        legacyOrUnknownOwner: sandbox.legacyOrUnknownOwner,
        missingProviderId: sandbox.missingProviderId,
        daytonaHint: sandbox.daytonaHint,
      },
    };
    if (hasLegacyOrUnknown) {
      (inactive ? inactiveLegacyOrUnknown : activeLegacyOrUnknown).push(sanitized);
    } else if (hasMissingBlaxelNamed) {
      missingProviderButBlaxelNamed.push(sanitized);
    }
  }

  return {
    ok: true,
    readOnly: true,
    source: {
      command: "npx convex data --prod cloudProjects --format jsonArray",
      scannedLimit: limit,
      truncated: rows.length >= limit,
    },
    summary: {
      totalCloudProjectsScanned: rows.length,
      activeProjectRows,
      inactiveProjectRows,
      countableProjectRows,
      projectsWithAnyPointer,
      projectsWithVolumePointer,
      projectsWithSandboxPointer,
      explicitBlaxelVolumePointers,
      explicitBlaxelSandboxPointers,
      explicitNonBlaxelVolumePointers,
      explicitNonBlaxelSandboxPointers,
      legacyOrUnknownVolumePointers,
      legacyOrUnknownSandboxPointers,
      daytonaHintVolumePointers,
      daytonaHintSandboxPointers,
      activeLegacyOrUnknownRows: activeLegacyOrUnknown.length,
      inactiveLegacyOrUnknownRows: inactiveLegacyOrUnknown.length,
      missingProviderButBlaxelNamedRows: missingProviderButBlaxelNamed.length,
    },
    counts: {
      status: statusCounts,
      workspaceVolumeRetentionState: retentionCounts,
      providerVolumeProviderId: volumeProviderCounts,
      providerSandboxProviderId: sandboxProviderCounts,
    },
    samples: {
      activeLegacyOrUnknown: activeLegacyOrUnknown.slice(0, 20),
      inactiveLegacyOrUnknown: inactiveLegacyOrUnknown.slice(0, 20),
      missingProviderButBlaxelNamed: missingProviderButBlaxelNamed.slice(0, 20),
    },
    nextDecision:
      activeLegacyOrUnknown.length > 0
        ? "active_legacy_or_unknown_workspace_pointers_require_migration_or_compatibility_before_production"
        : inactiveLegacyOrUnknown.length > 0
          ? "inactive_legacy_or_unknown_workspace_pointers_can_be_cleared_by_an_explicit_migration"
          : "no_legacy_or_unknown_workspace_pointers_detected_in_scanned_rows",
  };
}

function main() {
  const limit = readLimit();
  const rows = runConvexProductionCloudProjects(limit);
  console.log(JSON.stringify(summarizeRows(rows, limit), null, 2));
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  main();
}
