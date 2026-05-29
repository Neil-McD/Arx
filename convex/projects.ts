import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  BLAXEL_WORKSPACE_ROOT,
} from "./blaxelWorkspaceClient.ts";
import {
  executeBlaxelWorkspaceCommand,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  finalizeBillableBlaxelProjectWorkspaceLease,
  ensureBillableBlaxelWorkspaceComputer,
} from "./blaxelWorkspaceWake.ts";
import {
  buildBlaxelProjectWorkspaceNames,
} from "./blaxelWorkspaceProjectNames.ts";
import { buildNextDefaultComputerName, formatDefaultComputerName } from "../shared/projectNaming";
import {
  resolveRecordedWorkspaceResourceProviderId,
} from "../shared/workspaceComputerProvider";
import {
  DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE,
  isWorkspaceProjectDisplayable,
  isWorkspaceProjectInactiveStatus,
  normalizeWorkspaceVolumeRetentionState,
} from "../shared/workspaceProjectResources";
import {
  countWorkspaceProjectsForAdmission,
  countWorkspaceVolumesForAdmission,
  evaluateWorkspaceProjectCreateAdmission,
  evaluateWorkspaceVolumeMaterializationAdmission,
  resolveWorkspaceResourceAccountTier,
} from "../shared/workspaceResourceAdmission";
import {
  destroyBlaxelWorkspaceSandbox,
  destroyBlaxelWorkspaceVolume,
} from "./blaxelWorkspaceClient.ts";
import {
  readBlaxelWorkspaceVolumeQuotaAdmissionArgs,
} from "./blaxelWorkspaceVolumeQuota.ts";

const PROJECT_IMPORT_MAX_BYTES = 150 * 1024 * 1024;
const PROJECT_IMPORT_MAX_FILES = 25_000;
const PROJECT_IMPORT_MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;
const PROJECT_IMPORT_LEASE_MS = 20 * 60 * 1000;
const WORKSPACE_PROVIDER_POINTER_MIGRATION_CONFIRMATION =
  "clear-legacy-workspace-pointers";
const WORKSPACE_PROVIDER_POINTER_MIGRATION_SECRET_ENV =
  "ARX_WORKSPACE_PROVIDER_POINTER_MIGRATION_SECRET";
const workspaceResourceProviderIdValidator = v.literal("blaxel");

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Convex environments may not expose process.env in every runtime.
  }
  return "";
}

