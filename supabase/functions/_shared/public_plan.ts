export type PublicRecurringPlan = {
  id?: string;
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: "monthly" | "yearly";
};

export function sanitizeRecurringBillingPeriod(value: unknown): "monthly" | "yearly" | null {
  const billingPeriod = String(value ?? "").trim().toLowerCase();
  if (billingPeriod === "monthly" || billingPeriod === "yearly") return billingPeriod;
  return null;
}

export function requireRecurringBillingPeriod(
  value: unknown,
  errorMessage = "invalid_billing_period",
): "monthly" | "yearly" {
  const normalized = sanitizeRecurringBillingPeriod(value);
  if (!normalized) throw new Error(errorMessage);
  return normalized;
}

export function toPublicRecurringPlan(
  raw: unknown,
  opts?: { includeId?: boolean },
): PublicRecurringPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const billingPeriod = sanitizeRecurringBillingPeriod(row.billing_period);
  if (!billingPeriod) return null;
  const name = String(row.name ?? "").trim();
  const amountBaseUnits = String(row.amount_base_units ?? "").trim();
  const currency = String(row.currency ?? "").trim();
  const currencyDecimals = Number(row.currency_decimals);
  if (!name || !amountBaseUnits || !currency || !Number.isFinite(currencyDecimals)) return null;
  return {
    ...(opts?.includeId && typeof row.id === "string" ? { id: row.id } : null),
    name,
    description: typeof row.description === "string" ? row.description : null,
    amount_base_units: amountBaseUnits,
    currency,
    currency_decimals: currencyDecimals,
    billing_period: billingPeriod,
  };
}

export function parsePublicRecurringPlans(
  raw: unknown,
  opts?: { includeId?: boolean },
): PublicRecurringPlan[] {
  if (!Array.isArray(raw)) return [];
  const plans: PublicRecurringPlan[] = [];
  for (const item of raw) {
    const plan = toPublicRecurringPlan(item, opts);
    if (!plan) continue;
    plans.push(plan);
  }
  plans.sort((a, b) => {
    const ar = a.billing_period === "monthly" ? 0 : 1;
    const br = b.billing_period === "monthly" ? 0 : 1;
    return ar - br;
  });
  return plans;
}
