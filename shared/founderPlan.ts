import { COMMUNITY_OWNER_FUNDED_MODEL_ID } from "./founderInference";

export const POLYNET_FOUNDER_PLAN_NAME = "Polynet Founder";
export const POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_USD = 79;
export const POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS = 7_900;
export const POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS = 20_000_000;
export const POLYNET_FOUNDER_PLAN_INCLUDED_COMMUNITIES = 1;
export const POLYNET_FOUNDER_PLAN_MODEL_ID = COMMUNITY_OWNER_FUNDED_MODEL_ID;
export const POLYNET_FOUNDER_PLAN_PRICING_VERSION = "founder_plan_luna_v1";

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
