export const DEFAULT_WORKSPACE_SANDBOX_CPU = 1;
export const DEFAULT_WORKSPACE_SANDBOX_MEMORY_GIB = 2;
export const DEFAULT_WORKSPACE_SANDBOX_DISK_GIB = 8;

export const DEFAULT_INCLUDED_TOOL_CREDITS = 0;
export const WORKSPACE_CREDITS_PER_USD = 100;
export const WORKSPACE_CREDIT_TOPUP_CREDITS = 500;
export const WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD = 100;
export const WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;
export const PAID_TOOL_TARGET_GROSS_MARGIN_BPS = 6000;
export const PAID_TOOL_PRICING_VERSION = "paid_tools_v1";
export const WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION = {
  search: 0.005,
  open_page: 0.001,
  find_in_page: 0.001,
  crawl: 0.03,
} as const;
export const VOICE_TRANSCRIPTION_FALLBACK_DURATION_SECONDS = 1;
export const OPENAI_VOICE_TRANSCRIPTION_USD_PER_MINUTE_BY_MODEL = {
  "gpt-4o-mini-transcribe": 0.003,
  "gpt-4o-transcribe": 0.006,
} as const;
export const OPENAI_VOICE_TRANSCRIPTION_DEFAULT_USD_PER_MINUTE =
  OPENAI_VOICE_TRANSCRIPTION_USD_PER_MINUTE_BY_MODEL["gpt-4o-mini-transcribe"];
export const GROQ_VOICE_TRANSCRIPTION_USD_PER_HOUR_BY_MODEL = {
  "whisper-large-v3-turbo": 0.04,
  "whisper-large-v3": 0.111,
} as const;
export const GROQ_VOICE_TRANSCRIPTION_DEFAULT_USD_PER_HOUR =
  GROQ_VOICE_TRANSCRIPTION_USD_PER_HOUR_BY_MODEL["whisper-large-v3-turbo"];
export const GROQ_VOICE_TRANSCRIPTION_MIN_BILLED_SECONDS = 10;
export const CREDIT_RESERVATION_EXPIRY_MS = 60 * 60 * 1000;
export const WORKSPACE_SESSION_HOLD_SECONDS = 60;
export const WORKSPACE_SESSION_MAX_SECONDS = 30 * 60;
export const WORKSPACE_FILE_INSPECTION_HOLD_SECONDS = 10;
export const WORKSPACE_FILE_INSPECTION_MIN_BILLABLE_SECONDS = 10;
export const WORKSPACE_FILE_INSPECTION_MAX_SECONDS = 30;
export const WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS = 500;
export const WORKSPACE_CARD_COLLECTION_MIN_CREDITS = 50;
export const WORKSPACE_CARD_COLLECTION_STALE_PREPARED_MS = 15 * 60 * 1000;
export const WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES = 15;
export const WORKSPACE_SESSION_RESERVATION_EXPIRY_MS =
  (WORKSPACE_SESSION_MAX_SECONDS + 5 * 60) * 1000;
export const WORKSPACE_FILE_INSPECTION_RESERVATION_EXPIRY_MS =
  (WORKSPACE_FILE_INSPECTION_MAX_SECONDS + 60) * 1000;

export const WORKSPACE_VCPU_USD_PER_SECOND = 0;
export const WORKSPACE_MEMORY_GIB_USD_PER_SECOND = 0.0000115;
export const DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND = 0.0082 / 3600;

export type PaidToolKind =
  | "workspace_tools"
  | "web_research"
  | "voice_input";
export const PAID_TOOL_LEDGER_TOOL_NAMES = [
  "workspace_compute",
  "web_research",
  "voice_transcribe",
] as const;
export type PaidToolLedgerToolName = (typeof PAID_TOOL_LEDGER_TOOL_NAMES)[number];

