import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

function buildCollectionKey(args: {
  userId: unknown;
  balanceUpdatedAt: number;
  uncollectedCredits: number;
}) {
  return `workspace_usage:${String(args.userId)}:${Math.floor(args.balanceUpdatedAt)}:${Math.floor(args.uncollectedCredits)}`;
}

export const createWorkspaceUsageCardBillingSmokeRowsInternal = internalMutation({
  args: {
    authSubject: v.string(),
    email: v.string(),
    providerCustomerId: v.string(),
    providerDefaultPaymentMethodId: v.string(),
    uncollectedCredits: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", args.authSubject))
      .first();
    if (existing) {
      throw new Error("workspace_usage_card_billing_smoke_user_exists");
    }

    const userId = await ctx.db.insert("users", {
      authSubject: args.authSubject,
      email: args.email,
      normalizedEmail: args.email.toLowerCase(),
      displayName: "Workspace usage billing smoke",
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });

    const balanceUpdatedAt = args.nowMs;
    const balanceId = await ctx.db.insert("workspaceCreditBalances", {
      userId,
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 0,
      uncollectedCreditsBalance: args.uncollectedCredits,
      pendingCardCollectionCreditsBalance: 0,
      includedCycleCredits: 0,
      includedCycleStartedAt: args.nowMs,
      includedCycleEndsAt: args.nowMs,
      createdAt: args.nowMs,
      updatedAt: balanceUpdatedAt,
    });

    const stripeCustomerId = await ctx.db.insert("userStripeCustomers", {
      userId,
      provider: "stripe",
      providerCustomerId: args.providerCustomerId,
      paymentMethodStatus: "active",
      providerDefaultPaymentMethodId: args.providerDefaultPaymentMethodId,
      paymentMethodCheckedAt: args.nowMs,
      cardBrand: "visa",
      cardLast4: "4242",
      cardExpMonth: 12,
      cardExpYear: 2035,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });

    return {
      userId,
      balanceId,
      stripeCustomerId,
      balanceUpdatedAt,
      collectionKey: buildCollectionKey({
        userId,
        balanceUpdatedAt,
        uncollectedCredits: args.uncollectedCredits,
      }),
    };
  },
});

export const readWorkspaceUsageCardBillingSmokeRowsInternal = internalQuery({
  args: {
    userId: v.id("users"),
    collectionKey: v.string(),
  },
  handler: async (ctx, args) => {
    const balance = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const collection = await ctx.db
      .query("workspaceUsageCollections")
      .withIndex("by_collectionKey", (q) => q.eq("collectionKey", args.collectionKey))
      .first();
    return {
      balance: balance
        ? {
            includedCreditsBalance: balance.includedCreditsBalance,
            purchasedCreditsBalance: balance.purchasedCreditsBalance,
            uncollectedCreditsBalance: balance.uncollectedCreditsBalance ?? 0,
            pendingCardCollectionCreditsBalance:
              balance.pendingCardCollectionCreditsBalance ?? 0,
            updatedAt: balance.updatedAt,
          }
        : null,
      collection: collection
        ? {
            status: collection.status,
            creditsAmount: collection.creditsAmount,
            provider: collection.provider ?? null,
            providerPaymentIntentId: collection.providerPaymentIntentId ?? null,
            failureReason: collection.failureReason ?? null,
            completedAt: collection.completedAt ?? null,
          }
        : null,
    };
  },
});

export const cleanupWorkspaceUsageCardBillingSmokeRowsInternal = internalMutation({
  args: {
    authSubject: v.string(),
    collectionKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const deleted = {
      collections: 0,
      balances: 0,
      stripeCustomers: 0,
      users: 0,
    };
    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", args.authSubject))
      .first();
    if (!user) return deleted;

    if (args.collectionKey) {
      const collection = await ctx.db
        .query("workspaceUsageCollections")
        .withIndex("by_collectionKey", (q) => q.eq("collectionKey", args.collectionKey ?? ""))
        .first();
      if (collection && String(collection.userId) === String(user._id)) {
        await ctx.db.delete(collection._id);
        deleted.collections += 1;
      }
    }

    const collections = await ctx.db
      .query("workspaceUsageCollections")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", user._id))
      .take(25);
    for (const collection of collections) {
      await ctx.db.delete(collection._id);
      deleted.collections += 1;
    }

    const balances = await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(25);
    for (const balance of balances) {
      await ctx.db.delete(balance._id);
      deleted.balances += 1;
    }

    const stripeCustomers = await ctx.db
      .query("userStripeCustomers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(25);
    for (const stripeCustomer of stripeCustomers) {
      await ctx.db.delete(stripeCustomer._id);
      deleted.stripeCustomers += 1;
    }

    await ctx.db.delete(user._id);
    deleted.users += 1;
    return deleted;
  },
});