async function resolveOwnerIdForAuthenticatedRequest(args: {
  ctx: any;
  ownerId?: any;
  authSubject?: string | null;
}): Promise<any> {
  try {
    return await resolveUserIdForAuthenticatedRequest({
      ctx: args.ctx,
      userId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "user_id_mismatch") {
      throw new Error("owner_id_mismatch");
    }
    throw error;
  }
}

async function ensureDefaultProjectInternal(args: {
  ctx: any;
  ownerId: any;
  nowMs: number;
}) {
  const existingRows = await args.ctx.db
    .query("cloudProjects")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", args.ownerId))
    .collect();
  const existing = existingRows
    .filter(isWorkspaceProjectDisplayable)
    .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0] ?? null;
  if (existing) return existing;

  const id = await args.ctx.db.insert("cloudProjects", {
    ownerId: args.ownerId,
    name: formatDefaultComputerName(1),
    status: "active",
    providerVolumeId: undefined,
    workspaceVolumeRetentionState: DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = await args.ctx.db.get(id);
  if (!created) throw new Error("project_create_failed");
  return created;
}

function normalizeOptionalVolumeValue(raw: unknown): string | undefined {
  const normalized = String(raw ?? "").trim();
  return normalized || undefined;
}

function buildProjectVolumeName(project: { _id?: unknown }): string {
  const projectId = normalizeIdValue(project._id);
  if (!projectId) throw new Error("project_id_required");
  return buildBlaxelProjectWorkspaceNames(projectId).volumeName;
}

function normalizeOptionalProjectString(raw: unknown): string | undefined {
  const normalized = String(raw ?? "").trim();
  return normalized || undefined;
}

function buildNextProjectName(existingProjects: Array<{ name?: string | null }>): string {
  return buildNextDefaultComputerName(existingProjects.map((project) => project.name ?? null));
}

async function readWorkspaceCreditBalanceForProjectOwner(args: {
  ctx: any;
  ownerId: any;
}) {
  const rows = await args.ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_user", (q: any) => q.eq("userId", args.ownerId))
    .take(2);
  if (rows.length > 1) throw new Error("workspace_credit_balance_duplicate");
  return rows[0] ?? null;
}

async function resolveWorkspaceResourceAccountTierForOwner(args: {
  ctx: any;
  ownerId: any;
}) {
  const [workspaceCreditBalance, hasCardOnFile] = await Promise.all([
    readWorkspaceCreditBalanceForProjectOwner({
      ctx: args.ctx,
      ownerId: args.ownerId,
    }),
    resolveWorkspaceHasCardOnFileForOwner({
      ctx: args.ctx,
      ownerId: args.ownerId,
    }),
  ]);
  return resolveWorkspaceResourceAccountTier({
    hasCardOnFile,
    workspaceCreditBalance,
  });
}

async function resolveWorkspaceHasCardOnFileForOwner(args: {
  ctx: any;
  ownerId: any;
}): Promise<boolean> {
  const stripeCustomer = await args.ctx.db
    .query("userStripeCustomers")
    .withIndex("by_user", (q: any) => q.eq("userId", args.ownerId))
    .first();
  return Boolean(
    stripeCustomer?.paymentMethodStatus === "active" &&
      String(stripeCustomer.providerDefaultPaymentMethodId ?? "").trim().startsWith("pm_") &&
      !(Number(stripeCustomer.cardRemovedAt ?? 0) > 0),
  );
}

function workspaceResourceAdmissionStatus(code: string): number {
  if (code === "project_not_found") return 404;
  if (
    code === "workspace_volume_funding_required" ||
    code === "workspace_card_required_for_additional_volume" ||
    code === "workspace_volume_limit_reached" ||
    code === "project_limit_reached"
  ) {
    return 402;
  }
  if (
    code === "project_volume_provider_mismatch" ||
    code === "project_volume_resource_mismatch"
  ) {
    return 409;
  }
  if (code === "workspace_provider_volume_quota_headroom_exhausted") return 429;
  return 503;
}

function workspaceResourceAdmissionMessage(code: string): string {
  if (code === "project_not_found") return "Computer not found.";
  if (code === "project_volume_provider_mismatch") {
    return "This computer volume is managed by a different provider.";
  }
  if (code === "project_volume_resource_mismatch") {
    return "This computer volume is bound to a different provider resource.";
  }
  if (code === "workspace_volume_funding_required") {
    return "Add prepaid credits or a card before creating workspace storage.";
  }
  if (code === "workspace_card_required_for_additional_volume") {
    return "Extra workspace computers require a card on file.";
  }
  if (code === "workspace_volume_limit_reached") {
    return "Workspace project volume limit reached.";
  }
  if (code === "workspace_provider_volume_quota_headroom_exhausted") {
    return "Workspace storage provider quota has no safe headroom.";
  }
  return "Workspace resource admission failed.";
}

function workspaceResourceAdmissionFailure(params: {
  code: string;
  message?: string;
  details?: Record<string, unknown>;
}) {
  return {
    ok: false as const,
    status: workspaceResourceAdmissionStatus(params.code),
    code: params.code,
    message: params.message ?? workspaceResourceAdmissionMessage(params.code),
    ...(params.details ? { details: params.details } : {}),
  };
}

function shellQuote(value: string): string {
  return `'${String(value ?? "").replace(/'/g, `'\"'\"'`)}'`;
}

function buildProjectImportRunId(projectId: unknown): string {
  return `project_import_${normalizeIdValue(projectId)}_${Date.now()}`;
}

function buildProjectImportArchivePath(projectId: unknown): string {
  const safeProjectId = normalizeIdValue(projectId).replace(/[^a-zA-Z0-9_-]/g, "_") || "project";
  return `${BLAXEL_WORKSPACE_ROOT}/.arx-import-${safeProjectId}-${Date.now()}.zip`;
}

function buildProjectZipImportCommand(params: {
  zipPath: string;
  archiveUrl: string;
  workspaceRoot: string;
}): string {
  const script = String.raw`
import json
import os
import shutil
import tempfile
import urllib.error
import urllib.request
import zipfile

zip_path = os.environ["ARX_IMPORT_ZIP"]
workspace_root = os.environ["ARX_IMPORT_ROOT"]
archive_url = os.environ["ARX_IMPORT_URL"]
max_zip_bytes = ${String(PROJECT_IMPORT_MAX_BYTES)}
max_extracted_files = ${String(PROJECT_IMPORT_MAX_FILES)}
max_extracted_bytes = ${String(PROJECT_IMPORT_MAX_EXTRACTED_BYTES)}
junk_names = {"__MACOSX", ".git", "node_modules", ".next", "dist", "build", "coverage"}
blocked_dir_paths = {
    (".ssh",),
    (".aws",),
    (".azure",),
    (".kube",),
    (".config", "gcloud"),
}
blocked_file_names = {"id_rsa", "id_ed25519", "authorized_keys", "known_hosts", ".npmrc", ".netrc"}
blocked_suffixes = (".pem", ".key", ".p12", ".pfx")

summary = {
    "zip_bytes": 0,
    "imported_files": 0,
    "skipped_files": 0,
    "blocked_files": 0,
    "common_root_stripped": False,
}
staging_root = tempfile.mkdtemp(prefix=".arx-import-stage-", dir=workspace_root)

def normalize_parts(name: str):
    return [part for part in name.replace("\\", "/").split("/") if part not in ("", ".")]

def is_symlink(info):
    return ((int(info.external_attr or 0) >> 16) & 0o170000) == 0o120000

def is_blocked(parts):
    lowered = [part.lower() for part in parts]
    for candidate in blocked_dir_paths:
        candidate_len = len(candidate)
        if tuple(lowered[:candidate_len]) == candidate:
            return True
        for index in range(0, max(0, len(lowered) - candidate_len + 1)):
            if tuple(lowered[index:index + candidate_len]) == candidate:
                return True
    base = lowered[-1] if lowered else ""
    if base in blocked_file_names:
        return True
    return any(base.endswith(suffix) for suffix in blocked_suffixes)

def system_exit(code):
    raise SystemExit(code)

def copy_with_limit(src, dst, current_total):
    total = current_total
    while True:
        chunk = src.read(1024 * 1024)
        if not chunk:
            return total
        total += len(chunk)
        if total > max_extracted_bytes:
            system_exit("project_import_extracted_bytes_exceeded")
        try:
            dst.write(chunk)
        except OSError as exc:
            if getattr(exc, "errno", None) == 28:
                system_exit("project_import_storage_full")
            raise

try:
    try:
        request = urllib.request.Request(archive_url, headers={"User-Agent": "arx-import/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response, open(zip_path, "wb") as zip_dst:
            content_length = response.headers.get("Content-Length")
            if content_length:
                try:
                    if int(content_length) > max_zip_bytes:
                        system_exit("project_import_too_large")
                except ValueError:
                    pass
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                summary["zip_bytes"] += len(chunk)
                if summary["zip_bytes"] > max_zip_bytes:
                    system_exit("project_import_too_large")
                zip_dst.write(chunk)
    except SystemExit:
        raise
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        system_exit("project_import_download_failed")
    except OSError as exc:
        if getattr(exc, "errno", None) == 28:
            system_exit("project_import_storage_full")
        raise

    if summary["zip_bytes"] <= 0:
        system_exit("project_import_empty")

    with zipfile.ZipFile(zip_path) as archive:
        infos = archive.infolist()
        roots = set()
        for info in infos:
            parts = normalize_parts(info.filename)
            if not parts:
                continue
            if parts[0] in junk_names or is_blocked(parts):
                continue
            roots.add(parts[0])
        common_root = next(iter(roots)) if len(roots) == 1 else None
        summary["common_root_stripped"] = common_root is not None

        seen_relative_targets = set()
        validated_entries = []
        extracted_file_count = 0
        extracted_total_bytes = 0

        for info in infos:
            parts = normalize_parts(info.filename)
            if not parts:
                continue
            if common_root and parts and parts[0] == common_root:
                parts = parts[1:]
            if not parts:
                continue
            if any(part in junk_names for part in parts):
                summary["skipped_files"] += 1
                continue
            if is_blocked(parts):
                summary["blocked_files"] += 1
                continue
            if is_symlink(info):
                raise SystemExit("project_import_unsafe_entry")

            relative_target = os.path.join(*parts)
            normalized_relative_target = os.path.normpath(relative_target)
            if normalized_relative_target in ("", ".") or normalized_relative_target.startswith(".."):
                raise SystemExit("project_import_unsafe_entry")
            if normalized_relative_target in seen_relative_targets:
                raise SystemExit("project_import_unsafe_entry")
            seen_relative_targets.add(normalized_relative_target)

            target_path = os.path.abspath(os.path.join(staging_root, normalized_relative_target))
            staging_prefix = os.path.abspath(staging_root) + os.sep
            if target_path != os.path.abspath(staging_root) and not target_path.startswith(staging_prefix):
                raise SystemExit("project_import_unsafe_entry")

            if info.is_dir():
                validated_entries.append((info, normalized_relative_target, target_path, True))
                continue

            extracted_file_count += 1
            if extracted_file_count > max_extracted_files:
                system_exit("project_import_too_many_files")
            validated_entries.append((info, normalized_relative_target, target_path, False))

        for info, _relative_target, target_path, is_dir in validated_entries:
            if is_dir:
                os.makedirs(target_path, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            try:
                with archive.open(info, "r") as src, open(target_path, "wb") as dst:
                    extracted_total_bytes = copy_with_limit(src, dst, extracted_total_bytes)
            except OSError as exc:
                if getattr(exc, "errno", None) == 28:
                    system_exit("project_import_storage_full")
                raise
            summary["imported_files"] += 1

        for current_root, _dirnames, filenames in os.walk(staging_root):
            relative_root = os.path.relpath(current_root, staging_root)
            target_root = workspace_root if relative_root == "." else os.path.join(workspace_root, relative_root)
            os.makedirs(target_root, exist_ok=True)
            for filename in filenames:
                staged_path = os.path.join(current_root, filename)
                target_path = os.path.join(target_root, filename)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                try:
                    shutil.move(staged_path, target_path)
                except OSError as exc:
                    if getattr(exc, "errno", None) == 28:
                        system_exit("project_import_storage_full")
                    raise

    print(json.dumps(summary, sort_keys=True))
finally:
    shutil.rmtree(staging_root, ignore_errors=True)
`;
  return [
    `mkdir -p ${shellQuote(params.workspaceRoot)}`,
    `ARX_IMPORT_ZIP=${shellQuote(params.zipPath)} ARX_IMPORT_URL=${shellQuote(params.archiveUrl)} ARX_IMPORT_ROOT=${shellQuote(params.workspaceRoot)} python3 - <<'PY'`,
    script.trim(),
    "PY",
    `rm -f ${shellQuote(params.zipPath)}`,
  ].join("\n");
}

function parseProjectImportSummary(outputText: string): {
  zipBytes: number;
  importedFiles: number;
  skippedFiles: number;
  blockedFiles: number;
  commonRootStripped: boolean;
} {
  const lines = String(outputText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines[lines.length - 1] ?? "";
  if (!lastLine) {
    return {
      zipBytes: 0,
      importedFiles: 0,
      skippedFiles: 0,
      blockedFiles: 0,
      commonRootStripped: false,
    };
  }
  try {
    const parsed = JSON.parse(lastLine) as Record<string, unknown>;
    return {
      zipBytes: Math.max(0, Math.floor(Number(parsed.zip_bytes ?? 0) || 0)),
      importedFiles: Math.max(0, Math.floor(Number(parsed.imported_files ?? 0) || 0)),
      skippedFiles: Math.max(0, Math.floor(Number(parsed.skipped_files ?? 0) || 0)),
      blockedFiles: Math.max(0, Math.floor(Number(parsed.blocked_files ?? 0) || 0)),
      commonRootStripped: Boolean(parsed.common_root_stripped),
    };
  } catch {
    return {
      zipBytes: 0,
      importedFiles: 0,
      skippedFiles: 0,
      blockedFiles: 0,
      commonRootStripped: false,
    };
  }
}

async function resolveActionUser(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<{ authSubject: string; userId: any }> {
  const actor = (await args.ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
    authSubject: args.authSubject ?? undefined,
  })) as { authSubject?: unknown; dbUserId?: unknown } | null;
  const authSubject = normalizeIdValue(actor?.authSubject);
  if (!authSubject) throw new Error("authenticated_user_required");
  const userId = actor?.dbUserId;
  if (!userId) throw new Error("authenticated_user_required");
  return { authSubject, userId };
}

export const getCloudProjectByIdInternal = internalQuery({
  args: {
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

export const listCloudProjectsByOwnerInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
  },
});

export const listCloudProjectsForWorkspaceResourceInventoryInternal = internalQuery({
  args: {
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(
      1000,
      Math.max(1, Math.floor(Number(args.limit ?? 500))),
    );
    const ownerId = args.ownerId;
    if (ownerId) {
      return await ctx.db
        .query("cloudProjects")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .take(limit);
    }
    return await ctx.db.query("cloudProjects").take(limit);
  },
});

export const listExpiredBlaxelProjectWorkspaceLeasesInternal = internalQuery({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.min(
      100,
      Math.max(1, Math.floor(Number(args.limit ?? 50))),
    );
    const rows = await ctx.db
      .query("cloudProjects")
      .withIndex("by_sandboxProvider_creditBudgetExpiresAt", (q) =>
        q.eq("providerSandboxProviderId", "blaxel").lt("providerSandboxCreditBudgetExpiresAt", nowMs),
      )
      .take(limit);
    return rows.filter((project) =>
      Boolean(normalizeOptionalProjectString(project.providerSandboxCreditReservationKey)),
    );
  },
});

export const listBlaxelProjectWorkspaceLeasesMissingProjectExpiryInternal = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(
      100,
      Math.max(1, Math.floor(Number(args.limit ?? 50))),
    );
    const rows = await ctx.db
      .query("cloudProjects")
      .withIndex("by_sandboxProvider_creditBudgetExpiresAt", (q) =>
        q.eq("providerSandboxProviderId", "blaxel").eq("providerSandboxCreditBudgetExpiresAt", undefined),
      )
      .take(limit);
    return rows.filter((project) =>
      Boolean(normalizeOptionalProjectString(project.providerSandboxCreditReservationKey)),
    );
  },
});

export const attachCloudProjectVolumeInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerVolumeId: v.string(),
    providerId: workspaceResourceProviderIdValidator,
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.projectId);
    if (!existing) throw new Error("project_not_found");
    const nowMs = args.nowMs ?? Date.now();
    const providerVolumeId = normalizeOptionalVolumeValue(args.providerVolumeId);
    if (!providerVolumeId) throw new Error("provider_volume_id_required");
    await ctx.db.patch(existing._id, {
      providerVolumeId,
      providerVolumeProviderId: args.providerId,
      providerVolumeState: "active",
      providerVolumeLastSeenAt: nowMs,
      workspaceVolumeRetentionState: DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE,
      workspaceVolumeRetainUntil: undefined,
      workspaceVolumeDeleteAfter: undefined,
      workspaceVolumeDeletionWarningSentAt: undefined,
      workspaceVolumeDeletedAt: undefined,
      workspaceVolumeDeletionReason: undefined,
      updatedAt: nowMs,
    });
    return await ctx.db.get(existing._id);
  },
});

export const prepareCloudProjectVolumeMaterializationInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    nowMs: v.optional(v.number()),
    providerVolumeCount: v.optional(v.number()),
    providerVolumeLimit: v.optional(v.number()),
    providerVolumeSafetyBuffer: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return workspaceResourceAdmissionFailure({ code: "project_not_found" });
    }

    const nowMs = args.nowMs ?? Date.now();
    const expectedVolumeName = buildProjectVolumeName(project);
    const existingVolumeId = normalizeOptionalVolumeValue(project.providerVolumeId);
    const existingVolumeDeleted =
      normalizeWorkspaceVolumeRetentionState(project.workspaceVolumeRetentionState) ===
        "deleted" ||
      Number(project.workspaceVolumeDeletedAt ?? 0) > 0;
    const existingVolumeProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project.providerVolumeProviderId,
      resourceId: existingVolumeId,
    });

    if (existingVolumeId && existingVolumeProviderId !== "blaxel") {
      return workspaceResourceAdmissionFailure({
        code: "project_volume_provider_mismatch",
        details: {
          project_id: String(args.projectId),
          provider_volume_id: existingVolumeId,
          provider_id: existingVolumeProviderId,
        },
      });
    }
    if (existingVolumeId && existingVolumeId !== expectedVolumeName) {
      return workspaceResourceAdmissionFailure({
        code: "project_volume_resource_mismatch",
        details: {
          project_id: String(args.projectId),
          expected_provider_volume_id: expectedVolumeName,
          actual_provider_volume_id: existingVolumeId,
        },
      });
    }
    if (existingVolumeId && !existingVolumeDeleted) {
      return {
        ok: true as const,
        projectId: String(args.projectId),
        ownerId: String(project.ownerId),
        providerId: "blaxel" as const,
        providerVolumeId: existingVolumeId,
        providerVolumeState: String(project.providerVolumeState ?? "active"),
        alreadyClaimed: true,
      };
    }

    const [ownerProjectRows, workspaceCreditBalance, hasCardOnFile] = await Promise.all([
      ctx.db
        .query("cloudProjects")
        .withIndex("by_owner", (q) => q.eq("ownerId", project.ownerId))
        .collect(),
      readWorkspaceCreditBalanceForProjectOwner({
        ctx,
        ownerId: project.ownerId,
      }),
      resolveWorkspaceHasCardOnFileForOwner({
        ctx,
        ownerId: project.ownerId,
      }),
    ]);
    const admission = evaluateWorkspaceVolumeMaterializationAdmission({
      hasCardOnFile,
      workspaceCreditBalance,
      existingVolumeCount: countWorkspaceVolumesForAdmission(ownerProjectRows),
      providerVolumeCount: args.providerVolumeCount ?? null,
      providerVolumeLimit: args.providerVolumeLimit ?? null,
      providerVolumeSafetyBuffer: args.providerVolumeSafetyBuffer ?? null,
    });
    if (!admission.ok) {
      return workspaceResourceAdmissionFailure({
        code: admission.code,
        message: admission.message,
        details: {
          account_tier: admission.accountTier,
          current_count: admission.currentCount,
          requested_count: admission.requestedCount,
          limit: admission.limit,
        },
      });
    }

    await ctx.db.patch(project._id, {
      providerVolumeId: expectedVolumeName,
      providerVolumeProviderId: "blaxel",
      providerVolumeState: "materializing",
      providerVolumeLastSeenAt: nowMs,
      workspaceVolumeRetentionState: DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE,
      workspaceVolumeRetainUntil: undefined,
      workspaceVolumeDeleteAfter: undefined,
      workspaceVolumeDeletionWarningSentAt: undefined,
      workspaceVolumeDeletedAt: undefined,
      workspaceVolumeDeletionReason: undefined,
      updatedAt: nowMs,
    });

    return {
      ok: true as const,
      projectId: String(args.projectId),
      ownerId: String(project.ownerId),
      providerId: "blaxel" as const,
      providerVolumeId: expectedVolumeName,
      providerVolumeState: "materializing",
      alreadyClaimed: false,
    };
  },
});

