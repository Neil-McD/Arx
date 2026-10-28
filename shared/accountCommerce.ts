import type { CommunityBillingPeriod } from "./communityTypes";

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
