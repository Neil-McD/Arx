import assert from "node:assert/strict";

import {
  DEFAULT_DAYTONA_SANDBOX_CPU,
  DEFAULT_DAYTONA_SANDBOX_MEMORY_GIB,
  estimateDaytonaWorkspaceComputeUsd,
  estimateDaytonaWorkspaceReservationCredits,
  priceDaytonaWorkspaceUsageCredits,
} from "../shared/workspaceCredits.ts";

type Balance = {
  id: string;
  userId: string;
  includedCreditsBalance: number;
  purchasedCreditsBalance: number;
  uncollectedCreditsBalance: number;
  includedCycleStartedAt: number;
  includedCycleEndsAt: number;
};

type LedgerEntry = {
  creditKey: string;
  userId: string;
  status: "reserved" | "succeeded" | "refunded";
  creditsReserved: number;
  creditsSettled?: number;
  includedCreditsDebited: number;
  purchasedCreditsDebited: number;
  includedCreditsRefunded?: number;
  purchasedCreditsRefunded?: number;
  expiresAt: number;
};

type CheckoutSession = {
  sessionId: string;
  userId: string;
  credits: number;
  status: "pending" | "complete" | "expired";
  workspaceCreditsGrantedAt?: number;
  workspaceCreditsUncollectedPaid?: number;
};

