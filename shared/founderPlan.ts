
export const POLYNET_BUILDER_OFFER_NAME = "Agent plan";
export const POLYNET_FOUNDER_PLAN_TIERS = ["guide", "chief_of_staff"] as const;
export type FounderPlanTier = (typeof POLYNET_FOUNDER_PLAN_TIERS)[number];

export const POLYNET_FOUNDER_GUIDE_MONTHLY_PRICE_BASE_UNITS = 2_000;
export const POLYNET_FOUNDER_GUIDE_INCLUDED_COST_MICROS = 3_000_000;
export const POLYNET_FOUNDER_GUIDE_MAX_RUN_RESERVATION_CAP_MICROS = 250_000;

export const POLYNET_FOUNDER_CHIEF_OF_STAFF_MONTHLY_PRICE_BASE_UNITS = 10_000;
export const POLYNET_FOUNDER_CHIEF_OF_STAFF_INCLUDED_COST_MICROS = 20_000_000;
export const POLYNET_FOUNDER_CHIEF_OF_STAFF_MAX_RUN_RESERVATION_CAP_MICROS = 1_000_000;

// Legacy constants retained while existing $79 subscriptions grandfather cleanly
// into the `chief_of_staff` capability tier.
export const POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS = 7_900;
export const POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS =
  POLYNET_FOUNDER_CHIEF_OF_STAFF_INCLUDED_COST_MICROS;
// Operator-funded communities get the same monthly ceiling as Chief of Staff;
// the operator grant waives payment, not cost bounds.
export const POLYNET_OPERATOR_GRANT_MONTHLY_INCLUDED_COST_MICROS =
  POLYNET_FOUNDER_CHIEF_OF_STAFF_INCLUDED_COST_MICROS;
export const POLYNET_FOUNDER_PLAN_PRICING_VERSION = "founder_plan_luna_v1";
export const POLYNET_COMMUNITY_PLATFORM_FEE_BPS = 290;

export type FounderPlanTierSpec = {
  tier: FounderPlanTier;
  label: string;
  tagline: string;
  monthlyPriceBaseUnits: number;
  includedCostMicros: number;
  maxRunReservationCapMicros: number;
  proactiveEnabled: boolean;
  usageBoostsEnabled: boolean;
};

export const POLYNET_FOUNDER_TIER_CATALOG: Record<FounderPlanTier, FounderPlanTierSpec> = {
  guide: {
    tier: "guide",
    label: "Guide",
    tagline: "The community that remembers.",
    monthlyPriceBaseUnits: POLYNET_FOUNDER_GUIDE_MONTHLY_PRICE_BASE_UNITS,
    includedCostMicros: POLYNET_FOUNDER_GUIDE_INCLUDED_COST_MICROS,
    maxRunReservationCapMicros: POLYNET_FOUNDER_GUIDE_MAX_RUN_RESERVATION_CAP_MICROS,
    proactiveEnabled: false,
    usageBoostsEnabled: false,
  },
  chief_of_staff: {
    tier: "chief_of_staff",
    label: "Chief of Staff",
    tagline: "The agent that helps run your community.",
    monthlyPriceBaseUnits: POLYNET_FOUNDER_CHIEF_OF_STAFF_MONTHLY_PRICE_BASE_UNITS,
    includedCostMicros: POLYNET_FOUNDER_CHIEF_OF_STAFF_INCLUDED_COST_MICROS,
    maxRunReservationCapMicros: POLYNET_FOUNDER_CHIEF_OF_STAFF_MAX_RUN_RESERVATION_CAP_MICROS,
    proactiveEnabled: true,
    usageBoostsEnabled: true,
  },
};

export const POLYNET_FOUNDER_ALLOWED_INCLUDED_COST_MICROS = [
  POLYNET_FOUNDER_GUIDE_INCLUDED_COST_MICROS,
  POLYNET_FOUNDER_CHIEF_OF_STAFF_INCLUDED_COST_MICROS,
] as const;

// Absent/legacy subscription rows grandfather into `chief_of_staff` so existing
// $79 communities never lose proactive access or their $20 allowance.
export function normalizeFounderPlanTier(value: unknown): FounderPlanTier {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "guide" ? "guide" : "chief_of_staff";
}

export function getFounderPlanTierSpec(tier: unknown): FounderPlanTierSpec {
  return POLYNET_FOUNDER_TIER_CATALOG[normalizeFounderPlanTier(tier)];
}

export function founderPlanTierIncludedCostMicros(tier: unknown): number {
  return getFounderPlanTierSpec(tier).includedCostMicros;
}

export function founderPlanTierHasProactiveAgent(tier: unknown): boolean {
  return getFounderPlanTierSpec(tier).proactiveEnabled;
}

export function founderPlanTierAllowsUsageBoosts(tier: unknown): boolean {
  return getFounderPlanTierSpec(tier).usageBoostsEnabled;
}

export function founderPlanTierMaxRunReservationMicros(
  tier: unknown,
  configuredMaxReservationMicros: number,
): number {
  const spec = getFounderPlanTierSpec(tier);
  const safeConfigured = Math.max(1, Math.floor(Number(configuredMaxReservationMicros ?? 0)));
  return Math.min(safeConfigured, spec.maxRunReservationCapMicros, spec.includedCostMicros);
}

export function isAllowedFounderPlanIncludedCostMicros(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    (POLYNET_FOUNDER_ALLOWED_INCLUDED_COST_MICROS as readonly number[]).includes(value)
  );
}

export type FounderSubscriptionStatus =
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "canceled"
  | "ended";

export function founderSubscriptionStatusGrantsAccess(args: {
  status: unknown;
  currentPeriodEndAt?: unknown;
  nowMs: number;
}): boolean {
  const status = String(args.status ?? "").trim().toLowerCase();
  if (status !== "active" && status !== "cancel_at_period_end") return false;
  const currentPeriodEndAt = Number(args.currentPeriodEndAt ?? 0);
  return Number.isFinite(currentPeriodEndAt) && currentPeriodEndAt > args.nowMs;
}
