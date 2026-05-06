import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import {
  BUILDER_INCLUDED_WORKSPACE_CREDITS,
  CREDIT_RESERVATION_EXPIRY_MS,
  estimateDaytonaWorkspaceComputeUsd,
  formatWorkspaceToolBalanceUsdFromCredits,
  priceDaytonaWorkspaceUsageCredits,
  resolveWorkspaceToolBalanceTopupPack,
  WORKSPACE_CREDIT_TOPUP_CREDITS,
} from "../shared/workspaceCredits";
import {
  newOpaqueToken,
  requireCanonicalCheckoutReturnUrl,
} from "./billingCore";
import { resolveAuthenticatedActor } from "./authActor";
import {
  getStripeClient,
} from "./stripeCore";

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

function clampCredits(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, roundCredits(value)));
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

function compareBillingCycle(
  left: { cycleStartedAt: number; cycleEndsAt: number },
  right: { cycleStartedAt: number; cycleEndsAt: number },
): number {
  if (left.cycleStartedAt !== right.cycleStartedAt) {
    return left.cycleStartedAt - right.cycleStartedAt;
  }
  return left.cycleEndsAt - right.cycleEndsAt;
}

const SYNTHETIC_BUILDER_CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeBuilderAccessTier(value: unknown): "free" | "builder" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "builder" || normalized === "architect" || normalized === "pro") {
    return "builder";
  }
  return "free";
}

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

function deriveSyntheticBuilderProvisioningWindow(args: {
  nowMs: number;
  startsAt: number;
  endsAt?: number;
}): { cycleStartedAt: number; cycleEndsAt: number } {
  const offsetPeriods = Math.max(
    0,
    Math.floor(Math.max(0, args.nowMs - args.startsAt) / SYNTHETIC_BUILDER_CYCLE_MS),
  );
  const cycleStartedAt = args.startsAt + offsetPeriods * SYNTHETIC_BUILDER_CYCLE_MS;
  const nominalCycleEndsAt = cycleStartedAt + SYNTHETIC_BUILDER_CYCLE_MS;
  const cycleEndsAt =
    typeof args.endsAt === "number"
      ? Math.min(args.endsAt, nominalCycleEndsAt)
      : nominalCycleEndsAt;
  return { cycleStartedAt, cycleEndsAt };
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

export const getWorkspaceCreditBalance = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    return await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", actor.dbUserId))
      .first();
  },
});

