import {
  isWorkspaceProjectInactiveStatus,
  normalizeWorkspaceVolumeRetentionState,
} from "./workspaceProjectResources.ts";

export const WORKSPACE_PROJECT_VOLUME_LIMIT = 5;

export type WorkspaceResourceAdmissionCode =
  | "ok"
  | "project_limit_reached"
  | "workspace_volume_limit_reached"
  | "workspace_provider_volume_quota_headroom_exhausted";

export type WorkspaceResourceAdmissionDecision = {
  ok: boolean;
  code: WorkspaceResourceAdmissionCode;
  limit: number | null;
  currentCount: number;
  requestedCount: number;
  message: string;
};

export type WorkspaceProjectAdmissionRow = {
  status?: unknown;
  providerVolumeId?: unknown;
  provider_volume_id?: unknown;
  workspaceVolumeRetentionState?: unknown;
  volume_retention_state?: unknown;
  workspaceVolumeDeletedAt?: unknown;
  volume_deleted_at?: unknown;
};

function normalizeCount(value: unknown): number {
  const parsed = Math.floor(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeOptionalLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function isWorkspaceProjectCountableForAdmission(
  row: WorkspaceProjectAdmissionRow,
): boolean {
  if (isWorkspaceProjectInactiveStatus(row.status)) return false;
  if (Number(row.workspaceVolumeDeletedAt ?? row.volume_deleted_at ?? 0) > 0) return false;
  return normalizeWorkspaceVolumeRetentionState(
    row.workspaceVolumeRetentionState ?? row.volume_retention_state,
  ) !== "deleted";
}

export function countWorkspaceProjectsForAdmission(
  rows: WorkspaceProjectAdmissionRow[],
): number {
  return rows.filter(isWorkspaceProjectCountableForAdmission).length;
}

export function countWorkspaceVolumesForAdmission(
  rows: WorkspaceProjectAdmissionRow[],
): number {
  return rows.filter((row) =>
    isWorkspaceProjectCountableForAdmission(row) &&
    String(row.providerVolumeId ?? row.provider_volume_id ?? "").trim().length > 0
  ).length;
}

function limitDecision(params: {
  code: WorkspaceResourceAdmissionCode;
  limit: number | null;
  currentCount: number;
  requestedCount: number;
  message: string;
}): WorkspaceResourceAdmissionDecision {
  return {
    ok: params.code === "ok",
    code: params.code,
    limit: params.limit,
    currentCount: params.currentCount,
    requestedCount: params.requestedCount,
    message: params.message,
  };
}

export function evaluateWorkspaceProjectCreateAdmission(params: {
  existingProjectCount: number;
  requestedProjectCount?: number;
}): WorkspaceResourceAdmissionDecision {
  const currentCount = normalizeCount(params.existingProjectCount);
  const requestedCount = normalizeCount(params.requestedProjectCount ?? 1);
  if (currentCount + requestedCount > WORKSPACE_PROJECT_VOLUME_LIMIT) {
    return limitDecision({
      code: "project_limit_reached",
      limit: WORKSPACE_PROJECT_VOLUME_LIMIT,
      currentCount,
      requestedCount,
      message: `Workspace accounts are limited to ${WORKSPACE_PROJECT_VOLUME_LIMIT} projects.`,
    });
  }
  return limitDecision({
    code: "ok",
    limit: WORKSPACE_PROJECT_VOLUME_LIMIT,
    currentCount,
    requestedCount,
    message: "Workspace project admission allowed.",
  });
}

export function evaluateWorkspaceVolumeMaterializationAdmission(params: {
  existingVolumeCount: number;
  requestedVolumeCount?: number;
  providerVolumeCount?: number | null;
  providerVolumeLimit?: number | null;
  providerVolumeSafetyBuffer?: number | null;
}): WorkspaceResourceAdmissionDecision {
  const currentCount = normalizeCount(params.existingVolumeCount);
  const requestedCount = normalizeCount(params.requestedVolumeCount ?? 1);
  if (currentCount + requestedCount > WORKSPACE_PROJECT_VOLUME_LIMIT) {
    return limitDecision({
      code: "workspace_volume_limit_reached",
      limit: WORKSPACE_PROJECT_VOLUME_LIMIT,
      currentCount,
      requestedCount,
      message: `Workspace accounts are limited to ${WORKSPACE_PROJECT_VOLUME_LIMIT} project volumes.`,
    });
  }

  const providerVolumeLimit = normalizeOptionalLimit(params.providerVolumeLimit);
  const providerVolumeCount = normalizeOptionalLimit(params.providerVolumeCount);
  const safetyBuffer = normalizeCount(params.providerVolumeSafetyBuffer ?? 0);
  if (providerVolumeLimit !== null && providerVolumeCount !== null) {
    const usableLimit = Math.max(0, providerVolumeLimit - safetyBuffer);
    if (providerVolumeCount + requestedCount > usableLimit) {
      return limitDecision({
        code: "workspace_provider_volume_quota_headroom_exhausted",
        limit: usableLimit,
        currentCount: providerVolumeCount,
        requestedCount,
        message: "Workspace storage provider quota has no safe headroom.",
      });
    }
  }

  return limitDecision({
    code: "ok",
    limit: WORKSPACE_PROJECT_VOLUME_LIMIT,
    currentCount,
    requestedCount,
    message: "Workspace volume admission allowed.",
  });
}
