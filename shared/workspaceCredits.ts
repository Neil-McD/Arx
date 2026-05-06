export const DEFAULT_DAYTONA_SANDBOX_CPU = 1;
export const DEFAULT_DAYTONA_SANDBOX_MEMORY_GIB = 2;
export const DEFAULT_DAYTONA_SANDBOX_DISK_GIB = 8;

export const BUILDER_INCLUDED_WORKSPACE_CREDITS = 500;
export const WORKSPACE_CREDITS_PER_USD = 100;
export const WORKSPACE_CREDIT_TOPUP_CREDITS = 500;
export const WORKSPACE_CREDIT_TOPUP_PRICE_USD = 5;
export const WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD = 100;
export const WEB_RESEARCH_CREDITS_PER_CALL = 1;
export const VOICE_TRANSCRIPTION_CREDITS_PER_REQUEST = 1;
export const CREDIT_RESERVATION_EXPIRY_MS = 60 * 60 * 1000;
export const DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS = 60 * 60;
export const DAYTONA_WORKSPACE_SESSION_STOP_GRACE_SECONDS = 15 * 60;
export const DAYTONA_WORKSPACE_SESSION_RESERVE_SECONDS =
  DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS +
  DAYTONA_WORKSPACE_SESSION_STOP_GRACE_SECONDS;
export const DAYTONA_WORKSPACE_SESSION_RESERVATION_EXPIRY_MS = 2 * 60 * 60 * 1000;

export const DAYTONA_VCPU_USD_PER_SECOND = 0.000014;
export const DAYTONA_MEMORY_GIB_USD_PER_SECOND = 0.0000045;

export function normalizePositiveInteger(raw: unknown, fallback: number, min = 1): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

export function estimateDaytonaWorkspaceComputeUsd(params: {
  durationSeconds: number;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
}): number {
  const durationSeconds = Math.max(0, Number(params.durationSeconds) || 0);
  const sandboxCpu = Math.max(0, Number(params.sandboxCpu) || 0);
  const sandboxMemoryGiB = Math.max(0, Number(params.sandboxMemoryGiB) || 0);
  return durationSeconds * (
    sandboxCpu * DAYTONA_VCPU_USD_PER_SECOND +
    sandboxMemoryGiB * DAYTONA_MEMORY_GIB_USD_PER_SECOND
  );
}

export function convertUsdToWorkspaceCredits(usd: number): number {
  const normalizedUsd = Math.max(0, Number(usd) || 0);
  return normalizedUsd * WORKSPACE_CREDITS_PER_USD;
}

export function estimateDaytonaWorkspaceCredits(params: {
  durationSeconds: number;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
}): number {
  return convertUsdToWorkspaceCredits(estimateDaytonaWorkspaceComputeUsd(params));
}

export function estimateDaytonaWorkspaceReservationCredits(params: {
  sandboxCpu: number;
  sandboxMemoryGiB: number;
  durationSeconds?: number;
}): number {
  const credits = estimateDaytonaWorkspaceCredits({
    durationSeconds:
      typeof params.durationSeconds === "number" && Number.isFinite(params.durationSeconds)
        ? params.durationSeconds
        : DAYTONA_WORKSPACE_SESSION_RESERVE_SECONDS,
    sandboxCpu: params.sandboxCpu,
    sandboxMemoryGiB: params.sandboxMemoryGiB,
  });
  return Math.max(1, Math.ceil(credits * 100) / 100);
}
