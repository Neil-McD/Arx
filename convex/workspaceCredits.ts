import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import {
  DEFAULT_INCLUDED_TOOL_CREDITS,
  CREDIT_RESERVATION_EXPIRY_MS,
  creditsToUsd,
  estimateDaytonaWorkspaceComputeUsd,
  formatWorkspaceToolBalanceUsdFromCredits,
  getSpendableWorkspaceToolBalanceCredits,
  getUncollectedWorkspaceToolBalanceCredits,
  priceDaytonaWorkspaceUsageCredits,
  resolveWorkspaceToolBalanceTopupPack,
  WORKSPACE_CREDIT_TOPUP_CREDITS,
  WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD,
  WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS,
} from "../shared/workspaceCredits";
import {
  newOpaqueToken,
  requireCanonicalCheckoutReturnUrl,
} from "./billingCore";
import { resolveAuthenticatedActor } from "./authActor";
import {
  getStripeClient,
} from "./stripeCore";
import { recordToolUsagePartnerCommission } from "./builderPartners";
import {
  attachStripeCustomerToUser,
  ensureStripeCustomerForUser,
} from "./stripeCustomers";
import { requireOperatorRole } from "./operatorAccess";

function roundCurrency(value: number): number {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

function roundCredits(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeObjectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function mergeLedgerMetadata(existing: unknown, patch: unknown): unknown {
  const patchObject = normalizeObjectMetadata(patch);
  if (Object.keys(patchObject).length === 0) return existing;
  return {
    ...normalizeObjectMetadata(existing),
    ...patchObject,
  };
}

function normalizeStripePriceId(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized && normalized.startsWith("price_") ? normalized : undefined;
}

function clampCredits(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, roundCredits(value)));
}

function readUncollectedCreditsBalance(balance: any): number {
  return roundCredits(Math.max(0, Number(balance?.uncollectedCreditsBalance ?? 0)));
}

function buildEmptyWorkspaceCreditBalanceForUser(userId: unknown, nowMs: number) {
  return {
    userId,
    includedCreditsBalance: 0,
    purchasedCreditsBalance: 0,
    uncollectedCreditsBalance: 0,
    includedCycleCredits: 0,
    includedCycleStartedAt: nowMs,
    includedCycleEndsAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

function buildWorkspaceToolBalanceProjection(balance: any, userId: unknown, nowMs: number) {
  const normalizedBalance = balance ?? buildEmptyWorkspaceCreditBalanceForUser(userId, nowMs);
  const spendableCreditsBalance = roundCredits(
    getSpendableWorkspaceToolBalanceCredits(normalizedBalance),
  );
  const uncollectedCreditsBalance = roundCredits(
    getUncollectedWorkspaceToolBalanceCredits(normalizedBalance),
  );
  return {
    ...normalizedBalance,
    uncollectedCreditsBalance,
    spendableCreditsBalance,
    displayBalanceUsd: formatWorkspaceToolBalanceUsdFromCredits(spendableCreditsBalance),
    blocked: uncollectedCreditsBalance > 0,
    blockedReason: uncollectedCreditsBalance > 0 ? "uncollected_usage" : null,
    lowBalance: uncollectedCreditsBalance <= 0 &&
      spendableCreditsBalance <= WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD,
  };
}

function normalizeBalanceNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = Math.floor(Number(value ?? defaultValue));
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(1, Math.min(maxValue, parsed));
}

function effectiveWorkspaceCreditTopupCheckoutExpiresAt(row: any): number {
  const storedExpiresAt = normalizeBalanceNumber(row?.expiresAt);
  const createdAt = normalizeBalanceNumber(row?.createdAt);
  const ttlExpiresAt = createdAt > 0
    ? createdAt + WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS
    : 0;
  if (storedExpiresAt > 0 && ttlExpiresAt > 0) {
    return Math.min(storedExpiresAt, ttlExpiresAt);
  }
  return storedExpiresAt > 0 ? storedExpiresAt : ttlExpiresAt;
}

function splitSettledCredits(args: {
  includedDebited: number;
  purchasedDebited: number;
  creditsSettled: number;
}): {
  includedSettled: number;
  purchasedSettled: number;
  includedRefunded: number;
  purchasedRefunded: number;
} {
  const includedDebited = roundCredits(args.includedDebited);
  const purchasedDebited = roundCredits(args.purchasedDebited);
  const creditsSettled = clampCredits(
    args.creditsSettled,
    0,
    includedDebited + purchasedDebited,
  );
  const includedSettled = Math.min(includedDebited, creditsSettled);
  const purchasedSettled = Math.min(
    purchasedDebited,
    Math.max(0, creditsSettled - includedSettled),
  );
  return {
    includedSettled: roundCredits(includedSettled),
    purchasedSettled: roundCredits(purchasedSettled),
    includedRefunded: roundCredits(includedDebited - includedSettled),
    purchasedRefunded: roundCredits(purchasedDebited - purchasedSettled),
  };
}

function canRefundIncludedCreditsForEntry(args: {
  balance: any;
  entry: any;
}): boolean {
  const balanceStartedAt =
    typeof args.balance?.includedCycleStartedAt === "number"
      ? args.balance.includedCycleStartedAt
      : null;
  const balanceEndsAt =
    typeof args.balance?.includedCycleEndsAt === "number"
      ? args.balance.includedCycleEndsAt
      : null;
  if (balanceStartedAt === null || balanceEndsAt === null) return false;

  const entryStartedAt =
    typeof args.entry?.includedCycleStartedAt === "number"
      ? args.entry.includedCycleStartedAt
      : null;
  const entryEndsAt =
    typeof args.entry?.includedCycleEndsAt === "number"
      ? args.entry.includedCycleEndsAt
      : null;
  if (entryStartedAt !== null && entryEndsAt !== null) {
    return entryStartedAt === balanceStartedAt && entryEndsAt === balanceEndsAt;
  }

  const createdAt =
    typeof args.entry?.createdAt === "number" ? args.entry.createdAt : null;
  return (
    createdAt !== null &&
    createdAt >= balanceStartedAt &&
    createdAt < balanceEndsAt
  );
}

function applyCycleAwareRefund(args: {
  split: ReturnType<typeof splitSettledCredits>;
  balance: any;
  entry: any;
}): {
  includedRefunded: number;
  purchasedRefunded: number;
} {
  return {
    includedRefunded: canRefundIncludedCreditsForEntry({
      balance: args.balance,
      entry: args.entry,
    })
      ? args.split.includedRefunded
      : 0,
    purchasedRefunded: args.split.purchasedRefunded,
  };
}

async function debitAvailableWorkspaceCredits(params: {
  ctx: any;
  userId: any;
  credits: number;
  nowMs: number;
}): Promise<{ includedDebited: number; purchasedDebited: number }> {
  const requestedCredits = roundCredits(Math.max(0, Number(params.credits) || 0));
  if (!(requestedCredits > 0)) {
    return { includedDebited: 0, purchasedDebited: 0 };
  }
  const balance = await params.ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_user", (q: any) => q.eq("userId", params.userId))
    .first();
  if (!balance) {
    return { includedDebited: 0, purchasedDebited: 0 };
  }
  const includedDebited = Math.min(balance.includedCreditsBalance, requestedCredits);
  const purchasedDebited = Math.min(
    balance.purchasedCreditsBalance,
    Math.max(0, requestedCredits - includedDebited),
  );
  const debitedCredits = roundCredits(includedDebited + purchasedDebited);
  if (debitedCredits > 0) {
    await params.ctx.db.patch(balance._id, {
      includedCreditsBalance: roundCredits(balance.includedCreditsBalance - includedDebited),
      purchasedCreditsBalance: roundCredits(balance.purchasedCreditsBalance - purchasedDebited),
      updatedAt: params.nowMs,
    });
  }
  return {
    includedDebited: roundCredits(includedDebited),
    purchasedDebited: roundCredits(purchasedDebited),
  };
}

async function addUncollectedWorkspaceCredits(params: {
  ctx: any;
  userId: any;
  credits: number;
  nowMs: number;
}): Promise<number> {
  const uncollectedCredits = roundCredits(Math.max(0, Number(params.credits) || 0));
  if (!(uncollectedCredits > 0)) return 0;
  const balance = await params.ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_user", (q: any) => q.eq("userId", params.userId))
    .first();
  if (!balance) {
    await params.ctx.db.insert("workspaceCreditBalances", {
      userId: params.userId,
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 0,
      uncollectedCreditsBalance: uncollectedCredits,
      includedCycleCredits: 0,
      includedCycleStartedAt: params.nowMs,
      includedCycleEndsAt: params.nowMs,
      createdAt: params.nowMs,
      updatedAt: params.nowMs,
    });
    return uncollectedCredits;
  }
  await params.ctx.db.patch(balance._id, {
    uncollectedCreditsBalance: roundCredits(
      readUncollectedCreditsBalance(balance) + uncollectedCredits,
    ),
    updatedAt: params.nowMs,
  });
  return uncollectedCredits;
}

export const getWorkspaceCreditBalanceInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const getWorkspaceToolBalance = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const row = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", actor.dbUserId))
      .first();
    return buildWorkspaceToolBalanceProjection(row, actor.dbUserId, args.nowMs ?? Date.now());
  },
});

