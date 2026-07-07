import type { CommunityBillingPeriod } from "./communityTypes";

export type AccountTierUi = "free" | "architect";

export const POLYNET_PREMIUM_PLAN_NAME = "Polynet Premium";
export const POLYNET_PREMIUM_ACCOUNT_TIER = "architect" as const;
export const POLYNET_FREE_MAX_COMMUNITIES = 1;
export const POLYNET_PREMIUM_MAX_COMMUNITIES = 2;
export const POLYNET_PREMIUM_MONTHLY_PRICE_USD = 20;
export const POLYNET_PREMIUM_MONTHLY_PRICE_BASE_UNITS = 2000;
export const POLYNET_PREMIUM_MONTHLY_PRICE_LABEL = "$20/mo";
export const POLYNET_PREMIUM_INCLUDED_USAGE_LABEL = "Premium tool usage included";
export const POLYNET_PREMIUM_DESCRIPTION =
  "Grants access to Codex and future premium runtimes, web research, hosted workspace tools, premium tool usage, and a second community.";

export type StripeConnectReturnAction = "refresh" | "return";
export type StripeConnectContext = "account" | "community";

export type StripeConnectReturn = {
  action: StripeConnectReturnAction;
  context: StripeConnectContext;
  communitySlug: string | null;
};

export type PublicPlanSummaryLike = {
  amount_base_units: number | string | null | undefined;
  currency: string | null | undefined;
  currency_decimals: number | null | undefined;
  billing_period: CommunityBillingPeriod | null | undefined;
};

export function formatPlanPrice(plan: PublicPlanSummaryLike): string {
  const raw = String(plan.amount_base_units ?? "").trim();
  const amount = Number(raw);
  const decimals = Number(plan.currency_decimals ?? 2);
  const value = Number.isFinite(amount) ? amount / Math.pow(10, decimals) : 0;
  const currency = String(plan.currency ?? "").toUpperCase();
  const period = String(plan.billing_period ?? "").trim().toLowerCase();
  const suffix = period === "annual" ? "/year" : period === "monthly" ? "/month" : "";
  if (currency === "USD") return `$${value.toFixed(0)}${suffix}`;
  return `${value.toFixed(0)} ${currency}${suffix}`;
}

export function formatSubscriptionPrice(args: {
  amountBaseUnits: number | string | null | undefined;
  currency: string | null | undefined;
  currencyDecimals: number | null | undefined;
  billingPeriod: CommunityBillingPeriod | null | undefined;
}): string {
  const raw = String(args.amountBaseUnits ?? "").trim();
  const amount = Number(raw);
  const decimals = Number(args.currencyDecimals ?? 2);
  const value = Number.isFinite(amount) ? amount / Math.pow(10, decimals) : 0;
  const currency = String(args.currency ?? "").toUpperCase();
  const period = String(args.billingPeriod ?? "").trim().toLowerCase();
  const suffix = period === "annual" ? "/year" : period === "monthly" ? "/month" : "";
  if (!raw || !Number.isFinite(amount)) {
    if (period === "monthly") return "monthly";
    if (period === "annual") return "annual";
    return "paid";
  }
  if (currency === "USD") return `$${value.toFixed(0)}${suffix}`;
  return `${value.toFixed(0)} ${currency}${suffix}`;
}

function normalizeAccountTierRaw(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeAccountTierForUi(value: string | null | undefined): AccountTierUi {
  const raw = normalizeAccountTierRaw(value);
  if (raw === "architect") return "architect";
  return "free";
}

export function isAccountTierFree(value: string | null | undefined): boolean {
  return normalizeAccountTierRaw(value) === "free";
}

export function formatAccountTierLabel(
  value: string | null | undefined,
): "Free" | "Polynet Premium" {
  if (normalizeAccountTierForUi(value) === "architect") return POLYNET_PREMIUM_PLAN_NAME;
  return "Free";
}

function normalizeStripeConnectAction(
  value: string | null | undefined,
): StripeConnectReturnAction | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "refresh" || normalized === "return") return normalized;
  return null;
}

function normalizeStripeConnectContext(
  value: string | null | undefined,
): StripeConnectContext | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "account" || normalized === "community") return normalized;
  return null;
}

export function parseStripeConnectReturn(
  searchParams: URLSearchParams,
): StripeConnectReturn | null {
  const action = normalizeStripeConnectAction(searchParams.get("connect"));
  if (!action) return null;
  const context = normalizeStripeConnectContext(searchParams.get("connect_context"));
  if (!context) return null;
  const communitySlug = String(searchParams.get("community_slug") ?? "").trim() || null;
  return {
    action,
    context,
    communitySlug,
  };
}

export function clearStripeConnectQueryParams(searchParams: URLSearchParams): void {
  searchParams.delete("connect");
  searchParams.delete("connect_context");
  searchParams.delete("community_slug");
}
