"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import {
  inspectBlaxelWorkspaceComputer,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  buildBlaxelProjectWorkspaceNames,
} from "./blaxelWorkspaceProjectNames.ts";
import {
  resolveWorkspaceComputerProviderFromServerEnv,
} from "./workspaceComputerProviderPolicy.ts";
import {
  resolveRecordedWorkspaceResourceProviderId,
} from "../shared/workspaceComputerProvider";

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

function normalizeDeploymentKind(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function sanitizeFailure(value: any) {
  return {
    ok: false,
    status: Number.isFinite(Number(value?.status)) ? Number(value.status) : 503,
    code: String(value?.code ?? "diagnostic_failed"),
    message: String(value?.message ?? "Workspace diagnostic failed.").slice(0, 300),
  };
}

function summarizeListResult(value: unknown) {
  const result = value as any;
  if (!result || result.ok !== true) {
    return sanitizeFailure(result);
  }
  const entries = Array.isArray(result.entries) ? result.entries : [];
  return {
    ok: true,
    providerId: normalizeOptionalString(result.providerId),
    status: normalizeOptionalString(result.status),
    path: normalizeOptionalString(result.path),
    entryCount: entries.length,
    entries,
    truncated: result.truncated === true,
  };
}

export const diagnoseBlaxelWorkspaceInspectorProject = action({
  args: {
    authSubject: v.optional(v.string()),
    ownerId: v.optional(v.id("users")),
    projectId: v.id("cloudProjects"),
    path: v.optional(v.string()),
    runList: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const deploymentKind = normalizeDeploymentKind(
      readEnv("POLYNET_DEPLOYMENT_KIND"),
    );
    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    const authSubject = normalizeOptionalString(args.authSubject);

    if (deploymentKind !== "staging") {
      return {
        ok: false,
        code: "blaxel_workspace_inspector_diagnostic_staging_only",
        deploymentKind,
        policy,
      };
    }
    if (!authSubject && !args.ownerId) {
      return {
        ok: false,
        code: "blaxel_workspace_inspector_diagnostic_owner_required",
        deploymentKind,
        policy,
      };
    }
    if (args.runList !== false && !authSubject) {
      return {
        ok: false,
        code: "blaxel_workspace_inspector_diagnostic_auth_subject_required",
        deploymentKind,
        policy,
      };
    }

    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      projectId: args.projectId,
      ...(args.ownerId ? { ownerId: args.ownerId } : null),
      ...(authSubject ? { authSubject } : null),
    });
    if (!project) {
      return {
        ok: false,
        code: "project_not_found",
        deploymentKind,
        policy,
        projectId: String(args.projectId),
      };
    }

    const names = buildBlaxelProjectWorkspaceNames(args.projectId);
    const projectSandboxId = normalizeOptionalString(project.providerSandboxId);
    const projectSandboxProviderId = normalizeOptionalString(
      project.providerSandboxProviderId,
    );
    const projectVolumeId = normalizeOptionalString(project.providerVolumeId);
    const projectVolumeProviderId = normalizeOptionalString(
      project.providerVolumeProviderId,
    );
    const expectedSandboxRecorded =
      !projectSandboxId || projectSandboxId === names.sandboxName;
    const expectedVolumeRecorded =
      !projectVolumeId || projectVolumeId === names.volumeName;

    const projectSandboxOwner = resolveRecordedWorkspaceResourceProviderId({
      providerId: projectSandboxProviderId,
      resourceId: projectSandboxId,
    });
    const inspection = projectSandboxId && projectSandboxOwner === "blaxel"
      ? await inspectBlaxelWorkspaceComputer({
          sandboxName: projectSandboxId,
          volumeName: projectVolumeId ?? names.volumeName,
        })
      : projectSandboxId
        ? {
            ok: false,
            code: "workspace_provider_mismatch",
            message: "Project sandbox is not Blaxel-owned.",
            providerSandboxId: projectSandboxId,
            providerSandboxProviderId: projectSandboxOwner,
          }
        : null;

    const listResult = args.runList === false
      ? null
      : summarizeListResult(
          await ctx.runAction(api.workspaceInspector.listWorkspaceDirectory as any, {
            authSubject,
            projectId: args.projectId,
            path: args.path ?? ".",
          }),
        );

    const refreshedProject = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      projectId: args.projectId,
      ...(args.ownerId ? { ownerId: args.ownerId } : null),
      ...(authSubject ? { authSubject } : null),
    });

    const refreshedSandboxId = normalizeOptionalString(
      refreshedProject?.providerSandboxId,
    );
    const refreshedSandboxProviderId = normalizeOptionalString(
      refreshedProject?.providerSandboxProviderId,
    );
    const refreshedVolumeId = normalizeOptionalString(
      refreshedProject?.providerVolumeId,
    );
    const refreshedVolumeProviderId = normalizeOptionalString(
      refreshedProject?.providerVolumeProviderId,
    );

    return {
      ok:
        policy.providerId === "blaxel" &&
        (!listResult || (listResult as any).ok === true),
      code: "blaxel_workspace_inspector_diagnostic",
      deploymentKind,
      policy,
      project: {
        id: String(project._id),
        ownerId: String(project.ownerId),
        providerVolumeId: projectVolumeId,
        providerVolumeProviderId: projectVolumeProviderId,
        providerSandboxId: projectSandboxId,
        providerSandboxProviderId: projectSandboxProviderId,
        providerSandboxState: normalizeOptionalString(project.providerSandboxState),
        providerSandboxLastSeenAt:
          Number.isFinite(Number(project.providerSandboxLastSeenAt))
            ? Number(project.providerSandboxLastSeenAt)
            : null,
        providerSandboxStartedAt:
          Number.isFinite(Number(project.providerSandboxStartedAt))
            ? Number(project.providerSandboxStartedAt)
            : null,
      },
      expectedNames: names,
      expectedSandboxRecorded,
      expectedVolumeRecorded,
      inspection,
      listResult,
      refreshedProject: refreshedProject
        ? {
            providerVolumeId: refreshedVolumeId,
            providerVolumeProviderId: refreshedVolumeProviderId,
            providerSandboxId: refreshedSandboxId,
            providerSandboxProviderId: refreshedSandboxProviderId,
            providerSandboxState: normalizeOptionalString(
              refreshedProject.providerSandboxState,
            ),
            providerSandboxLastSeenAt:
              Number.isFinite(Number(refreshedProject.providerSandboxLastSeenAt))
                ? Number(refreshedProject.providerSandboxLastSeenAt)
                : null,
          }
        : null,
    };
  },
});
