"use node";

import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import {
  listBlaxelWorkspaceSandboxes,
  listBlaxelWorkspaceVolumes,
  loadBlaxelWorkspaceConfig,
  type BlaxelWorkspaceInventoryResource,
} from "./blaxelWorkspaceClient.ts";
import {
  buildBlaxelProjectWorkspaceNames,
} from "./blaxelWorkspaceProjectNames.ts";
import {
  resolveWorkspaceComputerProviderFromServerEnv,
} from "./workspaceComputerProviderPolicy.ts";
import {
  resolveRecordedWorkspaceResourceProviderId,
} from "../shared/workspaceComputerProvider";
import {
  isWorkspaceProjectInactiveStatus,
} from "../shared/workspaceProjectResources";
import {
  isWorkspaceProjectCountableForAdmission,
} from "../shared/workspaceResourceAdmission";

type ResourceKind = "sandbox" | "volume";

type ProjectInventoryRow = {
  _id: unknown;
  ownerId: unknown;
  name?: unknown;
  status?: unknown;
  providerVolumeId?: unknown;
  providerVolumeProviderId?: unknown;
  providerVolumeState?: unknown;
  providerVolumeLastSeenAt?: unknown;
  providerSandboxId?: unknown;
  providerSandboxProviderId?: unknown;
  providerSandboxState?: unknown;
  providerSandboxLastSeenAt?: unknown;
  workspaceVolumeRetentionState?: unknown;
  workspaceVolumeDeletedAt?: unknown;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeDeploymentKind(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function normalizeLimit(value: unknown): number {
  const parsed = Math.floor(Number(value ?? 500));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(1000, parsed) : 500;
}

function hasOperatorAccess(value: unknown): boolean {
  const role = normalizeString((value as { role?: unknown } | null)?.role).toLowerCase();
  return role === "owner" || role === "operator";
}

function sanitizeFailure(value: any) {
  return {
    ok: false,
    status: Number.isFinite(Number(value?.status)) ? Number(value.status) : 503,
    code: String(value?.code ?? "blaxel_resource_inventory_failed"),
    message: String(value?.message ?? "Blaxel resource inventory failed.").slice(0, 300),
  };
}

function resolveProviderVolumeQuotaSummary(providerVolumeCount: number) {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  const providerVolumeLimit = loadedConfig.ok
    ? loadedConfig.config.providerVolumeLimit
    : null;
  const providerVolumeSafetyBuffer = loadedConfig.ok
    ? loadedConfig.config.providerVolumeSafetyBuffer
    : 0;
  const safeProviderVolumeLimit = providerVolumeLimit === null
    ? null
    : Math.max(0, providerVolumeLimit - providerVolumeSafetyBuffer);
  const availableVolumeSlots = safeProviderVolumeLimit === null
    ? null
    : Math.max(0, safeProviderVolumeLimit - providerVolumeCount);
  return {
    providerVolumeCount,
    providerVolumeLimit,
    providerVolumeSafetyBuffer,
    safeProviderVolumeLimit,
    availableVolumeSlots,
    quotaRisk:
      safeProviderVolumeLimit !== null &&
      providerVolumeCount >= safeProviderVolumeLimit,
  };
}

function resourceMap(resources: BlaxelWorkspaceInventoryResource[]): Map<string, BlaxelWorkspaceInventoryResource> {
  return new Map(
    resources
      .map((resource) => [normalizeString(resource.name), resource] as const)
      .filter(([name]) => Boolean(name)),
  );
}

function projectId(row: ProjectInventoryRow): string {
  return normalizeString(row._id);
}

function projectStatus(row: ProjectInventoryRow): string {
  return normalizeString(row.status || "active").toLowerCase() || "active";
}

function isActiveProject(row: ProjectInventoryRow): boolean {
  return isWorkspaceProjectCountableForAdmission(row);
}

function appendProviderAttachmentMismatchClassification(params: {
  kind: ResourceKind;
  projectId: string;
  expectedSandboxName: string;
  resource: BlaxelWorkspaceInventoryResource;
  classifications: string[];
}) {
  const providerLabelProjectId = normalizeOptionalString(
    params.resource.labels.project_id,
  );
  const attachedTo = normalizeOptionalString(params.resource.attachedTo);
  if (
    (providerLabelProjectId && providerLabelProjectId !== params.projectId) ||
    (
      params.kind === "volume" &&
      attachedTo &&
      attachedTo !== params.expectedSandboxName
    )
  ) {
    params.classifications.push("attached_mismatch");
  }
}

function classifyRecordedResource(params: {
  kind: ResourceKind;
  project: ProjectInventoryRow;
  projectId: string;
  expectedName: string;
  expectedSandboxName: string;
  providerResource: BlaxelWorkspaceInventoryResource | null;
  expectedResource: BlaxelWorkspaceInventoryResource | null;
}): {
  recordedId: string | null;
  recordedProviderId: string | null;
  expectedName: string;
  matchedName: string | null;
  state: string | null;
  classifications: string[];
} {
  const recordedId = params.kind === "volume"
    ? normalizeOptionalString(params.project.providerVolumeId)
    : normalizeOptionalString(params.project.providerSandboxId);
  const rawProviderId = params.kind === "volume"
    ? params.project.providerVolumeProviderId
    : params.project.providerSandboxProviderId;
  const recordedProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: rawProviderId,
    resourceId: recordedId,
  });
  const expectedResource = params.expectedResource;
  const providerResource = params.providerResource;
  const classifications: string[] = [];
  let matchedName: string | null = null;
  let state: string | null = null;

  if (recordedId && recordedProviderId !== "blaxel") {
    classifications.push("provider_owner_mismatch");
    return {
      recordedId,
      recordedProviderId,
      expectedName: params.expectedName,
      matchedName: null,
      state: null,
      classifications,
    };
  }

  if (recordedId && providerResource) {
    matchedName = providerResource.name;
    state = providerResource.status;
    classifications.push("matched");
    if (recordedId !== params.expectedName) {
      classifications.push("unexpected_name_mismatch");
    }
    appendProviderAttachmentMismatchClassification({
      kind: params.kind,
      projectId: params.projectId,
      expectedSandboxName: params.expectedSandboxName,
      resource: providerResource,
      classifications,
    });
  } else if (recordedId) {
    classifications.push(
      params.kind === "volume"
        ? "missing_provider_volume"
        : "missing_provider_sandbox",
    );
  } else if (expectedResource) {
    matchedName = expectedResource.name;
    state = expectedResource.status;
    classifications.push(
      params.kind === "volume"
        ? "unrecorded_provider_volume"
        : "unrecorded_provider_sandbox",
    );
    appendProviderAttachmentMismatchClassification({
      kind: params.kind,
      projectId: params.projectId,
      expectedSandboxName: params.expectedSandboxName,
      resource: expectedResource,
      classifications,
    });
  } else {
    classifications.push(
      params.kind === "volume"
        ? "no_volume_recorded"
        : "no_sandbox_recorded",
    );
  }

  return {
    recordedId,
    recordedProviderId,
    expectedName: params.expectedName,
    matchedName,
    state,
    classifications,
  };
}