export const getActiveBuilderCreditProvisioningWindowInternal = internalQuery({
  args: {
    userId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const entitlements = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const activeBuilderEntitlement = entitlements
      .filter(
        (row) =>
          normalizeBuilderAccessTier(row.tier) === "builder" &&
          isActiveWindow(nowMs, row.startsAt, row.endsAt),
      )
      .sort((a, b) => b.startsAt - a.startsAt)[0];
    if (!activeBuilderEntitlement) return null;
    return deriveSyntheticBuilderProvisioningWindow({
      nowMs,
      startsAt: activeBuilderEntitlement.startsAt,
      endsAt: activeBuilderEntitlement.endsAt,
    });
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
          : existing?.includedCreditsBalance ?? BUILDER_INCLUDED_WORKSPACE_CREDITS,
      purchasedCreditsBalance:
        typeof args.purchasedCreditsBalance === "number"
          ? roundCredits(args.purchasedCreditsBalance)
          : existing?.purchasedCreditsBalance ?? 0,
      includedCycleCredits:
        typeof args.includedCycleCredits === "number"
          ? roundCredits(args.includedCycleCredits)
          : existing?.includedCycleCredits ?? BUILDER_INCLUDED_WORKSPACE_CREDITS,
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
      providerPriceId: args.providerPriceId,
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
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      providerCustomerId: String(args.providerCustomerId ?? "").trim() || undefined,
      providerPriceId: String(args.providerPriceId ?? "").trim() || row.providerPriceId,
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

export const syncBuilderMonthlyCreditsInternal = internalMutation({
  args: {
    userId: v.id("users"),
    targetTier: v.union(v.literal("builder"), v.literal("architect")),
    grantsAccess: v.boolean(),
    cycleStartedAt: v.number(),
    cycleEndsAt: v.number(),
    includedCycleCredits: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existing = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!args.grantsAccess) {
      return existing ?? null;
    }

    const includedCycleCredits = roundCredits(
      typeof args.includedCycleCredits === "number"
        ? args.includedCycleCredits
        : BUILDER_INCLUDED_WORKSPACE_CREDITS,
    );
    const isSameCycle =
      !!existing &&
      existing.includedCycleStartedAt === args.cycleStartedAt &&
      existing.includedCycleEndsAt === args.cycleEndsAt;
    if (isSameCycle) {
      return existing;
    }
    const isOlderCycle =
      !!existing &&
      compareBillingCycle(
        {
          cycleStartedAt: args.cycleStartedAt,
          cycleEndsAt: args.cycleEndsAt,
        },
        {
          cycleStartedAt: existing.includedCycleStartedAt,
          cycleEndsAt: existing.includedCycleEndsAt,
        },
      ) < 0;
    if (isOlderCycle) {
      return existing;
    }

    const patch = {
      includedCreditsBalance: includedCycleCredits,
      purchasedCreditsBalance: existing?.purchasedCreditsBalance ?? 0,
      includedCycleCredits,
      includedCycleStartedAt: args.cycleStartedAt,
      includedCycleEndsAt: args.cycleEndsAt,
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

export const completeWorkspaceCreditTopupCheckoutSessionInternal = internalMutation({
  args: {
    localSessionId: v.string(),
    providerCheckoutSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    workspaceCreditsAmount: v.optional(v.number()),
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
    if (typeof row.workspaceCreditsGrantedAt === "number") {
      return {
        ok: true,
        alreadyGranted: true,
        ownerUserId,
        grantedCredits: row.workspaceCreditsAmount ?? 0,
      };
    }

    const grantedCredits = roundCredits(
      typeof args.workspaceCreditsAmount === "number"
        ? args.workspaceCreditsAmount
        : row.workspaceCreditsAmount ?? WORKSPACE_CREDIT_TOPUP_CREDITS,
    );
    if (!(grantedCredits > 0)) {
      throw new Error("workspace_credit_topup_amount_invalid");
    }

    const existingBalance = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", ownerUserId))
      .first();

    if (!existingBalance) {
      await ctx.db.insert("workspaceCreditBalances", {
        userId: ownerUserId,
        includedCreditsBalance: 0,
        purchasedCreditsBalance: grantedCredits,
        includedCycleCredits: 0,
        includedCycleStartedAt: nowMs,
        includedCycleEndsAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.patch(existingBalance._id, {
        purchasedCreditsBalance: roundCredits(
          existingBalance.purchasedCreditsBalance + grantedCredits,
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
      providerPriceId: String(args.providerPriceId ?? "").trim() || row.providerPriceId,
      workspaceCreditsAmount: grantedCredits,
      workspaceCreditsGrantedAt: nowMs,
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
              includedCycleCredits: 0,
              includedCycleStartedAt: nowMs,
              includedCycleEndsAt: nowMs,
              createdAt: nowMs,
              updatedAt: nowMs,
            });
          }
        }
        await ctx.db.patch(reservation._id, {
          status: "succeeded",
          creditsSettled: roundCredits(split.includedSettled + split.purchasedSettled),
          includedCreditsRefunded: split.includedRefunded,
          purchasedCreditsRefunded: split.purchasedRefunded,
          settledAt: nowMs,
          updatedAt: nowMs,
        });
        debitIncluded = split.includedSettled;
        debitPurchased = split.purchasedSettled;
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
      const balance = await ctx.db
        .query("workspaceCreditBalances")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .first();
      if (balance) {
        debitIncluded = Math.min(balance.includedCreditsBalance, requestedCredits);
        debitPurchased = Math.min(
          balance.purchasedCreditsBalance,
          Math.max(0, requestedCredits - debitIncluded),
        );
        await ctx.db.patch(balance._id, {
          includedCreditsBalance: roundCredits(balance.includedCreditsBalance - debitIncluded),
          purchasedCreditsBalance: roundCredits(balance.purchasedCreditsBalance - debitPurchased),
          updatedAt: nowMs,
        });
      }
    }

    const debitedCredits = roundCredits(debitIncluded + debitPurchased);
    const debitSource =
      debitIncluded > 0 && debitPurchased > 0
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

    const creditsSettled =
      args.status === "refunded"
        ? 0
        : typeof args.creditsSettled === "number"
          ? clampCredits(args.creditsSettled, 0, entry.creditsReserved)
          : roundCredits(entry.creditsReserved);
    const split = splitSettledCredits({
      includedDebited: entry.includedCreditsDebited,
      purchasedDebited: entry.purchasedCreditsDebited,
      creditsSettled,
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
          includedCycleCredits: 0,
          includedCycleStartedAt: nowMs,
          includedCycleEndsAt: nowMs,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    }

    await ctx.db.patch(entry._id, {
      status: args.status,
      creditsSettled,
      includedCreditsRefunded: refund.includedRefunded,
      purchasedCreditsRefunded: refund.purchasedRefunded,
      failureReason: normalizeOptionalString(args.failureReason),
      settledAt: nowMs,
      updatedAt: nowMs,
    });
    return await ctx.db.get(entry._id);
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
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
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

    const sessionId = newOpaqueToken("credits");
    const pack = resolveWorkspaceToolBalanceTopupPack(args.packId);
    if (!pack) throw new Error("workspace_tool_balance_pack_invalid");
    const providerPriceId = pack.id;
    const workspaceCreditsAmount = pack.credits;
    await ctx.runMutation(
      internal.workspaceCredits.createPendingWorkspaceCreditTopupCheckoutSessionInternal as any,
      {
        sessionId,
        ownerUserId: userId,
        providerPriceId,
        workspaceCreditsAmount,
        expiresAt: nowMs + 14 * 24 * 60 * 60 * 1000,
        nowMs,
      },
    );

    try {
      const stripe = getStripeClient();
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
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
                )} for Daytona workspaces, web research, and voice input.`,
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
          workspace_credits_amount: String(workspaceCreditsAmount),
        },
        ...(typeof actor?.email === "string" && actor.email.trim()
          ? { customer_email: actor.email.trim() }
          : {}),
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
          providerPriceId,
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
