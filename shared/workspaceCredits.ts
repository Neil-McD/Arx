export const DEFAULT_DAYTONA_SANDBOX_CPU = 1;
export const DEFAULT_DAYTONA_SANDBOX_MEMORY_GIB = 2;
export const DEFAULT_DAYTONA_SANDBOX_DISK_GIB = 8;

export const DEFAULT_INCLUDED_TOOL_CREDITS = 0;
export const WORKSPACE_CREDITS_PER_USD = 100;
export const WORKSPACE_CREDIT_TOPUP_CREDITS = 500;
export const WORKSPACE_CREDIT_TOPUP_PRICE_USD = 5;
export const WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD = 100;
export const WORKSPACE_TOOL_BALANCE_TOPUP_PACKS = [
  {
    id: "tool_balance_500",
    label: "$5",
    priceUsd: 5,
    credits: 500,
    recommended: false,
  },
  {
    id: "tool_balance_1000",
    label: "$10",
    priceUsd: 10,
    credits: 1000,
    recommended: false,
  },
  {
    id: "tool_balance_2000",
    label: "$20",
    priceUsd: 20,
    credits: 2000,
    recommended: true,
  },
  {
    id: "tool_balance_5000",
    label: "$50",
    priceUsd: 50,
    credits: 5000,
    recommended: false,
  },
] as const;
export type WorkspaceToolBalanceTopupPack = (typeof WORKSPACE_TOOL_BALANCE_TOPUP_PACKS)[number];
export type WorkspaceToolBalanceTopupPackId = WorkspaceToolBalanceTopupPack["id"];
export type WorkspaceCreditTopupSurface = "settings_agent" | "tool_balance_modal";
export const DEFAULT_WORKSPACE_TOOL_BALANCE_TOPUP_PACK_ID: WorkspaceToolBalanceTopupPackId = "tool_balance_500";
export const WEB_RESEARCH_CREDITS_PER_CALL = 1;
export const VOICE_TRANSCRIPTION_CREDITS_PER_REQUEST = 1;
export const PAID_TOOL_TARGET_GROSS_MARGIN_BPS = 6000;
export const PAID_TOOL_PRICING_VERSION = "paid_tools_v1";
export const WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION = {
  search: 0.005,
  open_page: 0.001,
  find_in_page: 0.001,
} as const;
export const VOICE_TRANSCRIPTION_VENDOR_COST_ESTIMATE_USD_PER_REQUEST = 0.003;
export const VOICE_TRANSCRIPTION_VENDOR_COST_ESTIMATE_USD_PER_MEGABYTE = 0.001;
export const CREDIT_RESERVATION_EXPIRY_MS = 60 * 60 * 1000;
export const DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS = 60 * 60;
export const DAYTONA_WORKSPACE_SESSION_STOP_GRACE_SECONDS = 15 * 60;
export const DAYTONA_WORKSPACE_SESSION_RESERVE_SECONDS =
  DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS +
  DAYTONA_WORKSPACE_SESSION_STOP_GRACE_SECONDS;
export const DAYTONA_WORKSPACE_SESSION_RESERVATION_EXPIRY_MS = 2 * 60 * 60 * 1000;

export const DAYTONA_VCPU_USD_PER_SECOND = 0.000014;
export const DAYTONA_MEMORY_GIB_USD_PER_SECOND = 0.0000045;

export type PaidToolKind = "workspace_tools" | "web_research" | "voice_input";

export function normalizePaidToolKind(value: unknown): PaidToolKind | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "workspace_tools") return "workspace_tools";
  if (normalized === "web_research") return "web_research";
  if (normalized === "voice_input") return "voice_input";
  return null;
}

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

function ceilCredits(value: number): number {
  const normalizedValue = Math.max(0, Number(value) || 0);
  if (normalizedValue <= 0) return 0;
  return Math.ceil(normalizedValue * 100) / 100;
}

export function priceUsdForTargetGrossMargin(params: {
  rawVendorCostUsd: number;
  targetGrossMarginBps?: number;
}): number {
  const rawVendorCostUsd = Math.max(0, Number(params.rawVendorCostUsd) || 0);
  const targetGrossMarginBps =
    typeof params.targetGrossMarginBps === "number" && Number.isFinite(params.targetGrossMarginBps)
      ? params.targetGrossMarginBps
      : PAID_TOOL_TARGET_GROSS_MARGIN_BPS;
  const marginRate = Math.min(0.95, Math.max(0, targetGrossMarginBps / 10000));
  return rawVendorCostUsd / (1 - marginRate);
}

