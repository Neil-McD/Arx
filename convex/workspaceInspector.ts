import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import {
  inspectBlaxelWorkspaceComputer,
  listBlaxelWorkspaceDirectory,
  readBlaxelWorkspaceFile,
  releaseBlaxelWorkspaceComputerIfIdle,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  ensureBillableBlaxelWorkspaceComputer,
  finalizeBillableBlaxelProjectWorkspaceLease,
  releaseBillableBlaxelProjectWorkspaceLeaseBestEffort,
} from "./blaxelWorkspaceWake.ts";
import {
  isBlaxelWorkspaceSandboxTerminalState,
} from "./blaxelWorkspaceClient.ts";
import {
  buildBlaxelProjectWorkspaceNames,
} from "./blaxelWorkspaceProjectNames.ts";
import { isWorkspaceTerminalActiveStatus } from "./workspaceTerminalProcessCore";
import {
  resolveRecordedWorkspaceResourceProviderId,
} from "../shared/workspaceComputerProvider";

const DIRECTORY_ENTRY_LIMIT = 200;
const TEXT_PREVIEW_MAX_BYTES = 64 * 1024;
const IMAGE_PREVIEW_MAX_BYTES = 512 * 1024;
const WORKSPACE_INSPECTOR_WAKE_RETRY_AFTER_MS = 1500;

const HEAVY_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const TEXT_EXTENSION_ALLOWLIST = new Set([
  "c",
  "conf",
  "config",
  "css",
  "csv",
  "env",
  "go",
  "html",
  "js",
  "json",
  "jsx",
  "lock",
  "log",
  "md",
  "mdx",
  "mjs",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const TEXT_BASENAME_ALLOWLIST = new Set([
  "dockerfile",
  "gemfile",
  "license",
  "makefile",
  "procfile",
  "readme",
]);

type WorkspaceInspectorFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type WorkspaceInspectorProject = {
  actor: any;
  project: any;
};

type WorkspaceInspectorDirectoryEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
  extension: string | null;
  heavy: boolean;
  previewable: boolean;
};

type WorkspaceInspectorWorkspace = {
  sandboxName: string;
  volumeName: string;
  ownerId: any;
  shouldSettleInspectionLease: boolean;
  creditReservationKey: string | null;
};

function normalizeWorkspacePath(raw: unknown): string {
  const candidate = String(raw ?? "").trim().replaceAll("\\", "/");
  if (!candidate) throw new Error("tool_path_required");
  if (candidate.startsWith("/")) throw new Error("path_outside_workspace");
  const parts = candidate
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new Error("path_outside_workspace");
  }
  const segments =
    parts[0]?.toLowerCase() === "workspace" ? parts.slice(1) : parts;
  if (segments.length === 0) return ".";
  return segments.join("/");
}

function normalizeInspectorPath(raw: unknown):
  | { ok: true; relPath: string }
  | WorkspaceInspectorFailure {
  const candidate = String(raw ?? "").trim();
  try {
    return {
      ok: true,
      relPath: normalizeWorkspacePath(candidate || "."),
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_tool_args";
    return {
      ok: false,
      status: 400,
      code: code || "invalid_tool_args",
      message: "Workspace path is outside the computer workspace.",
    };
  }
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeDirectorySnapshotEntries(
  entries: unknown,
): WorkspaceInspectorDirectoryEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    const record = asRecord(entry);
    const name = String(record?.name ?? "").trim();
    const path = String(record?.path ?? "").trim();
    const type = String(record?.type ?? "").trim();
    if (!name || !path || (type !== "directory" && type !== "file")) return [];
    return [{
      name,
      path,
      type,
      extension: typeof record?.extension === "string" ? record.extension : null,
      heavy: record?.heavy === true,
      previewable: record?.previewable === true,
    }];
  });
}

export const getWorkspaceDirectorySnapshotInternal = internalQuery({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db
      .query("workspaceDirectorySnapshots")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", args.projectId).eq("path", args.path)
      )
      .first();
    if (!snapshot || String(snapshot.ownerId) !== String(args.ownerId)) return null;
    return snapshot;
  },
});

export const upsertWorkspaceDirectorySnapshotInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    path: v.string(),
    providerId: v.optional(v.literal("blaxel")),
    providerSandboxId: v.optional(v.string()),
    entries: v.array(v.object({
      name: v.string(),
      path: v.string(),
      type: v.union(v.literal("directory"), v.literal("file")),
      extension: v.union(v.string(), v.null()),
      heavy: v.boolean(),
      previewable: v.boolean(),
    })),
    truncated: v.boolean(),
    checkedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workspaceDirectorySnapshots")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", args.projectId).eq("path", args.path)
      )
      .first();
    const nowMs = Date.now();
    const row = {
      ownerId: args.ownerId,
      providerId: args.providerId,
      providerSandboxId: args.providerSandboxId,
      entries: args.entries,
      truncated: args.truncated,
      checkedAt: args.checkedAt,
      staleAt: undefined,
      staleReason: undefined,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("workspaceDirectorySnapshots", {
      projectId: args.projectId,
      path: args.path,
      ...row,
      createdAt: nowMs,
    });
  },
});

export const markWorkspaceDirectorySnapshotsStaleInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || String(project.ownerId) !== String(args.ownerId)) {
      return { ok: false, code: "project_not_found" };
    }
    const nowMs = Date.now();
    await ctx.db.patch(args.projectId, {
      workspaceDirectorySnapshotInvalidatedAt: nowMs,
      workspaceDirectorySnapshotInvalidationReason:
        normalizeOptionalString(args.reason) ?? "workspace_mutated",
      updatedAt: nowMs,
    });
    return { ok: true, invalidatedAt: nowMs };
  },
});

function basenameOfPath(path: string): string {
  if (path === ".") return ".";
  return path.split("/").filter(Boolean).pop() ?? path;
}

function extensionOfPath(path: string): string {
  const basename = basenameOfPath(path).toLowerCase();
  const index = basename.lastIndexOf(".");
  return index >= 0 ? basename.slice(index + 1) : "";
}

function isTextPreviewCandidate(path: string): boolean {
  const basename = basenameOfPath(path).toLowerCase();
  const extension = extensionOfPath(path);
  return TEXT_BASENAME_ALLOWLIST.has(basename) || TEXT_EXTENSION_ALLOWLIST.has(extension);
}

function joinWorkspacePath(directoryPath: string, entryPath: string): string {
  const entry = String(entryPath ?? "").replace(/^\.\/+/, "").replace(/^\/+/, "").trim();
  if (!entry) return directoryPath || ".";
  return directoryPath === "." ? entry : `${directoryPath}/${entry}`;
}

function parentWorkspacePath(path: string): string {
  const normalized = String(path ?? "").trim();
  if (!normalized || normalized === ".") return ".";
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? parts.join("/") : ".";
}