export const PAID_TOOL_DEFINITIONS = {
  workspace_tools: {
    ledgerToolName: "workspace_compute",
    primaryMessage: "Workspace tools use paid computer time.",
    operatorLabel: "Workspace runtime",
  },
  web_research: {
    ledgerToolName: "web_research",
    primaryMessage: "Web research uses paid provider calls.",
    operatorLabel: "Web research",
  },
  voice_input: {
    ledgerToolName: "voice_transcribe",
    primaryMessage: "Voice input uses paid transcription.",
    operatorLabel: "Voice input",
  },
} as const satisfies Record<
  PaidToolKind,
  {
    ledgerToolName: PaidToolLedgerToolName;
    primaryMessage: string;
    operatorLabel: string;
  }
>;

export function normalizePaidToolKind(value: unknown): PaidToolKind | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "workspace_tools") return "workspace_tools";
  if (normalized === "web_research") return "web_research";
  if (normalized === "voice_input") return "voice_input";
  if (normalized === "codex_runtime") return "workspace_tools";
  return null;
}

export function paidToolKindForLedgerToolName(value: unknown): PaidToolKind | null {
  const normalized = String(value ?? "").trim();
  if (normalized === "codex_runtime") return "workspace_tools";
  for (const [kind, definition] of Object.entries(PAID_TOOL_DEFINITIONS) as Array<
    [PaidToolKind, (typeof PAID_TOOL_DEFINITIONS)[PaidToolKind]]
  >) {
    if (definition.ledgerToolName === normalized) return kind;
  }
  return null;
}

export function getPaidToolLedgerLabel(toolName: string): string | null {
  const kind = paidToolKindForLedgerToolName(toolName);
  return kind ? PAID_TOOL_DEFINITIONS[kind].operatorLabel : null;
}

export function normalizePositiveInteger(raw: unknown, fallback: number, min = 1): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

