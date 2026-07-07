import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_WORKSPACE_SANDBOX_CPU,
  DEFAULT_WORKSPACE_SANDBOX_MEMORY_GIB,
  estimateWorkspaceComputeUsd,
  estimateWorkspaceReservationCredits,
  getSpendableWorkspaceToolBalanceCredits,
  normalizePaidToolKind,
  PAID_TOOL_LEDGER_TOOL_NAMES,
  paidToolKindForLedgerToolName,
  priceWorkspaceUsageCredits,
  WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
  WORKSPACE_CARD_COLLECTION_MIN_CREDITS,
  WORKSPACE_FILE_INSPECTION_HOLD_SECONDS,
  WORKSPACE_FILE_INSPECTION_MAX_SECONDS,
  WORKSPACE_FILE_INSPECTION_MIN_BILLABLE_SECONDS,
  WORKSPACE_MEMORY_GIB_USD_PER_SECOND,
  WORKSPACE_VCPU_USD_PER_SECOND,
} from "../shared/workspaceCredits.ts";

type Balance = {
  id: string;
  userId: string;
  includedCreditsBalance: number;
  purchasedCreditsBalance: number;
  uncollectedCreditsBalance: number;
  pendingCardCollectionCreditsBalance: number;
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
  metadata?: Record<string, unknown>;
};

type CheckoutSession = {
  sessionId: string;
  userId: string;
  credits: number;
  status: "pending" | "complete" | "expired";
  workspaceCreditsGrantedAt?: number;
  workspaceCreditsUncollectedPaid?: number;
};