function classifyUnmatchedProviderResource(params: {
  kind: ResourceKind;
  resource: BlaxelWorkspaceInventoryResource;
}): "probe_resource" | "orphan_volume" | "orphan_sandbox" | "unknown_unowned_resource" {
  const labels = params.resource.labels;
  const owner = normalizeString(labels.owner).toLowerCase();
  const provider = normalizeString(labels.provider).toLowerCase();
  const purpose = normalizeString(labels.purpose).toLowerCase();
  if (
    purpose.includes("smoke") ||
    purpose.includes("probe") ||
    purpose.includes("proof") ||
    purpose.includes("diagnostic")
  ) {
    return "probe_resource";
  }
  if (owner === "polynet" || provider === "blaxel" || params.resource.name.startsWith("pn-p-")) {
    return params.kind === "volume" ? "orphan_volume" : "orphan_sandbox";
  }
  return "unknown_unowned_resource";
}

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function isBlaxelOwnedRecordedSandbox(row: ProjectInventoryRow): boolean {
  const recordedSandboxId = normalizeOptionalString(row.providerSandboxId);
  if (!recordedSandboxId) return false;
  return resolveRecordedWorkspaceResourceProviderId({
    providerId: row.providerSandboxProviderId,
    resourceId: recordedSandboxId,
  }) === "blaxel";
}

function isLegacyRecordedWorkspaceResource(params: {
  resourceId: unknown;
  providerId: unknown;
}): boolean {
  const resourceId = normalizeOptionalString(params.resourceId);
  if (!resourceId) return false;
  return resolveRecordedWorkspaceResourceProviderId({
    providerId: params.providerId,
    resourceId,
  }) !== "blaxel";
}