export const clearInactiveLegacyWorkspaceProjectProviderPointersInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    expectedStatus: v.optional(v.string()),
    expectedProviderVolumeId: v.optional(v.string()),
    expectedProviderSandboxId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("project_not_found");
    if (!isWorkspaceProjectInactiveStatus(project.status)) {
      throw new Error("active_project_legacy_pointer_cleanup_forbidden");
    }
    if (
      args.expectedStatus &&
      String(project.status ?? "").trim() !== args.expectedStatus
    ) {
      return project;
    }

    const nowMs = args.nowMs ?? Date.now();
    const providerVolumeId = normalizeOptionalVolumeValue(project.providerVolumeId);
    const providerVolumeProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project.providerVolumeProviderId,
      resourceId: providerVolumeId,
    });
    const shouldClearVolume =
      Boolean(providerVolumeId) &&
      providerVolumeProviderId !== "blaxel" &&
      (
        !args.expectedProviderVolumeId ||
        args.expectedProviderVolumeId === providerVolumeId
      );

    const providerSandboxId = normalizeOptionalVolumeValue(project.providerSandboxId);
    const providerSandboxProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project.providerSandboxProviderId,
      resourceId: providerSandboxId,
    });
    const shouldClearSandbox =
      Boolean(providerSandboxId) &&
      providerSandboxProviderId !== "blaxel" &&
      (
        !args.expectedProviderSandboxId ||
        args.expectedProviderSandboxId === providerSandboxId
      );

    if (!shouldClearVolume && !shouldClearSandbox) {
      return project;
    }

    await ctx.db.patch(project._id, {
      ...(shouldClearVolume
        ? {
            providerVolumeId: undefined,
            providerVolumeProviderId: undefined,
            providerVolumeName: undefined,
            providerVolumeState: undefined,
            providerVolumeLastSeenAt: undefined,
            workspaceVolumeRetentionState: "deleted" as const,
            workspaceVolumeRetainUntil: undefined,
            workspaceVolumeDeleteAfter: undefined,
            workspaceVolumeDeletionWarningSentAt: undefined,
            workspaceVolumeDeletedAt: nowMs,
            workspaceVolumeDeletionReason: "inactive_legacy_provider_pointer_cleanup",
          }
        : {}),
      ...(shouldClearSandbox
        ? {
            providerSandboxId: undefined,
            providerSandboxProviderId: undefined,
            providerSandboxState: undefined,
            providerSandboxLastSeenAt: undefined,
            providerSandboxLastActivityAt: undefined,
            providerSandboxStartedAt: undefined,
            providerSandboxIdleExpiresAt: undefined,
            providerSandboxCreditReservationKey: undefined,
            providerSandboxCreditBudgetCredits: undefined,
            providerSandboxCreditBudgetExpiresAt: undefined,
          }
        : {}),
      updatedAt: nowMs,
    });
    return await ctx.db.get(project._id);
  },
});

