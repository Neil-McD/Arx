import {
  getSpendableWorkspaceToolBalanceCredits,
  getUncollectedWorkspaceToolBalanceCredits,
  type WorkspaceCreditBalanceLike,
} from "./workspaceCredits.ts";
import {
  isWorkspaceProjectInactiveStatus,
  normalizeWorkspaceVolumeRetentionState,
} from "./workspaceProjectResources.ts";

export const WORKSPACE_FREE_PROJECT_VOLUME_LIMIT = 1;
export const WORKSPACE_PAID_PROJECT_VOLUME_LIMIT = 5;

export type WorkspaceResourceAccountTier = "free" | "paid";

export type WorkspaceResourceAdmissionCode =
  | "ok"
  | "project_limit_reached"
  | "workspace_card_required_for_additional_volume"
  | "workspace_volume_funding_required"
  | "workspace_volume_limit_reached"
  | "workspace_provider_volume_quota_headroom_exhausted"
  | "workspace_credits_exhausted"
  | "workspace_uncollected_usage_blocked";

export type WorkspaceResourceAdmissionDecision = {
  ok: boolean;
  code: WorkspaceResourceAdmissionCode;
  accountTier: WorkspaceResourceAccountTier;
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

function normalizeFiniteCount(value: unknown): number {
  const parsed = Math.floor(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeFiniteAmount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeOptionalLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function resolveWorkspaceResourceAccountTier(params: {
  hasCardOnFile?: boolean | null;
  workspaceCreditBalance?: WorkspaceCreditBalanceLike | null;
  fallbackTier?: WorkspaceResourceAccountTier;
}): WorkspaceResourceAccountTier {
  if (params.hasCardOnFile === true) return "paid";
  return params.fallbackTier ?? "free";
}

export function hasPurchasedWorkspaceCredits(
  workspaceCreditBalance?: WorkspaceCreditBalanceLike | null,
): boolean {
  const purchasedCredits = Number(
    workspaceCreditBalance?.purchasedCreditsBalance ?? 0,
  );
  return Number.isFinite(purchasedCredits) && purchasedCredits > 0;
}

export function getWorkspaceProjectVolumeLimitForTier(
  tier: WorkspaceResourceAccountTier,
): number {
  return tier === "paid"
    ? WORKSPACE_PAID_PROJECT_VOLUME_LIMIT
    : WORKSPACE_FREE_PROJECT_VOLUME_LIMIT;
}

export function isWorkspaceProjectCountableForAdmission(
  row: WorkspaceProjectAdmissionRow,
): boolean {
  if (isWorkspaceProjectInactiveStatus(row.status)) return false;
  if (Number(row.workspaceVolumeDeletedAt ?? row.volume_deleted_at ?? 0) > 0) {
    return false;
  }
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
  return rows.filter((row) => {
    if (!isWorkspaceProjectCountableForAdmission(row)) return false;
    return String(row.providerVolumeId ?? row.provider_volume_id ?? "").trim().length > 0;
  }).length;
}

function admissionOk(params: {
  accountTier: WorkspaceResourceAccountTier;
  limit: number | null;
  currentCount: number;
  requestedCount: number;
  message?: string;
}): WorkspaceResourceAdmissionDecision {
  return {
    ok: true,
    code: "ok",
    accountTier: params.accountTier,
    limit: params.limit,
    currentCount: params.currentCount,
    requestedCount: params.requestedCount,
    message: params.message ?? "Workspace resource admission allowed.",
  };
}

function admissionBlocked(params: {
  code: Exclude<WorkspaceResourceAdmissionCode, "ok">;
  accountTier: WorkspaceResourceAccountTier;
  limit: number | null;
  currentCount: number;
  requestedCount: number;
  message: string;
}): WorkspaceResourceAdmissionDecision {
  return {
    ok: false,
    code: params.code,
    accountTier: params.accountTier,
    limit: params.limit,
    currentCount: params.currentCount,
    requestedCount: params.requestedCount,
    message: params.message,
  };
}

export function evaluateWorkspaceProjectCreateAdmission(params: {
  accountTier: WorkspaceResourceAccountTier;
  existingProjectCount: number;
  requestedProjectCount?: number;
}): WorkspaceResourceAdmissionDecision {
  const requestedCount = normalizeFiniteCount(params.requestedProjectCount ?? 1);
  const currentCount = normalizeFiniteCount(params.existingProjectCount);
  const limit = getWorkspaceProjectVolumeLimitForTier(params.accountTier);
  if (currentCount + requestedCount > limit) {
    return admissionBlocked({
      code: "project_limit_reached",
      accountTier: params.accountTier,
      limit,
      currentCount,
      requestedCount,
      message:
        params.accountTier === "free"
          ? "Free workspace accounts are limited to one computer."
          : `Workspace accounts are limited to ${limit} computers.`,
    });
  }
  return admissionOk({
    accountTier: params.accountTier,
    limit,
    currentCount,
    requestedCount,
  });
}

export function evaluateWorkspaceVolumeMaterializationAdmission(params: {
  hasCardOnFile?: boolean | null;
  workspaceCreditBalance?: WorkspaceCreditBalanceLike | null;
  existingVolumeCount: number;
  requestedVolumeCount?: number;
  providerVolumeCount?: number | null;
  providerVolumeLimit?: number | null;
  providerVolumeSafetyBuffer?: number | null;
}): WorkspaceResourceAdmissionDecision {
  const requestedCount = normalizeFiniteCount(params.requestedVolumeCount ?? 1);
  const currentCount = normalizeFiniteCount(params.existingVolumeCount);
  const accountTier = resolveWorkspaceResourceAccountTier({
    hasCardOnFile: params.hasCardOnFile,
    fallbackTier: "free",
  });
  const limit = getWorkspaceProjectVolumeLimitForTier(accountTier);
  const hasCardOnFile = params.hasCardOnFile === true;
  const hasFunding = hasCardOnFile ||
    hasPurchasedWorkspaceCredits(params.workspaceCreditBalance);

  if (!hasCardOnFile && currentCount + requestedCount > WORKSPACE_FREE_PROJECT_VOLUME_LIMIT) {
    return admissionBlocked({
      code: "workspace_card_required_for_additional_volume",
      accountTier,
      limit: WORKSPACE_FREE_PROJECT_VOLUME_LIMIT,
      currentCount,
      requestedCount,
      message: "Extra workspace computers require a card on file.",
    });
  }

  if (!hasFunding) {
    return admissionBlocked({
      code: "workspace_volume_funding_required",
      accountTier,
      limit,
      currentCount,
      requestedCount,
      message: "Add prepaid credits or a card before creating workspace storage.",
    });
  }

  if (currentCount + requestedCount > limit) {
    return admissionBlocked({
      code: "workspace_volume_limit_reached",
      accountTier,
      limit,
      currentCount,
      requestedCount,
      message:
        accountTier === "free"
          ? "Free workspace accounts are limited to one project volume."
          : `Workspace accounts are limited to ${limit} project volumes.`,
    });
  }

  const providerVolumeLimit = normalizeOptionalLimit(params.providerVolumeLimit);
  const providerVolumeCount = normalizeOptionalLimit(params.providerVolumeCount);
  const providerVolumeSafetyBuffer = normalizeFiniteCount(
    params.providerVolumeSafetyBuffer ?? 0,
  );
  if (providerVolumeLimit !== null && providerVolumeCount !== null) {
    const usableProviderLimit = Math.max(
      0,
      providerVolumeLimit - providerVolumeSafetyBuffer,
    );
    if (providerVolumeCount + requestedCount > usableProviderLimit) {
      return admissionBlocked({
        code: "workspace_provider_volume_quota_headroom_exhausted",
        accountTier,
        limit: usableProviderLimit,
        currentCount: providerVolumeCount,
        requestedCount,
        message: "Workspace storage provider quota has no safe headroom.",
      });
    }
  }

  return admissionOk({
    accountTier,
    limit,
    currentCount,
    requestedCount,
  });
}

export function evaluateWorkspaceSandboxStartAdmission(params: {
  accountTier: WorkspaceResourceAccountTier;
  workspaceCreditBalance?: WorkspaceCreditBalanceLike | null;
  requiredCredits: number;
}): WorkspaceResourceAdmissionDecision {
  const requiredCredits = normalizeFiniteAmount(params.requiredCredits);
  const uncollectedCredits = getUncollectedWorkspaceToolBalanceCredits(
    params.workspaceCreditBalance,
  );
  if (uncollectedCredits > 0) {
    return admissionBlocked({
      code: "workspace_uncollected_usage_blocked",
      accountTier: params.accountTier,
      limit: null,
      currentCount: uncollectedCredits,
      requestedCount: requiredCredits,
      message: "Prior workspace usage must be cleared before workspace tools can run.",
    });
  }
  const spendableCredits = getSpendableWorkspaceToolBalanceCredits(
    params.workspaceCreditBalance,
  );
  if (requiredCredits > 0 && spendableCredits < requiredCredits) {
    return admissionBlocked({
      code: "workspace_credits_exhausted",
      accountTier: params.accountTier,
      limit: requiredCredits,
      currentCount: spendableCredits,
      requestedCount: requiredCredits,
      message: "Workspace tools need tool balance before they run.",
    });
  }
  return admissionOk({
    accountTier: params.accountTier,
    limit: requiredCredits,
    currentCount: spendableCredits,
    requestedCount: requiredCredits,
  });
}
