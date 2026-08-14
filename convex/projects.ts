import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  finalizeBillableBlaxelProjectWorkspaceLease,
} from "./blaxelWorkspaceWake.ts";
import {
  buildBlaxelProjectWorkspaceNames,
} from "./blaxelWorkspaceProjectNames.ts";
import { buildNextDefaultProjectName, formatDefaultProjectName } from "../shared/projectNaming";
import {
  normalizeProjectContextLinks,
  normalizeProjectInstructions,
} from "../shared/projectContext";
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
} from "../shared/workspaceResourceAdmission";
import {
  destroyBlaxelWorkspaceSandbox,
  destroyBlaxelWorkspaceVolume,
} from "./blaxelWorkspaceClient.ts";
import {
  readBlaxelWorkspaceVolumeQuotaAdmissionArgs,
} from "./blaxelWorkspaceVolumeQuota.ts";

const workspaceResourceProviderIdValidator = v.literal("blaxel");

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
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
    name: formatDefaultProjectName(1),
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
  return buildNextDefaultProjectName(existingProjects.map((project) => project.name ?? null));
}

function workspaceResourceAdmissionStatus(code: string): number {
  if (code === "project_not_found") return 404;
  if (
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
  if (code === "project_not_found") return "Project not found.";
  if (code === "project_volume_provider_mismatch") {
    return "This project volume is managed by a different provider.";
  }
  if (code === "project_volume_resource_mismatch") {
    return "This project volume is bound to a different provider resource.";
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

    const ownerProjectRows = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", project.ownerId))
      .collect();
    const admission = evaluateWorkspaceVolumeMaterializationAdmission({
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
    instructions: v.optional(v.string()),
    contextLinks: v.optional(v.array(v.object({
      title: v.optional(v.string()),
      url: v.string(),
    }))),
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
    const admission = evaluateWorkspaceProjectCreateAdmission({
      existingProjectCount: countWorkspaceProjectsForAdmission(existingRows),
    });
    if (!admission.ok) {
      throw new Error(admission.code);
    }

    const projectName = normalizeOptionalProjectString(args.name) ??
      buildNextProjectName(existingRows.filter(isWorkspaceProjectDisplayable));
    const description = normalizeOptionalProjectString(args.description);
    const instructions = normalizeProjectInstructions(args.instructions);
    const contextLinks = normalizeProjectContextLinks(args.contextLinks ?? []);
    const id = await ctx.db.insert("cloudProjects", {
      ownerId,
      name: projectName,
      description,
      instructions,
      contextLinks,
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
    instructions: v.optional(v.string()),
    contextLinks: v.optional(v.array(v.object({
      title: v.optional(v.string()),
      url: v.string(),
    }))),
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
    const patch: any = {
      name,
      description,
      updatedAt: nowMs,
    };
    if (typeof args.instructions === "string") {
      patch.instructions = normalizeProjectInstructions(args.instructions);
    }
    if (Array.isArray(args.contextLinks)) {
      patch.contextLinks = normalizeProjectContextLinks(args.contextLinks);
    }
    await ctx.db.patch(existing._id, patch);
    const updated = await ctx.db.get(existing._id);
    if (!updated) throw new Error("project_not_found");
    return updated;
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
