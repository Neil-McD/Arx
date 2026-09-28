import { POLYNET_OPERATOR_GRANT_MONTHLY_INCLUDED_COST_MICROS } from "../shared/founderPlan";
import { utcMonthWindow } from "../shared/founderInference";

export type OperatorGrantUsageCycleRow = {
  _id: any;
  communityId: any;
  cycleKey: string;
  cycleStartAt: number;
  cycleEndAt: number;
  includedCostMicros: number;
  reservedCostMicros: number;
  settledCostMicros: number;
  createdAt: number;
  updatedAt: number;
};

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function assertOperatorGrantLedgerState(cycle: OperatorGrantUsageCycleRow): void {
  if (
    !isNonNegativeSafeInteger(cycle.includedCostMicros) ||
    cycle.includedCostMicros <= 0 ||
    !isNonNegativeSafeInteger(cycle.reservedCostMicros) ||
    !isNonNegativeSafeInteger(cycle.settledCostMicros)
  ) {
    throw new Error("operator_grant_usage_ledger_invalid");
  }
}

export function operatorGrantUsageCycleKey(communityId: unknown, nowMs: number): string {
  return `${String(communityId ?? "").trim()}:${utcMonthWindow(nowMs).key}`;
}

async function getOrCreateOperatorGrantUsageCycle(args: {
  ctx: any;
  communityId: any;
  nowMs: number;
}): Promise<OperatorGrantUsageCycleRow> {
  const cycleKey = operatorGrantUsageCycleKey(args.communityId, args.nowMs);
  const rows = (await args.ctx.db
    .query("operatorGrantUsageCycles")
    .withIndex("by_cycle_key", (q: any) => q.eq("cycleKey", cycleKey))
    .take(2)) as OperatorGrantUsageCycleRow[];
  if (rows.length > 1) throw new Error("operator_grant_usage_cycle_ambiguous");
  if (rows[0]) return rows[0];
  const window = utcMonthWindow(args.nowMs);
  const id = await args.ctx.db.insert("operatorGrantUsageCycles", {
    communityId: args.communityId,
    cycleKey,
    cycleStartAt: window.startAt,
    cycleEndAt: window.endAt,
    includedCostMicros: POLYNET_OPERATOR_GRANT_MONTHLY_INCLUDED_COST_MICROS,
    reservedCostMicros: 0,
    settledCostMicros: 0,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(id)) as OperatorGrantUsageCycleRow | null;
  if (!created) throw new Error("operator_grant_usage_cycle_create_failed");
  return created;
}

// Reserve before any provider call. Exhaustion uses the same code as a
// Builder cycle so every surface already renders the "allowance used" state.
export async function reserveOperatorGrantUsage(args: {
  ctx: any;
  communityId: any;
  reservationCostMicros: number;
  nowMs: number;
}): Promise<
  | { ok: true; cycle: OperatorGrantUsageCycleRow; reservationCostMicros: number }
  | { ok: false; code: string }
> {
  if (
    !Number.isSafeInteger(args.reservationCostMicros) ||
    args.reservationCostMicros <= 0
  ) {
    return { ok: false, code: "founder_inference_pricing_misconfigured" };
  }
  const cycle = await getOrCreateOperatorGrantUsageCycle(args);
  assertOperatorGrantLedgerState(cycle);
  const nextReserved = cycle.reservedCostMicros + args.reservationCostMicros;
  if (!Number.isSafeInteger(nextReserved + cycle.settledCostMicros)) {
    throw new Error("operator_grant_usage_ledger_invalid");
  }
  if (nextReserved + cycle.settledCostMicros > cycle.includedCostMicros) {
    return { ok: false, code: "founder_usage_exhausted" };
  }
  await args.ctx.db.patch(cycle._id, {
    reservedCostMicros: nextReserved,
    updatedAt: args.nowMs,
  });
  return {
    ok: true,
    cycle: { ...cycle, reservedCostMicros: nextReserved, updatedAt: args.nowMs },
    reservationCostMicros: args.reservationCostMicros,
  };
}

// Releases the reservation and records actual (or conservatively assumed)
// spend. Settlement above the reservation is tolerated in the ledger so a
// late settlement can never be lost; the headroom guard prevents it upstream.
export async function settleOperatorGrantUsageReservation(args: {
  ctx: any;
  operatorUsageCycleId: any;
  communityId: any;
  reservedCostMicros: number;
  settledCostMicros: number;
  nowMs: number;
}): Promise<void> {
  const cycle = (await args.ctx.db.get(
    args.operatorUsageCycleId,
  )) as OperatorGrantUsageCycleRow | null;
  if (!cycle) throw new Error("operator_grant_usage_cycle_missing");
  assertOperatorGrantLedgerState(cycle);
  if (String(cycle.communityId) !== String(args.communityId)) {
    throw new Error("operator_grant_usage_cycle_community_mismatch");
  }
  if (
    !isNonNegativeSafeInteger(args.reservedCostMicros) ||
    args.reservedCostMicros <= 0 ||
    !isNonNegativeSafeInteger(args.settledCostMicros)
  ) {
    throw new Error("operator_grant_usage_settlement_invalid");
  }
  if (cycle.reservedCostMicros < args.reservedCostMicros) {
    throw new Error("operator_grant_usage_reservation_underflow");
  }
  const nextSettled = cycle.settledCostMicros + args.settledCostMicros;
  if (!Number.isSafeInteger(nextSettled)) {
    throw new Error("operator_grant_usage_ledger_invalid");
  }
  await args.ctx.db.patch(cycle._id, {
    reservedCostMicros: cycle.reservedCostMicros - args.reservedCostMicros,
    settledCostMicros: nextSettled,
    updatedAt: args.nowMs,
  });
}