function isBlaxelSandboxNotFoundFailure(value: unknown): boolean {
  const record = asRecord(value);
  if (record?.ok !== false) return false;
  const code = String(record.code ?? "").trim();
  if (code === "blaxel_sandbox_not_found") return true;
  if (
    code !== "blaxel_request_failed" &&
    code !== "workspace_inspector_unavailable"
  ) {
    return false;
  }
  const details = asRecord(record.details);
  const text = [
    record.message,
    details?.errorMessage,
    details?.providerCode,
    details?.responseStatus,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return /(?:sandbox|workspace).*not found|not found.*(?:sandbox|workspace)|\b404\b/i
    .test(text);
}

function workspaceProviderTransitionRequiredFailure(params: {
  resourceKind: "sandbox" | "volume" | "terminal";
  actualProviderId: string | null;
  resourceId: string | null;
}): WorkspaceInspectorFailure {
  return {
    ok: false,
    status: 409,
    code: "workspace_provider_transition_required",
    message:
      "This project is currently attached to a different workspace provider. Explicit migration is required before Blaxel can inspect files.",
    details: {
      resource_kind: params.resourceKind,
      actual_provider_id: params.actualProviderId,
      resource_id: params.resourceId,
    },
  };
}

function workspaceProviderResourceMismatchFailure(params: {
  resourceKind: "sandbox" | "volume";
  expectedResourceId: string;
  actualResourceId: string;
}): WorkspaceInspectorFailure {
  return {
    ok: false,
    status: 409,
    code: "workspace_provider_resource_mismatch",
    message:
      "This project is attached to a different Blaxel workspace resource than the expected project workspace.",
    details: {
      resource_kind: params.resourceKind,
      expected_resource_id: params.expectedResourceId,
      actual_resource_id: params.actualResourceId,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function blaxelEntryName(value: unknown): string | null {
  const record = asRecord(value);
  const rawName = String(record?.name ?? "").trim();
  if (rawName) return basenameOfPath(rawName);
  const rawPath = String(record?.path ?? "").trim();
  return rawPath ? basenameOfPath(rawPath) : null;
}

function blaxelEntrySize(value: unknown): number | null {
  const record = asRecord(value);
  const parsed = Number(record?.size);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

type BlaxelDirectoryEntryKind = "file" | "directory" | "missing";

function findBlaxelDirectoryEntry(rawEntries: unknown, relPath: string): {
  kind: BlaxelDirectoryEntryKind;
  entry: unknown | null;
} {
  if (relPath === ".") return { kind: "directory", entry: null };
  const record = asRecord(rawEntries);
  const targetName = basenameOfPath(relPath);
  const files = Array.isArray(record?.files) ? record.files : [];
  const subdirectories = Array.isArray(record?.subdirectories)
    ? record.subdirectories
    : [];
  const directoryEntry = subdirectories.find((entry) => blaxelEntryName(entry) === targetName);
  if (directoryEntry) return { kind: "directory", entry: directoryEntry };
  const fileEntry = files.find((entry) => blaxelEntryName(entry) === targetName);
  if (fileEntry) return { kind: "file", entry: fileEntry };
  return { kind: "missing", entry: null };
}

function isLikelyBinaryText(value: string): boolean {
  if (!value) return false;
  if (value.includes("\0")) return true;
  const sample = value.slice(0, 4096);
  let controlCount = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    const isAllowedControl = code === 9 || code === 10 || code === 13;
    if (code < 32 && !isAllowedControl) controlCount += 1;
  }
  return controlCount > Math.max(8, sample.length * 0.02);
}

function parseBlaxelDirectoryEntries(
  rawEntries: unknown,
  directoryPath: string,
): WorkspaceInspectorDirectoryEntry[] {
  const record = asRecord(rawEntries);
  const files = Array.isArray(record?.files) ? record.files : [];
  const subdirectories = Array.isArray(record?.subdirectories)
    ? record.subdirectories
    : [];
  const rows = [
    ...subdirectories.flatMap((entry) => {
      const name = blaxelEntryName(entry);
      if (!name) return [];
      return [{
        name,
        path: joinWorkspacePath(directoryPath, name),
        type: "directory" as const,
        extension: null,
        heavy: HEAVY_DIRECTORY_NAMES.has(name),
        previewable: false,
      }];
    }),
    ...files.flatMap((entry) => {
      const name = blaxelEntryName(entry);
      if (!name) return [];
      const extension = extensionOfPath(name);
      return [{
        name,
        path: joinWorkspacePath(directoryPath, name),
        type: "file" as const,
        extension,
        heavy: false,
        previewable:
          Boolean(IMAGE_MIME_BY_EXTENSION[extension]) ||
          isTextPreviewCandidate(name),
      }];
    }),
  ];
  return rows
    .sort((left, right) =>
      `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`),
    )
    .slice(0, DIRECTORY_ENTRY_LIMIT);
}

async function ensureBlaxelInspectorWorkspace(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
}): Promise<
  | ({ ok: true } & WorkspaceInspectorWorkspace)
  | WorkspaceInspectorFailure
> {
  const resolvedProject = await resolveInspectorProject(params);
  if (!resolvedProject.ok) return resolvedProject;
  const names = buildBlaxelProjectWorkspaceNames(params.projectId);
  const ownership = await validateBlaxelInspectorWorkspaceOwnership({
    ctx: params.ctx,
    projectId: params.projectId,
    ownerId: resolvedProject.resolved.actor.dbUserId,
    project: resolvedProject.resolved.project,
    sandboxName: names.sandboxName,
    volumeName: names.volumeName,
  });
  if (!ownership.ok) return ownership;

  const volumeName = names.volumeName;

  const existingSandboxId = normalizeOptionalString(
    resolvedProject.resolved.project?.providerSandboxId,
  );
  if (existingSandboxId === names.sandboxName) {
    const inspected = await inspectBlaxelWorkspaceComputer({
      sandboxName: names.sandboxName,
      volumeName,
    });
    if (!inspected.ok) return mapFailure(inspected);
    if (!inspected.exists) {
      await clearBlaxelInspectorWorkspaceState({
        ctx: params.ctx,
        projectId: params.projectId,
        sandboxName: names.sandboxName,
      });
    } else if (isBlaxelWorkspaceSandboxTerminalState(inspected.state)) {
      await clearBlaxelInspectorWorkspaceState({
        ctx: params.ctx,
        projectId: params.projectId,
        sandboxName: names.sandboxName,
      });
    }
  }

  const ensured = await ensureBillableBlaxelWorkspaceComputer({
    ctx: params.ctx,
    projectId: params.projectId,
    ownerId: resolvedProject.resolved.actor.dbUserId,
    lifecycleIntent: "file_inspection",
    reservationAction: "workspace_file_inspection",
    reuseExistingLease: true,
    labels: {
      purpose: "workspace-inspector",
      project_id: String(params.projectId),
      owner_id: String(resolvedProject.resolved.actor.dbUserId),
    },
  });
  if (!ensured.ok) return mapFailure(ensured);
  return {
    ok: true,
    sandboxName: ensured.providerSandboxId,
    volumeName: ensured.projectVolumeId,
    ownerId: resolvedProject.resolved.actor.dbUserId,
    shouldSettleInspectionLease: ensured.reusedExistingLease !== true,
    creditReservationKey: ensured.creditReservationKey ?? null,
  };
}

async function validateBlaxelInspectorWorkspaceOwnership(params: {
  ctx: any;
  projectId: any;
  ownerId: any;
  project: any;
  sandboxName: string;
  volumeName: string;
}): Promise<{ ok: true } | WorkspaceInspectorFailure> {
  const existingSandboxId = normalizeOptionalString(params.project?.providerSandboxId);
  const existingSandboxProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: params.project?.providerSandboxProviderId,
    resourceId: existingSandboxId,
  });
  if (existingSandboxId && existingSandboxProviderId !== "blaxel") {
    return workspaceProviderTransitionRequiredFailure({
      resourceKind: "sandbox",
      actualProviderId: existingSandboxProviderId,
      resourceId: existingSandboxId,
    });
  }
  if (existingSandboxId && existingSandboxId !== params.sandboxName) {
    return workspaceProviderResourceMismatchFailure({
      resourceKind: "sandbox",
      expectedResourceId: params.sandboxName,
      actualResourceId: existingSandboxId,
    });
  }

  const existingVolumeId = normalizeOptionalString(params.project?.providerVolumeId);
  const existingVolumeProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: params.project?.providerVolumeProviderId,
    resourceId: existingVolumeId,
  });
  if (existingVolumeId && existingVolumeProviderId !== "blaxel") {
    return workspaceProviderTransitionRequiredFailure({
      resourceKind: "volume",
      actualProviderId: existingVolumeProviderId,
      resourceId: existingVolumeId,
    });
  }
  if (existingVolumeId && existingVolumeId !== params.volumeName) {
    return workspaceProviderResourceMismatchFailure({
      resourceKind: "volume",
      expectedResourceId: params.volumeName,
      actualResourceId: existingVolumeId,
    });
  }

  const terminalRows = await params.ctx.runQuery(
    internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
    {
      ownerId: params.ownerId,
      projectId: params.projectId,
    },
  ) as any[];
  const conflictingActiveTerminal = Array.isArray(terminalRows)
    ? terminalRows.find(
        (row) =>
          isWorkspaceTerminalActiveStatus(row?.status) &&
          normalizeOptionalString(row?.providerSandboxId) !== params.sandboxName,
      )
    : null;
  if (conflictingActiveTerminal) {
    return workspaceProviderTransitionRequiredFailure({
      resourceKind: "terminal",
      actualProviderId: "blaxel",
      resourceId: normalizeOptionalString(conflictingActiveTerminal.providerSandboxId),
    });
  }

  return { ok: true };
}

