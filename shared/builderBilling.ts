import type { CommunityBillingPeriod } from "./communityTypes";

export type BuilderTierUi = "free" | "architect";

export type BuilderConnectReturnAction = "refresh" | "return";
export type BuilderConnectContext = "account" | "community";

export type BuilderConnectReturn = {
  action: BuilderConnectReturnAction;
  context: BuilderConnectContext;
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

function normalizeBuilderTierRaw(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeBuilderTierForUi(value: string | null | undefined): BuilderTierUi {
  const raw = normalizeBuilderTierRaw(value);
  if (raw === "architect") return "architect";
  return "free";
}

export function isBuilderTierFree(value: string | null | undefined): boolean {
  return normalizeBuilderTierRaw(value) === "free";
}

export function formatBuilderTierLabel(
  value: string | null | undefined,
): "Free" | "Architect" {
  if (normalizeBuilderTierForUi(value) === "architect") return "Architect";
  return "Free";
}

function normalizeBuilderConnectAction(
  value: string | null | undefined,
): BuilderConnectReturnAction | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "refresh" || normalized === "return") return normalized;
  return null;
}

function normalizeBuilderConnectContext(
  value: string | null | undefined,
): BuilderConnectContext | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "account" || normalized === "community") return normalized;
  return null;
}

export function parseBuilderConnectReturn(
  searchParams: URLSearchParams,
): BuilderConnectReturn | null {
  const action = normalizeBuilderConnectAction(searchParams.get("connect"));
  if (!action) return null;
  const context = normalizeBuilderConnectContext(searchParams.get("connect_context"));
  if (!context) return null;
  const communitySlug = String(searchParams.get("community_slug") ?? "").trim() || null;
  return {
    action,
    context,
    communitySlug,
  };
}

export function clearBuilderConnectQueryParams(searchParams: URLSearchParams): void {
  searchParams.delete("connect");
  searchParams.delete("connect_context");
  searchParams.delete("community_slug");
}