export function estimateWorkspaceComputeUsd(params: {
  durationSeconds: number;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
}): number {
  const durationSeconds = Math.max(0, Number(params.durationSeconds) || 0);
  const sandboxCpu = Math.max(0, Number(params.sandboxCpu) || 0);
  const sandboxMemoryGiB = Math.max(0, Number(params.sandboxMemoryGiB) || 0);
  return durationSeconds * (
    sandboxCpu * WORKSPACE_VCPU_USD_PER_SECOND +
    sandboxMemoryGiB * WORKSPACE_MEMORY_GIB_USD_PER_SECOND
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

export type WebResearchCreditAction = keyof typeof WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION;

export function estimateWebResearchVendorCostUsd(action: WebResearchCreditAction): number {
  return WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION[action] ??
    WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION.search;
}

export type VoiceTranscriptionProvider = "openai" | "groq";

function normalizeDurationSeconds(raw: unknown): number {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return VOICE_TRANSCRIPTION_FALLBACK_DURATION_SECONDS;
  return Math.max(0, seconds);
}

export function estimateVoiceTranscriptionVendorCostUsd(params?: {
  durationSeconds?: number;
  provider?: VoiceTranscriptionProvider;
  model?: string | null;
}): number {
  const provider = params?.provider === "groq" ? "groq" : "openai";
  const durationSeconds = normalizeDurationSeconds(params?.durationSeconds);
  const model = String(params?.model ?? "").trim();
  if (provider === "groq") {
    const hourlyRate =
      GROQ_VOICE_TRANSCRIPTION_USD_PER_HOUR_BY_MODEL[
        model as keyof typeof GROQ_VOICE_TRANSCRIPTION_USD_PER_HOUR_BY_MODEL
      ] ?? GROQ_VOICE_TRANSCRIPTION_DEFAULT_USD_PER_HOUR;
    const billableSeconds = Math.max(durationSeconds, GROQ_VOICE_TRANSCRIPTION_MIN_BILLED_SECONDS);
    return (billableSeconds / 3600) * hourlyRate;
  }
  const minuteRate =
    OPENAI_VOICE_TRANSCRIPTION_USD_PER_MINUTE_BY_MODEL[
      model as keyof typeof OPENAI_VOICE_TRANSCRIPTION_USD_PER_MINUTE_BY_MODEL
    ] ?? OPENAI_VOICE_TRANSCRIPTION_DEFAULT_USD_PER_MINUTE;
  return (durationSeconds / 60) * minuteRate;
}

export function priceVoiceTranscriptionCredits(params?: {
  durationSeconds?: number;
  provider?: VoiceTranscriptionProvider;
  model?: string | null;
}): number {
  return priceVendorCostUsdToWorkspaceCredits({
    rawVendorCostUsd: estimateVoiceTranscriptionVendorCostUsd(params),
  });
}

export function estimateWorkspaceCredits(params: {
  durationSeconds: number;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
}): number {
  return priceVendorCostUsdToWorkspaceCredits({
    rawVendorCostUsd: estimateWorkspaceComputeUsd(params),
  });
}

export function estimateWorkspaceReservationCredits(params: {
  sandboxCpu: number;
  sandboxMemoryGiB: number;
  durationSeconds?: number;
}): number {
  const credits = estimateWorkspaceCredits({
    durationSeconds:
      typeof params.durationSeconds === "number" && Number.isFinite(params.durationSeconds)
        ? params.durationSeconds
        : WORKSPACE_SESSION_HOLD_SECONDS,
    sandboxCpu: params.sandboxCpu,
    sandboxMemoryGiB: params.sandboxMemoryGiB,
  });
  return ceilCredits(credits);
}

export function priceWorkspaceUsageCredits(params: {
  computeCostUsd: number;
}): number {
  return priceVendorCostUsdToWorkspaceCredits({
    rawVendorCostUsd: params.computeCostUsd,
  });
}

export function estimateDaytonaWorkspaceComputeVendorCostUsd(params: {
  durationSeconds: number;
}): number {
  const durationSeconds = Math.max(0, Number(params.durationSeconds) || 0);
  return durationSeconds * DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND;
}

export function priceDaytonaWorkspaceComputeCredits(params: {
  durationSeconds: number;
}): number {
  return priceVendorCostUsdToWorkspaceCredits({
    rawVendorCostUsd: estimateDaytonaWorkspaceComputeVendorCostUsd(params),
  });
}

export function creditsToUsd(credits: number): number {
  return Math.round((Math.max(0, Number(credits) || 0) / WORKSPACE_CREDITS_PER_USD) * 10000) / 10000;
}

export function formatWorkspaceToolBalanceUsdFromCredits(credits: number): string {
  const usd = creditsToUsd(credits);
  return usd % 1 === 0 ? `$${usd.toFixed(0)}` : `$${usd.toFixed(2)}`;
}

export type WorkspaceCreditBalanceLike = {
  includedCreditsBalance?: number | null;
  purchasedCreditsBalance?: number | null;
  uncollectedCreditsBalance?: number | null;
  pendingCardCollectionCreditsBalance?: number | null;
};

export function getSpendableWorkspaceToolBalanceCredits(balance: WorkspaceCreditBalanceLike | null | undefined): number {
  return Math.max(0, Number(balance?.purchasedCreditsBalance ?? 0) || 0);
}

export function getUncollectedWorkspaceToolBalanceCredits(balance: WorkspaceCreditBalanceLike | null | undefined): number {
  return Math.max(0, Number(balance?.uncollectedCreditsBalance ?? 0) || 0);
}

export function getPendingCardCollectionWorkspaceToolBalanceCredits(balance: WorkspaceCreditBalanceLike | null | undefined): number {
  return Math.max(0, Number(balance?.pendingCardCollectionCreditsBalance ?? 0) || 0);
}

export function getOutstandingWorkspaceToolUsageCredits(balance: WorkspaceCreditBalanceLike | null | undefined): number {
  return Math.max(
    0,
    getUncollectedWorkspaceToolBalanceCredits(balance) +
      getPendingCardCollectionWorkspaceToolBalanceCredits(balance),
  );
}
