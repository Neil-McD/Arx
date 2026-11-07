
export const POLYNET_BUILDER_OFFER_NAME = "Agent plan";
export const POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS = 7_900;
export const POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS = 20_000_000;
// Operator-funded communities get the same monthly ceiling as a Builder
// subscription; the operator grant waives payment, not cost bounds.
export const POLYNET_OPERATOR_GRANT_MONTHLY_INCLUDED_COST_MICROS = 20_000_000;
export const POLYNET_FOUNDER_PLAN_PRICING_VERSION = "founder_plan_luna_v1";
export const POLYNET_COMMUNITY_PLATFORM_FEE_BPS = 290;

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
