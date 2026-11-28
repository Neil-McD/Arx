// Pure, deterministic member revenue, realized LTV, stage MRR, and verified
// Chief of Staff saved-revenue helpers (client-safe + server-usable).
// Strictly conservative: refunded/disputed subscriptions never count toward
// realized LTV or saved revenue, and saved revenue requires an auditable
// 3-step chain (at-risk check-in sent -> member re-engaged -> next Stripe
// paid renewal completed).
import { formatPrice } from "./communityMemberRecords";

const DAY_MS = 24 * 60 * 60_000;

const ACTIVE_RECURRING_STATUSES = new Set(["active", "past_due", "cancel_at_period_end"]);
const PAID_RENEWAL_STATUSES = new Set(["active", "cancel_at_period_end"]);
const REVOKED_REVENUE_REASONS = new Set([
  "subscription_refunded",
  "subscription_dispute_opened",
  "subscription_dispute_lost",
]);
const AT_RISK_COACH_REASONS = new Set([
  "quiet_member",
  "course_stall",
  "board_coaching",
  "quiet_newcomer",
  "commitment_followup",
]);

export type PricePointRevenueLike = {
  amountBaseUnits: number;
  currency: string;
  currencyDecimals: number;
  billingPeriod: string;
};

export type SubscriptionRevenueLike = {
  status: string;
  pricePoint: PricePointRevenueLike | null;
  createdAt: number;
  updatedAt?: number;
  currentPeriodStartAt?: number | null;
  currentPeriodEndAt?: number | null;
  endedAt?: number | null;
  cancelAtPeriodEnd?: boolean;
  riskAccessState?: string | null;
};

export type SubscriptionAuditRevenueLike = {
  subscriptionStatus?: string | null;
  currentPeriodStartAt?: number | null;
  pricePoint?: PricePointRevenueLike | null;
  createdAt: number;
};

function addCalendarCyclesUtc(startMs: number, cycles: number, annual: boolean): number {
  const base = new Date(startMs);
  const year = base.getUTCFullYear() + (annual ? cycles : 0);
  const month = base.getUTCMonth() + (annual ? 0 : cycles);
  const targetDay = base.getUTCDate();
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(targetDay, lastDayOfTargetMonth),
    base.getUTCHours(),
    base.getUTCMinutes(),
    base.getUTCSeconds(),
    base.getUTCMilliseconds(),
  );
}

// Counts calendar billing periods from startMs through anchorMs (inclusive),
// e.g. Jan 1 2025 -> Jan 1 2026 monthly = 13 periods (never 14 from a 28-day divisor).
export function countCalendarBillingPeriods(
  startMs: number,
  anchorMs: number,
  billingPeriod: string,
): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(anchorMs) || startMs <= 0) return 0;
  if (anchorMs <= startMs) return 1;
  const period = String(billingPeriod ?? "").trim().toLowerCase();
  const annual = period === "annual" || period === "yearly";
  let cycles = 1;
  const maxCycles = annual ? 50 : 600;
  // Allow a small 12-hour tolerance for Stripe invoice scheduling jitter around the exact boundary.
  const toleranceMs = 12 * 60 * 60_000;
  while (cycles < maxCycles) {
    const nextBoundary = addCalendarCyclesUtc(startMs, cycles, annual);
    if (nextBoundary - toleranceMs <= anchorMs) {
      cycles += 1;
    } else {
      break;
    }
  }
  return cycles;
}

export type PodPaymentRevenueLike = {
  status: string;
  amountBaseUnits: number;
  currency: string;
  createdAt: number;
  grantedAt?: number | null;
  refundDue?: boolean;
};

export type ExternalAppGrantRevenueLike = {
  active: boolean;
  amountBaseUnits?: number | null;
  currency?: string | null;
  currencyDecimals?: number | null;
  billingInterval?: "monthly" | "annual" | "one_time" | string | null;
  createdAt: number;
  startedAt?: number | null;
  endedAt?: number | null;
  updatedAt?: number | null;
};

