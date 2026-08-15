export const PROVIDER_COST_CATEGORIES = ["workspace", "web", "voice"] as const;

export type ProviderCostCategory = (typeof PROVIDER_COST_CATEGORIES)[number];

export const PROVIDER_COST_COMPONENTS = [
  // Historical accounting identities. No active runtime can create these rows.
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
