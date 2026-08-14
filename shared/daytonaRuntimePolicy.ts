export type DaytonaRuntimeTargetLifecycleMode =
  | "prepared_staging_reuse"
  | "thread_ephemeral"
  | "per_turn_ephemeral";

export const DAYTONA_WORKSPACE_ROOT = "/home/daytona/workspace";
export const DAYTONA_DEFAULT_PREVIEW_LEASE_MINUTES = 30;
export const DAYTONA_DEFAULT_HUMAN_SAVE_RETENTION_MINUTES = 120;
export const DAYTONA_MAX_HUMAN_SAVE_RETENTION_MINUTES = 8 * 60;
export const DAYTONA_DEFAULT_AUTO_STOP_MINUTES = 30;
export const DAYTONA_DEFAULT_AUTO_ARCHIVE_MINUTES = 60;
export const DAYTONA_DEFAULT_AUTO_DELETE_MINUTES = 180;

export function defaultDaytonaProviderEphemeralForLifecycleMode(
  lifecycleMode: DaytonaRuntimeTargetLifecycleMode,
): boolean {
  return lifecycleMode === "per_turn_ephemeral";
}

export const DAYTONA_RUNTIME_POLICY = {
  id: "daytona_runtime_policy_v1",
  daytonaSandbox: {
    workspaceRoot: DAYTONA_WORKSPACE_ROOT,
    publicPreview: false,
    autoStopIntervalMinutes: DAYTONA_DEFAULT_AUTO_STOP_MINUTES,
    autoArchiveIntervalMinutes: DAYTONA_DEFAULT_AUTO_ARCHIVE_MINUTES,
    autoDeleteIntervalMinutes: DAYTONA_DEFAULT_AUTO_DELETE_MINUTES,
    previewLeaseMinutes: DAYTONA_DEFAULT_PREVIEW_LEASE_MINUTES,
    humanSaveRetentionMinutes: DAYTONA_DEFAULT_HUMAN_SAVE_RETENTION_MINUTES,
    maxHumanSaveRetentionMinutes: DAYTONA_MAX_HUMAN_SAVE_RETENTION_MINUTES,
    providerEphemeralByLifecycle: {
      thread_ephemeral: false,
      per_turn_ephemeral: true,
    },
    defaultResources: {
      cpu: 2,
      memory: 4,
      disk: 8,
    },
  },
} as const;