export type MemberRevenueSummary = {
  active_mrr_base_units: number;
  realized_ltv_base_units: number;
  billing_cycles_paid: number;
  months_retained: number;
  tenure_days: number;
  currency: string | null;
  currency_decimals: number;
  mixed_currency: boolean;
  includes_external_app_sales?: boolean;
};

export type StageMrrSummary = {
  mrr_base_units: number;
  currency: string | null;
  currency_decimals: number;
  mixed_currency: boolean;
  paid_count: number;
};

export type VerifiedSaveResult =
  | {
      saved: true;
      saved_mrr_base_units: number;
      verified_at: string;
      currency: string;
      currency_decimals: number;
    }
  | { saved: false };

export function monthlyMrrForPricePoint(pricePoint: PricePointRevenueLike | null | undefined): number {
  if (!pricePoint) return 0;
  const amount = Math.max(0, Math.floor(Number(pricePoint.amountBaseUnits ?? 0)));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const period = String(pricePoint.billingPeriod ?? "").trim().toLowerCase();
  if (period === "annual" || period === "yearly") {
    return Math.round(amount / 12);
  }
  return amount;
}

export function isAtRiskCoachReason(reason: string | null | undefined): boolean {
  return AT_RISK_COACH_REASONS.has(String(reason ?? "").trim());
}