export const clearLegacyWorkspaceProjectProviderPointersForMaintenance = mutation({
  args: {
    secret: v.string(),
    confirm: v.string(),
    projectId: v.id("cloudProjects"),
    expectedStatus: v.optional(v.string()),
    expectedUpdatedAt: v.number(),
    expectedProviderVolumeId: v.optional(v.string()),
    expectedProviderSandboxId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = readEnv(WORKSPACE_PROVIDER_POINTER_MIGRATION_SECRET_ENV);
    if (!expectedSecret || args.secret !== expectedSecret) {
      throw new Error("workspace_provider_pointer_migration_unauthorized");
    }
    if (args.confirm !== WORKSPACE_PROVIDER_POINTER_MIGRATION_CONFIRMATION) {
      throw new Error("workspace_provider_pointer_migration_confirmation_required");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return {
        ok: false as const,
        status: "missing" as const,
        projectId: String(args.projectId),
        reason: "project_not_found",
      };
    }

    const status = String(project.status ?? "active").trim() || "active";
    if (
      typeof args.expectedStatus === "string" &&
      String(args.expectedStatus).trim() !== status
    ) {
      return {
        ok: false as const,
        status: "skipped" as const,
        projectId: String(project._id),
        reason: "expected_status_mismatch",
      };
    }
    if (Number(project.updatedAt ?? 0) !== args.expectedUpdatedAt) {
      return {
        ok: false as const,
        status: "skipped" as const,
        projectId: String(project._id),
        reason: "expected_updated_at_mismatch",
      };
    }

    const expectedProviderVolumeId = normalizeOptionalVolumeValue(
      args.expectedProviderVolumeId,
    );
    const expectedProviderSandboxId = normalizeOptionalVolumeValue(
      args.expectedProviderSandboxId,
    );
    const providerVolumeId = normalizeOptionalVolumeValue(project.providerVolumeId);
    const providerSandboxId = normalizeOptionalVolumeValue(project.providerSandboxId);
    if (expectedProviderVolumeId && providerVolumeId !== expectedProviderVolumeId) {
      return {
        ok: false as const,
        status: "skipped" as const,
        projectId: String(project._id),
        reason: "expected_provider_volume_id_mismatch",
      };
    }
    if (expectedProviderSandboxId && providerSandboxId !== expectedProviderSandboxId) {
      return {
        ok: false as const,
        status: "skipped" as const,
        projectId: String(project._id),
        reason: "expected_provider_sandbox_id_mismatch",
      };
    }

    const providerVolumeProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project.providerVolumeProviderId,
      resourceId: providerVolumeId,
    });
    if (expectedProviderVolumeId && providerVolumeProviderId === "blaxel") {
      return {
        ok: false as const,
        status: "refused" as const,
        projectId: String(project._id),
        reason: "blaxel_volume_pointer_refused",
      };
    }
    const providerSandboxProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project.providerSandboxProviderId,
      resourceId: providerSandboxId,
    });
    if (expectedProviderSandboxId && providerSandboxProviderId === "blaxel") {
      return {
        ok: false as const,
        status: "refused" as const,
        projectId: String(project._id),
        reason: "blaxel_sandbox_pointer_refused",
      };
    }

    const shouldClearVolume =
      Boolean(expectedProviderVolumeId) &&
      Boolean(providerVolumeId) &&
      providerVolumeProviderId !== "blaxel";
    const shouldClearSandbox =
      Boolean(expectedProviderSandboxId) &&
      Boolean(providerSandboxId) &&
      providerSandboxProviderId !== "blaxel";
    if (!shouldClearVolume && !shouldClearSandbox) {
      return {
        ok: true as const,
        status: "skipped" as const,
        projectId: String(project._id),
        reason: "no_matching_legacy_or_unknown_pointer",
      };
    }

    const nowMs = args.nowMs ?? Date.now();
    const active = !isWorkspaceProjectInactiveStatus(status);
    await ctx.db.patch(project._id, {
      ...(shouldClearVolume
        ? {
            providerVolumeId: undefined,
            providerVolumeProviderId: undefined,
            providerVolumeName: undefined,
            providerVolumeState: undefined,
            providerVolumeLastSeenAt: undefined,
            workspaceVolumeRetentionState: active
              ? DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE
              : ("deleted" as const),
            workspaceVolumeRetainUntil: undefined,
            workspaceVolumeDeleteAfter: undefined,
            workspaceVolumeDeletionWarningSentAt: undefined,
            workspaceVolumeDeletedAt: active ? undefined : nowMs,
            workspaceVolumeDeletionReason: active
              ? undefined
              : "inactive_legacy_provider_pointer_cleanup",
          }
        : {}),
      ...(shouldClearSandbox
        ? {
            providerSandboxId: undefined,
            providerSandboxProviderId: undefined,
            providerSandboxState: undefined,
            providerSandboxLastSeenAt: undefined,
            providerSandboxLastActivityAt: undefined,
            providerSandboxStartedAt: undefined,
            providerSandboxIdleExpiresAt: undefined,
            providerSandboxCreditReservationKey: undefined,
            providerSandboxCreditBudgetCredits: undefined,
            providerSandboxCreditBudgetExpiresAt: undefined,
          }
        : {}),
      updatedAt: nowMs,
    });

    return {
      ok: true as const,
      status: "cleared" as const,
      projectId: String(project._id),
      active,
      clearedVolume: shouldClearVolume,
      clearedSandbox: shouldClearSandbox,
      updatedAt: nowMs,
    };
  },
});

export const acquireCloudProjectImportLeaseInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== args.ownerId) {
      throw new Error("project_not_found");
    }
    const nowMs = args.nowMs ?? Date.now();
    const currentLease = Number(project.importLeaseExpiresAt ?? 0);
    if (Number.isFinite(currentLease) && currentLease > nowMs) {
      throw new Error("project_import_in_progress");
    }
    const nextLeaseExpiresAt = nowMs + PROJECT_IMPORT_LEASE_MS;
    await ctx.db.patch(project._id, {
      importLeaseExpiresAt: nextLeaseExpiresAt,
      updatedAt: nowMs,
    });
    return nextLeaseExpiresAt;
  },
});

export const clearCloudProjectImportLeaseInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== args.ownerId) {
      return null;
    }
    await ctx.db.patch(project._id, {
      importLeaseExpiresAt: undefined,
      updatedAt: args.nowMs ?? Date.now(),
    });
    return await ctx.db.get(project._id);
  },
});
export const ensureCloudProjectVolumeInternal = internalAction({
  args: {
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const quotaAdmissionArgs = await readBlaxelWorkspaceVolumeQuotaAdmissionArgs({
      ctx,
      projectId: args.projectId,
    });
    if (!quotaAdmissionArgs.ok) {
      throw new Error(String(quotaAdmissionArgs.code ?? "blaxel_volume_quota_snapshot_failed"));
    }
    const prepared: any = await ctx.runMutation(
      internal.projects.prepareCloudProjectVolumeMaterializationInternal as any,
      {
        projectId: args.projectId,
        nowMs: Date.now(),
        providerVolumeCount: quotaAdmissionArgs.providerVolumeCount,
        providerVolumeLimit: quotaAdmissionArgs.providerVolumeLimit,
        providerVolumeSafetyBuffer: quotaAdmissionArgs.providerVolumeSafetyBuffer,
      },
    );
    if (!prepared?.ok) {
      throw new Error(String(prepared?.code ?? "workspace_volume_admission_failed"));
    }
    return prepared;
  },
});