async function clearBlaxelInspectorWorkspaceState(params: {
  ctx: any;
  projectId: any;
  sandboxName: string;
}) {
  await params.ctx.runMutation(
    internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any,
    {
      projectId: params.projectId,
      providerSandboxId: params.sandboxName,
      providerSandboxProviderId: "blaxel",
    },
  );
}

async function runWithBlaxelInspectorWorkspace(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
  operation: (workspace: WorkspaceInspectorWorkspace) => Promise<unknown>;
}): Promise<unknown> {
  const names = buildBlaxelProjectWorkspaceNames(params.projectId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const workspace = await ensureBlaxelInspectorWorkspace(params);
    if (!workspace.ok) {
      if (attempt === 0 && isBlaxelSandboxNotFoundFailure(workspace)) {
        await clearBlaxelInspectorWorkspaceState({
          ctx: params.ctx,
          projectId: params.projectId,
          sandboxName: names.sandboxName,
        });
        continue;
      }
      return workspace;
    }

    const operationStartedAt = Date.now();
    let result: unknown;
    try {
      result = await params.operation(workspace);
    } catch (error) {
      if (workspace.shouldSettleInspectionLease) {
        const providerRelease = await releaseBlaxelWorkspaceComputerIfIdle({
          sandboxName: workspace.sandboxName,
        });
        if (providerRelease.ok) {
          await releaseBillableBlaxelProjectWorkspaceLeaseBestEffort({
            ctx: params.ctx,
            projectId: params.projectId,
            ownerId: workspace.ownerId,
            providerSandboxId: workspace.sandboxName,
            releaseReason: "workspace_file_inspection_threw",
            metadata: {
              error_message: error instanceof Error ? error.message : String(error ?? ""),
              provider_release_reason: providerRelease.reason,
              provider_release_confirmed: providerRelease.releaseConfirmed,
              provider_standby_grace_seconds: providerRelease.billableGraceSeconds,
            },
            providerStandbyGraceSeconds: providerRelease.billableGraceSeconds,
            providerReleaseReason: providerRelease.reason,
            providerReleaseConfirmed: providerRelease.releaseConfirmed,
            clearProjectAccounting: true,
          });
        }
      }
      throw error;
    }
    if (workspace.shouldSettleInspectionLease) {
      const resultRecord = asRecord(result);
      if (resultRecord?.ok === true) {
        const providerRelease = await releaseBlaxelWorkspaceComputerIfIdle({
          sandboxName: workspace.sandboxName,
        });
        if (!providerRelease.ok) return result;
        await finalizeBillableBlaxelProjectWorkspaceLease({
          ctx: params.ctx,
          projectId: params.projectId,
          ownerId: workspace.ownerId,
          providerSandboxId: workspace.sandboxName,
          settlementReason: "workspace_file_inspection_completed",
          billableDurationSeconds: (Date.now() - operationStartedAt) / 1000,
          providerStandbyGraceSeconds: providerRelease.billableGraceSeconds,
          providerReleaseReason: providerRelease.reason,
          providerReleaseConfirmed: providerRelease.releaseConfirmed,
          clearProjectAccounting: true,
        });
      } else {
        const providerRelease = await releaseBlaxelWorkspaceComputerIfIdle({
          sandboxName: workspace.sandboxName,
        });
        if (providerRelease.ok) {
          await releaseBillableBlaxelProjectWorkspaceLeaseBestEffort({
            ctx: params.ctx,
            projectId: params.projectId,
            ownerId: workspace.ownerId,
            providerSandboxId: workspace.sandboxName,
            releaseReason: "workspace_file_inspection_no_data_returned",
            metadata: {
              result_code: normalizeOptionalString(resultRecord?.code),
              provider_release_reason: providerRelease.reason,
              provider_release_confirmed: providerRelease.releaseConfirmed,
              provider_standby_grace_seconds: providerRelease.billableGraceSeconds,
            },
            providerStandbyGraceSeconds: providerRelease.billableGraceSeconds,
            providerReleaseReason: providerRelease.reason,
            providerReleaseConfirmed: providerRelease.releaseConfirmed,
            clearProjectAccounting: true,
          });
        }
      }
    }
    return result;
  }

  return {
    ok: false,
    status: 503,
    code: "blaxel_workspace_recreate_failed",
    message: "Workspace is still waking up. Try again in a moment.",
    details: {
      retryAfterMs: WORKSPACE_INSPECTOR_WAKE_RETRY_AFTER_MS,
    },
  };
}