export const upsertWorkspaceCreditBalanceInternal = internalMutation({
  args: {
    userId: v.id("users"),
    includedCreditsBalance: v.optional(v.number()),
    purchasedCreditsBalance: v.optional(v.number()),
    includedCycleCredits: v.optional(v.number()),
    includedCycleStartedAt: v.optional(v.number()),
    includedCycleEndsAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existing = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const patch = {
      includedCreditsBalance:
        typeof args.includedCreditsBalance === "number"
          ? roundCredits(args.includedCreditsBalance)
          : existing?.includedCreditsBalance ?? DEFAULT_INCLUDED_TOOL_CREDITS,
      purchasedCreditsBalance:
        typeof args.purchasedCreditsBalance === "number"
          ? roundCredits(args.purchasedCreditsBalance)
          : existing?.purchasedCreditsBalance ?? 0,
      uncollectedCreditsBalance: readUncollectedCreditsBalance(existing),
      includedCycleCredits:
        typeof args.includedCycleCredits === "number"
          ? roundCredits(args.includedCycleCredits)
          : existing?.includedCycleCredits ?? DEFAULT_INCLUDED_TOOL_CREDITS,
      includedCycleStartedAt:
        typeof args.includedCycleStartedAt === "number"
          ? args.includedCycleStartedAt
          : existing?.includedCycleStartedAt ?? nowMs,
      includedCycleEndsAt:
        typeof args.includedCycleEndsAt === "number"
          ? args.includedCycleEndsAt
          : existing?.includedCycleEndsAt ?? nowMs,
      updatedAt: nowMs,
    };
    if (!existing) {
      const id = await ctx.db.insert("workspaceCreditBalances", {
        userId: args.userId,
        ...patch,
        createdAt: nowMs,
      });
      return await ctx.db.get(id);
    }
    await ctx.db.patch(existing._id, patch);
    return await ctx.db.get(existing._id);
  },
});

function mergeWorkspaceCreditBalanceRows(rows: any[], nowMs: number) {
  const ordered = [...rows].sort((a, b) => {
    const updatedDelta = normalizeBalanceNumber(b.updatedAt) - normalizeBalanceNumber(a.updatedAt);
    if (updatedDelta !== 0) return updatedDelta;
    return normalizeBalanceNumber(b.createdAt) - normalizeBalanceNumber(a.createdAt);
  });
  const canonical = ordered[0];
  const cycle = ordered.reduce((best, row) => {
    if (!best) return row;
    const bestEndsAt = normalizeBalanceNumber(best.includedCycleEndsAt);
    const rowEndsAt = normalizeBalanceNumber(row.includedCycleEndsAt);
    if (rowEndsAt !== bestEndsAt) return rowEndsAt > bestEndsAt ? row : best;
    return normalizeBalanceNumber(row.updatedAt) > normalizeBalanceNumber(best.updatedAt) ? row : best;
  }, canonical);
  const cycleStartedAt = normalizeBalanceNumber(cycle?.includedCycleStartedAt) || nowMs;
  const cycleEndsAt = normalizeBalanceNumber(cycle?.includedCycleEndsAt) || nowMs;
  const includedCreditsBalance = cycleEndsAt > nowMs
    ? rows.reduce((sum, row) => {
        const rowStartedAt = normalizeBalanceNumber(row.includedCycleStartedAt);
        const rowEndsAt = normalizeBalanceNumber(row.includedCycleEndsAt);
        if (rowStartedAt !== cycleStartedAt || rowEndsAt !== cycleEndsAt) return sum;
        return sum + Math.max(0, normalizeBalanceNumber(row.includedCreditsBalance));
      }, 0)
    : 0;
  return {
    canonical,
    patch: {
      includedCreditsBalance: roundCredits(includedCreditsBalance),
      purchasedCreditsBalance: roundCredits(
        rows.reduce((sum, row) => sum + Math.max(0, normalizeBalanceNumber(row.purchasedCreditsBalance)), 0),
      ),
      uncollectedCreditsBalance: roundCredits(
        rows.reduce((sum, row) => sum + readUncollectedCreditsBalance(row), 0),
      ),
      includedCycleCredits: roundCredits(
        Math.max(0, normalizeBalanceNumber(cycle?.includedCycleCredits)),
      ),
      includedCycleStartedAt: cycleStartedAt,
      includedCycleEndsAt: cycleEndsAt,
      createdAt: Math.min(...rows.map((row) => normalizeBalanceNumber(row.createdAt) || nowMs)),
      updatedAt: nowMs,
    },
    duplicateRows: ordered.slice(1),
  };
}

