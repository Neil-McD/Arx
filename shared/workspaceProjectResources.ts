import {
  resolveRecordedWorkspaceResourceProviderId,
  type WorkspaceComputerProviderId,
} from "./workspaceComputerProvider.ts";

export const WORKSPACE_VOLUME_RETENTION_STATES = [
  "active",
  "suspended",
  "pending_delete",
  "deleted",
] as const;

export type WorkspaceVolumeRetentionState =
  (typeof WORKSPACE_VOLUME_RETENTION_STATES)[number];

export const DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE =
  "active" satisfies WorkspaceVolumeRetentionState;

export type WorkspaceProjectResourceTruthInput = {
  providerVolumeId?: unknown;
  providerVolumeProviderId?: unknown;
  providerVolumeName?: unknown;
  providerVolumeState?: unknown;
  providerVolumeLastSeenAt?: unknown;
  workspaceVolumeRetentionState?: unknown;
  workspaceVolumeRetainUntil?: unknown;
  workspaceVolumeDeleteAfter?: unknown;
  workspaceVolumeDeletionWarningSentAt?: unknown;
  workspaceVolumeDeletedAt?: unknown;
  workspaceVolumeDeletionReason?: unknown;
  providerSandboxId?: unknown;
  providerSandboxProviderId?: unknown;
  providerSandboxState?: unknown;
  providerSandboxLastSeenAt?: unknown;
  providerSandboxLastActivityAt?: unknown;
  providerSandboxStartedAt?: unknown;
  providerSandboxIdleExpiresAt?: unknown;
};

export type WorkspaceProjectResourceTruth = {
  volume: {
    resourceId: string | null;
    providerId: WorkspaceComputerProviderId | null;
    name: string | null;
    providerState: string | null;
    lastSeenAt: number | null;
    retentionState: WorkspaceVolumeRetentionState;
    retainUntil: number | null;
    deleteAfter: number | null;
    deletionWarningSentAt: number | null;
    deletedAt: number | null;
    deletionReason: string | null;
  };
  sandbox: {
    resourceId: string | null;
    providerId: WorkspaceComputerProviderId | null;
    providerState: string | null;
    lastSeenAt: number | null;
    lastActivityAt: number | null;
    startedAt: number | null;
    idleExpiresAt: number | null;
  };
};

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function isWorkspaceVolumeRetentionState(
  value: unknown,
): value is WorkspaceVolumeRetentionState {
  return WORKSPACE_VOLUME_RETENTION_STATES.includes(
    value as WorkspaceVolumeRetentionState,
  );
}

export function normalizeWorkspaceVolumeRetentionState(
  value: unknown,
): WorkspaceVolumeRetentionState {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isWorkspaceVolumeRetentionState(normalized)
    ? normalized
    : DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE;
}

export function isWorkspaceProjectInactiveStatus(value: unknown): boolean {
  const status = String(value ?? "active").trim().toLowerCase();
  return status.includes("deleted") || status.includes("archived");
}

export function isWorkspaceProjectDisplayable(row: { status?: unknown }): boolean {
  return !isWorkspaceProjectInactiveStatus(row.status);
}

export function resolveWorkspaceProjectResourceTruth(
  row: WorkspaceProjectResourceTruthInput,
): WorkspaceProjectResourceTruth {
  const volumeResourceId = normalizeOptionalString(row.providerVolumeId);
  const sandboxResourceId = normalizeOptionalString(row.providerSandboxId);
  return {
    volume: {
      resourceId: volumeResourceId,
      providerId: resolveRecordedWorkspaceResourceProviderId({
        providerId: row.providerVolumeProviderId,
        resourceId: volumeResourceId,
      }),
      name: normalizeOptionalString(row.providerVolumeName),
      providerState: normalizeOptionalString(row.providerVolumeState),
      lastSeenAt: normalizeOptionalNumber(row.providerVolumeLastSeenAt),
      retentionState: normalizeWorkspaceVolumeRetentionState(
        row.workspaceVolumeRetentionState,
      ),
      retainUntil: normalizeOptionalNumber(row.workspaceVolumeRetainUntil),
      deleteAfter: normalizeOptionalNumber(row.workspaceVolumeDeleteAfter),
      deletionWarningSentAt: normalizeOptionalNumber(
        row.workspaceVolumeDeletionWarningSentAt,
      ),
      deletedAt: normalizeOptionalNumber(row.workspaceVolumeDeletedAt),
      deletionReason: normalizeOptionalString(row.workspaceVolumeDeletionReason),
    },
    sandbox: {
      resourceId: sandboxResourceId,
      providerId: resolveRecordedWorkspaceResourceProviderId({
        providerId: row.providerSandboxProviderId,
        resourceId: sandboxResourceId,
      }),
      providerState: normalizeOptionalString(row.providerSandboxState),
      lastSeenAt: normalizeOptionalNumber(row.providerSandboxLastSeenAt),
      lastActivityAt: normalizeOptionalNumber(row.providerSandboxLastActivityAt),
      startedAt: normalizeOptionalNumber(row.providerSandboxStartedAt),
      idleExpiresAt: normalizeOptionalNumber(row.providerSandboxIdleExpiresAt),
    },
  };
}