function mapFailure(result: {
  status?: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}): WorkspaceInspectorFailure {
  return {
    ok: false,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : 503,
    code: String(result.code ?? "workspace_inspector_unavailable"),
    message: String(result.message ?? "Workspace inspector unavailable."),
    details: result.details,
  };
}

async function resolveActor(ctx: any, authSubject: string | null | undefined) {
  return await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
    authSubject: authSubject ?? null,
  });
}

async function resolveInspectorProject(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
}): Promise<
  | { ok: true; resolved: WorkspaceInspectorProject }
  | WorkspaceInspectorFailure
> {
  const actor = await resolveActor(params.ctx, params.authSubject);
  const project = await params.ctx.runQuery(api.projects.getCloudProjectById as any, {
    authSubject: params.authSubject ?? null,
    ownerId: actor.dbUserId,
    projectId: params.projectId,
  });
  if (!project) {
    return {
      ok: false,
      status: 404,
      code: "project_not_found",
      message: "Computer not found.",
    };
  }
  return {
    ok: true,
    resolved: { actor, project },
  };
}

async function listBlaxelInspectorDirectory(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
  relPath: string;
  resolvedProject?: WorkspaceInspectorProject;
}): Promise<unknown> {
  return await runWithBlaxelInspectorWorkspace({
    ...params,
    operation: async (workspace) => {
      const listed = await listBlaxelWorkspaceDirectory({
        sandboxName: workspace.sandboxName,
        path: params.relPath,
      });
      if (!listed.ok) return listed;
      const entries = parseBlaxelDirectoryEntries(listed.entries, params.relPath);
      await params.ctx.runMutation(
        internal.workspaceInspector.upsertWorkspaceDirectorySnapshotInternal as any,
        {
          projectId: params.projectId,
          ownerId: params.resolvedProject?.actor?.dbUserId ?? workspace.ownerId,
          path: params.relPath,
          providerId: "blaxel",
          providerSandboxId: workspace.sandboxName,
          entries,
          truncated: entries.length >= DIRECTORY_ENTRY_LIMIT,
          checkedAt: Date.now(),
        },
      );
      return {
        ok: true,
        providerId: "blaxel",
        status: "active",
        path: params.relPath,
        entries,
        truncated: entries.length >= DIRECTORY_ENTRY_LIMIT,
        cached: false,
        checkedAt: Date.now(),
        stale: false,
      };
    },
  });
}

