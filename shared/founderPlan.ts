
export const POLYNET_BUILDER_OFFER_NAME = "Builder";
export const POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS = 7_900;
export const POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS = 20_000_000;
// Operator-funded communities get the same monthly ceiling as a Builder
// subscription; the operator grant waives payment, not cost bounds.
export const POLYNET_OPERATOR_GRANT_MONTHLY_INCLUDED_COST_MICROS = 20_000_000;
export const POLYNET_FOUNDER_PLAN_INCLUDED_COMMUNITIES = 1;
export const POLYNET_FOUNDER_PLAN_PRICING_VERSION = "founder_plan_luna_v1";
export const POLYNET_COMMUNITY_PLATFORM_FEE_BPS = 290;

export const COMMUNITY_BUILDER_ACCESS_GRANDFATHERED = "grandfathered" as const;
export const COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED =
  "subscription_required" as const;

export type CommunityBuilderAccessMode =
  | typeof COMMUNITY_BUILDER_ACCESS_GRANDFATHERED
  | typeof COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED;

export function parseCommunityBuilderAccessMode(
  value: unknown,
): CommunityBuilderAccessMode | null {
  if (value === undefined || value === null) {
    return COMMUNITY_BUILDER_ACCESS_GRANDFATHERED;
  }
  if (
    value === COMMUNITY_BUILDER_ACCESS_GRANDFATHERED ||
    value === COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED
  ) {
    return value;
  }
  return null;
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
