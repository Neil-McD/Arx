export const PROVIDER_COST_CATEGORIES = ["workspace", "web", "voice"] as const;

export type ProviderCostCategory = (typeof PROVIDER_COST_CATEGORIES)[number];

export const PROVIDER_COST_COMPONENTS = [
  "blaxel_active_runtime",
  "blaxel_volume_storage",
  "blaxel_standby_snapshot",
  "web_research_call",
  "web_crawl_provider_call",
  "web_screenshot_provider_call",
  "daytona_codex_runtime_active",
  "voice_transcription",
  "knowledge_model_inference",
] as const;

export type ProviderCostComponent = (typeof PROVIDER_COST_COMPONENTS)[number];

export const PROVIDER_COST_EVIDENCE_TYPES = [
  "estimated",
  "provider_reported",
  "exact",
] as const;

export type ProviderCostEvidenceType = (typeof PROVIDER_COST_EVIDENCE_TYPES)[number];

export const PROVIDER_COST_BILLING_DISPOSITIONS = [
  "tracked_only",
  "rolled_into_user_usage",
  "platform_absorbed",
] as const;

export type ProviderCostBillingDisposition =
  (typeof PROVIDER_COST_BILLING_DISPOSITIONS)[number];

export const BLAXEL_VOLUME_STORAGE_USD_PER_GB_SECOND = 0.00000004629;
export const BLAXEL_STANDBY_SNAPSHOT_STORAGE_USD_PER_GB_SECOND = 0.00000007716;

export const PROVIDER_COST_ACCOUNTING_BUCKET_MS = 60 * 60 * 1000;

function roundDecimal(value: number, places: number): number {
  const normalized = Math.max(0, Number(value) || 0);
  const factor = 10 ** places;
  return Math.round(normalized * factor) / factor;
}

export function roundProviderCostUsd(value: number): number {
  return roundDecimal(value, 8);
}

export function roundProviderCostQuantity(value: number): number {
  return roundDecimal(value, 6);
}

export function estimateBlaxelStorageCostUsd(params: {
  sizeGb: number;
  durationSeconds: number;
  usdPerGbSecond: number;
}): number {
  const sizeGb = Math.max(0, Number(params.sizeGb) || 0);
  const durationSeconds = Math.max(0, Number(params.durationSeconds) || 0);
  const usdPerGbSecond = Math.max(0, Number(params.usdPerGbSecond) || 0);
  return sizeGb * durationSeconds * usdPerGbSecond;
}

export function resolveProviderCostAccountingHourBucket(nowMs = Date.now()): {
  periodStart: number;
  periodEnd: number;
  bucketKey: string;
} {
  const normalizedNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const periodEnd =
    Math.floor(normalizedNowMs / PROVIDER_COST_ACCOUNTING_BUCKET_MS) *
    PROVIDER_COST_ACCOUNTING_BUCKET_MS;
  const periodStart = Math.max(0, periodEnd - PROVIDER_COST_ACCOUNTING_BUCKET_MS);
  return {
    periodStart,
    periodEnd,
    bucketKey: String(periodStart),
  };
}