function buildWorkspaceCreditBalanceDiagnostics(rows: any[], nowMs: number, sampleLimit: number) {
  const byUser = new Map<string, any[]>();
  for (const row of rows) {
    const key = String(row.userId);
    byUser.set(key, [...(byUser.get(key) ?? []), row]);
  }

  let duplicateUsers = 0;
  let duplicateRows = 0;
  let balancesWithUncollectedUsage = 0;
  let uncollectedCreditsBalance = 0;
  let negativeBalanceRows = 0;
  const duplicateSamples: Array<{
    userId: string;
    rows: number;
    canonicalId: string;
    mergedDuplicateRows: number;
  }> = [];
  const uncollectedSamples: Array<{
    userId: string;
    balanceId: string;
    uncollectedCreditsBalance: number;
    uncollectedBalanceUsd: string;
  }> = [];
  const negativeBalanceSamples: Array<{
    userId: string;
    balanceId: string;
    includedCreditsBalance: number;
    purchasedCreditsBalance: number;
    uncollectedCreditsBalance: number;
  }> = [];

  for (const userRows of byUser.values()) {
    if (userRows.length > 1) {
      const merged = mergeWorkspaceCreditBalanceRows(userRows, nowMs);
      duplicateUsers += 1;
      duplicateRows += merged.duplicateRows.length;
      if (duplicateSamples.length < sampleLimit) {
        duplicateSamples.push({
          userId: String(merged.canonical.userId),
          rows: userRows.length,
          canonicalId: String(merged.canonical._id),
          mergedDuplicateRows: merged.duplicateRows.length,
        });
      }
    }
  }

  for (const row of rows) {
    const includedCreditsBalance = roundCredits(normalizeBalanceNumber(row.includedCreditsBalance));
    const purchasedCreditsBalance = roundCredits(normalizeBalanceNumber(row.purchasedCreditsBalance));
    const rowUncollectedCreditsBalance = readUncollectedCreditsBalance(row);
    if (rowUncollectedCreditsBalance > 0) {
      balancesWithUncollectedUsage += 1;
      uncollectedCreditsBalance = roundCredits(uncollectedCreditsBalance + rowUncollectedCreditsBalance);
      if (uncollectedSamples.length < sampleLimit) {
        uncollectedSamples.push({
          userId: String(row.userId),
          balanceId: String(row._id),
          uncollectedCreditsBalance: rowUncollectedCreditsBalance,
          uncollectedBalanceUsd: formatWorkspaceToolBalanceUsdFromCredits(rowUncollectedCreditsBalance),
        });
      }
    }
    if (includedCreditsBalance < 0 || purchasedCreditsBalance < 0 || rowUncollectedCreditsBalance < 0) {
      negativeBalanceRows += 1;
      if (negativeBalanceSamples.length < sampleLimit) {
        negativeBalanceSamples.push({
          userId: String(row.userId),
          balanceId: String(row._id),
          includedCreditsBalance,
          purchasedCreditsBalance,
          uncollectedCreditsBalance: rowUncollectedCreditsBalance,
        });
      }
    }
  }

  return {
    scannedRows: rows.length,
    duplicateUsers,
    duplicateRows,
    duplicateSamples,
    balancesWithUncollectedUsage,
    uncollectedCreditsBalance: roundCredits(uncollectedCreditsBalance),
    uncollectedBalanceUsd: formatWorkspaceToolBalanceUsdFromCredits(uncollectedCreditsBalance),
    uncollectedSamples,
    negativeBalanceRows,
    negativeBalanceSamples,
  };
}

export const getWorkspaceToolCreditDiagnosticsForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const nowMs = args.nowMs ?? Date.now();
    const limit = boundedLimit(args.limit, 25, 100);
    const balanceRows = await ctx.db.query("workspaceCreditBalances").collect();
    const balanceDiagnostics = buildWorkspaceCreditBalanceDiagnostics(balanceRows, nowMs, limit);
    const pendingTopups = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_mode_status", (q) =>
        q.eq("mode", "workspace_credit_topup").eq("status", "pending"),
      )
      .take(500);
    const staleTopups = pendingTopups
      .filter((row) => effectiveWorkspaceCreditTopupCheckoutExpiresAt(row) <= nowMs)
      .slice(0, limit)
      .map((row) => ({
        sessionId: row.sessionId,
        ownerUserId: row.ownerUserId ? String(row.ownerUserId) : null,
        workspaceCreditsAmount: row.workspaceCreditsAmount ?? null,
        expiresAt: row.expiresAt,
        effectiveExpiresAt: effectiveWorkspaceCreditTopupCheckoutExpiresAt(row),
      }));
    const pendingSettlements = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_pendingSettlementStatus_nextAttemptAt", (q) =>
        q.eq("pendingSettlementStatus", "succeeded").lt("pendingSettlementNextAttemptAt", nowMs),
      )
      .take(limit);

    return {
      generatedAt: nowMs,
      operator: {
        userId: operator.userId,
        role: operator.role,
      },
      balances: balanceDiagnostics,
      uncollectedUsage: {
        balanceRows: balanceDiagnostics.balancesWithUncollectedUsage,
        uncollectedCreditsBalance: balanceDiagnostics.uncollectedCreditsBalance,
        uncollectedBalanceUsd: balanceDiagnostics.uncollectedBalanceUsd,
        samples: balanceDiagnostics.uncollectedSamples,
      },
      staleTopupCheckouts: {
        scannedPendingRows: pendingTopups.length,
        staleRowsInScan: pendingTopups.filter((row) =>
          effectiveWorkspaceCreditTopupCheckoutExpiresAt(row) <= nowMs
        ).length,
        isTruncated: pendingTopups.length >= 500,
        samples: staleTopups,
      },
      pendingSettlements: {
        dueRows: pendingSettlements.length,
        samples: pendingSettlements.map((entry) => ({
          creditKey: entry.creditKey,
          userId: String(entry.userId),
          toolName: entry.toolName,
          attempts: entry.pendingSettlementAttempts ?? 0,
          nextAttemptAt: entry.pendingSettlementNextAttemptAt ?? null,
          error: entry.pendingSettlementError ?? null,
        })),
      },
      repair: {
        duplicateBalanceRowsDryRun: {
          duplicateUsers: balanceDiagnostics.duplicateUsers,
          mergedDuplicateRows: balanceDiagnostics.duplicateRows,
          samples: balanceDiagnostics.duplicateSamples,
        },
        repairMutation: "workspaceCredits:repairDuplicateWorkspaceCreditBalancesInternal",
      },
    };
  },
});

