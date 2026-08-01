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
  lastProviderEventCreatedAt: number;
  createdAt: number;
  updatedAt: number;
};

export type FounderUsageCycleRow = {
  _id: any;
  founderSubscriptionId: any;
  communityId?: any;
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
): Promise<FounderSubscriptionRow | null> {
  const rows = (await ctx.db
    .query("founderSubscriptions" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(2)) as FounderSubscriptionRow[];
  if (rows.length > 1) throw new Error("founder_subscription_ambiguous");
  return rows[0] ?? null;
}

export async function getAvailableFounderSubscriptionForOwner(args: {
  ctx: any;
  ownerUserId: any;
  nowMs: number;
}): Promise<FounderSubscriptionRow | null> {
  const rows = (await args.ctx.db
    .query("founderSubscriptions" as any)
    .withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.ownerUserId))
    .collect()) as FounderSubscriptionRow[];
  return rows
    .filter(
      (row) =>
        !row.communityId &&
        founderSubscriptionStatusGrantsAccess({
          status: row.status,
          currentPeriodEndAt: row.currentPeriodEndAt,
          nowMs: args.nowMs,
        }),
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
}

export async function requireAvailableFounderSubscription(args: {
  ctx: any;
  ownerUserId: any;
  founderSubscriptionId?: any;
  nowMs: number;
}): Promise<FounderSubscriptionRow> {
  const row = args.founderSubscriptionId
    ? ((await args.ctx.db.get(args.founderSubscriptionId as any)) as FounderSubscriptionRow | null)
    : await getAvailableFounderSubscriptionForOwner(args);
  if (!row || normalizedId(row.ownerUserId) !== normalizedId(args.ownerUserId)) {
    throw new Error("founder_subscription_required");
  }
  if (row.communityId) throw new Error("founder_subscription_already_attached");
  if (!founderSubscriptionStatusGrantsAccess({
    status: row.status,
    currentPeriodEndAt: row.currentPeriodEndAt,
    nowMs: args.nowMs,
  })) {
    throw new Error("founder_subscription_inactive");
  }
  return row;
}

export async function attachFounderSubscriptionToCommunity(args: {
  ctx: any;
  founderSubscriptionId: any;
  ownerUserId: any;
  communityId: any;
  nowMs: number;
}): Promise<void> {
  const row = await requireAvailableFounderSubscription({
    ctx: args.ctx,
    ownerUserId: args.ownerUserId,
    founderSubscriptionId: args.founderSubscriptionId,
    nowMs: args.nowMs,
  });
  const existing = await getFounderSubscriptionByCommunity(args.ctx, args.communityId);
  if (existing) throw new Error("founder_subscription_community_already_attached");
  await args.ctx.db.patch(row._id as any, {
    communityId: args.communityId,
    updatedAt: args.nowMs,
  });
  const openCycles = (await args.ctx.db
    .query("founderUsageCycles" as any)
    .withIndex("by_subscription_status", (q: any) =>
      q.eq("founderSubscriptionId", row._id).eq("status", "open"),
    )
    .collect()) as FounderUsageCycleRow[];
  for (const cycle of openCycles) {
    await args.ctx.db.patch(cycle._id as any, {
      communityId: args.communityId,
      updatedAt: args.nowMs,
    });
  }
}

export async function syncFounderUsageCycle(args: {
  ctx: any;
  subscription: FounderSubscriptionRow;
  cycleStartAt: number;
  cycleEndAt: number;
  pricing: FounderInferencePricing | null;
  nowMs: number;
}): Promise<FounderUsageCycleRow | null> {
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
    if (normalizedId(existing.founderSubscriptionId) !== normalizedId(args.subscription._id)) {
      throw new Error("founder_usage_cycle_identity_mismatch");
    }
    await args.ctx.db.patch(existing._id as any, {
      communityId: args.subscription.communityId,
      cycleStartAt: args.cycleStartAt,
      cycleEndAt: args.cycleEndAt,
      status: "open",
      updatedAt: args.nowMs,
    });
    return {
      ...existing,
      communityId: args.subscription.communityId,
      cycleStartAt: args.cycleStartAt,
      cycleEndAt: args.cycleEndAt,
      status: "open",
      updatedAt: args.nowMs,
    };
  }
  if (!args.pricing) return null;
  if (
    args.pricing.pricingVersion !== POLYNET_FOUNDER_PLAN_PRICING_VERSION ||
    args.pricing.includedCostMicros !== POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS
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
  if (normalizedId(cycle.communityId) !== normalizedId(args.communityId)) {
    return { ok: false, code: "founder_usage_cycle_community_mismatch" };
  }
  const reservationCostMicros = Math.max(
    0,
    Math.floor(cycle.maxRunReservationCostMicros),
  );
  if (reservationCostMicros <= 0) {
    return { ok: false, code: "founder_inference_pricing_misconfigured" };
  }
  const nextReserved = cycle.reservedCostMicros + reservationCostMicros;
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
  const reservedCostMicros = Math.max(0, Math.floor(args.reservedCostMicros));
  const settledCostMicros = Math.max(0, Math.floor(args.settledCostMicros));
  if (cycle.reservedCostMicros < reservedCostMicros) {
    throw new Error("founder_usage_reservation_underflow");
  }
  await args.ctx.db.patch(cycle._id as any, {
    reservedCostMicros: cycle.reservedCostMicros - reservedCostMicros,
    settledCostMicros: cycle.settledCostMicros + settledCostMicros,
    updatedAt: args.nowMs,
  });
}

export async function releaseFounderUsageReservation(args: {
  ctx: any;
  usageCycleId: any;
  reservedCostMicros: number;
  nowMs: number;
}): Promise<void> {
  await settleFounderUsageReservation({
    ...args,
    settledCostMicros: 0,
  });
}
