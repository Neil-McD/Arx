import {
  POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS,
  POLYNET_FOUNDER_PLAN_PRICING_VERSION,
  founderSubscriptionStatusGrantsAccess,
  type FounderSubscriptionStatus,
} from "../shared/founderPlan";
import type { FounderInferencePricing } from "./founderPlanPricing";

export type FounderSubscriptionRow = {
  _id: any;
  ownerUserId: any;
  communityId?: any;
  attachedAt?: number;
  provider: "stripe";
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  status: FounderSubscriptionStatus;
  currentPeriodStartAt: number;
  currentPeriodEndAt: number;
  cancelAtPeriodEnd: boolean;
  endedAt?: number;
  revokedReason?: string;
  riskAccessState?: "clear" | "revoked";
  riskStateChangedAt?: number;
  lastProviderEventCreatedAt: number;
  createdAt: number;
  updatedAt: number;
};

export type FounderUsageCycleRow = {
  _id: any;
  founderSubscriptionId: any;
  communityId: any;
  cycleKey: string;
  cycleStartAt: number;
  cycleEndAt: number;
  includedCostMicros: number;
  reservedCostMicros: number;
  settledCostMicros: number;
  pricingVersion: string;
  inputCostMicrosPerMillionTokens: number;
  outputCostMicrosPerMillionTokens: number;
  maxRunReservationCostMicros: number;
  status: "open" | "closed";
  createdAt: number;
  updatedAt: number;
};