export const diagnoseBlaxelWorkspaceResourceInventory = action({
  args: {
    authSubject: v.string(),
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    const operatorAccess = await ctx.runQuery(
      (api as any).operatorAccess.getMyOperatorAccessOptional,
      {
        authSubject: args.authSubject,
      },
    );
    if (!hasOperatorAccess(operatorAccess)) {
      return {
        ok: false,
        code: "blaxel_resource_inventory_operator_access_required",
        deploymentKind,
        policy,
      };
    }

    return await diagnoseBlaxelWorkspaceResourceInventoryCore(ctx, args);
  },
});

export const diagnoseBlaxelWorkspaceResourceInventoryInternal = internalAction({
  args: {
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    if (deploymentKind !== "staging") {
      return {
        ok: false,
        code: "blaxel_resource_inventory_internal_staging_only",
        deploymentKind,
        policy,
      };
    }
    return await diagnoseBlaxelWorkspaceResourceInventoryCore(ctx, args);
  },
});

export const reconcileBlaxelWorkspaceSandboxPointersInternal = internalAction({
  args: {
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    if (deploymentKind !== "staging") {
      return {
        ok: false,
        code: "blaxel_sandbox_pointer_reconcile_staging_only",
        deploymentKind,
        policy,
      };
    }
    const dryRun = args.dryRun !== false;
    const [projectRows, sandboxesResult] = await Promise.all([
      ctx.runQuery(
        internal.projects.listCloudProjectsForWorkspaceResourceInventoryInternal as any,
        {
          ...(args.ownerId ? { ownerId: args.ownerId } : null),
          limit: normalizeLimit(args.limit),
        },
      ) as Promise<ProjectInventoryRow[]>,
      listBlaxelWorkspaceSandboxes(),
    ]);
    if (sandboxesResult.ok !== true) {
      return {
        ok: false,
        code: "blaxel_sandbox_pointer_reconcile_provider_request_failed",
        deploymentKind,
        policy,
        sandboxes: sanitizeFailure(sandboxesResult),
      };
    }

    const providerSandboxNames = new Set(
      sandboxesResult.resources.map((resource) => resource.name),
    );
    const candidates = projectRows.flatMap((project) => {
      const recordedSandboxId = normalizeOptionalString(project.providerSandboxId);
      if (!recordedSandboxId || !isBlaxelOwnedRecordedSandbox(project)) return [];
      if (providerSandboxNames.has(recordedSandboxId)) return [];
      return [{
        projectId: projectId(project),
        ownerId: normalizeString(project.ownerId),
        name: normalizeOptionalString(project.name),
        status: projectStatus(project),
        active: isActiveProject(project),
        recordedSandboxId,
        recordedProviderId: "blaxel" as const,
        action: "clear_missing_blaxel_sandbox_pointer" as const,
      }];
    });

    const cleared: Array<{
      projectId: string;
      recordedSandboxId: string;
      cleared: boolean;
    }> = [];
    if (!dryRun) {
      for (const candidate of candidates) {
        const updated = await ctx.runMutation(
          internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any,
          {
            projectId: candidate.projectId,
            providerSandboxId: candidate.recordedSandboxId,
            providerSandboxProviderId: "blaxel",
          },
        ) as { providerSandboxId?: unknown } | null;
        cleared.push({
          projectId: candidate.projectId,
          recordedSandboxId: candidate.recordedSandboxId,
          cleared: normalizeOptionalString(updated?.providerSandboxId) !== candidate.recordedSandboxId,
        });
      }
    }

    return {
      ok: true,
      code: "blaxel_sandbox_pointer_reconcile",
      deploymentKind,
      policy,
      dryRun,
      summary: {
        projectRows: projectRows.length,
        providerSandboxes: sandboxesResult.resources.length,
        staleSandboxPointers: candidates.length,
        clearedSandboxPointers: cleared.filter((row) => row.cleared).length,
      },
      candidates,
      cleared,
    };
  },
});