function roundCredits(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function newBalance(input: {
  id?: string;
  userId?: string;
  included?: number;
  purchased?: number;
  uncollected?: number;
  cycleStart?: number;
  cycleEnd?: number;
} = {}): Balance {
  return {
    id: input.id ?? "balance_1",
    userId: input.userId ?? "user_1",
    includedCreditsBalance: roundCredits(input.included ?? 0),
    purchasedCreditsBalance: roundCredits(input.purchased ?? 0),
    uncollectedCreditsBalance: roundCredits(input.uncollected ?? 0),
    includedCycleStartedAt: input.cycleStart ?? 0,
    includedCycleEndsAt: input.cycleEnd ?? 1000,
  };
}

class CreditAccountingHarness {
  balances: Balance[];
  ledger = new Map<string, LedgerEntry>();
  checkouts = new Map<string, CheckoutSession>();
  stripeCheckoutCreates = 0;

  constructor(balances: Balance[] = [newBalance()]) {
    this.balances = balances;
  }

  canonicalBalance(userId = "user_1"): Balance | null {
    const rows = this.balances.filter((row) => row.userId === userId);
    if (rows.length > 1) throw new Error("workspace_credit_balance_duplicate");
    return rows[0] ?? null;
  }

  ensureBalance(userId = "user_1"): Balance {
    const existing = this.canonicalBalance(userId);
    if (existing) return existing;
    const row = newBalance({ id: `balance_${this.balances.length + 1}`, userId });
    this.balances.push(row);
    return row;
  }

  startTopup(input: { sessionId: string; userId?: string; credits: number }): CheckoutSession {
    this.canonicalBalance(input.userId ?? "user_1");
    const session = {
      sessionId: input.sessionId,
      userId: input.userId ?? "user_1",
      credits: input.credits,
      status: "pending" as const,
    };
    this.checkouts.set(session.sessionId, session);
    this.stripeCheckoutCreates += 1;
    return session;
  }

  repairDuplicateBalance(userId = "user_1") {
    const rows = this.balances.filter((row) => row.userId === userId);
    if (rows.length >= 25) throw new Error("workspace_credit_balance_repair_row_limit_exceeded");
    if (rows.length <= 1) {
      return { rows: rows.length, mergedDuplicateRows: 0, repaired: false };
    }
    const [canonical, ...duplicates] = rows;
    canonical.includedCreditsBalance = roundCredits(
      rows.reduce((sum, row) => sum + Math.max(0, row.includedCreditsBalance), 0),
    );
    canonical.purchasedCreditsBalance = roundCredits(
      rows.reduce((sum, row) => sum + Math.max(0, row.purchasedCreditsBalance), 0),
    );
    canonical.uncollectedCreditsBalance = roundCredits(
      rows.reduce((sum, row) => sum + Math.max(0, row.uncollectedCreditsBalance), 0),
    );
    this.balances = this.balances.filter((row) => row.userId !== userId || row.id === canonical.id);
    return { rows: rows.length, mergedDuplicateRows: duplicates.length, repaired: true };
  }

  reserve(input: {
    creditKey: string;
    credits: number;
    userId?: string;
    expiresAt?: number;
  }): LedgerEntry {
    if (this.ledger.has(input.creditKey)) return this.ledger.get(input.creditKey)!;
    const balance = this.canonicalBalance(input.userId ?? "user_1");
    const requestedCredits = roundCredits(input.credits);
    assert.ok(requestedCredits > 0, "reserve requires positive credits");
    if (!balance || balance.uncollectedCreditsBalance > 0) throw new Error("credits_exhausted");
    const total = roundCredits(balance.includedCreditsBalance + balance.purchasedCreditsBalance);
    if (total < requestedCredits) throw new Error("credits_exhausted");

    const included = Math.min(balance.includedCreditsBalance, requestedCredits);
    const purchased = Math.min(balance.purchasedCreditsBalance, requestedCredits - included);
    balance.includedCreditsBalance = roundCredits(balance.includedCreditsBalance - included);
    balance.purchasedCreditsBalance = roundCredits(balance.purchasedCreditsBalance - purchased);
    const entry: LedgerEntry = {
      creditKey: input.creditKey,
      userId: input.userId ?? "user_1",
      status: "reserved",
      creditsReserved: requestedCredits,
      includedCreditsDebited: roundCredits(included),
      purchasedCreditsDebited: roundCredits(purchased),
      expiresAt: input.expiresAt ?? 1000,
    };
    this.ledger.set(input.creditKey, entry);
    return entry;
  }

  settle(input: {
    creditKey: string;
    status: "succeeded" | "refunded";
    creditsSettled?: number;
  }): LedgerEntry {
    const entry = this.ledger.get(input.creditKey);
    assert.ok(entry, "ledger entry must exist");
    if (entry.status !== "reserved") return entry;
    const requested = input.status === "refunded"
      ? 0
      : roundCredits(input.creditsSettled ?? entry.creditsReserved);
    const reservedSettled = Math.min(requested, entry.creditsReserved);
    const includedSettled = Math.min(entry.includedCreditsDebited, reservedSettled);
    const purchasedSettled = Math.min(
      entry.purchasedCreditsDebited,
      Math.max(0, reservedSettled - includedSettled),
    );
    const includedRefunded = roundCredits(entry.includedCreditsDebited - includedSettled);
    const purchasedRefunded = roundCredits(entry.purchasedCreditsDebited - purchasedSettled);
    let extraSettled = 0;
    if (input.status === "succeeded" && requested > reservedSettled) {
      extraSettled = this.debitAvailable(entry.userId, requested - reservedSettled);
    }
    const balance = this.ensureBalance(entry.userId);
    balance.includedCreditsBalance = roundCredits(balance.includedCreditsBalance + includedRefunded);
    balance.purchasedCreditsBalance = roundCredits(balance.purchasedCreditsBalance + purchasedRefunded);
    const creditsSettled = roundCredits(reservedSettled + extraSettled);
    const uncollected = roundCredits(Math.max(0, requested - creditsSettled));
    balance.uncollectedCreditsBalance = roundCredits(balance.uncollectedCreditsBalance + uncollected);
    entry.status = input.status;
    entry.creditsSettled = creditsSettled;
    entry.includedCreditsRefunded = includedRefunded;
    entry.purchasedCreditsRefunded = purchasedRefunded;
    return entry;
  }

  debitAvailable(userId: string, credits: number): number {
    const balance = this.canonicalBalance(userId);
    if (!balance) return 0;
    const included = Math.min(balance.includedCreditsBalance, credits);
    const purchased = Math.min(balance.purchasedCreditsBalance, credits - included);
    balance.includedCreditsBalance = roundCredits(balance.includedCreditsBalance - included);
    balance.purchasedCreditsBalance = roundCredits(balance.purchasedCreditsBalance - purchased);
    return roundCredits(included + purchased);
  }

  completeTopup(input: { sessionId: string; userId?: string; credits: number }): CheckoutSession {
    const existing = this.checkouts.get(input.sessionId);
    if (existing?.workspaceCreditsGrantedAt) return existing;
    const session = existing ?? {
      sessionId: input.sessionId,
      userId: input.userId ?? "user_1",
      credits: input.credits,
      status: "pending" as const,
    };
    const balance = this.ensureBalance(session.userId);
    const paidUncollected = Math.min(balance.uncollectedCreditsBalance, session.credits);
    balance.uncollectedCreditsBalance = roundCredits(balance.uncollectedCreditsBalance - paidUncollected);
    balance.purchasedCreditsBalance = roundCredits(
      balance.purchasedCreditsBalance + session.credits - paidUncollected,
    );
    session.status = "complete";
    session.workspaceCreditsGrantedAt = Date.now();
    session.workspaceCreditsUncollectedPaid = roundCredits(paidUncollected);
    this.checkouts.set(session.sessionId, session);
    return session;
  }

  reconcileExpired(nowMs: number): number {
    let refunded = 0;
    for (const entry of this.ledger.values()) {
      if (entry.status !== "reserved" || entry.expiresAt > nowMs) continue;
      this.settle({ creditKey: entry.creditKey, status: "refunded" });
      refunded += 1;
    }
    return refunded;
  }
}

function testDuplicateTopupWebhookIsIdempotent() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 0 })]);
  harness.completeTopup({ sessionId: "cs_1", credits: 500 });
  harness.completeTopup({ sessionId: "cs_1", credits: 500 });
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 500);
  assert.equal(harness.checkouts.get("cs_1")?.status, "complete");
}

