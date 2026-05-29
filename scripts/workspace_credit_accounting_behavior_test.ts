import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_WORKSPACE_SANDBOX_CPU,
  DEFAULT_WORKSPACE_SANDBOX_MEMORY_GIB,
  estimateWorkspaceComputeUsd,
  estimateWorkspaceReservationCredits,
  getSpendableWorkspaceToolBalanceCredits,
  paidToolKindForLedgerToolName,
  priceWorkspaceUsageCredits,
  WORKSPACE_MEMORY_GIB_USD_PER_SECOND,
  WORKSPACE_VCPU_USD_PER_SECOND,
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
    const total = roundCredits(balance.purchasedCreditsBalance);
    if (total < requestedCredits) throw new Error("credits_exhausted");

    const included = 0;
    const purchased = Math.min(balance.purchasedCreditsBalance, requestedCredits);
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
    const includedRefunded = 0;
    const purchasedRefunded = roundCredits(entry.purchasedCreditsDebited - purchasedSettled);
    let extraSettled = 0;
    if (input.status === "succeeded" && requested > reservedSettled) {
      extraSettled = this.debitAvailable(entry.userId, requested - reservedSettled);
    }
    const balance = this.ensureBalance(entry.userId);
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
  assert.match(blaxelWakeSource, /settleReservedCreditsBestEffort/);
  assert.match(runtimeSessionSource, /ensureBillableBlaxelWorkspaceComputer/);
  assert.doesNotMatch(runtimeSessionSource, /reuseExistingLease: true/);
  assert.match(runtimeSessionSource, /recordWorkspaceComputeChargeInternal/);
  assert.match(runtimeExecutionSource, /createProjectRuntimeWorkspaceSession\(\{\s*ctx:[\s\S]*runId: params\.runId/);
  assert.match(runtimeExecutionSource, /settleRuntimeWorkspaceSession/);
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
  assert.match(blaxelWakeSource, /isRuntimeWorkspaceSessionLeaseLedgerEntry\(ledgerEntry\)[\s\S]*isRunningRuntimeWorkspaceSessionLease/);
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
  assert.match(blaxelWakeSource, /resolveWorkspaceLeaseBillingTiming[\s\S]*WORKSPACE_FILE_INSPECTION_MAX_SECONDS/);
  assert.match(blaxelWakeSource, /durationSeconds[\s\S]*billingTiming\.maxSeconds[\s\S]*priceWorkspaceUsageCredits/);
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
  assert.match(creditsSource, /isBlaxelProjectWorkspaceLeaseReservation[\s\S]*workspace_file_inspection[\s\S]*interactive_workspace_computer[\s\S]*project_zip_import/);
  assert.doesNotMatch(
    creditsSource,
    /function isBlaxelProjectWorkspaceLeaseReservation[\s\S]*runtime_workspace_session[\s\S]*async function hasRunningRuntimeRunForWorkspaceReservation/,
  );
  assert.match(creditsSource, /hasActiveBlaxelProjectWorkspaceLeasePointer[\s\S]*providerSandboxCreditReservationKey/);
  assert.match(creditsSource, /hasRunningRuntimeRunForWorkspaceReservation[\s\S]*by_owner_runId[\s\S]*status[\s\S]*running[\s\S]*projectId/);
  assert.match(creditsSource, /shouldSkipExpiredBlaxelWorkspaceReservation[\s\S]*isBlaxelRuntimeWorkspaceReservation\(entry\)[\s\S]*hasRunningRuntimeRunForWorkspaceReservation[\s\S]*hasActiveBlaxelProjectWorkspaceLeasePointer/);
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
  assert.match(wakeSource, /ledgerOwnerMatches[\s\S]*ledgerProjectMatches[\s\S]*isProjectFinalizableBlaxelWorkspaceLeaseLedgerEntry/);
  assert.match(wakeSource, /!isProjectFinalizableBlaxelWorkspaceLeaseLedgerEntry\(ledgerEntry\)[\s\S]*skipped_unsupported_action/);
  assert.match(wakeSource, /startedAt !== null[\s\S]*settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*requireLedgerWrite: params\.requireLedgerWrite === true[\s\S]*clearProjectWorkspaceLeaseAccounting/);
  assert.match(wakeSource, /settleReservedCreditsStrict[\s\S]*status: "refunded"[\s\S]*workspace_project_lease_released_before_start/);
  assert.match(cronsSource, /reconcile stale runtime workspace runs[\s\S]*minutes: 5[\s\S]*reconcileStaleRuntimeWorkspaceRunsInternal[\s\S]*finalize expired blaxel project workspace leases[\s\S]*blaxelWorkspaceWake\.finalizeExpiredBlaxelProjectWorkspaceLeasesInternal[\s\S]*reconcile expired credit reservations/);
}

function main() {
  testDuplicateTopupWebhookIsIdempotent();
  testProviderFailureRefundsReservation();
  testPartialSettlementRefundsUnusedReservation();
  testOverageCreatesDebtAndTopupClearsItFirst();
  testExpiredReservationRefundsHeldCredits();
  testIncludedCreditsAreLegacyAndNotSpendable();
  testLegacyIncludedRefundDoesNotCreateSpendableBalance();
  testDuplicateBalanceFailsClosed();
  testTargetedRepairAllowsTopupGrantOnce();
  testWorkspaceRawElapsedSettlementRefundsHoldRemainder();
  testBlaxelWorkspacePricingUsesMemorySeconds();
  testWorkspaceLedgerNameMapsToWorkspaceTools();
  testBillingUiDoesNotSurfaceIncludedCredits();
  testBlaxelRuntimeReservationAndSettlementAreWired();
  testReusableWorkspaceLeaseRequiresReservedLedgerEntry();
  testManualWorkspaceStopSettlesReusableLease();
  testExpiredBlaxelProjectLeaseFinalizationIsProviderAware();
  console.log("workspace_credit_accounting_behavior_test: ok");
}

main();