export const ensureDefaultCloudProjectForOwner = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    return await ensureDefaultProjectInternal({
      ctx,
      ownerId,
      nowMs,
    });
  },
});

export const listCloudProjectsForOwner = query({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const rows = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    return rows
      .filter(isWorkspaceProjectDisplayable)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  },
});

export const createCloudProjectForOwner = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const existingRows = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const accountTier = await resolveWorkspaceResourceAccountTierForOwner({
      ctx,
      ownerId,
    });
    const admission = evaluateWorkspaceProjectCreateAdmission({
      accountTier,
      existingProjectCount: countWorkspaceProjectsForAdmission(existingRows),
    });
    if (!admission.ok) {
      throw new Error(admission.code);
    }

    const projectName = normalizeOptionalProjectString(args.name) ??
      buildNextProjectName(existingRows.filter(isWorkspaceProjectDisplayable));
    const description = normalizeOptionalProjectString(args.description);
    const id = await ctx.db.insert("cloudProjects", {
      ownerId,
      name: projectName,
      description,
      status: "active",
      providerVolumeId: undefined,
      workspaceVolumeRetentionState: DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("project_create_failed");
    return created;
  },
});

export const updateCloudProjectForOwner = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const existing = await ctx.db.get(args.projectId);
    if (!existing || existing.ownerId !== ownerId) {
      throw new Error("project_not_found");
    }
    const nowMs = args.nowMs ?? Date.now();
    const name = normalizeOptionalProjectString(args.name);
    if (!name) throw new Error("project_name_required");
    const description = normalizeOptionalProjectString(args.description);
    await ctx.db.patch(existing._id, {
      name,
      description,
      updatedAt: nowMs,
    });
    const updated = await ctx.db.get(existing._id);
    if (!updated) throw new Error("project_not_found");
    return updated;
  },
});

export const generateCloudProjectImportUploadUrl = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwnerIdForAuthenticatedRequest({
      ctx,
      ownerId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

export const importCloudProjectZipForOwner = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    storageId: v.id("_storage"),
    sourceFilename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const ownerId = args.ownerId ?? userId;
    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      ownerId,
      authSubject,
      projectId: args.projectId,
    });
    if (!project) {
      throw new Error("project_not_found");
    }

    const sourceFilename = String(args.sourceFilename ?? "").trim() || "project.zip";
    if (!sourceFilename.toLowerCase().endsWith(".zip")) {
      throw new Error("project_import_zip_required");
    }

    const downloadUrl = await ctx.storage.getUrl(args.storageId);
    if (!downloadUrl) {
      throw new Error("project_import_file_missing");
    }

    const runId = buildProjectImportRunId(args.projectId);
    try {
      await ctx.runMutation(internal.projects.acquireCloudProjectImportLeaseInternal as any, {
        projectId: args.projectId,
        ownerId,
        nowMs: Date.now(),
      });
      const ensured = await ensureBillableBlaxelWorkspaceComputer({
        ctx,
        projectId: args.projectId,
        ownerId,
        runId,
        lifecycleIntent: "interactive",
        reservationAction: "project_zip_import",
        labels: {
          purpose: "project-zip-import",
          project_id: String(args.projectId),
          owner_id: String(ownerId),
          run_id: runId,
        },
      });
      if (!ensured.ok) {
        throw new Error(ensured.code || ensured.message);
      }

      const archivePath = buildProjectImportArchivePath(args.projectId);
      const imported = await executeBlaxelWorkspaceCommand({
        sandboxName: ensured.providerSandboxId,
        cwd: BLAXEL_WORKSPACE_ROOT,
        command: buildProjectZipImportCommand({
          archiveUrl: downloadUrl,
          zipPath: archivePath,
          workspaceRoot: BLAXEL_WORKSPACE_ROOT,
        }),
        waitForCompletion: true,
        timeoutSeconds: 120,
      });
      if (!imported.ok || imported.exitCode !== 0) {
        throw new Error(
          String(
            imported.ok
              ? imported.stdout ?? ""
              : imported.message,
          ).trim() ||
            "project_import_extract_failed",
        );
      }
      const importSummary = parseProjectImportSummary(imported.stdout ?? "");

      return {
        ok: true as const,
        importedBytes: importSummary.zipBytes,
        sourceFilename,
        importedFiles: importSummary.importedFiles,
        skippedFiles: importSummary.skippedFiles,
        blockedFiles: importSummary.blockedFiles,
        commonRootStripped: importSummary.commonRootStripped,
      };
    } finally {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        // Best-effort cleanup for temporary import archives.
      }
      await ctx.runMutation(internal.projects.clearCloudProjectImportLeaseInternal as any, {
        projectId: args.projectId,
        ownerId,
        nowMs: Date.now(),
      });
    }
  },
});

