export const WORKSPACE_COMPUTER_PROVIDER_IDS = ["daytona", "blaxel"] as const;

export type WorkspaceComputerProviderId =
  (typeof WORKSPACE_COMPUTER_PROVIDER_IDS)[number];

export const DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID =
  "daytona" satisfies WorkspaceComputerProviderId;

export const WORKSPACE_COMPUTER_PROVIDER_OPERATIONS = [
  "ensureWorkspaceComputer",
  "resolveWorkspaceComputerIfReady",
  "releaseWorkspaceComputerIfIdle",
  "destroyWorkspaceComputer",
  "executeWorkspaceCommand",
  "listWorkspaceDirectory",
  "readWorkspaceFile",
  "writeWorkspaceFile",
  "getWorkspacePreviewUrl",
] as const;

export type WorkspaceComputerProviderOperation =
  (typeof WORKSPACE_COMPUTER_PROVIDER_OPERATIONS)[number];

export type WorkspaceComputerProviderFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type WorkspaceComputerProviderSession = {
  ok: true;
  providerId: WorkspaceComputerProviderId;
  providerSandboxId: string;
  projectVolumeId: string | null;
  workspaceRoot: string;
  startedAt: number;
};

export type WorkspaceComputerProviderResult =
  | WorkspaceComputerProviderSession
  | WorkspaceComputerProviderFailure;

export function isWorkspaceComputerProviderId(
  value: unknown,
): value is WorkspaceComputerProviderId {
  return WORKSPACE_COMPUTER_PROVIDER_IDS.includes(
    value as WorkspaceComputerProviderId,
  );
}

export function normalizeWorkspaceComputerProviderId(
  value: unknown,
): WorkspaceComputerProviderId {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isWorkspaceComputerProviderId(normalized)
    ? normalized
    : DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID;
}
