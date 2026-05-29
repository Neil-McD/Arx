import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export type CloudProjectAuditRow = {
  _id?: unknown;
  ownerId?: unknown;
  name?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  providerVolumeId?: unknown;
  providerVolumeName?: unknown;
  providerVolumeState?: unknown;
  providerVolumeLastSeenAt?: unknown;
  providerSandboxId?: unknown;
  providerSandboxState?: unknown;
  providerSandboxLastSeenAt?: unknown;
  providerSandboxLastActivityAt?: unknown;
  providerSandboxStartedAt?: unknown;
  providerSandboxIdleExpiresAt?: unknown;
  providerSandboxCreditReservationKey?: unknown;
  providerSandboxCreditBudgetCredits?: unknown;
  providerSandboxCreditBudgetExpiresAt?: unknown;
};

export type PointerKind = "volume" | "sandbox";

export type PointerAudit = {
  resourceId: string | null;
  hasPointer: boolean;
  resolvedProviderId: "blaxel" | "legacy_or_unknown" | null;
  blaxelOwned: boolean;
  legacyOrUnknownOwner: boolean;
  legacyShapeHint: "uuid_or_unknown" | "unknown" | null;
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

export function isBlaxelWorkspaceResourceId(value: unknown): boolean {
  return normalizeString(value).startsWith("pn-p-");
}

export function isActiveProjectStatus(value: unknown): boolean {
  const status = normalizeOptionalString(value) ?? "active";
  return status === "active";
}

export function auditPointer(row: CloudProjectAuditRow, kind: PointerKind): PointerAudit {
  const resourceId = kind === "volume"
    ? normalizeOptionalString(row.providerVolumeId)
    : normalizeOptionalString(row.providerSandboxId);
  const blaxelOwned = isBlaxelWorkspaceResourceId(resourceId);
  const legacyOrUnknownOwner = Boolean(resourceId && !blaxelOwned);
  const legacyShapeHint = legacyOrUnknownOwner
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId ?? "")
      ? "uuid_or_unknown"
      : "unknown"
    : null;

  return {
    resourceId,
    hasPointer: Boolean(resourceId),
    resolvedProviderId: resourceId ? (blaxelOwned ? "blaxel" : "legacy_or_unknown") : null,
    blaxelOwned,
    legacyOrUnknownOwner,
    legacyShapeHint,
  };
}

export function summarizeRows(rows: CloudProjectAuditRow[], limit: number) {
  const statusCounts: Record<string, number> = {};
  const activeLegacyOrUnknown: unknown[] = [];
  const inactiveLegacyOrUnknown: unknown[] = [];

  let activeProjectRows = 0;
  let inactiveProjectRows = 0;
  let projectsWithAnyPointer = 0;
  let projectsWithVolumePointer = 0;
  let projectsWithSandboxPointer = 0;
  let blaxelVolumePointers = 0;
  let blaxelSandboxPointers = 0;
  let legacyOrUnknownVolumePointers = 0;
  let legacyOrUnknownSandboxPointers = 0;

  for (const row of rows) {
    const status = normalizeOptionalString(row.status) ?? "active";
    const active = isActiveProjectStatus(status);
    increment(statusCounts, status);
    if (active) activeProjectRows += 1;
    else inactiveProjectRows += 1;

    const volume = auditPointer(row, "volume");
    const sandbox = auditPointer(row, "sandbox");
    if (volume.hasPointer || sandbox.hasPointer) projectsWithAnyPointer += 1;
    if (volume.hasPointer) projectsWithVolumePointer += 1;
    if (sandbox.hasPointer) projectsWithSandboxPointer += 1;
    if (volume.blaxelOwned) blaxelVolumePointers += 1;
    if (sandbox.blaxelOwned) blaxelSandboxPointers += 1;
    if (volume.legacyOrUnknownOwner) legacyOrUnknownVolumePointers += 1;
    if (sandbox.legacyOrUnknownOwner) legacyOrUnknownSandboxPointers += 1;

    const hasLegacyOrUnknown = volume.legacyOrUnknownOwner || sandbox.legacyOrUnknownOwner;
    if (hasLegacyOrUnknown) {
      const sanitized = {
        projectId: normalizeOptionalString(row._id),
        name: normalizeOptionalString(row.name),
        status,
        active,
        createdAt: Number.isFinite(Number(row.createdAt)) ? Number(row.createdAt) : null,
        updatedAt: Number.isFinite(Number(row.updatedAt)) ? Number(row.updatedAt) : null,
        volume: {
          hasPointer: volume.hasPointer,
          resourceIdPreview: previewResourceId(volume.resourceId),
          resolvedProviderId: volume.resolvedProviderId,
          legacyOrUnknownOwner: volume.legacyOrUnknownOwner,
          legacyShapeHint: volume.legacyShapeHint,
        },
        sandbox: {
          hasPointer: sandbox.hasPointer,
          resourceIdPreview: previewResourceId(sandbox.resourceId),
          resolvedProviderId: sandbox.resolvedProviderId,
          legacyOrUnknownOwner: sandbox.legacyOrUnknownOwner,
          legacyShapeHint: sandbox.legacyShapeHint,
        },
      };
      (active ? activeLegacyOrUnknown : inactiveLegacyOrUnknown).push(sanitized);
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
      projectsWithAnyPointer,
      projectsWithVolumePointer,
      projectsWithSandboxPointer,
      blaxelVolumePointers,
      blaxelSandboxPointers,
      legacyOrUnknownVolumePointers,
      legacyOrUnknownSandboxPointers,
    },
    statusCounts,
    activeLegacyOrUnknown,
    inactiveLegacyOrUnknown,
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
