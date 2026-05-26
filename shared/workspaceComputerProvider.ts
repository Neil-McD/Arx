export const WORKSPACE_COMPUTER_PROVIDER_IDS = ["daytona", "blaxel"] as const;

export type WorkspaceComputerProviderId =
  (typeof WORKSPACE_COMPUTER_PROVIDER_IDS)[number];

export const DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID =
  "daytona" satisfies WorkspaceComputerProviderId;

export const WORKSPACE_COMPUTER_LIFECYCLE_INTENTS = [
  "file_inspection",
  "interactive",
  "agent_run",
] as const;

export type WorkspaceComputerLifecycleIntent =
  (typeof WORKSPACE_COMPUTER_LIFECYCLE_INTENTS)[number];

export const DEFAULT_WORKSPACE_COMPUTER_LIFECYCLE_INTENT =
  "interactive" satisfies WorkspaceComputerLifecycleIntent;

export const WORKSPACE_COMPUTER_LIFECYCLE_POLICY = {
  file_inspection: {
    idleDeleteAfter: "5m",
    maxAgeDeleteAfter: "1h",
    allowActiveRunPastMaxAge: false,
  },
  interactive: {
    idleDeleteAfter: "30m",
    maxAgeDeleteAfter: "1h",
    allowActiveRunPastMaxAge: false,
  },
  agent_run: {
    idleDeleteAfter: "30m",
    maxAgeDeleteAfter: null,
    allowActiveRunPastMaxAge: true,
  },
} as const satisfies Record<
  WorkspaceComputerLifecycleIntent,
  {
    idleDeleteAfter: string;
    maxAgeDeleteAfter: string | null;
    allowActiveRunPastMaxAge: boolean;
  }
>;

export const WORKSPACE_COMPUTER_LIFECYCLE_INTENT_RANK = {
  file_inspection: 1,
  interactive: 2,
  agent_run: 3,
} as const satisfies Record<WorkspaceComputerLifecycleIntent, number>;

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

export function normalizeRecordedWorkspaceResourceProviderId(
  value: unknown,
): WorkspaceComputerProviderId | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isWorkspaceComputerProviderId(normalized) ? normalized : null;
}

export function resolveRecordedWorkspaceResourceProviderId(params: {
  providerId: unknown;
  resourceId: unknown;
}): WorkspaceComputerProviderId | null {
  const providerId = normalizeRecordedWorkspaceResourceProviderId(params.providerId);
  if (providerId) return providerId;
  const resourceId = String(params.resourceId ?? "").trim();
  if (!resourceId) return null;
  return resourceId.startsWith("pn-p-") ? "blaxel" : "daytona";
}

export function isWorkspaceComputerLifecycleIntent(
  value: unknown,
): value is WorkspaceComputerLifecycleIntent {
  return WORKSPACE_COMPUTER_LIFECYCLE_INTENTS.includes(
    value as WorkspaceComputerLifecycleIntent,
  );
}

export function normalizeWorkspaceComputerLifecycleIntent(
  value: unknown,
): WorkspaceComputerLifecycleIntent {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isWorkspaceComputerLifecycleIntent(normalized)
    ? normalized
    : DEFAULT_WORKSPACE_COMPUTER_LIFECYCLE_INTENT;
}

export function compareWorkspaceComputerLifecycleIntents(
  currentIntent: unknown,
  requestedIntent: unknown,
): number {
  const current = normalizeWorkspaceComputerLifecycleIntent(currentIntent);
  const requested = normalizeWorkspaceComputerLifecycleIntent(requestedIntent);
  return WORKSPACE_COMPUTER_LIFECYCLE_INTENT_RANK[current] -
    WORKSPACE_COMPUTER_LIFECYCLE_INTENT_RANK[requested];
}

export function resolveStrongestWorkspaceComputerLifecycleIntent(
  intents: readonly WorkspaceComputerLifecycleIntent[],
): WorkspaceComputerLifecycleIntent | null {
  let strongest: WorkspaceComputerLifecycleIntent | null = null;
  for (const intent of intents) {
    if (
      strongest === null ||
      compareWorkspaceComputerLifecycleIntents(strongest, intent) < 0
    ) {
      strongest = intent;
    }
  }
  return strongest;
}