function normalizedId(value: unknown): string {
  return String(value ?? "").trim();
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function assertFounderUsageCycleLedgerState(cycle: FounderUsageCycleRow): void {
  if (
    !isPositiveSafeInteger(cycle.includedCostMicros) ||
    !isNonNegativeSafeInteger(cycle.reservedCostMicros) ||
    !isNonNegativeSafeInteger(cycle.settledCostMicros) ||
    !Number.isSafeInteger(cycle.reservedCostMicros + cycle.settledCostMicros) ||
    cycle.reservedCostMicros + cycle.settledCostMicros > cycle.includedCostMicros
  ) {
    throw new Error("founder_usage_cycle_ledger_invalid");
  }
}

export function founderUsageCycleKey(args: {
  providerSubscriptionId: string;
  cycleStartAt: number;
  cycleEndAt: number;
}): string {
  return [
    String(args.providerSubscriptionId ?? "").trim(),
    Math.floor(args.cycleStartAt),
    Math.floor(args.cycleEndAt),
  ].join(":");
}

export async function getFounderSubscriptionByProviderSubscriptionId(
  ctx: any,
  providerSubscriptionId: string,
): Promise<FounderSubscriptionRow | null> {
  const normalized = String(providerSubscriptionId ?? "").trim();
  if (!normalized) return null;
  const rows = (await ctx.db
    .query("founderSubscriptions" as any)
    .withIndex("by_provider_subscription", (q: any) =>
      q.eq("providerSubscriptionId", normalized),
    )
    .take(2)) as FounderSubscriptionRow[];
  if (rows.length > 1) throw new Error("founder_subscription_ambiguous");
  return rows[0] ?? null;
}

export async function getFounderSubscriptionByCommunity(
  ctx: any,
  communityId: any,
  nowMs: number = Date.now(),
): Promise<FounderSubscriptionRow | null> {
  const rows = (await ctx.db
    .query("founderSubscriptions" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as FounderSubscriptionRow[];
  const grantingRows = rows.filter((row) =>
    founderSubscriptionStatusGrantsAccess({
      status: row.status,
      currentPeriodEndAt: row.currentPeriodEndAt,
      nowMs,
    }),
  );
  if (grantingRows.length > 1) throw new Error("founder_subscription_ambiguous");
  if (grantingRows.length === 1) return grantingRows[0]!;
  return rows.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

export async function syncFounderUsageCycle(args: {
  ctx: any;
  subscription: FounderSubscriptionRow;
  cycleStartAt: number;
  cycleEndAt: number;
  pricing: FounderInferencePricing | null;
  nowMs: number;
}): Promise<FounderUsageCycleRow | null> {
  const subscriptionCommunityId = normalizedId(args.subscription.communityId);
  if (!subscriptionCommunityId) {
    throw new Error("founder_subscription_community_missing");
  }
  if (!(args.cycleStartAt > 0) || !(args.cycleEndAt > args.cycleStartAt)) {
    throw new Error("founder_subscription_cycle_invalid");
  }
  const cycleKey = founderUsageCycleKey({
    providerSubscriptionId: args.subscription.providerSubscriptionId,
    cycleStartAt: args.cycleStartAt,
    cycleEndAt: args.cycleEndAt,
  });
  const matchingCycles = (await args.ctx.db
    .query("founderUsageCycles" as any)
    .withIndex("by_cycle_key", (q: any) => q.eq("cycleKey", cycleKey))
    .take(2)) as FounderUsageCycleRow[];
  if (matchingCycles.length > 1) throw new Error("founder_usage_cycle_ambiguous");
  const existing = matchingCycles[0] ?? null;
  const openCycles = (await args.ctx.db
    .query("founderUsageCycles" as any)
    .withIndex("by_subscription_status", (q: any) =>
      q.eq("founderSubscriptionId", args.subscription._id).eq("status", "open"),
    )
    .collect()) as FounderUsageCycleRow[];
  for (const cycle of openCycles) {
    if (cycle.cycleKey === cycleKey) continue;
    await args.ctx.db.patch(cycle._id as any, {
      status: "closed",
      updatedAt: args.nowMs,
    });
  }
  if (existing) {
    assertFounderUsageCycleLedgerState(existing);
    if (normalizedId(existing.founderSubscriptionId) !== normalizedId(args.subscription._id)) {
      throw new Error("founder_usage_cycle_identity_mismatch");
    }
    if (normalizedId(existing.communityId) !== subscriptionCommunityId) {
      throw new Error("founder_usage_cycle_community_mismatch");
    }
    await args.ctx.db.patch(existing._id as any, {
      cycleStartAt: args.cycleStartAt,
      cycleEndAt: args.cycleEndAt,
      status: "open",
      updatedAt: args.nowMs,
    });
    return {
      ...existing,
      cycleStartAt: args.cycleStartAt,
      cycleEndAt: args.cycleEndAt,
      status: "open",
      updatedAt: args.nowMs,
    };
  }
  if (!args.pricing) return null;
  if (
    args.pricing.pricingVersion !== POLYNET_FOUNDER_PLAN_PRICING_VERSION ||
    args.pricing.includedCostMicros !== POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS ||
    !isPositiveSafeInteger(args.pricing.inputCostMicrosPerMillionTokens) ||
    !isPositiveSafeInteger(args.pricing.outputCostMicrosPerMillionTokens) ||
    !isPositiveSafeInteger(args.pricing.maxRunReservationCostMicros) ||
    args.pricing.maxRunReservationCostMicros > args.pricing.includedCostMicros
  ) {
    throw new Error("founder_inference_pricing_misconfigured");
  }
  const id = await args.ctx.db.insert("founderUsageCycles" as any, {
    founderSubscriptionId: args.subscription._id,
    communityId: args.subscription.communityId,
    cycleKey,
    cycleStartAt: args.cycleStartAt,
    cycleEndAt: args.cycleEndAt,
    includedCostMicros: POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS,
    reservedCostMicros: 0,
    settledCostMicros: 0,
    pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
    inputCostMicrosPerMillionTokens: args.pricing.inputCostMicrosPerMillionTokens,
    outputCostMicrosPerMillionTokens: args.pricing.outputCostMicrosPerMillionTokens,
    maxRunReservationCostMicros: args.pricing.maxRunReservationCostMicros,
    status: "open",
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(id as any)) as FounderUsageCycleRow | null;
  if (!created) throw new Error("founder_usage_cycle_create_failed");
  return created;
}

export async function reserveFounderUsage(args: {
  ctx: any;
  founderSubscriptionId: any;
  communityId: any;
  nowMs: number;
  reservationCostMicros?: number;
}): Promise<
  | { ok: true; cycle: FounderUsageCycleRow; reservationCostMicros: number }
  | { ok: false; code: string }
> {
  const subscription = (await args.ctx.db.get(
    args.founderSubscriptionId as any,
  )) as FounderSubscriptionRow | null;
  if (
    !subscription ||
    normalizedId(subscription.communityId) !== normalizedId(args.communityId)
  ) {
    return { ok: false, code: "funding_authority_changed" };
  }
  if (!founderSubscriptionStatusGrantsAccess({
    status: subscription.status,
    currentPeriodEndAt: subscription.currentPeriodEndAt,
    nowMs: args.nowMs,
  })) {
    return { ok: false, code: "founder_subscription_inactive" };
  }
  const cycles = (await args.ctx.db
    .query("founderUsageCycles" as any)
    .withIndex("by_subscription_status", (q: any) =>
      q.eq("founderSubscriptionId", subscription._id).eq("status", "open"),
    )
    .collect()) as FounderUsageCycleRow[];
  const active = cycles.filter(
    (cycle) => cycle.cycleStartAt <= args.nowMs && cycle.cycleEndAt > args.nowMs,
  );
  if (active.length !== 1) {
    return { ok: false, code: active.length > 1 ? "founder_usage_cycle_ambiguous" : "founder_usage_cycle_missing" };
  }
  const cycle = active[0]!;
  assertFounderUsageCycleLedgerState(cycle);
  if (normalizedId(cycle.communityId) !== normalizedId(args.communityId)) {
    return { ok: false, code: "founder_usage_cycle_community_mismatch" };
  }
  const hasExplicitReservation = args.reservationCostMicros !== undefined;
  const requestedReservationCostMicros = hasExplicitReservation
    ? args.reservationCostMicros!
    : cycle.maxRunReservationCostMicros;
  if (
    !Number.isSafeInteger(requestedReservationCostMicros) ||
    requestedReservationCostMicros <= 0 ||
    requestedReservationCostMicros > cycle.includedCostMicros
  ) {
    return {
      ok: false,
      code: hasExplicitReservation
        ? "founder_usage_reservation_invalid"
        : "founder_inference_pricing_misconfigured",
    };
  }
  const reservationCostMicros = requestedReservationCostMicros;
  const nextReserved = cycle.reservedCostMicros + reservationCostMicros;
  if (!Number.isSafeInteger(nextReserved)) {
    throw new Error("founder_usage_cycle_ledger_invalid");
  }
  if (nextReserved + cycle.settledCostMicros > cycle.includedCostMicros) {
    return { ok: false, code: "founder_usage_exhausted" };
  }
  await args.ctx.db.patch(cycle._id as any, {
    reservedCostMicros: nextReserved,
    updatedAt: args.nowMs,
  });
  return {
    ok: true,
    cycle: {
      ...cycle,
      reservedCostMicros: nextReserved,
      updatedAt: args.nowMs,
    },
    reservationCostMicros,
  };
}

export async function settleFounderUsageReservation(args: {
  ctx: any;
  usageCycleId: any;
  reservedCostMicros: number;
  settledCostMicros: number;
  nowMs: number;
}): Promise<void> {
  const cycle = (await args.ctx.db.get(args.usageCycleId as any)) as FounderUsageCycleRow | null;
  if (!cycle) throw new Error("founder_usage_cycle_missing");
  assertFounderUsageCycleLedgerState(cycle);
  if (!isPositiveSafeInteger(args.reservedCostMicros)) {
    throw new Error("founder_usage_settlement_invalid");
  }
  if (!isNonNegativeSafeInteger(args.settledCostMicros)) {
    throw new Error("founder_usage_settlement_invalid");
  }
  const reservedCostMicros = args.reservedCostMicros;
  const settledCostMicros = args.settledCostMicros;
  if (settledCostMicros > reservedCostMicros) {
    throw new Error("founder_usage_settlement_exceeds_reservation");
  }
  if (cycle.reservedCostMicros < reservedCostMicros) {
    throw new Error("founder_usage_reservation_underflow");
  }
  const nextReservedCostMicros = cycle.reservedCostMicros - reservedCostMicros;
  const nextSettledCostMicros = cycle.settledCostMicros + settledCostMicros;
  if (
    !Number.isSafeInteger(nextReservedCostMicros) ||
    !Number.isSafeInteger(nextSettledCostMicros) ||
    !Number.isSafeInteger(nextReservedCostMicros + nextSettledCostMicros) ||
    nextReservedCostMicros + nextSettledCostMicros > cycle.includedCostMicros
  ) {
    throw new Error("founder_usage_cycle_ledger_invalid");
  }
  await args.ctx.db.patch(cycle._id as any, {
    reservedCostMicros: nextReservedCostMicros,
    settledCostMicros: nextSettledCostMicros,
    updatedAt: args.nowMs,
  });
}