async function readBlaxelInspectorFilePreview(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: any;
  relPath: string;
}): Promise<unknown> {
  return await runWithBlaxelInspectorWorkspace({
    ...params,
    operation: async (workspace) => {
      const parentPath = parentWorkspacePath(params.relPath);
      const parentListing = await listBlaxelWorkspaceDirectory({
        sandboxName: workspace.sandboxName,
        path: parentPath,
      });
      if (!parentListing.ok) return parentListing;

      const target = findBlaxelDirectoryEntry(parentListing.entries, params.relPath);
      if (target.kind === "missing") {
        return {
          ok: false,
          status: 404,
          code: "file_not_found",
          message: "Workspace file not found.",
        };
      }
      if (target.kind === "directory") {
        return {
          ok: true,
          path: params.relPath,
          name: basenameOfPath(params.relPath),
          type: "directory",
          previewKind: "directory",
        };
      }

      const sizeBytes = blaxelEntrySize(target.entry);
      const extension = extensionOfPath(params.relPath);
      const imageMimeType = IMAGE_MIME_BY_EXTENSION[extension] ?? null;
      if (imageMimeType) {
        return {
          ok: true,
          path: params.relPath,
          name: basenameOfPath(params.relPath),
          type: "file",
          previewKind: "unsupported",
          mimeType: imageMimeType,
          sizeBytes,
          reason: "Image preview is not available for Blaxel workspaces yet.",
        };
      }

      if (!isTextPreviewCandidate(params.relPath)) {
        return {
          ok: true,
          path: params.relPath,
          name: basenameOfPath(params.relPath),
          type: "file",
          previewKind: "unsupported",
          sizeBytes,
          reason: "This file type is not previewed yet.",
        };
      }

      if (sizeBytes === null) {
        return {
          ok: true,
          path: params.relPath,
          name: basenameOfPath(params.relPath),
          type: "file",
          previewKind: "unsupported",
          sizeBytes,
          reason: "File size is unavailable, so this file is not previewed.",
        };
      }

      if (typeof sizeBytes === "number" && sizeBytes > TEXT_PREVIEW_MAX_BYTES) {
        return {
          ok: true,
          path: params.relPath,
          name: basenameOfPath(params.relPath),
          type: "file",
          previewKind: "unsupported",
          sizeBytes,
          reason: "Text file is too large to preview in the workspace panel.",
        };
      }

      const read = await readBlaxelWorkspaceFile({
        sandboxName: workspace.sandboxName,
        path: params.relPath,
      });
      if (!read.ok) return read;
      const text = String(read.content ?? "");
      if (isLikelyBinaryText(text)) {
        return {
          ok: true,
          path: params.relPath,
          name: basenameOfPath(params.relPath),
          type: "file",
          previewKind: "unsupported",
          sizeBytes,
          reason: "Binary files are not previewed in the workspace panel.",
        };
      }

      return {
        ok: true,
        path: params.relPath,
        name: basenameOfPath(params.relPath),
        type: "file",
        previewKind: "text",
        sizeBytes,
        text: text.slice(0, TEXT_PREVIEW_MAX_BYTES),
        truncated: text.length > TEXT_PREVIEW_MAX_BYTES,
      };
    },
  });
}

