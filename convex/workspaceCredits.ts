import { api, internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import {
  BUILDER_INCLUDED_WORKSPACE_CREDITS,
  convertUsdToWorkspaceCredits,
  estimateDaytonaWorkspaceComputeUsd,
  WORKSPACE_CREDIT_TOPUP_CREDITS,
} from "../shared/workspaceCredits";
import { newOpaqueToken } from "./billingCore";
import { resolveAuthenticatedActor } from "./authActor";
import {
  getStripeClient,
  readStripeWorkspaceCreditTopupPriceId,
} from "./stripeCore";

function roundCurrency(value: number): number {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

function roundCredits(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
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
    if (!args.grantsAccess || args.targetTier !== "builder") {
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
        : convertUsdToWorkspaceCredits(computeCostUsd),
    );

    const balance = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    let debitIncluded = 0;
    let debitPurchased = 0;
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
      debitSource,
      createdAt: nowMs,
    });
    return await ctx.db.get(id);
  },
});

export const startWorkspaceCreditTopupCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const successUrl = String(args.successUrl ?? "").trim();
    const cancelUrl = String(args.cancelUrl ?? "").trim();
    if (!successUrl) throw new Error("workspace_credit_topup_success_url_required");
    if (!cancelUrl) throw new Error("workspace_credit_topup_cancel_url_required");

    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject ?? null,
    })) as { dbUserId?: unknown; email?: string | null };
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("user_not_found");

    const canonicalTier = await ctx.runQuery(api.entitlements.getCanonicalTierByUserId as any, {
      userId,
    });
    if (canonicalTier !== "builder" && canonicalTier !== "architect") {
      throw new Error("plan_required");
    }

    const sessionId = newOpaqueToken("credits");
    const priceId = readStripeWorkspaceCreditTopupPriceId();
    const workspaceCreditsAmount = WORKSPACE_CREDIT_TOPUP_CREDITS;
    await ctx.runMutation(
      internal.workspaceCredits.createPendingWorkspaceCreditTopupCheckoutSessionInternal as any,
      {
        sessionId,
        ownerUserId: userId,
        providerPriceId: priceId,
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
            price: priceId,
            quantity: 1,
          },
        ],
        metadata: {
          local_session_id: sessionId,
          checkout_mode: "workspace_credit_topup",
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
          providerPriceId: priceId,
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