export const repairDuplicateWorkspaceCreditBalancesInternal = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limitUsers: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const dryRun = args.dryRun === true;
    const limitUsers = Math.max(1, Math.min(100, Math.floor(args.limitUsers ?? 25)));
    const rows = await ctx.db.query("workspaceCreditBalances").collect();
    const byUser = new Map<string, any[]>();
    for (const row of rows) {
      const key = String(row.userId);
      byUser.set(key, [...(byUser.get(key) ?? []), row]);
    }

    let duplicateUsers = 0;
    let repairedUsers = 0;
    let deletedRows = 0;
    const samples: Array<{ userId: string; rows: number; canonicalId: string }> = [];
    for (const [userId, userRows] of byUser.entries()) {
      if (userRows.length <= 1) continue;
      duplicateUsers += 1;
      if (repairedUsers >= limitUsers) continue;
      const merged = mergeWorkspaceCreditBalanceRows(userRows, nowMs);
      samples.push({
        userId,
        rows: userRows.length,
        canonicalId: String(merged.canonical._id),
      });
      if (!dryRun) {
        await ctx.db.patch(merged.canonical._id, merged.patch);
        for (const duplicate of merged.duplicateRows) {
          await ctx.db.delete(duplicate._id);
          deletedRows += 1;
        }
      } else {
        deletedRows += merged.duplicateRows.length;
      }
      repairedUsers += 1;
    }
    return {
      scannedRows: rows.length,
      duplicateUsers,
      repairedUsers,
      mergedDuplicateRows: deletedRows,
      dryRun,
      samples,
    };
  },
});

export const getWorkspaceCreditTopupCheckoutSessionInternal = internalQuery({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row || row.mode !== "workspace_credit_topup") return null;
    return row;
  },
});

export const createPendingWorkspaceCreditTopupCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    ownerUserId: v.id("users"),
    providerPriceId: v.optional(v.string()),
    workspaceCreditsAmount: v.number(),
    expiresAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      mode: "workspace_credit_topup",
      provider: "stripe",
      providerPriceId: normalizeStripePriceId(args.providerPriceId),
      ownerUserId: args.ownerUserId,
      workspaceCreditsAmount: roundCredits(args.workspaceCreditsAmount),
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

export const attachWorkspaceCreditTopupStripeCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    providerCheckoutSessionId: v.string(),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) throw new Error("workspace_credit_topup_checkout_session_not_found");
    if (row.mode !== "workspace_credit_topup") throw new Error("workspace_credit_topup_checkout_session_invalid");
    await attachStripeCustomerToUser({
      ctx,
      userId: row.ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      providerCustomerId: String(args.providerCustomerId ?? "").trim() || undefined,
      providerPriceId: normalizeStripePriceId(args.providerPriceId) ?? normalizeStripePriceId(row.providerPriceId),
      updatedAt: nowMs,
    });
  },
});

export const expireWorkspaceCreditTopupCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row || row.mode !== "workspace_credit_topup") return;
    await ctx.db.patch(row._id, {
      status: "expired",
      updatedAt: nowMs,
    });
  },
});

export const expireStaleWorkspaceCreditTopupCheckoutSessionsInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const pending = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_mode_status", (q) =>
        q.eq("mode", "workspace_credit_topup").eq("status", "pending"),
      )
      .take(limit);
    let expired = 0;
    for (const row of pending) {
      if (effectiveWorkspaceCreditTopupCheckoutExpiresAt(row) > nowMs) continue;
      await ctx.db.patch(row._id, {
        status: "expired",
        updatedAt: nowMs,
      });
      expired += 1;
    }
    return {
      scanned: pending.length,
      expired,
    };
  },
});

export const completeWorkspaceCreditTopupCheckoutSessionInternal = internalMutation({
  args: {
    localSessionId: v.string(),
    providerCheckoutSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.localSessionId))
      .first();
    if (!row) throw new Error("workspace_credit_topup_checkout_session_not_found");
    if (row.mode !== "workspace_credit_topup") throw new Error("workspace_credit_topup_checkout_session_invalid");
    if (!row.ownerUserId) throw new Error("workspace_credit_topup_owner_missing");
    const ownerUserId = row.ownerUserId;
    await attachStripeCustomerToUser({
      ctx,
      userId: ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    if (typeof row.workspaceCreditsGrantedAt === "number") {
      return {
        ok: true,
        alreadyGranted: true,
        ownerUserId,
        grantedCredits: row.workspaceCreditsAmount ?? 0,
      };
    }

    const grantedCredits = roundCredits(row.workspaceCreditsAmount ?? WORKSPACE_CREDIT_TOPUP_CREDITS);
    if (!(grantedCredits > 0)) {
      throw new Error("workspace_credit_topup_amount_invalid");
    }

    const existingBalance = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", ownerUserId))
      .first();

    let uncollectedCreditsPaid = 0;
    if (!existingBalance) {
      await ctx.db.insert("workspaceCreditBalances", {
        userId: ownerUserId,
        includedCreditsBalance: 0,
        purchasedCreditsBalance: grantedCredits,
        uncollectedCreditsBalance: 0,
        includedCycleCredits: 0,
        includedCycleStartedAt: nowMs,
        includedCycleEndsAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      const existingUncollectedCredits = readUncollectedCreditsBalance(existingBalance);
      uncollectedCreditsPaid = Math.min(existingUncollectedCredits, grantedCredits);
      const purchasedCreditsGranted = roundCredits(grantedCredits - uncollectedCreditsPaid);
      await ctx.db.patch(existingBalance._id, {
        purchasedCreditsBalance: roundCredits(
          existingBalance.purchasedCreditsBalance + purchasedCreditsGranted,
        ),
        uncollectedCreditsBalance: roundCredits(
          existingUncollectedCredits - uncollectedCreditsPaid,
        ),
        updatedAt: nowMs,
      });
    }

    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId:
        String(args.providerCheckoutSessionId ?? "").trim() || row.providerCheckoutSessionId,
      providerCustomerId:
        String(args.providerCustomerId ?? "").trim() || row.providerCustomerId,
      providerPriceId: normalizeStripePriceId(args.providerPriceId) ?? normalizeStripePriceId(row.providerPriceId),
      workspaceCreditsAmount: grantedCredits,
      workspaceCreditsGrantedAt: nowMs,
      workspaceCreditsUncollectedPaid: roundCredits(uncollectedCreditsPaid),
      status: "complete",
      updatedAt: nowMs,
    });

    return {
      ok: true,
      alreadyGranted: false,
      ownerUserId: row.ownerUserId,
      grantedCredits,
    };
  },
});