export const reconcileInactiveLegacyWorkspaceProjectPointersInternal = internalAction({
  args: {
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    if (deploymentKind !== "staging") {
      return {
        ok: false,
        code: "inactive_legacy_workspace_pointer_reconcile_staging_only",
        deploymentKind,
        policy,
      };
    }
    const dryRun = args.dryRun !== false;
    const projectRows = await ctx.runQuery(
      internal.projects.listCloudProjectsForWorkspaceResourceInventoryInternal as any,
      {
        ...(args.ownerId ? { ownerId: args.ownerId } : null),
        limit: normalizeLimit(args.limit),
      },
    ) as ProjectInventoryRow[];

    const candidates = projectRows.flatMap((project) => {
      const status = projectStatus(project);
      if (!isWorkspaceProjectInactiveStatus(status)) return [];
      const recordedVolumeId = normalizeOptionalString(project.providerVolumeId);
      const recordedSandboxId = normalizeOptionalString(project.providerSandboxId);
      const clearLegacyVolumePointer = isLegacyRecordedWorkspaceResource({
        resourceId: recordedVolumeId,
        providerId: project.providerVolumeProviderId,
      });
      const clearLegacySandboxPointer = isLegacyRecordedWorkspaceResource({
        resourceId: recordedSandboxId,
        providerId: project.providerSandboxProviderId,
      });
      if (!clearLegacyVolumePointer && !clearLegacySandboxPointer) return [];
      return [{
        projectId: projectId(project),
        ownerId: normalizeString(project.ownerId),
        name: normalizeOptionalString(project.name),
        status,
        active: isActiveProject(project),
        recordedVolumeId: clearLegacyVolumePointer ? recordedVolumeId : null,
        recordedSandboxId: clearLegacySandboxPointer ? recordedSandboxId : null,
        action: "clear_inactive_legacy_provider_pointers" as const,
      }];
    });

    const cleared: Array<{
      projectId: string;
      clearedVolumePointer: boolean;
      clearedSandboxPointer: boolean;
    }> = [];
    if (!dryRun) {
      for (const candidate of candidates) {
        const updated = await ctx.runMutation(
          internal.projects.clearInactiveLegacyWorkspaceProjectProviderPointersInternal as any,
          {
            projectId: candidate.projectId,
            expectedStatus: candidate.status,
            ...(candidate.recordedVolumeId
              ? { expectedProviderVolumeId: candidate.recordedVolumeId }
              : {}),
            ...(candidate.recordedSandboxId
              ? { expectedProviderSandboxId: candidate.recordedSandboxId }
              : {}),
          },
        ) as {
          providerVolumeId?: unknown;
          providerSandboxId?: unknown;
        } | null;
        cleared.push({
          projectId: candidate.projectId,
          clearedVolumePointer: candidate.recordedVolumeId
            ? normalizeOptionalString(updated?.providerVolumeId) !== candidate.recordedVolumeId
            : false,
          clearedSandboxPointer: candidate.recordedSandboxId
            ? normalizeOptionalString(updated?.providerSandboxId) !== candidate.recordedSandboxId
            : false,
        });
      }
    }

    return {
      ok: true,
      code: "inactive_legacy_workspace_pointer_reconcile",
      deploymentKind,
      policy,
      dryRun,
      summary: {
        projectRows: projectRows.length,
        inactiveLegacyPointerRows: candidates.length,
        clearedVolumePointers: cleared.filter((row) => row.clearedVolumePointer).length,
        clearedSandboxPointers: cleared.filter((row) => row.clearedSandboxPointer).length,
      },
      candidates,
      cleared,
    };
  },
});