function testProviderFailureRefundsReservation() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 20 })]);
  harness.reserve({ creditKey: "credit_1", credits: 8 });
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 12);
  const entry = harness.settle({ creditKey: "credit_1", status: "refunded" });
  assert.equal(entry.status, "refunded");
  assert.equal(entry.purchasedCreditsRefunded, 8);
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 20);
}

function testPartialSettlementRefundsUnusedReservation() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 20 })]);
  harness.reserve({ creditKey: "credit_2", credits: 10 });
  const entry = harness.settle({ creditKey: "credit_2", status: "succeeded", creditsSettled: 4 });
  assert.equal(entry.status, "succeeded");
  assert.equal(entry.creditsSettled, 4);
  assert.equal(entry.purchasedCreditsRefunded, 6);
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 16);
}

function testOverageCreatesDebtAndTopupClearsItFirst() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 5 })]);
  harness.reserve({ creditKey: "credit_3", credits: 5 });
  const entry = harness.settle({ creditKey: "credit_3", status: "succeeded", creditsSettled: 8 });
  assert.equal(entry.creditsSettled, 5);
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 3);
  assert.throws(
    () => harness.reserve({ creditKey: "credit_4", credits: 1 }),
    /credits_exhausted/,
  );

  const session = harness.completeTopup({ sessionId: "cs_2", credits: 10 });
  assert.equal(session.workspaceCreditsUncollectedPaid, 3);
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 0);
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 7);
}

function testExpiredReservationRefundsHeldCredits() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 20 })]);
  harness.reserve({ creditKey: "credit_5", credits: 9, expiresAt: 100 });
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 11);
  assert.equal(harness.reconcileExpired(101), 1);
  assert.equal(harness.ledger.get("credit_5")?.status, "refunded");
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 20);
}

