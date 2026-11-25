// Shared contract for Optional Prepaid Community Usage Boosts
// (docs/specs/agent-pricing-and-overage-v1.md).
// Client-safe + server-usable pure rules for boost pack sizing, monthly safety
// caps, first-cycle anti-abuse ceiling, and effective billing-cycle allowance.

// $30.00 charged on Stripe -> +$20.00 (20_000_000 micros) AI allowance (1.5x markup).
export const FOUNDER_USAGE_BOOST_PRICE_CENTS = 3_000;
export const FOUNDER_USAGE_BOOST_ALLOWANCE_MICROS = 20_000_000;

// Allowed founder-selected monthly safety cap presets in USD cents (0 = paused at $20 included).
export const FOUNDER_USAGE_BOOST_CAP_PRESETS_CENTS = [
  0,
  3_000,
  6_000,
  15_000,
  30_000,
] as const;

export type FounderUsageBoostCapCents =
  (typeof FOUNDER_USAGE_BOOST_CAP_PRESETS_CENTS)[number];

// Brand-new subscriptions in their very first billing cycle are hard-capped at
// $60/cycle (2 boosts max) until their first monthly renewal invoice clears.
export const FOUNDER_USAGE_BOOST_FIRST_CYCLE_MAX_CENTS = 6_000;

// Small grace window (24h) around subscription creation vs cycle start to detect
// the initial billing cycle reliably despite Stripe timestamp skew.
const FIRST_CYCLE_GRACE_MS = 24 * 60 * 60_000;

export function isValidFounderUsageBoostCapCents(
  value: unknown,
): value is FounderUsageBoostCapCents {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    (FOUNDER_USAGE_BOOST_CAP_PRESETS_CENTS as readonly number[]).includes(value)
  );
}

export function normalizeFounderUsageBoostCapCents(
  value: unknown,
): FounderUsageBoostCapCents {
  return isValidFounderUsageBoostCapCents(value) ? value : 0;
}

export function computeEffectiveCycleAllowanceMicros(cycle: {
  includedCostMicros: number;
  paidBoostCostMicros?: number | null;
}): number {
  const included = Math.max(0, Math.floor(Number(cycle.includedCostMicros ?? 0)));
  const boost = Math.max(0, Math.floor(Number(cycle.paidBoostCostMicros ?? 0)));
  const total = included + boost;
  if (!Number.isSafeInteger(total)) {
    throw new Error("founder_usage_cycle_ledger_invalid");
  }
  return total;
}

export function isSubscriptionInFirstBillingCycle(input: {
  subscriptionCreatedAtMs: number;
  cycleStartAtMs: number;
}): boolean {
  if (
    !Number.isFinite(input.subscriptionCreatedAtMs) ||
    !Number.isFinite(input.cycleStartAtMs) ||
    input.subscriptionCreatedAtMs <= 0 ||
    input.cycleStartAtMs <= 0
  ) {
    return true;
  }
  return input.cycleStartAtMs <= input.subscriptionCreatedAtMs + FIRST_CYCLE_GRACE_MS;
}

export function resolveEffectiveMonthlyBoostCapCents(input: {
  requestedCapCents: number;
  isFirstCycle: boolean;
}): number {
  const normalized = normalizeFounderUsageBoostCapCents(input.requestedCapCents);
  if (normalized <= 0) return 0;
  if (input.isFirstCycle) {
    return Math.min(normalized, FOUNDER_USAGE_BOOST_FIRST_CYCLE_MAX_CENTS);
  }
  return normalized;
}

export function canGrantAdditionalUsageBoost(input: {
  requestedCapCents: number;
  isFirstCycle: boolean;
  paidBoostCountThisCycle: number;
}): { allowed: true; remainingBoosts: number; effectiveCapCents: number } | { allowed: false; code: string; effectiveCapCents: number } {
  const effectiveCapCents = resolveEffectiveMonthlyBoostCapCents({
    requestedCapCents: input.requestedCapCents,
    isFirstCycle: input.isFirstCycle,
  });
  if (effectiveCapCents <= 0) {
    return { allowed: false, code: "usage_boost_disabled", effectiveCapCents: 0 };
  }
  const maxBoosts = Math.floor(effectiveCapCents / FOUNDER_USAGE_BOOST_PRICE_CENTS);
  const usedBoosts = Math.max(0, Math.floor(Number(input.paidBoostCountThisCycle ?? 0)));
  if (usedBoosts >= maxBoosts) {
    return {
      allowed: false,
      code: input.isFirstCycle && input.requestedCapCents > FOUNDER_USAGE_BOOST_FIRST_CYCLE_MAX_CENTS
        ? "usage_boost_first_cycle_cap_reached"
        : "usage_boost_monthly_cap_reached",
      effectiveCapCents,
    };
  }
  return {
    allowed: true,
    remainingBoosts: maxBoosts - usedBoosts,
    effectiveCapCents,
  };
}
