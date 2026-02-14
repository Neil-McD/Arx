export type BuilderBillingStatus = "success" | "cancel" | "return";
export type BuilderBillingSource = "web" | "desktop" | "unknown";
export type BuilderUpgradeContextValue = "builder" | "create_community";
export type BuilderBillingContext = BuilderUpgradeContextValue | "unknown";

export type BuilderBillingReturn = {
  status: BuilderBillingStatus;
  source: BuilderBillingSource;
  context: BuilderBillingContext;
};

export type PublicPlanSummaryLike = {
  amount_base_units: number | string | null | undefined;
  currency: string | null | undefined;
  currency_decimals: number | null | undefined;
  billing_period: string | null | undefined;
};

export function formatPlanPrice(plan: PublicPlanSummaryLike): string {
  const raw = String(plan.amount_base_units ?? "").trim();
  const amount = Number(raw);
  const decimals = Number(plan.currency_decimals ?? 2);
  const value = Number.isFinite(amount) ? amount / Math.pow(10, decimals) : 0;
  const currency = String(plan.currency ?? "").toUpperCase();
  const period = String(plan.billing_period ?? "").trim().toLowerCase();
  const suffix = period === "yearly" ? "/year" : period === "monthly" ? "/month" : "";
  if (currency === "USD") return `$${value.toFixed(0)}${suffix}`;
  return `${value.toFixed(0)} ${currency}${suffix}`;
}

export function formatSubscriptionPrice(args: {
  amountBaseUnits: number | string | null | undefined;
  currency: string | null | undefined;
  currencyDecimals: number | null | undefined;
  billingPeriod: string | null | undefined;
}): string {
  const raw = String(args.amountBaseUnits ?? "").trim();
  const amount = Number(raw);
  const decimals = Number(args.currencyDecimals ?? 2);
  const value = Number.isFinite(amount) ? amount / Math.pow(10, decimals) : 0;
  const currency = String(args.currency ?? "").toUpperCase();
  const period = String(args.billingPeriod ?? "").trim().toLowerCase();
  const suffix = period === "yearly" ? "/year" : period === "monthly" ? "/month" : "";
  if (!raw || !Number.isFinite(amount)) {
    if (period === "monthly") return "monthly";
    if (period === "yearly") return "annual";
    return "paid";
  }
  if (currency === "USD") return `$${value.toFixed(0)}${suffix}`;
  return `${value.toFixed(0)} ${currency}${suffix}`;
}

export function normalizeBuilderCheckoutTier(tier: "builder" | "architect" | "pro"): "builder" | "pro" {
  return tier === "architect" ? "pro" : tier;
}

export function buildBuilderBillingRedirectUrls(args: {
  origin: string;
  source: "web" | "desktop";
  context: BuilderUpgradeContextValue;
}): { successUrl: string; cancelUrl: string; returnUrl: string } {
  const base = args.origin.replace(/\/+$/, "");
  const encodedContext = encodeURIComponent(args.context);
  return {
    successUrl: `${base}/?billing=success&billing_source=${args.source}&billing_context=${encodedContext}`,
    cancelUrl: `${base}/?billing=cancel&billing_source=${args.source}&billing_context=${encodedContext}`,
    returnUrl: `${base}/?billing=return&billing_source=${args.source}&billing_context=${encodedContext}`,
  };
}

function normalizeBuilderBillingStatus(value: string | null | undefined): BuilderBillingStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "success" || normalized === "cancel" || normalized === "return") {
    return normalized;
  }
  return null;
}

function normalizeBuilderBillingSource(
  value: string | null | undefined,
  fallbackSource: BuilderBillingSource,
): BuilderBillingSource {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "web" || normalized === "desktop") return normalized;
  return fallbackSource;
}

function normalizeBuilderBillingContext(value: string | null | undefined): BuilderBillingContext {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "builder" || normalized === "create_community") return normalized;
  return "unknown";
}

export function parseBuilderBillingReturn(
  searchParams: URLSearchParams,
  opts?: { fallbackSource?: BuilderBillingSource },
): BuilderBillingReturn | null {
  const status =
    normalizeBuilderBillingStatus(searchParams.get("billing")) ??
    normalizeBuilderBillingStatus(searchParams.get("status"));
  if (!status) return null;

  const source = normalizeBuilderBillingSource(
    searchParams.get("billing_source") ?? searchParams.get("source"),
    opts?.fallbackSource ?? "unknown",
  );
  const context = normalizeBuilderBillingContext(
    searchParams.get("billing_context") ?? searchParams.get("context"),
  );

  return { status, source, context };
}

export function clearBuilderBillingQueryParams(searchParams: URLSearchParams): void {
  searchParams.delete("billing");
  searchParams.delete("billing_source");
  searchParams.delete("billing_context");
}