function testDuplicateBalanceFailsClosed() {
  const harness = new CreditAccountingHarness([
    newBalance({ id: "balance_1", purchased: 10 }),
    newBalance({ id: "balance_2", purchased: 10 }),
  ]);
  assert.throws(
    () => harness.startTopup({ sessionId: "cs_duplicate", credits: 500 }),
    /workspace_credit_balance_duplicate/,
  );
  assert.equal(harness.stripeCheckoutCreates, 0);
  assert.equal(harness.checkouts.size, 0);
  assert.throws(
    () => harness.reserve({ creditKey: "credit_6", credits: 1 }),
    /workspace_credit_balance_duplicate/,
  );
  assert.throws(
    () => harness.completeTopup({ sessionId: "cs_3", credits: 500 }),
    /workspace_credit_balance_duplicate/,
  );
}

function testTargetedRepairAllowsTopupGrantOnce() {
  const harness = new CreditAccountingHarness([
    newBalance({ id: "balance_1", purchased: 10, uncollected: 2 }),
    newBalance({ id: "balance_2", purchased: 15, uncollected: 1 }),
  ]);
  assert.throws(
    () => harness.startTopup({ sessionId: "cs_repair", credits: 100 }),
    /workspace_credit_balance_duplicate/,
  );
  const repair = harness.repairDuplicateBalance();
  assert.deepEqual(repair, { rows: 2, mergedDuplicateRows: 1, repaired: true });
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 25);
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 3);

  harness.startTopup({ sessionId: "cs_repair", credits: 100 });
  harness.completeTopup({ sessionId: "cs_repair", credits: 100 });
  harness.completeTopup({ sessionId: "cs_repair", credits: 100 });
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 0);
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 122);
  assert.equal(harness.checkouts.get("cs_repair")?.workspaceCreditsUncollectedPaid, 3);
  assert.equal(harness.stripeCheckoutCreates, 1);
}

function testDaytonaRawElapsedSettlementRefundsHoldRemainder() {
  const reservationCredits = estimateDaytonaWorkspaceReservationCredits({
    sandboxCpu: DEFAULT_DAYTONA_SANDBOX_CPU,
    sandboxMemoryGiB: DEFAULT_DAYTONA_SANDBOX_MEMORY_GIB,
  });
  const actualCostUsd = estimateDaytonaWorkspaceComputeUsd({
    durationSeconds: 12,
    sandboxCpu: DEFAULT_DAYTONA_SANDBOX_CPU,
    sandboxMemoryGiB: DEFAULT_DAYTONA_SANDBOX_MEMORY_GIB,
  });
  const actualCredits = priceDaytonaWorkspaceUsageCredits({ computeCostUsd: actualCostUsd });
  assert.ok(actualCredits < reservationCredits, "short raw elapsed computer use should settle below the hold");

  const harness = new CreditAccountingHarness([newBalance({ purchased: 100 })]);
  harness.reserve({ creditKey: "daytona_1", credits: reservationCredits });
  const heldBalance = harness.canonicalBalance()!.purchasedCreditsBalance;
  const entry = harness.settle({
    creditKey: "daytona_1",
    status: "succeeded",
    creditsSettled: actualCredits,
  });
  assert.equal(entry.creditsSettled, actualCredits);
  assert.ok(
    harness.canonicalBalance()!.purchasedCreditsBalance > heldBalance,
    "unused computer hold credits should be refunded at settlement",
  );
}

function main() {
  testDuplicateTopupWebhookIsIdempotent();
  testProviderFailureRefundsReservation();
  testPartialSettlementRefundsUnusedReservation();
  testOverageCreatesDebtAndTopupClearsItFirst();
  testExpiredReservationRefundsHeldCredits();
  testDuplicateBalanceFailsClosed();
  testTargetedRepairAllowsTopupGrantOnce();
  testDaytonaRawElapsedSettlementRefundsHoldRemainder();
  console.log("workspace_credit_accounting_behavior_test: ok");
}

main();
