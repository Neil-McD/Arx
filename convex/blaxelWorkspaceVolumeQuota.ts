import { internal } from "./_generated/api";
import {
  readBlaxelWorkspaceVolumeQuotaSnapshot,
} from "./blaxelWorkspaceClient.ts";
import {
  normalizeWorkspaceVolumeRetentionState,
} from "../shared/workspaceProjectResources";

type BlaxelWorkspaceVolumeQuotaAdmissionArgs =
  | {
      ok: true;
      providerVolumeCount?: number;
      providerVolumeLimit?: number;
      providerVolumeSafetyBuffer?: number;
      source: "project_absent" | "existing_volume" | "provider_inventory";
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function hasExistingUndeletedProjectVolume(project: Record<string, unknown>): boolean {
  const existingVolumeId = normalizeOptionalString(project.providerVolumeId);
  if (!existingVolumeId) return false;
  const existingVolumeDeleted =
    normalizeWorkspaceVolumeRetentionState(project.workspaceVolumeRetentionState) ===
      "deleted" ||
    Number(project.workspaceVolumeDeletedAt ?? 0) > 0;
  return !existingVolumeDeleted;
}

export async function readBlaxelWorkspaceVolumeQuotaAdmissionArgs(params: {
  ctx: any;
  projectId: any;
}): Promise<BlaxelWorkspaceVolumeQuotaAdmissionArgs> {
  const project = await params.ctx.runQuery(
    internal.projects.getCloudProjectByIdInternal as any,
    {
      projectId: params.projectId,
    },
  );
  if (!project) {
    return {
      ok: true,
      source: "project_absent",
    };
  }
  if (project && hasExistingUndeletedProjectVolume(project)) {
    return {
      ok: true,
      source: "existing_volume",
    };
  }

  const quotaSnapshot = await readBlaxelWorkspaceVolumeQuotaSnapshot();
  if (!quotaSnapshot.ok) return quotaSnapshot;
  return {
    ok: true,
    providerVolumeCount: quotaSnapshot.providerVolumeCount,
    providerVolumeLimit: quotaSnapshot.providerVolumeLimit ?? undefined,
    providerVolumeSafetyBuffer: quotaSnapshot.providerVolumeSafetyBuffer,
    source: "provider_inventory",
  };
}