function assertBefore(source: string, first: string, second: string, message: string) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} missing`);
  assert.notEqual(secondIndex, -1, `${second} missing`);
  assert.ok(firstIndex < secondIndex, message);
}

type WorkspaceUsageCollection = {
  collectionKey: string;
  userId: string;
  status: "prepared" | "processing" | "succeeded" | "failed" | "released";
  creditsAmount: number;
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
  pendingCollection?: number;
  cycleStart?: number;
  cycleEnd?: number;
} = {}): Balance {
  return {
    id: input.id ?? "balance_1",
    userId: input.userId ?? "user_1",
    includedCreditsBalance: roundCredits(input.included ?? 0),
    purchasedCreditsBalance: roundCredits(input.purchased ?? 0),
    uncollectedCreditsBalance: roundCredits(input.uncollected ?? 0),
    pendingCardCollectionCreditsBalance: roundCredits(input.pendingCollection ?? 0),
    includedCycleStartedAt: input.cycleStart ?? 0,
    includedCycleEndsAt: input.cycleEnd ?? 1000,
  };
}

class CreditAccountingHarness {
  balances: Balance[];
  ledger = new Map<string, LedgerEntry>();
  checkouts = new Map<string, CheckoutSession>();
  collections = new Map<string, WorkspaceUsageCollection>();
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
    canonical.pendingCardCollectionCreditsBalance = roundCredits(
      rows.reduce(
        (sum, row) => sum + Math.max(0, row.pendingCardCollectionCreditsBalance),
        0,
      ),
    );
    this.balances = this.balances.filter((row) => row.userId !== userId || row.id === canonical.id);
    return { rows: rows.length, mergedDuplicateRows: duplicates.length, repaired: true };
  }

  pendingCardBackedReservationExposure(userId = "user_1"): number {
    let total = 0;
    for (const entry of this.ledger.values()) {
      if (entry.userId !== userId || entry.status !== "reserved") continue;
      if (
        entry.metadata?.billing_mode !== "card_backed" &&
        entry.metadata?.funding_source !== "card_on_file"
      ) {
        continue;
      }
      total += Math.max(
        0,
        entry.creditsReserved -
          entry.includedCreditsDebited -
          entry.purchasedCreditsDebited,
      );
    }
    return roundCredits(total);
  }

  reserve(input: {
    creditKey: string;
    credits: number;
    userId?: string;
    expiresAt?: number;
    allowUncollectedReservation?: boolean;
    uncollectedReservationLimitCredits?: number;
    metadata?: Record<string, unknown>;
  }): LedgerEntry {
    if (this.ledger.has(input.creditKey)) return this.ledger.get(input.creditKey)!;
    const balance = this.canonicalBalance(input.userId ?? "user_1");
    const requestedCredits = roundCredits(input.credits);
    assert.ok(requestedCredits > 0, "reserve requires positive credits");
    const allowUncollectedReservation = input.allowUncollectedReservation === true;
    if (!allowUncollectedReservation && (!balance || balance.uncollectedCreditsBalance > 0)) {
      throw new Error("credits_exhausted");
    }
    const total = roundCredits(balance?.purchasedCreditsBalance ?? 0);
    if (!allowUncollectedReservation && total < requestedCredits) throw new Error("credits_exhausted");

    const included = 0;
    const purchased = Math.min(balance?.purchasedCreditsBalance ?? 0, requestedCredits);
    if (allowUncollectedReservation) {
      const limit = roundCredits(Math.max(0, input.uncollectedReservationLimitCredits ?? 0));
      const uncollectedExposure = roundCredits(Math.max(0, requestedCredits - purchased));
      const currentUncollected = roundCredits(
        (balance?.uncollectedCreditsBalance ?? 0) +
          (balance?.pendingCardCollectionCreditsBalance ?? 0),
      );
      const pendingUncollectedExposure = this.pendingCardBackedReservationExposure(
        input.userId ?? "user_1",
      );
      if (
        !(limit > 0) ||
        currentUncollected + pendingUncollectedExposure + uncollectedExposure > limit
      ) {
        throw new Error("credits_exhausted");
      }
    }
    if (balance && purchased > 0) {
      balance.purchasedCreditsBalance = roundCredits(balance.purchasedCreditsBalance - purchased);
    }
    const entry: LedgerEntry = {
      creditKey: input.creditKey,
      userId: input.userId ?? "user_1",
      status: "reserved",
      creditsReserved: requestedCredits,
      includedCreditsDebited: roundCredits(included),
      purchasedCreditsDebited: roundCredits(purchased),
      expiresAt: input.expiresAt ?? 1000,
      metadata: input.metadata,
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
    const reservedCollected = roundCredits(includedSettled + purchasedSettled);
    const includedRefunded = 0;
    const purchasedRefunded = roundCredits(entry.purchasedCreditsDebited - purchasedSettled);
    let extraSettled = 0;
    if (input.status === "succeeded" && requested > reservedSettled) {
      extraSettled = this.debitAvailable(entry.userId, requested - reservedSettled);
    }
    const balance = this.ensureBalance(entry.userId);
    balance.purchasedCreditsBalance = roundCredits(balance.purchasedCreditsBalance + purchasedRefunded);
    const creditsSettled = roundCredits(reservedCollected + extraSettled);
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
    const purchased = Math.min(balance.purchasedCreditsBalance, credits);
    balance.purchasedCreditsBalance = roundCredits(balance.purchasedCreditsBalance - purchased);
    return roundCredits(purchased);
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

  prepareCardCollection(input: {
    collectionKey: string;
    userId?: string;
    requestedCredits?: number;
  }): WorkspaceUsageCollection | null {
    const existing = this.collections.get(input.collectionKey);
    if (existing) return existing;
    const balance = this.canonicalBalance(input.userId ?? "user_1");
    const uncollected = roundCredits(balance?.uncollectedCreditsBalance ?? 0);
    const requested = roundCredits(input.requestedCredits ?? uncollected);
    const creditsAmount = roundCredits(Math.min(uncollected, requested));
    if (!(creditsAmount > 0)) return null;
    assert.ok(balance, "balance must exist");
    balance.uncollectedCreditsBalance = roundCredits(balance.uncollectedCreditsBalance - creditsAmount);
    balance.pendingCardCollectionCreditsBalance = roundCredits(
      balance.pendingCardCollectionCreditsBalance + creditsAmount,
    );
    const collection: WorkspaceUsageCollection = {
      collectionKey: input.collectionKey,
      userId: input.userId ?? "user_1",
      status: "prepared",
      creditsAmount,
    };
    this.collections.set(collection.collectionKey, collection);
    return collection;
  }

  markCardCollectionProcessing(collectionKey: string): WorkspaceUsageCollection {
    const collection = this.collections.get(collectionKey);
    assert.ok(collection, "collection must exist");
    if (collection.status === "prepared") {
      collection.status = "processing";
    }
    return collection;
  }

  completeCardCollection(input: {
    collectionKey: string;
    status: "succeeded" | "failed" | "released";
  }): WorkspaceUsageCollection {
    const collection = this.collections.get(input.collectionKey);
    assert.ok(collection, "collection must exist");
    if (collection.status !== "prepared" && collection.status !== "processing") return collection;
    const balance = this.ensureBalance(collection.userId);
    assert.ok(
      balance.pendingCardCollectionCreditsBalance >= collection.creditsAmount,
      "pending collection balance must cover collection",
    );
    balance.pendingCardCollectionCreditsBalance = roundCredits(
      balance.pendingCardCollectionCreditsBalance - collection.creditsAmount,
    );
    if (input.status !== "succeeded") {
      balance.uncollectedCreditsBalance = roundCredits(
        balance.uncollectedCreditsBalance + collection.creditsAmount,
      );
    }
    collection.status = input.status;
    return collection;
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

function testCardBackedReservationCreatesUncollectedUsageWithoutPrepaid() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 0 })]);
  const entry = harness.reserve({
    creditKey: "card_backed_1",
    credits: 3,
    allowUncollectedReservation: true,
    uncollectedReservationLimitCredits: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
    metadata: { billing_mode: "card_backed", funding_source: "card_on_file" },
  });
  assert.equal(entry.purchasedCreditsDebited, 0);
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 0);

  const settled = harness.settle({
    creditKey: "card_backed_1",
    status: "succeeded",
    creditsSettled: 2,
  });
  assert.equal(settled.creditsSettled, 0);
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 2);
}

function testCardBackedReservationSpendsPrepaidBeforeUncollectedUsage() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 1 })]);
  const entry = harness.reserve({
    creditKey: "card_backed_2",
    credits: 3,
    allowUncollectedReservation: true,
    uncollectedReservationLimitCredits: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
    metadata: { billing_mode: "card_backed", funding_source: "card_on_file" },
  });
  assert.equal(entry.purchasedCreditsDebited, 1);
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 0);

  const settled = harness.settle({
    creditKey: "card_backed_2",
    status: "succeeded",
    creditsSettled: 2,
  });
  assert.equal(settled.creditsSettled, 1);
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 1);
}

function testCardBackedProviderFailureDoesNotCreateUncollectedUsage() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 1 })]);
  harness.reserve({
    creditKey: "card_backed_refund",
    credits: 3,
    allowUncollectedReservation: true,
    uncollectedReservationLimitCredits: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
    metadata: { billing_mode: "card_backed", funding_source: "card_on_file" },
  });
  const entry = harness.settle({
    creditKey: "card_backed_refund",
    status: "refunded",
  });
  assert.equal(entry.purchasedCreditsRefunded, 1);
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 1);
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 0);
}

function testCardBackedReservationFailsClosedAtUncollectedLimit() {
  const harness = new CreditAccountingHarness([
    newBalance({
      purchased: 0,
      uncollected: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
    }),
  ]);
  assert.throws(
    () =>
      harness.reserve({
        creditKey: "card_backed_limit",
        credits: 1,
        allowUncollectedReservation: true,
        uncollectedReservationLimitCredits: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
      }),
    /credits_exhausted/,
  );
}

function testCardBackedReservationLimitIncludesPendingExposure() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 0 })]);
  harness.reserve({
    creditKey: "card_backed_pending",
    credits: 3,
    allowUncollectedReservation: true,
    uncollectedReservationLimitCredits: 3,
    metadata: { billing_mode: "card_backed", funding_source: "card_on_file" },
  });
  assert.throws(
    () =>
      harness.reserve({
        creditKey: "card_backed_pending_over",
        credits: 1,
        allowUncollectedReservation: true,
        uncollectedReservationLimitCredits: 3,
        metadata: { billing_mode: "card_backed", funding_source: "card_on_file" },
      }),
    /credits_exhausted/,
  );
}

function testCardBackedReservationLimitIncludesPendingCardCollection() {
  const harness = new CreditAccountingHarness([
    newBalance({
      purchased: 0,
      pendingCollection: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
    }),
  ]);
  assert.throws(
    () =>
      harness.reserve({
        creditKey: "card_backed_pending_collection_over",
        credits: 1,
        allowUncollectedReservation: true,
        uncollectedReservationLimitCredits: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
        metadata: { billing_mode: "card_backed", funding_source: "card_on_file" },
      }),
    /credits_exhausted/,
  );
}

function testCardCollectionPrepareLocksDebtAwayFromManualTopup() {
  const harness = new CreditAccountingHarness([newBalance({ uncollected: 10 })]);
  const collection = harness.prepareCardCollection({
    collectionKey: "usage_collection_1",
    requestedCredits: 4,
  });
  assert.equal(collection?.creditsAmount, 4);
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 6);
  assert.equal(harness.canonicalBalance()!.pendingCardCollectionCreditsBalance, 4);

  const session = harness.completeTopup({ sessionId: "cs_pending_race", credits: 10 });
  assert.equal(session.workspaceCreditsUncollectedPaid, 6);
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 0);
  assert.equal(harness.canonicalBalance()!.pendingCardCollectionCreditsBalance, 4);
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 4);
}

function testCardCollectionSuccessClearsPendingOnly() {
  const harness = new CreditAccountingHarness([newBalance({ uncollected: 10 })]);
  harness.prepareCardCollection({ collectionKey: "usage_collection_success", requestedCredits: 4 });
  const collection = harness.completeCardCollection({
    collectionKey: "usage_collection_success",
    status: "succeeded",
  });
  assert.equal(collection.status, "succeeded");
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 6);
  assert.equal(harness.canonicalBalance()!.pendingCardCollectionCreditsBalance, 0);
  harness.completeCardCollection({
    collectionKey: "usage_collection_success",
    status: "succeeded",
  });
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 6);
  assert.equal(harness.canonicalBalance()!.pendingCardCollectionCreditsBalance, 0);
}

function testCardCollectionFailureRestoresUncollectedDebt() {
  const harness = new CreditAccountingHarness([newBalance({ uncollected: 10 })]);
  harness.prepareCardCollection({ collectionKey: "usage_collection_failure", requestedCredits: 4 });
  const collection = harness.completeCardCollection({
    collectionKey: "usage_collection_failure",
    status: "failed",
  });
  assert.equal(collection.status, "failed");
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 10);
  assert.equal(harness.canonicalBalance()!.pendingCardCollectionCreditsBalance, 0);
}

function testProcessingCardCollectionCanFinalize() {
  const harness = new CreditAccountingHarness([newBalance({ uncollected: 60 })]);
  harness.prepareCardCollection({ collectionKey: "usage_collection_processing", requestedCredits: 50 });
  const processing = harness.markCardCollectionProcessing("usage_collection_processing");
  assert.equal(processing.status, "processing");
  const collection = harness.completeCardCollection({
    collectionKey: "usage_collection_processing",
    status: "succeeded",
  });
  assert.equal(collection.status, "succeeded");
  assert.equal(harness.canonicalBalance()!.uncollectedCreditsBalance, 10);
  assert.equal(harness.canonicalBalance()!.pendingCardCollectionCreditsBalance, 0);
}

function testExpiredReservationRefundsHeldCredits() {
  const harness = new CreditAccountingHarness([newBalance({ purchased: 20 })]);
  harness.reserve({ creditKey: "credit_5", credits: 9, expiresAt: 100 });
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 11);
  assert.equal(harness.reconcileExpired(101), 1);
  assert.equal(harness.ledger.get("credit_5")?.status, "refunded");
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 20);
}

function testIncludedCreditsAreLegacyAndNotSpendable() {
  const includedOnly = new CreditAccountingHarness([newBalance({ included: 500, purchased: 0 })]);
  assert.equal(getSpendableWorkspaceToolBalanceCredits(includedOnly.canonicalBalance()), 0);
  assert.throws(
    () => includedOnly.reserve({ creditKey: "included_only", credits: 1 }),
    /credits_exhausted/,
  );
  assert.equal(includedOnly.canonicalBalance()!.includedCreditsBalance, 500);
  assert.equal(includedOnly.canonicalBalance()!.purchasedCreditsBalance, 0);

  const mixed = new CreditAccountingHarness([newBalance({ included: 500, purchased: 300 })]);
  const entry = mixed.reserve({ creditKey: "mixed", credits: 100 });
  assert.equal(entry.includedCreditsDebited, 0);
  assert.equal(entry.purchasedCreditsDebited, 100);
  assert.equal(mixed.canonicalBalance()!.includedCreditsBalance, 500);
  assert.equal(mixed.canonicalBalance()!.purchasedCreditsBalance, 200);
}

function testLegacyIncludedRefundDoesNotCreateSpendableBalance() {
  const harness = new CreditAccountingHarness([newBalance({ included: 0, purchased: 0 })]);
  harness.ledger.set("legacy_included", {
    creditKey: "legacy_included",
    userId: "user_1",
    status: "reserved",
    creditsReserved: 10,
    includedCreditsDebited: 10,
    purchasedCreditsDebited: 0,
    expiresAt: 1000,
  });
  const entry = harness.settle({ creditKey: "legacy_included", status: "refunded" });
  assert.equal(entry.includedCreditsRefunded, 0);
  assert.equal(entry.purchasedCreditsRefunded, 0);
  assert.equal(harness.canonicalBalance()!.includedCreditsBalance, 0);
  assert.equal(harness.canonicalBalance()!.purchasedCreditsBalance, 0);
  assert.equal(getSpendableWorkspaceToolBalanceCredits(harness.canonicalBalance()), 0);
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

function testWorkspaceRawElapsedSettlementRefundsHoldRemainder() {
  const reservationCredits = estimateWorkspaceReservationCredits({
    sandboxCpu: DEFAULT_WORKSPACE_SANDBOX_CPU,
    sandboxMemoryGiB: DEFAULT_WORKSPACE_SANDBOX_MEMORY_GIB,
  });
  const actualCostUsd = estimateWorkspaceComputeUsd({
    durationSeconds: 12,
    sandboxCpu: DEFAULT_WORKSPACE_SANDBOX_CPU,
    sandboxMemoryGiB: DEFAULT_WORKSPACE_SANDBOX_MEMORY_GIB,
  });
  const actualCredits = priceWorkspaceUsageCredits({ computeCostUsd: actualCostUsd });
  assert.ok(actualCredits < reservationCredits, "short raw elapsed computer use should settle below the hold");

  const harness = new CreditAccountingHarness([newBalance({ purchased: 100 })]);
  harness.reserve({ creditKey: "workspace_1", credits: reservationCredits });
  const heldBalance = harness.canonicalBalance()!.purchasedCreditsBalance;
  const entry = harness.settle({
    creditKey: "workspace_1",
    status: "succeeded",
    creditsSettled: actualCredits,
  });
  assert.equal(entry.creditsSettled, actualCredits);
  assert.ok(
    harness.canonicalBalance()!.purchasedCreditsBalance > heldBalance,
    "unused computer hold credits should be released at settlement",
  );
}

function testBlaxelWorkspacePricingUsesMemorySeconds() {
  assert.equal(WORKSPACE_VCPU_USD_PER_SECOND, 0);
  assert.equal(WORKSPACE_MEMORY_GIB_USD_PER_SECOND, 0.0000115);
  assert.equal(
    estimateWorkspaceComputeUsd({
      durationSeconds: 60,
      sandboxCpu: 0,
      sandboxMemoryGiB: 4,
    }),
    60 * 4 * 0.0000115,
  );
}

function testWorkspaceLedgerNameMapsToWorkspaceTools() {
  assert.equal(paidToolKindForLedgerToolName("workspace_compute"), "workspace_tools");
  assert.equal(paidToolKindForLedgerToolName("codex_runtime"), "workspace_tools");
  assert.equal(normalizePaidToolKind("codex_runtime"), "workspace_tools");
  assert.deepEqual(PAID_TOOL_LEDGER_TOOL_NAMES, [
    "workspace_compute",
    "web_research",
    "voice_transcribe",
  ]);
}

function testBillingUiDoesNotSurfaceIncludedCredits() {
  const billingSettingsSource = readFileSync(
    join(process.cwd(), "apps/web/src/components/WebBillingSettingsSection.tsx"),
    "utf8",
  );
  const workspaceCreditsGatewaySource = readFileSync(
    join(process.cwd(), "shared/workspaceCreditsGateway.ts"),
    "utf8",
  );
  assert.doesNotMatch(billingSettingsSource, /included this cycle/i);
  assert.doesNotMatch(billingSettingsSource, /included balance/i);
  assert.doesNotMatch(billingSettingsSource, /included balance resets/i);
  assert.doesNotMatch(
    workspaceCreditsGatewaySource,
    /normalizeNumber\(value\.includedCreditsBalance\) \+ normalizeNumber\(value\.purchasedCreditsBalance\)/,
  );
}

function testBillingOverviewUsesCanonicalPaidToolLedger() {
  const workspaceCreditsSource = readFileSync(
    join(process.cwd(), "convex/workspaceCredits.ts"),
    "utf8",
  );

  const usageHelperStart = workspaceCreditsSource.indexOf(
    "function readCreditLedgerBillingUsageCredits",
  );
  assert.ok(usageHelperStart >= 0, "billing usage helper must exist");
  const usageHelperEnd = workspaceCreditsSource.indexOf(
    "\n}\n\nfunction effectiveWorkspaceCreditTopupCheckoutExpiresAt",
    usageHelperStart,
  );
  assert.ok(usageHelperEnd > usageHelperStart, "billing usage helper must be bounded");
  const usageHelperSource = workspaceCreditsSource.slice(usageHelperStart, usageHelperEnd);
  assert.match(usageHelperSource, /requested_credits_settled/);
  assert.match(usageHelperSource, /creditsSettled/);
  assert.match(
    usageHelperSource,
    /requestedCreditsSettled \?\? creditsSettled/,
    "card-backed usage must count consumed usage even when the paid ledger settle amount is zero",
  );

  const overviewStart = workspaceCreditsSource.indexOf("export const getWorkspaceBillingOverview");
  assert.ok(overviewStart >= 0, "billing overview query must exist");
  const overviewEnd = workspaceCreditsSource.indexOf(
    "\nexport const upsertWorkspaceCreditBalanceInternal",
    overviewStart,
  );
  assert.ok(overviewEnd > overviewStart, "billing overview query must be bounded");
  const overviewSource = workspaceCreditsSource.slice(overviewStart, overviewEnd);

  assert.match(overviewSource, /query\("creditLedgerEntries"\)[\s\S]*withIndex\("by_user_createdAt"/);
  assert.match(overviewSource, /new Set<string>\(PAID_TOOL_LEDGER_TOOL_NAMES\)/);
  assert.match(overviewSource, /entry\.status !== "succeeded"/);
  assert.match(overviewSource, /paidToolLedgerToolNames\.has\(toolName\)/);
  assert.match(overviewSource, /canonicalPaidToolCreditKeys\.add\(creditKey\)/);
  assert.match(overviewSource, /readCreditLedgerBillingUsageCredits\(entry\)/);
  assert.ok(
    overviewSource.includes("bucket.workspaceUsageCredits + usageCredits"),
    "canonical paid-tool ledger usage must be added to billing buckets",
  );
  assert.match(overviewSource, /query\("workspaceComputeCharges"\)/);
  assert.match(
    overviewSource,
    /creditReservationKey && canonicalPaidToolCreditKeys\.has\(creditReservationKey\)[\s\S]*continue/,
    "legacy workspace charges must not double-count rows already represented by the canonical ledger",
  );
  assert.match(overviewSource, /creditLedgerEntriesTruncated/);

  assert.match(
    overviewSource,
    /creditLedgerEntriesTruncated:\s*creditLedgerEntries\.length >= WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT/,
  );
}

function testWorkspaceComputeChargesAreLegacyCompatibilityOnly() {
  const workspaceCreditsSource = readFileSync(
    join(process.cwd(), "convex/workspaceCredits.ts"),
    "utf8",
  );
  const runtimeTurnHandlersSource = readFileSync(
    join(process.cwd(), "convex/runtimeTurnHandlers.ts"),
    "utf8",
  );
  const workerIngestSource = readFileSync(
    join(process.cwd(), "convex/polynetCodexWorkerIngest.ts"),
    "utf8",
  );

  assert.match(
    workspaceCreditsSource,
    /Legacy billing fallback: creditLedgerEntries above is the canonical paid-tool usage source/,
  );
  assert.match(
    workspaceCreditsSource,
    /Legacy Blaxel\/runtime mirror: canonical paid-tool usage lives in creditLedgerEntries/,
  );
  assert.match(
    workspaceCreditsSource,
    /Legacy Blaxel\/runtime compatibility writer[\s\S]*New paid-tool usage should reserve and[\s\S]*settle creditLedgerEntries directly/,
  );

  const overviewStart = workspaceCreditsSource.indexOf("export const getWorkspaceBillingOverview");
  const overviewEnd = workspaceCreditsSource.indexOf(
    "\nexport const upsertWorkspaceCreditBalanceInternal",
    overviewStart,
  );
  assert.ok(overviewStart >= 0 && overviewEnd > overviewStart, "billing overview must be bounded");
  const overviewSource = workspaceCreditsSource.slice(overviewStart, overviewEnd);
  const overviewLedgerIndex = overviewSource.indexOf('query("creditLedgerEntries")');
  const overviewLegacyIndex = overviewSource.indexOf('query("workspaceComputeCharges")');
  assert.ok(overviewLedgerIndex >= 0, "billing overview must read canonical credit ledger");
  assert.ok(overviewLegacyIndex > overviewLedgerIndex, "legacy workspace charges must be fallback after ledger");
  assert.match(overviewSource, /canonicalPaidToolCreditKeys/);
  assert.match(overviewSource, /creditReservationKey && canonicalPaidToolCreditKeys\.has\(creditReservationKey\)/);

  const diagnosticStart = workspaceCreditsSource.indexOf("let computeChargesScanned = 0");
  const diagnosticEnd = workspaceCreditsSource.indexOf(
    "const totalMissingProviderCostUsd",
    diagnosticStart,
  );
  assert.ok(diagnosticStart >= 0 && diagnosticEnd > diagnosticStart, "provider mirror diagnostic must be bounded");
  const diagnosticSource = workspaceCreditsSource.slice(diagnosticStart, diagnosticEnd);
  assert.match(diagnosticSource, /workspaceComputeCharges/);
  assert.match(diagnosticSource, /expectedProviderCostKey = creditReservationKey/);

  const writerStart = workspaceCreditsSource.indexOf("export const recordWorkspaceComputeChargeInternal");
  const writerEnd = workspaceCreditsSource.indexOf(
    "\nexport const reserveCreditsInternal",
    writerStart,
  );
  assert.ok(writerStart >= 0 && writerEnd > writerStart, "legacy workspace compute writer must be bounded");
  const writerSource = workspaceCreditsSource.slice(writerStart, writerEnd);
  assert.match(writerSource, /query\("workspaceComputeCharges"\)/);
  assert.match(writerSource, /query\("creditLedgerEntries"\)/);
  assert.match(writerSource, /provider_cost_source: "workspace_compute_charge"/);

  assert.match(runtimeTurnHandlersSource, /const codexRuntimeCreditKey = `workspace_compute:daytona:\$\{runId\}`/);
  assert.match(runtimeTurnHandlersSource, /toolName: "workspace_compute"/);
  assert.match(runtimeTurnHandlersSource, /settleReservedCreditsStrict/);
  assert.doesNotMatch(runtimeTurnHandlersSource, /recordWorkspaceComputeChargeInternal/);
  assert.match(workerIngestSource, /asRecord\(contextRecord\?\.workspace_compute_billing\)/);
  assert.match(workerIngestSource, /settleReservedCreditsStrict/);
  assert.doesNotMatch(workerIngestSource, /recordWorkspaceComputeChargeInternal/);
}

function testBlaxelRuntimeReservationAndSettlementAreWired() {
  const blaxelWakeSource = readFileSync(
    join(process.cwd(), "convex/blaxelWorkspaceWake.ts"),
    "utf8",
  );
  const runtimeSessionSource = readFileSync(
    join(process.cwd(), "convex/workspaceRuntimeSession.ts"),
    "utf8",
  );
  const runtimeExecutionSource = readFileSync(
    join(process.cwd(), "convex/runtimeExecutionSession.ts"),
    "utf8",
  );
  assert.match(blaxelWakeSource, /reserveCreditsInternal/);
  assert.match(blaxelWakeSource, /billing_mode: workspaceBillingMode/);
  assert.match(blaxelWakeSource, /allowUncollectedReservation: hasCardOnFile/);
  assert.match(blaxelWakeSource, /uncollectedReservationLimitCredits: hasCardOnFile[\s\S]*WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS/);
  const workspaceCreditsSource = readFileSync(
    join(process.cwd(), "convex/workspaceCredits.ts"),
    "utf8",
  );
  const cronsSource = readFileSync(join(process.cwd(), "convex/crons.ts"), "utf8");
  assert.equal(WORKSPACE_CARD_COLLECTION_MIN_CREDITS, 50);
  assert.match(workspaceCreditsSource, /readPendingCardBackedReservationExposureCredits/);
  assert.match(workspaceCreditsSource, /by_status_expiresAt/);
  assert.match(workspaceCreditsSource, /currentOutstandingUsageCredits[\s\S]*pendingUncollectedReservationCredits[\s\S]*uncollectedExposureCredits[\s\S]*uncollectedReservationLimitCredits/);
  assert.match(workspaceCreditsSource, /prepareWorkspaceUsageCardCollectionInternal/);
  assert.match(workspaceCreditsSource, /markWorkspaceUsageCardCollectionProcessingInternal/);
  assert.match(workspaceCreditsSource, /pendingCardCollectionCreditsBalance[\s\S]*uncollectedCreditsBalance/);
  assert.match(workspaceCreditsSource, /completeWorkspaceUsageCardCollectionInternal/);
  assert.match(workspaceCreditsSource, /collectWorkspaceUsageByCardInternal/);
  const collectionStart = workspaceCreditsSource.indexOf("export const collectWorkspaceUsageByCardInternal");
  const collectionEnd = workspaceCreditsSource.indexOf(
    "\nexport const getWorkspaceCreditBalanceInternal",
    collectionStart,
  );
  assert.ok(collectionStart >= 0 && collectionEnd > collectionStart, "usage collection action must be bounded");
  const collectionActionSource = workspaceCreditsSource.slice(collectionStart, collectionEnd);
  const candidateBlock = collectionActionSource.slice(
    collectionActionSource.indexOf("const candidateResult"),
    collectionActionSource.indexOf("return {"),
  );
  assert.match(candidateBlock, /activeBeforePrepare[\s\S]*activeBeforePrepare\.length > 0/);
  assert.match(candidateBlock, /activeAfterPrepare[\s\S]*activeAfterPrepare\.length > 1/);
  assertBefore(
    candidateBlock,
    "activeBeforePrepare",
    "prepareWorkspaceUsageCardCollectionInternal",
    "usage collection must check active collection state before preparing a candidate",
  );
  assertBefore(
    candidateBlock,
    "prepareWorkspaceUsageCardCollectionInternal",
    "readStripeForCollection(collectionKey)",
    "usage collection must prepare DB state before reading Stripe",
  );
  assertBefore(
    candidateBlock,
    "activeAfterPrepare",
    "readStripeForCollection(collectionKey)",
    "usage collection must recheck active collection state before reading Stripe",
  );
  assert.match(workspaceCreditsSource, /paymentIntents\.create/);
  assert.match(workspaceCreditsSource, /confirm: true/);
  assert.match(workspaceCreditsSource, /off_session: true/);
  assert.match(workspaceCreditsSource, /idempotencyKey: `polynet-workspace-usage:\${collectionKey}`/);
  assert.match(workspaceCreditsSource, /workspace_usage_collection_pending_balance_mismatch/);
  assert.match(cronsSource, /collect workspace usage by card[\s\S]*minutes: 15[\s\S]*collectWorkspaceUsageByCardInternal/);
  const schemaSource = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8");
  assert.match(schemaSource, /workspaceUsageCollections: defineTable/);
  assert.match(schemaSource, /v\.literal\("processing"\)/);
  assert.match(schemaSource, /pendingCardCollectionCreditsBalance: v\.optional\(v\.number\(\)\)/);
  assert.match(blaxelWakeSource, /settleReservedCreditsBestEffort/);
  assert.match(runtimeSessionSource, /ensureBillableBlaxelWorkspaceComputer/);
  assert.match(runtimeSessionSource, /createRuntimeSandboxSession/);
  assert.doesNotMatch(runtimeSessionSource, /reuseExistingLease: true/);
  assert.match(runtimeSessionSource, /recordWorkspaceComputeChargeInternal/);
  assert.match(runtimeExecutionSource, /createRuntimeSandboxSession\(\{\s*ctx:[\s\S]*runId: params\.runId/);
  assert.match(runtimeExecutionSource, /settleRuntimeWorkspaceSession/);
}

function testRuntimeAccountingReleaseAlwaysChecksCurrentTerminalTruth() {
  const runtimeExecutionSource = readFileSync(
    join(process.cwd(), "convex/runtimeExecutionSession.ts"),
    "utf8",
  );
  const workspaceTerminalsSource = readFileSync(
    join(process.cwd(), "convex/workspaceTerminals.ts"),
    "utf8",
  );
  const workspaceRuntimeSessionSource = readFileSync(
    join(process.cwd(), "convex/workspaceRuntimeSession.ts"),
    "utf8",
  );

  assert.doesNotMatch(runtimeExecutionSource, /workspaceSessionStartedPersistentTerminal/);
  assert.doesNotMatch(runtimeExecutionSource, /no_terminal_started/);
  assert.match(
    runtimeExecutionSource,
    /terminal_read[\s\S]*readWorkspaceTerminalProcess/,
    "later turns can read an existing terminal without starting one",
  );
  assert.match(
    runtimeExecutionSource,
    /terminal_write[\s\S]*writeWorkspaceTerminalProcessInput/,
    "later turns can write to an existing terminal without starting one",
  );

  const decisionStart = runtimeExecutionSource.indexOf(
    "const resolveWorkspaceSessionAccountingReleaseDecision",
  );
  assert.ok(decisionStart >= 0, "runtime release decision helper must exist");
  const decisionEnd = runtimeExecutionSource.indexOf("\n  return {", decisionStart);
  assert.ok(decisionEnd > decisionStart, "runtime release decision helper must be bounded");
  const decisionSource = runtimeExecutionSource.slice(decisionStart, decisionEnd);
  assert.match(decisionSource, /refreshProjectSandboxActiveTerminalStatusInternal/);
  assert.match(decisionSource, /active_terminal_still_running/);
  assert.match(decisionSource, /no_active_terminal_remaining/);
  assert.match(decisionSource, /active_terminal_refresh_failed/);
  assert.doesNotMatch(
    decisionSource,
    /terminal_start|workspaceSessionStartedPersistentTerminal/,
    "release decision must not depend on whether this turn started a terminal",
  );

  const settlementIndex = runtimeExecutionSource.indexOf("settleRuntimeWorkspaceSession({");
  const releaseDecisionIndex = runtimeExecutionSource.indexOf(
    "await resolveWorkspaceSessionAccountingReleaseDecision(workspaceSession)",
  );
  const keptAliveIndex = runtimeExecutionSource.indexOf(
    "workspace_session_accounting_kept_alive",
    releaseDecisionIndex,
  );
  const releaseIndex = runtimeExecutionSource.indexOf(
    "releaseRuntimeWorkspaceSessionAccountingIfCurrent({",
    settlementIndex,
  );
  assert.ok(settlementIndex >= 0, "runtime dispose must settle workspace usage");
  assert.ok(
    releaseDecisionIndex >= 0 && releaseDecisionIndex < settlementIndex,
    "runtime dispose must decide release before settlement",
  );
  assert.ok(
    keptAliveIndex > releaseDecisionIndex && keptAliveIndex < settlementIndex,
    "active terminals must keep the reservation alive before any settlement happens",
  );
  assert.ok(
    releaseIndex > settlementIndex,
    "no-active-terminal path must settle before releasing accounting",
  );

  assert.match(
    workspaceTerminalsSource,
    /refreshProjectSandboxActiveTerminalStatusInternal[\s\S]*listWorkspaceTerminalSessionsBySandboxInternal[\s\S]*isTerminalActiveStatus[\s\S]*readWorkspaceTerminalProcess[\s\S]*readProjectSandboxActiveTerminalStatusInternal/,
    "terminal truth refresh must reconcile active terminal rows against Blaxel before release",
  );
  assert.match(
    workspaceRuntimeSessionSource,
    /releaseRuntimeWorkspaceSessionAccountingIfCurrent[\s\S]*releaseProjectBackgroundSandboxAccountingIfCurrentInternal[\s\S]*providerSandboxCreditReservationKey[\s\S]*providerSandboxStartedAt/,
    "runtime accounting release must remain expected-value guarded",
  );
}

function testReusableWorkspaceLeaseRequiresReservedLedgerEntry() {
  const blaxelWakeSource = readFileSync(
    join(process.cwd(), "convex/blaxelWorkspaceWake.ts"),
    "utf8",
  );
  const inspectorSource = readFileSync(
    join(process.cwd(), "convex/workspaceInspector.ts"),
    "utf8",
  );
  const terminalsSource = readFileSync(
    join(process.cwd(), "convex/workspaceTerminals.ts"),
    "utf8",
  );
  assert.match(blaxelWakeSource, /getCreditLedgerEntryByKeyInternal/);
  assert.match(blaxelWakeSource, /ledgerEntry\.status !== "reserved"/);
  assert.match(blaxelWakeSource, /String\(ledgerEntry\.userId \?\? ""\) !== String\(params\.ownerId \?\? ""\)/);
  assert.match(blaxelWakeSource, /normalizeOptionalString\(ledgerEntry\.projectId\) !== String\(params\.projectId\)/);
  assert.match(blaxelWakeSource, /canReuseWorkspaceLeaseForIntent[\s\S]*compareWorkspaceComputerLifecycleIntents/);
  assert.doesNotMatch(
    blaxelWakeSource,
    /isRuntimeWorkspaceSessionLeaseLedgerEntry\(ledgerEntry\)[\s\S]*isRunningRuntimeWorkspaceSessionLease/,
  );
  assert.match(
    blaxelWakeSource,
    /resolveReusableProjectWorkspaceLease[\s\S]*providerSandboxCreditReservationKey[\s\S]*ledgerEntry\.status !== "reserved"[\s\S]*canReuseWorkspaceLeaseForIntent[\s\S]*inspectBlaxelWorkspaceComputer/,
  );
  assert.match(blaxelWakeSource, /projectCreditBudgetExpiresAt <= Date\.now\(\)[\s\S]*ledgerExpiresAt <= Date\.now\(\)/);
  assert.match(blaxelWakeSource, /Math\.min\(projectCreditBudgetExpiresAt, ledgerExpiresAt\)/);
  assert.match(blaxelWakeSource, /inspectBlaxelWorkspaceComputer/);
  assert.match(blaxelWakeSource, /workspace_project_lease_replaced/);
  assert.match(inspectorSource, /reuseExistingLease: true/);
  assert.match(terminalsSource, /startProjectWorkspaceComputer[\s\S]*reuseExistingLease: true/);
}

function testManualWorkspaceStopSettlesReusableLease() {
  const blaxelWakeSource = readFileSync(
    join(process.cwd(), "convex/blaxelWorkspaceWake.ts"),
    "utf8",
  );
  const terminalsSource = readFileSync(
    join(process.cwd(), "convex/workspaceTerminals.ts"),
    "utf8",
  );
  assert.match(blaxelWakeSource, /export async function settleBillableBlaxelWorkspaceLeaseBestEffort/);
  assert.match(blaxelWakeSource, /settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*getCreditLedgerEntryByKeyInternal[\s\S]*ledgerEntry\.status !== "reserved"/);
  assert.match(blaxelWakeSource, /settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*String\(ledgerEntry\.userId \?\? ""\) !== String\(params\.ownerId \?\? ""\)/);
  assert.match(blaxelWakeSource, /settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*normalizeOptionalString\(ledgerEntry\.projectId\) !== String\(params\.projectId\)/);
  assert.match(blaxelWakeSource, /providerSandboxCreditReservationKey[\s\S]*settleReservedCreditsBestEffort[\s\S]*status: "succeeded"/);
  assert.match(blaxelWakeSource, /ledgerMetadata[\s\S]*sandbox_memory_gib[\s\S]*loadedConfig\.ok/);
  assert.equal(WORKSPACE_FILE_INSPECTION_HOLD_SECONDS, 10);
  assert.equal(WORKSPACE_FILE_INSPECTION_MIN_BILLABLE_SECONDS, 10);
  assert.equal(WORKSPACE_FILE_INSPECTION_MAX_SECONDS, 30);
  assert.match(blaxelWakeSource, /resolveWorkspaceLeaseBillingTiming[\s\S]*WORKSPACE_FILE_INSPECTION_MAX_SECONDS/);
  assert.match(blaxelWakeSource, /minBillableSeconds[\s\S]*WORKSPACE_FILE_INSPECTION_MIN_BILLABLE_SECONDS/);
  assert.match(blaxelWakeSource, /billableDurationSeconds[\s\S]*measuredDurationSeconds[\s\S]*billingTiming\.minBillableSeconds/);
  assert.match(blaxelWakeSource, /measured_duration_seconds[\s\S]*min_billable_seconds/);
  assert.match(blaxelWakeSource, /durationSeconds[\s\S]*billingTiming\.maxSeconds[\s\S]*priceWorkspaceUsageCredits/);
  assert.match(blaxelWakeSource, /releaseBillableBlaxelProjectWorkspaceLeaseBestEffort[\s\S]*status: "refunded"/);
  assert.match(blaxelWakeSource, /recordTrackedBlaxelWorkspaceLeaseProviderCostBestEffort[\s\S]*recordProviderCostInternal[\s\S]*billingDisposition: "tracked_only"/);
  assert.match(blaxelWakeSource, /settlement_source: "project_workspace_lease"/);
  assert.match(blaxelWakeSource, /settlement_reason: normalizeOptionalString\(params\.settlementReason\)/);
  assert.match(terminalsSource, /stopProjectWorkspaceComputer[\s\S]*settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*settlementReason: "workspace_computer_stopped"/);
  assert.match(terminalsSource, /stopProjectWorkspaceComputer[\s\S]*clearSandboxAccounting: true/);
}

function testExpiredBlaxelProjectLeaseFinalizationIsProviderAware() {
  const schemaSource = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8");
  const projectsSource = readFileSync(join(process.cwd(), "convex/projects.ts"), "utf8");
  const creditsSource = readFileSync(join(process.cwd(), "convex/workspaceCredits.ts"), "utf8");
  const wakeSource = readFileSync(join(process.cwd(), "convex/blaxelWorkspaceWake.ts"), "utf8");
  const threadsSource = readFileSync(join(process.cwd(), "convex/threads.ts"), "utf8");
  const cronsSource = readFileSync(join(process.cwd(), "convex/crons.ts"), "utf8");

  assert.match(schemaSource, /by_sandboxProvider_creditBudgetExpiresAt/);
  assert.match(schemaSource, /by_status_updatedAt/);
  assert.match(projectsSource, /listExpiredBlaxelProjectWorkspaceLeasesInternal[\s\S]*by_sandboxProvider_creditBudgetExpiresAt/);
  assert.match(projectsSource, /listBlaxelProjectWorkspaceLeasesMissingProjectExpiryInternal[\s\S]*providerSandboxCreditBudgetExpiresAt", undefined/);
  assert.match(projectsSource, /deleteCloudProjectForOwner[\s\S]*finalizeBillableBlaxelProjectWorkspaceLease[\s\S]*requireLedgerWrite: true[\s\S]*destroyBlaxelWorkspaceSandbox/);
  assert.match(creditsSource, /isBlaxelRuntimeWorkspaceReservation[\s\S]*runtime_workspace_session/);
  assert.match(creditsSource, /hasActiveBlaxelProjectWorkspaceLeasePointer[\s\S]*isBlaxelWorkspaceComputeReservation\(entry\)[\s\S]*providerSandboxCreditReservationKey/);
  assert.doesNotMatch(
    creditsSource,
    /hasActiveBlaxelProjectWorkspaceLeasePointer[\s\S]*isBlaxelProjectWorkspaceLeaseReservation/,
  );
  assert.match(creditsSource, /hasRunningRuntimeRunForWorkspaceReservation[\s\S]*by_owner_runId[\s\S]*status[\s\S]*running[\s\S]*projectId/);
  assert.match(
    creditsSource,
    /shouldSkipExpiredBlaxelWorkspaceReservation[\s\S]*await hasActiveBlaxelProjectWorkspaceLeasePointer\(ctx, entry\)[\s\S]*isBlaxelRuntimeWorkspaceReservation\(entry\)[\s\S]*hasRunningRuntimeRunForWorkspaceReservation/,
  );
  assert.match(creditsSource, /reconcileExpiredCreditReservationsInternal[\s\S]*await shouldSkipExpiredBlaxelWorkspaceReservation\(ctx, entry\)[\s\S]*skippedBlaxelWorkspaceReservations/);
  assert.match(threadsSource, /RUNTIME_RUN_STALE_AFTER_MS = 8 \* 60 \* 1000/);
  assert.match(threadsSource, /listStaleRunningRuntimeRunsInternal[\s\S]*by_status_updatedAt[\s\S]*status", "running"[\s\S]*lt\("updatedAt"/);
  assert.match(threadsSource, /finalizeStaleCloudRuntimeRunInternal[\s\S]*isRuntimeRunStale[\s\S]*stale_runtime_workspace_run_reconciled/);
  assert.match(creditsSource, /listReservedBlaxelRuntimeWorkspaceReservationsByRunInternal[\s\S]*by_run[\s\S]*isBlaxelRuntimeWorkspaceReservation/);
  assert.match(creditsSource, /reconcileStaleRuntimeWorkspaceRunsInternal[\s\S]*listStaleRunningRuntimeRunsInternal[\s\S]*hasRuntimeWorkspaceEvidence[\s\S]*recordWorkspaceComputeChargeInternal[\s\S]*queueCreditSettlementRetryInternal[\s\S]*finalizeStaleCloudRuntimeRunInternal/);
  assert.match(wakeSource, /finalizeExpiredBlaxelProjectWorkspaceLeasesInternal[\s\S]*listExpiredBlaxelProjectWorkspaceLeasesInternal/);
  assert.match(wakeSource, /listBlaxelProjectWorkspaceLeasesMissingProjectExpiryInternal[\s\S]*requireExpiredReservation: true/);
  assert.match(wakeSource, /finalizeBillableBlaxelProjectWorkspaceLease[\s\S]*getCreditLedgerEntryByKeyInternal[\s\S]*ledgerEntry\.status !== "reserved"[\s\S]*clearProjectWorkspaceLeaseAccounting/);
  assert.match(wakeSource, /requireExpiredReservation === true[\s\S]*projectExpired[\s\S]*ledgerExpired[\s\S]*disposition: "not_expired"/);
  assert.match(wakeSource, /ledgerOwnerMatches[\s\S]*ledgerProjectMatches[\s\S]*!isBlaxelWorkspaceLeaseLedgerEntry\(ledgerEntry\)/);
  assert.doesNotMatch(wakeSource, /isProjectFinalizableBlaxelWorkspaceLeaseLedgerEntry/);
  assert.match(wakeSource, /!isBlaxelWorkspaceLeaseLedgerEntry\(ledgerEntry\)[\s\S]*skipped_unsupported_action/);
  assert.match(wakeSource, /startedAt !== null[\s\S]*settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*requireLedgerWrite: params\.requireLedgerWrite === true[\s\S]*clearProjectWorkspaceLeaseAccounting/);
  assert.match(wakeSource, /settleReservedCreditsStrict[\s\S]*status: "refunded"[\s\S]*workspace_project_lease_released_before_start/);
  assert.match(cronsSource, /reconcile stale runtime workspace runs[\s\S]*minutes: 5[\s\S]*reconcileStaleRuntimeWorkspaceRunsInternal[\s\S]*finalize expired blaxel project workspace leases[\s\S]*blaxelWorkspaceWake\.finalizeExpiredBlaxelProjectWorkspaceLeasesInternal[\s\S]*reconcile expired credit reservations/);
}

function main() {
  testDuplicateTopupWebhookIsIdempotent();
  testProviderFailureRefundsReservation();
  testPartialSettlementRefundsUnusedReservation();
  testOverageCreatesDebtAndTopupClearsItFirst();
  testCardBackedReservationCreatesUncollectedUsageWithoutPrepaid();
  testCardBackedReservationSpendsPrepaidBeforeUncollectedUsage();
  testCardBackedProviderFailureDoesNotCreateUncollectedUsage();
  testCardBackedReservationFailsClosedAtUncollectedLimit();
  testCardBackedReservationLimitIncludesPendingExposure();
  testCardBackedReservationLimitIncludesPendingCardCollection();
  testCardCollectionPrepareLocksDebtAwayFromManualTopup();
  testCardCollectionSuccessClearsPendingOnly();
  testCardCollectionFailureRestoresUncollectedDebt();
  testProcessingCardCollectionCanFinalize();
  testExpiredReservationRefundsHeldCredits();
  testIncludedCreditsAreLegacyAndNotSpendable();
  testLegacyIncludedRefundDoesNotCreateSpendableBalance();
  testDuplicateBalanceFailsClosed();
  testTargetedRepairAllowsTopupGrantOnce();
  testWorkspaceRawElapsedSettlementRefundsHoldRemainder();
  testBlaxelWorkspacePricingUsesMemorySeconds();
  testWorkspaceLedgerNameMapsToWorkspaceTools();
  testBillingUiDoesNotSurfaceIncludedCredits();
  testBillingOverviewUsesCanonicalPaidToolLedger();
  testWorkspaceComputeChargesAreLegacyCompatibilityOnly();
  testBlaxelRuntimeReservationAndSettlementAreWired();
  testRuntimeAccountingReleaseAlwaysChecksCurrentTerminalTruth();
  testReusableWorkspaceLeaseRequiresReservedLedgerEntry();
  testManualWorkspaceStopSettlesReusableLease();
  testExpiredBlaxelProjectLeaseFinalizationIsProviderAware();
  console.log("workspace_credit_accounting_behavior_test: ok");
}

main();