export const recordWorkspaceComputeChargeInternal = internalMutation({
  args: {
    chargeKey: v.string(),
    userId: v.id("users"),
    projectId: v.id("cloudProjects"),
    runId: v.string(),
    providerSandboxId: v.string(),
    startedAt: v.number(),
    endedAt: v.number(),
    durationSeconds: v.optional(v.number()),
    sandboxCpu: v.number(),
    sandboxMemoryGiB: v.number(),
    sandboxDiskGiB: v.number(),
    computeCostUsd: v.optional(v.number()),
    creditsDebited: v.optional(v.number()),
    creditReservationKey: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existing = await ctx.db
      .query("workspaceComputeCharges")
      .withIndex("by_chargeKey", (q) => q.eq("chargeKey", args.chargeKey))
      .first();
    if (existing) return existing;

    const durationSeconds = Math.max(
      0,
      typeof args.durationSeconds === "number"
        ? args.durationSeconds
        : (args.endedAt - args.startedAt) / 1000,
    );
    const computeCostUsd = roundCurrency(
      typeof args.computeCostUsd === "number"
        ? args.computeCostUsd
        : estimateDaytonaWorkspaceComputeUsd({
            durationSeconds,
            sandboxCpu: args.sandboxCpu,
            sandboxMemoryGiB: args.sandboxMemoryGiB,
          }),
    );
    const requestedCredits = roundCredits(
      typeof args.creditsDebited === "number"
        ? args.creditsDebited
        : priceDaytonaWorkspaceUsageCredits({ computeCostUsd }),
    );

    let debitIncluded = 0;
    let debitPurchased = 0;
    const creditReservationKey = normalizeOptionalString(args.creditReservationKey);
    if (creditReservationKey) {
      const reservation = await ctx.db
        .query("creditLedgerEntries")
        .withIndex("by_creditKey", (q) => q.eq("creditKey", creditReservationKey))
        .first();
      if (reservation?.status === "reserved") {
        const split = splitSettledCredits({
          includedDebited: reservation.includedCreditsDebited,
          purchasedDebited: reservation.purchasedCreditsDebited,
          creditsSettled: requestedCredits,
        });
        const hasRefund = split.includedRefunded > 0 || split.purchasedRefunded > 0;
        if (hasRefund) {
          const balance = await ctx.db
            .query("workspaceCreditBalances")
            .withIndex("by_user", (q) => q.eq("userId", reservation.userId))
            .first();
          if (balance) {
            await ctx.db.patch(balance._id, {
              includedCreditsBalance: roundCredits(
                balance.includedCreditsBalance + split.includedRefunded,
              ),
              purchasedCreditsBalance: roundCredits(
                balance.purchasedCreditsBalance + split.purchasedRefunded,
              ),
              updatedAt: nowMs,
            });
          } else {
            await ctx.db.insert("workspaceCreditBalances", {
              userId: reservation.userId,
              includedCreditsBalance: split.includedRefunded,
              purchasedCreditsBalance: split.purchasedRefunded,
              uncollectedCreditsBalance: 0,
              includedCycleCredits: 0,
              includedCycleStartedAt: nowMs,
              includedCycleEndsAt: nowMs,
              createdAt: nowMs,
              updatedAt: nowMs,
            });
          }
        }
        debitIncluded = split.includedSettled;
        debitPurchased = split.purchasedSettled;
        let extraIncludedDebited = 0;
        let extraPurchasedDebited = 0;
        const remainingCredits = roundCredits(
          requestedCredits - debitIncluded - debitPurchased,
        );
        if (remainingCredits > 0) {
          const extraDebit = await debitAvailableWorkspaceCredits({
            ctx,
            userId: args.userId,
            credits: remainingCredits,
            nowMs,
          });
          extraIncludedDebited = extraDebit.includedDebited;
          extraPurchasedDebited = extraDebit.purchasedDebited;
          debitIncluded = roundCredits(debitIncluded + extraDebit.includedDebited);
          debitPurchased = roundCredits(debitPurchased + extraDebit.purchasedDebited);
        }
        const totalCreditsSettled = roundCredits(debitIncluded + debitPurchased);
        const uncollectedCredits = roundCredits(
          Math.max(0, requestedCredits - totalCreditsSettled),
        );
        const uncollectedCreditsRecorded = await addUncollectedWorkspaceCredits({
          ctx,
          userId: args.userId,
          credits: uncollectedCredits,
          nowMs,
        });
        const chargedRatio = requestedCredits > 0
          ? Math.min(1, totalCreditsSettled / requestedCredits)
          : 0;
        const existingMetadata =
          reservation.metadata &&
          typeof reservation.metadata === "object" &&
          !Array.isArray(reservation.metadata)
            ? reservation.metadata
            : {};
        await ctx.db.patch(reservation._id, {
          status: "succeeded",
          creditsSettled: totalCreditsSettled,
          includedCreditsDebited: roundCredits(
            Number(reservation.includedCreditsDebited ?? 0) + extraIncludedDebited,
          ),
          purchasedCreditsDebited: roundCredits(
            Number(reservation.purchasedCreditsDebited ?? 0) + extraPurchasedDebited,
          ),
          includedCreditsRefunded: split.includedRefunded,
          purchasedCreditsRefunded: split.purchasedRefunded,
          rawVendorCostUsd: roundCurrency(computeCostUsd * chargedRatio),
          polynetPriceUsd: creditsToUsd(totalCreditsSettled),
          metadata: {
            ...existingMetadata,
            final_duration_seconds: roundCurrency(durationSeconds),
            final_compute_cost_usd: computeCostUsd,
            final_credits_requested: requestedCredits,
            final_credits_settled: totalCreditsSettled,
            uncollected_credits: uncollectedCreditsRecorded,
            uncollected_reason:
              uncollectedCreditsRecorded > 0 ? "insufficient_balance_at_settlement" : null,
            extra_credits_debited: roundCredits(
              extraIncludedDebited + extraPurchasedDebited,
            ),
          },
          settledAt: nowMs,
          updatedAt: nowMs,
        });
        const paidUsageRatio = totalCreditsSettled > 0
          ? debitPurchased / totalCreditsSettled
          : 0;
        await recordToolUsagePartnerCommission(ctx, {
          creditLedgerEntryId: reservation._id,
          referredUserId: reservation.userId,
          polynetPriceUsd: creditsToUsd(totalCreditsSettled),
          rawVendorCostUsd: roundCurrency(computeCostUsd * chargedRatio),
          paidUsageRatio,
          nowMs,
        });
      } else if (reservation?.status === "succeeded") {
        const settledCredits = roundCredits(
          typeof reservation.creditsSettled === "number"
            ? reservation.creditsSettled
            : requestedCredits,
        );
        debitIncluded = Math.min(
          Number(reservation.includedCreditsDebited ?? 0),
          settledCredits,
        );
        debitPurchased = Math.min(
          Number(reservation.purchasedCreditsDebited ?? 0),
          Math.max(0, settledCredits - debitIncluded),
        );
      }
    } else {
      const directDebit = await debitAvailableWorkspaceCredits({
        ctx,
        userId: args.userId,
        credits: requestedCredits,
        nowMs,
      });
      debitIncluded = directDebit.includedDebited;
      debitPurchased = directDebit.purchasedDebited;
      await addUncollectedWorkspaceCredits({
        ctx,
        userId: args.userId,
        credits: roundCredits(Math.max(0, requestedCredits - debitIncluded - debitPurchased)),
        nowMs,
      });
    }

    const debitedCredits = roundCredits(debitIncluded + debitPurchased);
    const debitSource =
      debitedCredits <= 0
        ? "unbilled"
        : debitIncluded > 0 && debitPurchased > 0
          ? "mixed"
          : debitPurchased > 0
            ? "purchased"
            : "included";

    const id = await ctx.db.insert("workspaceComputeCharges", {
      chargeKey: args.chargeKey,
      userId: args.userId,
      projectId: args.projectId,
      runId: args.runId,
      providerSandboxId: args.providerSandboxId,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      durationSeconds: roundCurrency(durationSeconds),
      sandboxCpu: args.sandboxCpu,
      sandboxMemoryGiB: args.sandboxMemoryGiB,
      sandboxDiskGiB: args.sandboxDiskGiB,
      computeCostUsd,
      creditsDebited: debitedCredits,
      creditReservationKey,
      debitSource,
      createdAt: nowMs,
    });
    return await ctx.db.get(id);
  },
});