export const deleteCloudProjectInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== args.ownerId) {
      throw new Error("project_not_found");
    }
    const nowMs = args.nowMs ?? Date.now();
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    let archivedThreadCount = 0;
    for (const thread of threads) {
      if (thread.ownerId !== args.ownerId) continue;
      archivedThreadCount += 1;
      await ctx.db.patch(thread._id, {
        archivedAt: nowMs,
        updatedAt: nowMs,
      });
    }
    await ctx.db.delete(args.projectId);
    return {
      ok: true,
      archivedThreadCount,
    };
  },
});

export const deleteCloudProjectForOwner = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const ownerId = args.ownerId ?? userId;
    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      ownerId,
      authSubject,
      projectId: args.projectId,
    });
    if (!project) throw new Error("project_not_found");
    const importLeaseExpiresAt = Number(project.importLeaseExpiresAt ?? 0);
    if (Number.isFinite(importLeaseExpiresAt) && importLeaseExpiresAt > nowMs) {
      throw new Error("project_import_in_progress");
    }

    const runtimeRuns = (await ctx.runQuery(api.threads.listCloudRuntimeRunsByOwner as any, {
      ownerId,
      authSubject,
      limit: 500,
    })) as Array<{ projectId?: unknown; status?: unknown }> | null;
    const hasRunningRun = Array.isArray(runtimeRuns)
      ? runtimeRuns.some(
          (run) =>
            normalizeIdValue(run?.projectId) === normalizeIdValue(args.projectId) &&
            String(run?.status ?? "").trim().toLowerCase() === "running",
        )
      : false;
    if (hasRunningRun) {
      throw new Error("project_run_in_progress");
    }

    const providerSandboxId = normalizeOptionalVolumeValue(project.providerSandboxId);
    const providerSandboxProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project.providerSandboxProviderId,
      resourceId: providerSandboxId,
    });
    const providerSandboxCreditReservationKey = normalizeOptionalVolumeValue(
      project.providerSandboxCreditReservationKey,
    );
    if (providerSandboxCreditReservationKey) {
      const finalizedLease = await finalizeBillableBlaxelProjectWorkspaceLease({
        ctx,
        projectId: args.projectId,
        ownerId,
        providerSandboxId,
        settlementReason: "workspace_project_deleted",
        releaseReason: "workspace_project_deleted_before_start",
        nowMs,
        requireLedgerWrite: true,
        clearProjectAccounting: false,
      });
      if (!finalizedLease.ok) {
        throw new Error(
          finalizedLease.errorMessage || "workspace_project_lease_finalization_failed",
        );
      }
    }
    if (providerSandboxId && providerSandboxProviderId === "blaxel") {
      const cleanup = await destroyBlaxelWorkspaceSandbox({
        sandboxName: providerSandboxId,
      });
      if (!cleanup.ok) {
        throw new Error(cleanup.message);
      }
    }

    const providerVolumeId = normalizeOptionalVolumeValue(project.providerVolumeId);
    const providerVolumeProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project.providerVolumeProviderId,
      resourceId: providerVolumeId,
    });
    if (providerVolumeId && providerVolumeProviderId === "blaxel") {
      const cleanup = await destroyBlaxelWorkspaceVolume({
        volumeName: providerVolumeId,
      });
      if (!cleanup.ok) {
        throw new Error(cleanup.message);
      }
    }

    return await ctx.runMutation(internal.projects.deleteCloudProjectInternal as any, {
      ownerId,
      projectId: args.projectId,
      nowMs,
    });
  },
});

export const ensureDefaultCloudProjectWithVolumeForOwner = action({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const row = await ctx.runMutation(api.projects.ensureDefaultCloudProjectForOwner as any, {
      ownerId: args.ownerId ?? userId,
      authSubject,
      nowMs: args.nowMs,
    });
    if (!row?._id) throw new Error("default_project_missing_id");
    return await ctx.runAction(internal.projects.ensureCloudProjectVolumeInternal as any, {
      projectId: row._id,
    });
  },
});

export const ensureCloudProjectVolume = action({
  args: {
    projectId: v.id("cloudProjects"),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { authSubject, userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      ownerId: userId,
      authSubject,
      projectId: args.projectId,
    });
    if (!project) throw new Error("project_access_denied");
    return await ctx.runAction(internal.projects.ensureCloudProjectVolumeInternal as any, {
      projectId: args.projectId,
    });
  },
});

export const getCloudProjectById = query({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.projectId);
    if (!row) return null;
    const ownerId = args.authSubject
      ? await resolveOwnerIdForAuthenticatedRequest({
          ctx,
          ownerId: args.ownerId,
          authSubject: args.authSubject ?? null,
        })
      : args.ownerId;
    if (ownerId && row.ownerId !== ownerId) return null;
    return row;
  },
});