export function priceUsdToWorkspaceCredits(priceUsd: number): number {
  return ceilCredits(convertUsdToWorkspaceCredits(priceUsd));
}

export function priceVendorCostUsdToWorkspaceCredits(params: {
  rawVendorCostUsd: number;
  targetGrossMarginBps?: number;
}): number {
  return priceUsdToWorkspaceCredits(priceUsdForTargetGrossMargin(params));
}

export function priceFixedPaidToolCredits(params: {
  minimumCredits: number;
  estimatedVendorCostUsd: number;
  targetGrossMarginBps?: number;
}): number {
  const marginAwareCredits = priceVendorCostUsdToWorkspaceCredits({
    rawVendorCostUsd: params.estimatedVendorCostUsd,
    targetGrossMarginBps: params.targetGrossMarginBps,
  });
  return Math.max(params.minimumCredits, marginAwareCredits);
}

export type WebResearchCreditAction = keyof typeof WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION;

export function estimateWebResearchVendorCostUsd(action: WebResearchCreditAction): number {
  return WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION[action] ??
    WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION.search;
}

export function priceWebResearchCredits(action: WebResearchCreditAction): number {
  return priceFixedPaidToolCredits({
    minimumCredits: WEB_RESEARCH_CREDITS_PER_CALL,
    estimatedVendorCostUsd: estimateWebResearchVendorCostUsd(action),
  });
}

export function estimateVoiceTranscriptionVendorCostUsd(params?: {
  audioBytes?: number;
}): number {
  const audioBytes =
    typeof params?.audioBytes === "number" && Number.isFinite(params.audioBytes)
      ? Math.max(0, params.audioBytes)
      : 0;
  const megabytes = audioBytes / 1_000_000;
  return Math.max(
    VOICE_TRANSCRIPTION_VENDOR_COST_ESTIMATE_USD_PER_REQUEST,
    megabytes * VOICE_TRANSCRIPTION_VENDOR_COST_ESTIMATE_USD_PER_MEGABYTE,
  );
}

export function priceVoiceTranscriptionCredits(params?: {
  audioBytes?: number;
}): number {
  return priceFixedPaidToolCredits({
    minimumCredits: VOICE_TRANSCRIPTION_CREDITS_PER_REQUEST,
    estimatedVendorCostUsd: estimateVoiceTranscriptionVendorCostUsd(params),
  });
}

export function estimateDaytonaWorkspaceCredits(params: {
  durationSeconds: number;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
}): number {
  return priceVendorCostUsdToWorkspaceCredits({
    rawVendorCostUsd: estimateDaytonaWorkspaceComputeUsd(params),
  });
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
  return Math.max(1, ceilCredits(credits));
}

export function priceDaytonaWorkspaceUsageCredits(params: {
  computeCostUsd: number;
}): number {
  return priceVendorCostUsdToWorkspaceCredits({
    rawVendorCostUsd: params.computeCostUsd,
  });
}

export function creditsToUsd(credits: number): number {
  return Math.round((Math.max(0, Number(credits) || 0) / WORKSPACE_CREDITS_PER_USD) * 10000) / 10000;
}

export function resolveWorkspaceToolBalanceTopupPack(
  packId?: string | null,
): WorkspaceToolBalanceTopupPack | null {
  const normalized = String(packId ?? DEFAULT_WORKSPACE_TOOL_BALANCE_TOPUP_PACK_ID).trim() ||
    DEFAULT_WORKSPACE_TOOL_BALANCE_TOPUP_PACK_ID;
  return WORKSPACE_TOOL_BALANCE_TOPUP_PACKS.find((pack) => pack.id === normalized) ?? null;
}

export function formatWorkspaceToolBalanceUsdFromCredits(credits: number): string {
  const usd = creditsToUsd(credits);
  return usd % 1 === 0 ? `$${usd.toFixed(0)}` : `$${usd.toFixed(2)}`;
}