export function computeMemberRevenueSummary(args: {
  membership: {
    state: string;
    createdAt: number;
    activatedAt?: number | null;
    revokedAt?: number | null;
    revokedReason?: string | null;
  } | null;
  subscriptions: readonly SubscriptionRevenueLike[];
  subscriptionAuditEvents?: readonly SubscriptionAuditRevenueLike[];
  podPayments?: readonly PodPaymentRevenueLike[];
  externalAppGrants?: readonly ExternalAppGrantRevenueLike[];
  nowMs: number;
}): MemberRevenueSummary {
  const membership = args.membership;
  const joinedAtMs = membership
    ? Number(membership.activatedAt ?? membership.createdAt ?? args.nowMs)
    : args.nowMs;
  const isOut =
    !membership ||
    membership.state === "left" ||
    membership.state === "removed" ||
    membership.state === "lapsed" ||
    (membership.state === "payment_hold" &&
      REVOKED_REVENUE_REASONS.has(String(membership.revokedReason ?? "")));
  const latestEndedAt = args.subscriptions.reduce((best, sub) => {
    const end = typeof sub.endedAt === "number" && Number.isFinite(sub.endedAt) ? sub.endedAt : 0;
    return end > best ? end : best;
  }, 0);
  const effectiveEndMs = isOut
    ? Math.max(joinedAtMs, Number(membership?.revokedAt ?? (latestEndedAt || args.nowMs)))
    : Math.max(joinedAtMs, args.nowMs);
  const tenureDays = membership ? Math.max(0, Math.floor((effectiveEndMs - joinedAtMs) / DAY_MS)) : 0;
  const monthsRetained = Math.floor(tenureDays / 30);

  const membershipRevenueRevoked = REVOKED_REVENUE_REASONS.has(String(membership?.revokedReason ?? ""));
  let activeMrrBaseUnits = 0;
  let realizedLtvBaseUnits = 0;
  let billingCyclesPaid = 0;
  let currency: string | null = null;
  let currencyDecimals = 2;
  let mixedCurrency = false;

  const trackCurrency = (rawCurrency: string | null | undefined, rawDecimals?: number | null): boolean => {
    const clean = String(rawCurrency ?? "").trim().toUpperCase();
    if (!clean) return false;
    const decimals = Math.max(0, Math.floor(Number(rawDecimals ?? 2)));
    if (currency && currency !== clean) {
      mixedCurrency = true;
      return false;
    }
    if (!currency) {
      currency = clean;
      currencyDecimals = decimals;
    }
    return true;
  };

  // Distinct evidenced paid billing periods from Stripe sync audit events, preserving
  // the historical pricePoint recorded for each billing cycle (so upgrades/downgrades
  // never retroactively reprice earlier periods).
  const auditPeriodsByDay = new Map<number, { pricePoint: PricePointRevenueLike | null; createdAt: number }>();
  for (const event of args.subscriptionAuditEvents ?? []) {
    const st = String(event.subscriptionStatus ?? "").trim().toLowerCase();
    if (!PAID_RENEWAL_STATUSES.has(st)) continue;
    const periodStart =
      typeof event.currentPeriodStartAt === "number" && Number.isFinite(event.currentPeriodStartAt)
        ? event.currentPeriodStartAt
        : null;
    if (periodStart === null || periodStart <= 0) continue;
    const dayKey = Math.floor(periodStart / DAY_MS);
    const existing = auditPeriodsByDay.get(dayKey);
    const eventAt = Number(event.createdAt ?? 0);
    if (
      !existing ||
      (!existing.pricePoint && event.pricePoint) ||
      (event.pricePoint && eventAt >= existing.createdAt)
    ) {
      auditPeriodsByDay.set(dayKey, {
        pricePoint: event.pricePoint ?? existing?.pricePoint ?? null,
        createdAt: eventAt,
      });
    }
  }

  // Sort newest first so active recurring MRR picks the latest active subscription once.
  const sortedSubs = [...args.subscriptions].sort(
    (a, b) => Number(b.updatedAt ?? b.createdAt ?? 0) - Number(a.updatedAt ?? a.createdAt ?? 0),
  );
  let foundActiveSub = false;

  for (const sub of sortedSubs) {
    const point = sub.pricePoint;
    if (!point || !Number.isFinite(point.amountBaseUnits) || point.amountBaseUnits <= 0) continue;
    const status = String(sub.status ?? "").trim().toLowerCase();
    const revoked = membershipRevenueRevoked || sub.riskAccessState === "revoked";
    if (revoked) continue;

    const sameCurrency = trackCurrency(point.currency, point.currencyDecimals);
    const amount = Math.floor(point.amountBaseUnits);
    const period = String(point.billingPeriod ?? "").trim().toLowerCase();

    if (!foundActiveSub && !isOut && ACTIVE_RECURRING_STATUSES.has(status)) {
      foundActiveSub = true;
      if (sameCurrency) {
        activeMrrBaseUnits += monthlyMrrForPricePoint(point);
      }
    }

    const periodStart =
      typeof sub.currentPeriodStartAt === "number" && Number.isFinite(sub.currentPeriodStartAt)
        ? sub.currentPeriodStartAt
        : null;
    const createdAt = Number(sub.createdAt ?? 0);
    const endBound =
      typeof sub.endedAt === "number" && Number.isFinite(sub.endedAt)
        ? Math.min(sub.endedAt, args.nowMs)
        : args.nowMs;

    // Prefer evidenced historical audit periods (preserving each period's historical price).
    if (sortedSubs.length === 1 && auditPeriodsByDay.size > 0) {
      const evidencedPeriods = new Map<number, PricePointRevenueLike>();
      for (const [dayKey, entry] of auditPeriodsByDay.entries()) {
        evidencedPeriods.set(dayKey, entry.pricePoint ?? point);
      }
      if (periodStart !== null && periodStart > 0 && status !== "past_due") {
        const currentDay = Math.floor(periodStart / DAY_MS);
        if (!evidencedPeriods.has(currentDay)) {
          evidencedPeriods.set(currentDay, point);
        }
      }
      for (const periodPoint of evidencedPeriods.values()) {
        const pAmount = Math.floor(Number(periodPoint.amountBaseUnits ?? 0));
        if (!Number.isFinite(pAmount) || pAmount <= 0) continue;
        billingCyclesPaid += 1;
        if (trackCurrency(periodPoint.currency, periodPoint.currencyDecimals)) {
          realizedLtvBaseUnits += pAmount;
        }
      }
      continue;
    }

    // Fallback when no audit rows exist for this subscription: exact calendar periods.
    let cyclesPaid = 0;
    if (status !== "past_due" || (periodStart !== null && periodStart > createdAt)) {
      const paidAnchor = periodStart !== null ? Math.min(periodStart, endBound) : createdAt;
      if (createdAt > 0 && paidAnchor > createdAt) {
        cyclesPaid = countCalendarBillingPeriods(createdAt, paidAnchor, period);
      } else if (PAID_RENEWAL_STATUSES.has(status) || (status === "ended" && periodStart !== null)) {
        cyclesPaid = 1;
      }
    }
    if (cyclesPaid > 0) {
      billingCyclesPaid += cyclesPaid;
      if (sameCurrency) {
        realizedLtvBaseUnits += cyclesPaid * amount;
      }
    }
  }

  for (const pod of args.podPayments ?? []) {
    if (pod.refundDue) continue;
    const st = String(pod.status ?? "").trim().toLowerCase();
    if (st === "pending" || st === "expired") continue;
    if (typeof pod.grantedAt !== "number" || !Number.isFinite(pod.grantedAt)) continue;
    const amount = Math.floor(Number(pod.amountBaseUnits ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (trackCurrency(pod.currency, 2)) {
      realizedLtvBaseUnits += amount;
    }
  }

  let includesExternalAppSales = false;
  if (!membershipRevenueRevoked) {
    for (const grant of args.externalAppGrants ?? []) {
      const amount = Math.floor(Number(grant.amountBaseUnits ?? 0));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const grantCurrency = String(grant.currency ?? "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(grantCurrency)) continue;
      const decimals = Math.max(0, Math.min(4, Math.floor(Number(grant.currencyDecimals ?? 2))));
      const interval = String(grant.billingInterval ?? "monthly").trim().toLowerCase();
      const sameCurrency = trackCurrency(grantCurrency, decimals);
      includesExternalAppSales = true;

      if (grant.active && !isOut && interval !== "one_time") {
        if (sameCurrency) {
          activeMrrBaseUnits += monthlyMrrForPricePoint({
            amountBaseUnits: amount,
            currency: grantCurrency,
            currencyDecimals: decimals,
            billingPeriod: interval,
          });
        }
      }

      let cyclesPaid = 1;
      if (interval !== "one_time") {
        const startMs =
          typeof grant.startedAt === "number" && Number.isFinite(grant.startedAt) && grant.startedAt > 0
            ? grant.startedAt
            : Number(grant.createdAt ?? 0);
        const endBound = grant.active
          ? args.nowMs
          : Math.min(
              typeof grant.endedAt === "number" && Number.isFinite(grant.endedAt) && grant.endedAt > 0
                ? grant.endedAt
                : Number(grant.updatedAt ?? args.nowMs),
              args.nowMs,
            );
        if (startMs > 0 && endBound > startMs) {
          cyclesPaid = Math.max(1, countCalendarBillingPeriods(startMs, endBound, interval));
        }
      }
      billingCyclesPaid += cyclesPaid;
      if (sameCurrency) {
        realizedLtvBaseUnits += cyclesPaid * amount;
      }
    }
  }

  if (mixedCurrency) {
    realizedLtvBaseUnits = 0;
    activeMrrBaseUnits = 0;
  }

  return {
    active_mrr_base_units: activeMrrBaseUnits,
    realized_ltv_base_units: realizedLtvBaseUnits,
    billing_cycles_paid: billingCyclesPaid,
    months_retained: monthsRetained,
    tenure_days: tenureDays,
    currency: mixedCurrency ? null : currency,
    currency_decimals: currencyDecimals,
    mixed_currency: mixedCurrency,
    ...(includesExternalAppSales ? { includes_external_app_sales: true } : {}),
  };
}

export function evaluateVerifiedSavedMember(args: {
  earliestAtRiskSentAtMs: number | null;
  // Qualifying member activity timestamp(s) strictly between sentAt and renewal.
  // Passing activityTimestampsMs checks whether ANY activity occurred in (sentAt, renewedAt];
  // latestActivityAtMs is only accepted when it itself falls in (sentAt, renewedAt].
  latestActivityAtMs?: number | null;
  activityTimestampsMs?: ReadonlyArray<number | null | undefined>;
  subscription: {
    status: string;
    currentPeriodStartAt?: number | null;
    riskAccessState?: string | null;
    activeMrrBaseUnits: number;
    currency: string | null;
    currencyDecimals: number;
  } | null;
  membershipRevokedReason?: string | null;
}): VerifiedSaveResult {
  const sentAt = args.earliestAtRiskSentAtMs;
  if (typeof sentAt !== "number" || !Number.isFinite(sentAt) || sentAt <= 0) {
    return { saved: false };
  }
  const sub = args.subscription;
  if (!sub || sub.activeMrrBaseUnits <= 0 || !sub.currency) {
    return { saved: false };
  }
  const status = String(sub.status ?? "").trim().toLowerCase();
  if (!PAID_RENEWAL_STATUSES.has(status)) {
    return { saved: false };
  }
  if (
    sub.riskAccessState === "revoked" ||
    REVOKED_REVENUE_REASONS.has(String(args.membershipRevokedReason ?? ""))
  ) {
    return { saved: false };
  }
  const renewedAt = sub.currentPeriodStartAt;
  if (typeof renewedAt !== "number" || !Number.isFinite(renewedAt) || renewedAt <= sentAt) {
    return { saved: false };
  }
  const candidates: number[] = [];
  if (typeof args.latestActivityAtMs === "number" && Number.isFinite(args.latestActivityAtMs)) {
    candidates.push(args.latestActivityAtMs);
  }
  for (const ts of args.activityTimestampsMs ?? []) {
    if (typeof ts === "number" && Number.isFinite(ts)) {
      candidates.push(ts);
    }
  }
  const reengagedBeforeRenewal = candidates.some((ts) => ts > sentAt && ts <= renewedAt);
  if (!reengagedBeforeRenewal) {
    return { saved: false };
  }
  return {
    saved: true,
    saved_mrr_base_units: Math.floor(sub.activeMrrBaseUnits),
    verified_at: new Date(renewedAt).toISOString(),
    currency: sub.currency.toUpperCase(),
    currency_decimals: Math.max(0, Math.floor(sub.currencyDecimals)),
  };
}

export function aggregateStageMrr(
  cards: ReadonlyArray<{
    stage_key: string;
    active_mrr_base_units?: number;
    mrr_currency?: string | null;
    mrr_currency_decimals?: number;
  }>,
): {
  byStage: Record<string, StageMrrSummary>;
  total: StageMrrSummary;
} {
  const byStage: Record<string, StageMrrSummary> = {};
  const total: StageMrrSummary = {
    mrr_base_units: 0,
    currency: null,
    currency_decimals: 2,
    mixed_currency: false,
    paid_count: 0,
  };

  const add = (bucket: StageMrrSummary, amount: number, rawCurrency: string, decimals: number) => {
    const cur = rawCurrency.trim().toUpperCase();
    bucket.paid_count += 1;
    if (bucket.mixed_currency) return;
    if (bucket.currency && bucket.currency !== cur) {
      bucket.mixed_currency = true;
      bucket.currency = null;
      bucket.mrr_base_units = 0;
      return;
    }
    bucket.currency = cur;
    bucket.currency_decimals = decimals;
    bucket.mrr_base_units += amount;
  };

  for (const card of cards) {
    const mrr = Math.max(0, Math.floor(Number(card.active_mrr_base_units ?? 0)));
    const cur = typeof card.mrr_currency === "string" ? card.mrr_currency.trim() : "";
    if (mrr <= 0 || !cur) continue;
    const decimals = Math.max(0, Math.floor(Number(card.mrr_currency_decimals ?? 2)));
    const stageBucket =
      byStage[card.stage_key] ??
      (byStage[card.stage_key] = {
        mrr_base_units: 0,
        currency: null,
        currency_decimals: decimals,
        mixed_currency: false,
        paid_count: 0,
      });
    add(stageBucket, mrr, cur, decimals);
    add(total, mrr, cur, decimals);
  }

  return { byStage, total };
}

export function formatCompactMrr(
  baseUnits: number,
  currency: string | null | undefined,
  decimals = 2,
): string | null {
  if (!currency || !Number.isFinite(baseUnits) || baseUnits <= 0) return null;
  return `${formatPrice(baseUnits, currency, decimals)}/mo`;
}
