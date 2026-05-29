import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  auditPointer,
  normalizeOptionalString,
  readArg,
  readLimit,
  runConvexProductionCloudProjects,
  type CloudProjectAuditRow,
} from "./workspace_provider_pointer_production_audit.ts";
import {
  buildProductionWorkspacePointerPreflight,
} from "./workspace_provider_pointer_production_preflight.ts";

const CONFIRMATION = "clear-legacy-workspace-pointers";
const SECRET_ENV = "ARX_WORKSPACE_PROVIDER_POINTER_MIGRATION_SECRET";
const ENV_FILES = [".env.local", ".env"] as const;

type ApplyCandidate = {
  projectId: string;
  expectedStatus: string;
  expectedUpdatedAt: number | null;
  expectedProviderVolumeId?: string;
  expectedProviderSandboxId?: string;
};

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readEnvValue(key: string): string {
  const direct = String(process.env[key] ?? "").trim();
  if (direct) return direct;

  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      if (trimmed.slice(0, index).trim() !== key) continue;
      return stripWrappingQuotes(trimmed.slice(index + 1)).trim();
    }
  }

  return "";
}

function normalizeOptionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildApplyCandidate(row: CloudProjectAuditRow): ApplyCandidate | null {
  const projectId = normalizeOptionalString(row._id);
  if (!projectId) return null;
  const volume = auditPointer(row, "volume");
  const sandbox = auditPointer(row, "sandbox");
  if (!volume.legacyOrUnknownOwner && !sandbox.legacyOrUnknownOwner) {
    return null;
  }

  const candidate: ApplyCandidate = {
    projectId,
    expectedStatus: normalizeOptionalString(row.status) ?? "active",
    expectedUpdatedAt: normalizeOptionalNumber(row.updatedAt),
  };
  if (volume.legacyOrUnknownOwner && volume.resourceId) {
    candidate.expectedProviderVolumeId = volume.resourceId;
  }
  if (sandbox.legacyOrUnknownOwner && sandbox.resourceId) {
    candidate.expectedProviderSandboxId = sandbox.resourceId;
  }
  return candidate;
}

function parseConvexRunOutput(raw: string): unknown {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) return trimmed;
  return JSON.parse(trimmed.slice(start, end + 1));
}

function runMaintenanceMutation(params: {
  secret: string;
  candidate: ApplyCandidate;
}) {
  const args = {
    secret: params.secret,
    confirm: CONFIRMATION,
    projectId: params.candidate.projectId,
    expectedStatus: params.candidate.expectedStatus,
    expectedUpdatedAt: params.candidate.expectedUpdatedAt ?? undefined,
    expectedProviderVolumeId: params.candidate.expectedProviderVolumeId,
    expectedProviderSandboxId: params.candidate.expectedProviderSandboxId,
  };
  const result = spawnSync(
    "npx",
    [
      "convex",
      "run",
      "--prod",
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
      "projects:clearLegacyWorkspaceProjectProviderPointersForMaintenance",
      JSON.stringify(args),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    return {
      ok: false,
      projectId: params.candidate.projectId,
      status: "failed",
      reason: String(result.stderr || result.stdout || "convex_run_failed").slice(0, 1000),
    };
  }

  try {
    return parseConvexRunOutput(String(result.stdout ?? ""));
  } catch (error) {
    return {
      ok: false,
      projectId: params.candidate.projectId,
      status: "failed",
      reason: error instanceof Error ? error.message : "convex_run_output_parse_failed",
    };
  }
}

function main() {
  const apply = hasFlag("--apply");
  const confirm = readArg("--confirm", "");
  const limit = readLimit();
  const rows = runConvexProductionCloudProjects(limit);
  const preflight = buildProductionWorkspacePointerPreflight(rows, limit, "plan");
  const candidates = rows
    .map(buildApplyCandidate)
    .filter((candidate): candidate is ApplyCandidate => candidate !== null);

  if (!apply) {
    console.log(JSON.stringify({
      ...preflight,
      migrationApply: {
        dryRun: true,
        writePathAvailable: true,
        applyRequires: {
          flag: "--apply",
          confirm: `--confirm=${CONFIRMATION}`,
          secretEnv: SECRET_ENV,
        },
        plannedCandidateCount: candidates.length,
      },
    }, null, 2));
    return;
  }

  if (confirm !== CONFIRMATION) {
    throw new Error(`missing_exact_confirmation_${CONFIRMATION}`);
  }
  if (preflight.audit.source.truncated) {
    throw new Error("production_workspace_pointer_scan_truncated_increase_limit_before_apply");
  }
  const secret = readEnvValue(SECRET_ENV);
  if (!secret) {
    throw new Error(`missing_${SECRET_ENV}`);
  }

  const results = candidates.map((candidate) => runMaintenanceMutation({
    secret,
    candidate,
  }));
  const failed = results.filter((result: any) =>
    result?.ok !== true || result?.status !== "cleared",
  );

  console.log(JSON.stringify({
    ok: failed.length === 0,
    dryRun: false,
    applied: true,
    candidateCount: candidates.length,
    clearedCount: results.length - failed.length,
    failedCount: failed.length,
    results,
  }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  main();
}