export const reserveCreditsInternal = internalMutation({
  args: {
    creditKey: v.string(),
    userId: v.id("users"),
    communityId: v.optional(v.union(v.id("communities"), v.null())),
    projectId: v.optional(v.union(v.id("cloudProjects"), v.null())),
    runId: v.optional(v.union(v.string(), v.null())),
    toolName: v.string(),
    action: v.optional(v.union(v.string(), v.null())),
    vendor: v.optional(v.union(v.string(), v.null())),
    credits: v.number(),
    rawVendorCostUsd: v.optional(v.number()),
    polynetPriceUsd: v.optional(v.number()),
    metadata: v.optional(v.any()),
    expiresAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const creditKey = String(args.creditKey ?? "").trim();
    if (!creditKey) throw new Error("credits_key_required");
    const existing = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_creditKey", (q) => q.eq("creditKey", creditKey))
      .first();
    if (existing) return existing;

    const requestedCredits = roundCredits(args.credits);
    if (!(requestedCredits > 0)) throw new Error("credits_amount_invalid");

    const balance = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (readUncollectedCreditsBalance(balance) > 0) {
      throw new Error("credits_exhausted");
    }
    const remainingCredits =
      Number(balance?.includedCreditsBalance ?? 0) +
      Number(balance?.purchasedCreditsBalance ?? 0);
    if (!balance || remainingCredits < requestedCredits) {
      throw new Error("credits_exhausted");
    }

    const debitIncluded = Math.min(balance.includedCreditsBalance, requestedCredits);
    const debitPurchased = Math.min(
      balance.purchasedCreditsBalance,
      Math.max(0, requestedCredits - debitIncluded),
    );
    const debitedCredits = roundCredits(debitIncluded + debitPurchased);
    if (debitedCredits < requestedCredits) {
      throw new Error("credits_exhausted");
    }

    await ctx.db.patch(balance._id, {
      includedCreditsBalance: roundCredits(balance.includedCreditsBalance - debitIncluded),
      purchasedCreditsBalance: roundCredits(balance.purchasedCreditsBalance - debitPurchased),
      updatedAt: nowMs,
    });

    const id = await ctx.db.insert("creditLedgerEntries", {
      creditKey,
      userId: args.userId,
      communityId: args.communityId ?? undefined,
      projectId: args.projectId ?? undefined,
      runId: normalizeOptionalString(args.runId),
      toolName: String(args.toolName ?? "").trim() || "unknown",
      action: normalizeOptionalString(args.action),
      vendor: normalizeOptionalString(args.vendor),
      status: "reserved",
      creditsReserved: requestedCredits,
      includedCreditsDebited: roundCredits(debitIncluded),
      purchasedCreditsDebited: roundCredits(debitPurchased),
      includedCycleStartedAt:
        typeof balance.includedCycleStartedAt === "number"
          ? balance.includedCycleStartedAt
          : undefined,
      includedCycleEndsAt:
        typeof balance.includedCycleEndsAt === "number"
          ? balance.includedCycleEndsAt
          : undefined,
      rawVendorCostUsd:
        typeof args.rawVendorCostUsd === "number" ? roundCurrency(args.rawVendorCostUsd) : undefined,
      polynetPriceUsd:
        typeof args.polynetPriceUsd === "number" ? roundCurrency(args.polynetPriceUsd) : undefined,
      metadata: args.metadata,
      expiresAt:
        typeof args.expiresAt === "number" && Number.isFinite(args.expiresAt)
          ? args.expiresAt
          : nowMs + CREDIT_RESERVATION_EXPIRY_MS,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return await ctx.db.get(id);
  },
});

export const settleCreditsInternal = internalMutation({
  args: {
    creditKey: v.string(),
    status: v.union(v.literal("succeeded"), v.literal("refunded")),
    creditsSettled: v.optional(v.number()),
    failureReason: v.optional(v.union(v.string(), v.null())),
    rawVendorCostUsd: v.optional(v.number()),
    metadata: v.optional(v.any()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const creditKey = String(args.creditKey ?? "").trim();
    if (!creditKey) throw new Error("credits_key_required");
    const entry = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_creditKey", (q) => q.eq("creditKey", creditKey))
      .first();
    if (!entry) throw new Error("credits_ledger_entry_not_found");
    if (entry.status === args.status) return entry;
    if (entry.status === "refunded" || entry.status === "succeeded") return entry;

    const requestedCreditsSettled =
      args.status === "refunded"
        ? 0
        : typeof args.creditsSettled === "number"
          ? roundCredits(Math.max(0, args.creditsSettled))
          : roundCredits(entry.creditsReserved);
    const reservedCreditsSettled = clampCredits(
      requestedCreditsSettled,
      0,
      entry.creditsReserved,
    );
    const split = splitSettledCredits({
      includedDebited: entry.includedCreditsDebited,
      purchasedDebited: entry.purchasedCreditsDebited,
      creditsSettled: reservedCreditsSettled,
    });
    let extraIncludedDebited = 0;
    let extraPurchasedDebited = 0;
    if (args.status === "succeeded" && requestedCreditsSettled > reservedCreditsSettled) {
      const extraDebit = await debitAvailableWorkspaceCredits({
        ctx,
        userId: entry.userId,
        credits: requestedCreditsSettled - reservedCreditsSettled,
        nowMs,
      });
      extraIncludedDebited = extraDebit.includedDebited;
      extraPurchasedDebited = extraDebit.purchasedDebited;
    }
    const creditsSettled = roundCredits(
      reservedCreditsSettled + extraIncludedDebited + extraPurchasedDebited,
    );
    const uncollectedCredits = roundCredits(
      Math.max(0, requestedCreditsSettled - creditsSettled),
    );
    const settledRawVendorCostUsd =
      args.status === "succeeded" && typeof args.rawVendorCostUsd === "number"
        ? roundCurrency(args.rawVendorCostUsd)
        : args.status === "refunded"
          ? 0
          : entry.rawVendorCostUsd;
    const settledPolynetPriceUsd =
      args.status === "succeeded"
        ? creditsToUsd(creditsSettled)
        : 0;
    const balance = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", entry.userId))
      .first();
    const refund = balance
      ? applyCycleAwareRefund({ split, balance, entry })
      : {
          includedRefunded: 0,
          purchasedRefunded: split.purchasedRefunded,
        };
    const hasRefund = refund.includedRefunded > 0 || refund.purchasedRefunded > 0;

    if (hasRefund) {
      if (balance) {
        await ctx.db.patch(balance._id, {
          includedCreditsBalance: roundCredits(
            balance.includedCreditsBalance + refund.includedRefunded,
          ),
          purchasedCreditsBalance: roundCredits(
            balance.purchasedCreditsBalance + refund.purchasedRefunded,
          ),
          updatedAt: nowMs,
        });
      } else {
        await ctx.db.insert("workspaceCreditBalances", {
          userId: entry.userId,
          includedCreditsBalance: 0,
          purchasedCreditsBalance: refund.purchasedRefunded,
          uncollectedCreditsBalance: 0,
          includedCycleCredits: 0,
          includedCycleStartedAt: nowMs,
          includedCycleEndsAt: nowMs,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    }
    const uncollectedCreditsRecorded = await addUncollectedWorkspaceCredits({
      ctx,
      userId: entry.userId,
      credits: uncollectedCredits,
      nowMs,
    });
    const settlementMetadata = mergeLedgerMetadata(entry.metadata, {
      ...normalizeObjectMetadata(args.metadata),
      requested_credits_settled: requestedCreditsSettled,
      collected_credits_settled: creditsSettled,
      uncollected_credits: uncollectedCreditsRecorded,
      uncollected_reason:
        uncollectedCreditsRecorded > 0 ? "insufficient_balance_at_settlement" : null,
      collected_polynet_price_usd: settledPolynetPriceUsd,
    });

    await ctx.db.patch(entry._id, {
      status: args.status,
      creditsSettled,
      includedCreditsDebited: roundCredits(
        Number(entry.includedCreditsDebited ?? 0) + extraIncludedDebited,
      ),
      purchasedCreditsDebited: roundCredits(
        Number(entry.purchasedCreditsDebited ?? 0) + extraPurchasedDebited,
      ),
      includedCreditsRefunded: refund.includedRefunded,
      purchasedCreditsRefunded: refund.purchasedRefunded,
      failureReason: normalizeOptionalString(args.failureReason),
      rawVendorCostUsd: settledRawVendorCostUsd,
      polynetPriceUsd: settledPolynetPriceUsd,
      pendingSettlementStatus: undefined,
      pendingCreditsSettled: undefined,
      pendingRawVendorCostUsd: undefined,
      pendingSettlementMetadata: undefined,
      pendingSettlementAttempts: undefined,
      pendingSettlementNextAttemptAt: undefined,
      pendingSettlementError: undefined,
      pendingSettlementUpdatedAt: undefined,
      metadata: settlementMetadata,
      settledAt: nowMs,
      updatedAt: nowMs,
    });
    if (args.status === "succeeded") {
      const purchasedSettled = roundCredits(split.purchasedSettled + extraPurchasedDebited);
      const paidUsageRatio = creditsSettled > 0
        ? purchasedSettled / creditsSettled
        : 0;
      await recordToolUsagePartnerCommission(ctx, {
        creditLedgerEntryId: entry._id,
        referredUserId: entry.userId,
        polynetPriceUsd: settledPolynetPriceUsd,
        rawVendorCostUsd: settledRawVendorCostUsd,
        paidUsageRatio,
        nowMs,
      });
    }
    return await ctx.db.get(entry._id);
  },
});

export const queueCreditSettlementRetryInternal = internalMutation({
  args: {
    creditKey: v.string(),
    status: v.literal("succeeded"),
    creditsSettled: v.optional(v.number()),
    rawVendorCostUsd: v.optional(v.number()),
    metadata: v.optional(v.any()),
    error: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const creditKey = String(args.creditKey ?? "").trim();
    if (!creditKey) throw new Error("credits_key_required");
    const entry = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_creditKey", (q) => q.eq("creditKey", creditKey))
      .first();
    if (!entry || entry.status !== "reserved") return null;
    const attempts = Math.max(0, Math.floor(Number(entry.pendingSettlementAttempts ?? 0))) + 1;
    const retryDelayMs = Math.min(60 * 60 * 1000, attempts * attempts * 60 * 1000);
    await ctx.db.patch(entry._id, {
      pendingSettlementStatus: args.status,
      pendingCreditsSettled:
        typeof args.creditsSettled === "number"
          ? roundCredits(Math.max(0, args.creditsSettled))
          : undefined,
      pendingRawVendorCostUsd:
        typeof args.rawVendorCostUsd === "number"
          ? roundCurrency(Math.max(0, args.rawVendorCostUsd))
          : undefined,
      pendingSettlementMetadata: args.metadata,
      pendingSettlementAttempts: attempts,
      pendingSettlementNextAttemptAt: nowMs + retryDelayMs,
      pendingSettlementError: normalizeOptionalString(args.error),
      pendingSettlementUpdatedAt: nowMs,
      expiresAt: nowMs + Math.max(CREDIT_RESERVATION_EXPIRY_MS, retryDelayMs + 60 * 60 * 1000),
      updatedAt: nowMs,
    });
    return {
      queued: true,
      attempts,
      nextAttemptAt: nowMs + retryDelayMs,
    };
  },
});

export const listPendingCreditSettlementsInternal = internalQuery({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 25)));
    return await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_pendingSettlementStatus_nextAttemptAt", (q) =>
        q.eq("pendingSettlementStatus", "succeeded").lt("pendingSettlementNextAttemptAt", nowMs),
      )
      .take(limit);
  },
});

export const retryPendingCreditSettlementsInternal = internalAction({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 25)));
    const entries = await ctx.runQuery(
      (internal as any).workspaceCredits.listPendingCreditSettlementsInternal,
      { nowMs, limit },
    ) as any[];
    let settled = 0;
    let requeued = 0;
    for (const entry of entries) {
      const creditKey = String(entry.creditKey ?? "").trim();
      if (!creditKey) continue;
      try {
        await ctx.runMutation((internal as any).workspaceCredits.settleCreditsInternal, {
          creditKey,
          status: "succeeded",
          creditsSettled: entry.pendingCreditsSettled,
          rawVendorCostUsd: entry.pendingRawVendorCostUsd,
          metadata: entry.pendingSettlementMetadata,
          nowMs,
        });
        settled += 1;
      } catch (error) {
        requeued += 1;
        await ctx.runMutation((internal as any).workspaceCredits.queueCreditSettlementRetryInternal, {
          creditKey,
          status: "succeeded",
          creditsSettled: entry.pendingCreditsSettled,
          rawVendorCostUsd: entry.pendingRawVendorCostUsd,
          metadata: entry.pendingSettlementMetadata,
          error: error instanceof Error ? error.message : String(error ?? ""),
          nowMs,
        });
      }
    }
    return {
      scanned: entries.length,
      settled,
      requeued,
    };
  },
});

export const reconcileExpiredCreditReservationsInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const expired = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_status_expiresAt", (q) =>
        q.eq("status", "reserved").lt("expiresAt", nowMs),
      )
      .take(limit);
    let refunded = 0;
    for (const entry of expired) {
      if (entry.pendingSettlementStatus === "succeeded") continue;
      const split = splitSettledCredits({
        includedDebited: entry.includedCreditsDebited,
        purchasedDebited: entry.purchasedCreditsDebited,
        creditsSettled: 0,
      });
      const balance = await ctx.db
        .query("workspaceCreditBalances")
        .withIndex("by_user", (q) => q.eq("userId", entry.userId))
        .first();
      const refund = balance
        ? applyCycleAwareRefund({ split, balance, entry })
        : {
            includedRefunded: 0,
            purchasedRefunded: split.purchasedRefunded,
          };
      if (balance) {
        await ctx.db.patch(balance._id, {
          includedCreditsBalance: roundCredits(
            balance.includedCreditsBalance + refund.includedRefunded,
          ),
          purchasedCreditsBalance: roundCredits(
            balance.purchasedCreditsBalance + refund.purchasedRefunded,
          ),
          updatedAt: nowMs,
        });
      } else if (refund.purchasedRefunded > 0) {
        await ctx.db.insert("workspaceCreditBalances", {
          userId: entry.userId,
          includedCreditsBalance: 0,
          purchasedCreditsBalance: refund.purchasedRefunded,
          uncollectedCreditsBalance: 0,
          includedCycleCredits: 0,
          includedCycleStartedAt: nowMs,
          includedCycleEndsAt: nowMs,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
      await ctx.db.patch(entry._id, {
        status: "refunded",
        creditsSettled: 0,
        includedCreditsRefunded: refund.includedRefunded,
        purchasedCreditsRefunded: refund.purchasedRefunded,
        failureReason: "reservation_expired",
        settledAt: nowMs,
        updatedAt: nowMs,
      });
      refunded += 1;
    }
    return { scanned: expired.length, refunded };
  },
});

export const startWorkspaceCreditTopupCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
    packId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const successUrl = requireCanonicalCheckoutReturnUrl(
      args.successUrl,
      "workspace_credit_topup_success_url_invalid",
    );
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "workspace_credit_topup_cancel_url_invalid",
    );

    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject ?? null,
    })) as { dbUserId?: unknown; email?: string | null };
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("user_not_found");
    const stripeCustomerId = await ensureStripeCustomerForUser({
      ctx,
      userId,
      email: actor?.email ?? null,
      nowMs,
    });

    const sessionId = newOpaqueToken("credits");
    const pack = resolveWorkspaceToolBalanceTopupPack(args.packId);
    if (!pack) throw new Error("workspace_tool_balance_pack_invalid");
    const workspaceCreditsAmount = pack.credits;
    const expiresAt = nowMs + WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS;
    await ctx.runMutation(
      internal.workspaceCredits.createPendingWorkspaceCreditTopupCheckoutSessionInternal as any,
      {
        sessionId,
        ownerUserId: userId,
        workspaceCreditsAmount,
        expiresAt,
        nowMs,
      },
    );

    try {
      const stripe = getStripeClient();
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: stripeCustomerId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        expires_at: Math.floor(expiresAt / 1000),
        client_reference_id: sessionId,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(pack.priceUsd * 100),
              product_data: {
                name: "Polynet tool balance",
                description: `${formatWorkspaceToolBalanceUsdFromCredits(
                  workspaceCreditsAmount,
                )} for workspace tools, web research, and voice input.`,
              },
            },
            quantity: 1,
          },
        ],
        custom_text: {
          submit: {
            message:
              "Tool balance is non-refundable and can only be used for Polynet premium tools.",
          },
        },
        metadata: {
          local_session_id: sessionId,
          checkout_mode: "workspace_credit_topup",
          workspace_tool_balance_pack_id: pack.id,
          workspace_tool_balance_usd: String(pack.priceUsd),
        },
      });
      const checkoutUrl = String(checkoutSession.url ?? "").trim();
      if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
      await ctx.runMutation(
        internal.workspaceCredits.attachWorkspaceCreditTopupStripeCheckoutSessionInternal as any,
        {
          sessionId,
          providerCheckoutSessionId: checkoutSession.id,
          providerCustomerId:
            typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
          nowMs: Date.now(),
        },
      );
      return {
        checkout_url: checkoutUrl,
      };
    } catch (error) {
      await ctx.runMutation(
        internal.workspaceCredits.expireWorkspaceCreditTopupCheckoutSessionInternal as any,
        {
          sessionId,
          nowMs: Date.now(),
        },
      );
      throw error;
    }
  },
});