async function diagnoseBlaxelWorkspaceResourceInventoryCore(
  ctx: any,
  args: {
    ownerId?: unknown;
    limit?: unknown;
  },
): Promise<unknown> {
  const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
  const policy = resolveWorkspaceComputerProviderFromServerEnv();

  const [projectRows, sandboxesResult, volumesResult] = await Promise.all([
    ctx.runQuery(
      internal.projects.listCloudProjectsForWorkspaceResourceInventoryInternal as any,
      {
        ...(args.ownerId ? { ownerId: args.ownerId } : null),
        limit: normalizeLimit(args.limit),
      },
    ) as Promise<ProjectInventoryRow[]>,
    listBlaxelWorkspaceSandboxes(),
    listBlaxelWorkspaceVolumes(),
  ]);

  if (sandboxesResult.ok !== true || volumesResult.ok !== true) {
    return {
      ok: false,
      code: "blaxel_resource_inventory_provider_request_failed",
      deploymentKind,
      policy,
      sandboxes: sandboxesResult.ok === true ? null : sanitizeFailure(sandboxesResult),
      volumes: volumesResult.ok === true ? null : sanitizeFailure(volumesResult),
    };
  }

  const sandboxByName = resourceMap(sandboxesResult.resources);
  const volumeByName = resourceMap(volumesResult.resources);
  const matchedSandboxNames = new Set<string>();
  const matchedVolumeNames = new Set<string>();
  const classificationCounts: Record<string, number> = {};
  const providerVolumeQuota = resolveProviderVolumeQuotaSummary(
    volumesResult.rawCount,
  );
  if (providerVolumeQuota.quotaRisk) {
    increment(classificationCounts, "quota_risk");
  }

  const projects = projectRows.map((project) => {
    const id = projectId(project);
    const expectedNames = buildBlaxelProjectWorkspaceNames(id);
    const recordedVolumeId = normalizeOptionalString(project.providerVolumeId);
    const recordedSandboxId = normalizeOptionalString(project.providerSandboxId);
    const expectedVolume = volumeByName.get(expectedNames.volumeName) ?? null;
    const expectedSandbox = sandboxByName.get(expectedNames.sandboxName) ?? null;
    const recordedVolume = recordedVolumeId ? volumeByName.get(recordedVolumeId) ?? null : null;
    const recordedSandbox = recordedSandboxId ? sandboxByName.get(recordedSandboxId) ?? null : null;
    const volume = classifyRecordedResource({
      kind: "volume",
      project,
      projectId: id,
      expectedName: expectedNames.volumeName,
      expectedSandboxName: expectedNames.sandboxName,
      providerResource: recordedVolume,
      expectedResource: expectedVolume,
    });
    const sandbox = classifyRecordedResource({
      kind: "sandbox",
      project,
      projectId: id,
      expectedName: expectedNames.sandboxName,
      expectedSandboxName: expectedNames.sandboxName,
      providerResource: recordedSandbox,
      expectedResource: expectedSandbox,
    });
    if (volume.matchedName) matchedVolumeNames.add(volume.matchedName);
    if (sandbox.matchedName) matchedSandboxNames.add(sandbox.matchedName);
    for (const classification of [...volume.classifications, ...sandbox.classifications]) {
      increment(classificationCounts, classification);
    }
    return {
      projectId: id,
      ownerId: normalizeString(project.ownerId),
      name: normalizeOptionalString(project.name),
      status: projectStatus(project),
      active: isActiveProject(project),
      volume,
      sandbox,
      expectedNames,
      retention: {
        state: normalizeOptionalString(project.workspaceVolumeRetentionState),
        deletedAt: Number.isFinite(Number(project.workspaceVolumeDeletedAt))
          ? Number(project.workspaceVolumeDeletedAt)
          : null,
      },
    };
  });

  const unmatchedVolumes = volumesResult.resources
    .filter((resource) => !matchedVolumeNames.has(resource.name))
    .map((resource) => {
      const classification = classifyUnmatchedProviderResource({ kind: "volume", resource });
      increment(classificationCounts, classification);
      return {
        ...resource,
        classification,
      };
    });
  const unmatchedSandboxes = sandboxesResult.resources
    .filter((resource) => !matchedSandboxNames.has(resource.name))
    .map((resource) => {
      const classification = classifyUnmatchedProviderResource({ kind: "sandbox", resource });
      increment(classificationCounts, classification);
      return {
        ...resource,
        classification,
      };
    });

  const activeProjectCount = projects.filter((project) => project.active).length;
  return {
    ok: true,
    code: "blaxel_resource_inventory",
    deploymentKind,
    policy,
    summary: {
      projectRows: projects.length,
      activeProjectRows: activeProjectCount,
      recordedProjectVolumes: projects.filter((project) => project.volume.recordedId).length,
      recordedProjectSandboxes: projects.filter((project) => project.sandbox.recordedId).length,
      providerVolumes: volumesResult.resources.length,
      providerSandboxes: sandboxesResult.resources.length,
      matchedVolumes: matchedVolumeNames.size,
      matchedSandboxes: matchedSandboxNames.size,
      orphanVolumes: unmatchedVolumes.filter((resource) => resource.classification === "orphan_volume").length,
      orphanSandboxes: unmatchedSandboxes.filter((resource) => resource.classification === "orphan_sandbox").length,
      probeResources: [
        ...unmatchedVolumes,
        ...unmatchedSandboxes,
      ].filter((resource) => resource.classification === "probe_resource").length,
      missingProviderResources:
        (classificationCounts.missing_provider_volume ?? 0) +
        (classificationCounts.missing_provider_sandbox ?? 0),
      providerOwnerMismatches: classificationCounts.provider_owner_mismatch ?? 0,
      attachedMismatches: classificationCounts.attached_mismatch ?? 0,
      quotaRisk: providerVolumeQuota.quotaRisk,
      classificationCounts,
    },
    projects,
    provider: {
      volumes: {
        rawCount: volumesResult.rawCount,
        sanitizedCount: volumesResult.resources.length,
        quota: providerVolumeQuota,
        unmatched: unmatchedVolumes,
      },
      sandboxes: {
        rawCount: sandboxesResult.rawCount,
        sanitizedCount: sandboxesResult.resources.length,
        unmatched: unmatchedSandboxes,
      },
    },
  };
}