export const listWorkspaceDirectory = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    path: v.optional(v.string()),
    refresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const normalized = normalizeInspectorPath(args.path ?? ".");
    if (!normalized.ok) return normalized;
    const relPath = normalized.relPath;
    const resolvedProject = await resolveInspectorProject({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
    });
    if (!resolvedProject.ok) return resolvedProject;
    if (args.refresh !== true) {
      const cached = await ctx.runQuery(
        internal.workspaceInspector.getWorkspaceDirectorySnapshotInternal as any,
        {
          projectId: args.projectId,
          ownerId: resolvedProject.resolved.actor.dbUserId,
          path: relPath,
        },
      );
      if (cached) {
        const checkedAt = Number(cached.checkedAt ?? cached.updatedAt ?? Date.now());
        const invalidatedAt = Number(
          resolvedProject.resolved.project.workspaceDirectorySnapshotInvalidatedAt ?? 0,
        );
        const stale = Number.isFinite(invalidatedAt) && invalidatedAt >= checkedAt;
        return {
          ok: true,
          providerId: cached.providerId ?? "blaxel",
          status: "active",
          path: relPath,
          entries: normalizeDirectorySnapshotEntries(cached.entries),
          truncated: cached.truncated === true,
          cached: true,
          checkedAt,
          stale: stale || typeof cached.staleAt === "number",
          staleReason: stale
            ? normalizeOptionalString(
                resolvedProject.resolved.project
                  .workspaceDirectorySnapshotInvalidationReason,
              )
            : normalizeOptionalString(cached.staleReason),
        };
      }
    }
    return await listBlaxelInspectorDirectory({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
      relPath,
      resolvedProject: resolvedProject.resolved,
    });
  },
});

export const readWorkspaceFilePreview = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    path: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const normalized = normalizeInspectorPath(args.path);
    if (!normalized.ok) return normalized;
    const relPath = normalized.relPath;
    return await readBlaxelInspectorFilePreview({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
      relPath,
    });
  },
});
