import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  newOpaqueToken,
  normalizeBuilderTier,
} from "./billingCore";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { getStripeClient, readStripeBuilderPriceId } from "./stripeCore";
import { enqueueBuilderSubscriptionStateEmailInternal } from "./emailEvents";

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

function readEffectiveBuilderTier(rows: Array<{ tier: string }>): "free" | "builder" | "architect" {
  let rank = 0;
  for (const row of rows) {
    const tier = String(row.tier ?? "").trim().toLowerCase();
    if (tier === "architect" || tier === "pro") {
      rank = Math.max(rank, 2);
      continue;
    }
    if (tier === "builder") {
      rank = Math.max(rank, 1);
    }
  }
  if (rank >= 2) return "architect";
  if (rank >= 1) return "builder";
  return "free";
}

export const createPendingBuilderCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    ownerUserId: v.id("users"),
    targetTier: v.union(v.literal("builder"), v.literal("architect")),
    providerPriceId: v.optional(v.string()),
    expiresAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      mode: "builder_upgrade",
      provider: "stripe",
      providerPriceId: args.providerPriceId,
      targetTier: args.targetTier,
      ownerUserId: args.ownerUserId,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

export const attachBuilderStripeCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    providerCheckoutSessionId: v.string(),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) throw new Error("builder_checkout_session_not_found");
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      providerCustomerId: String(args.providerCustomerId ?? "").trim() || undefined,
      providerSubscriptionId: String(args.providerSubscriptionId ?? "").trim() || undefined,
      providerPriceId: String(args.providerPriceId ?? "").trim() || row.providerPriceId,
      updatedAt: nowMs,
    });
  },
});

export const expireBuilderCheckoutSessionInternal = internalMutation({
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
    if (!row) return;
    await ctx.db.patch(row._id, {
      status: "expired",
      updatedAt: nowMs,
    });
  },
});

export const syncBuilderStripeSubscriptionInternal = internalMutation({
  args: {
    localSessionId: v.string(),
    providerCheckoutSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    targetTier: v.optional(v.union(v.literal("builder"), v.literal("architect"), v.null())),
    subscriptionStatus: v.string(),
    grantsAccess: v.optional(v.union(v.boolean(), v.null())),
    currentPeriodStartAt: v.optional(v.union(v.number(), v.null())),
    currentPeriodEndAt: v.optional(v.union(v.number(), v.null())),
    markCheckoutComplete: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.localSessionId))
      .first();
    if (!row) throw new Error("builder_checkout_session_not_found");
    if (row.mode !== "builder_upgrade") throw new Error("builder_checkout_session_invalid");
    if (!row.ownerUserId) throw new Error("builder_checkout_owner_missing");

    const ownerUserId = row.ownerUserId;
    if (!ownerUserId) throw new Error("builder_checkout_owner_missing");

    const targetTier = normalizeBuilderTier(args.targetTier ?? row.targetTier ?? "builder");
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId: String(args.providerCheckoutSessionId ?? "").trim() || row.providerCheckoutSessionId,
      providerCustomerId: String(args.providerCustomerId ?? "").trim() || row.providerCustomerId,
      providerSubscriptionId: String(args.providerSubscriptionId ?? "").trim() || row.providerSubscriptionId,
      providerPriceId: String(args.providerPriceId ?? "").trim() || row.providerPriceId,
      currentPeriodStartAt:
        typeof args.currentPeriodStartAt === "number"
          ? args.currentPeriodStartAt
          : row.currentPeriodStartAt,
      currentPeriodEndAt:
        typeof args.currentPeriodEndAt === "number"
          ? args.currentPeriodEndAt
          : row.currentPeriodEndAt,
      targetTier,
      status: args.markCheckoutComplete ? "complete" : row.status,
      updatedAt: nowMs,
    });

    const entitlementRows = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", ownerUserId))
      .collect();
    const activeStripeRows = entitlementRows.filter(
      (entry) =>
        entry.source === "stripe" &&
        isActiveWindow(nowMs, entry.startsAt, entry.endsAt),
    );
    const previousTier = readEffectiveBuilderTier(activeStripeRows);

    if (args.grantsAccess === true) {
      let hasMatchingTier = false;
      for (const entitlement of activeStripeRows) {
        if (entitlement.tier === targetTier) {
          hasMatchingTier = true;
          continue;
        }
        await ctx.db.patch(entitlement._id, {
          endsAt: nowMs,
          updatedAt: nowMs,
        });
      }
      if (!hasMatchingTier) {
        await ctx.db.insert("userEntitlements", {
          userId: row.ownerUserId,
          tier: targetTier,
          source: "stripe",
          startsAt: nowMs,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    } else if (args.grantsAccess === false) {
      for (const entitlement of activeStripeRows) {
        await ctx.db.patch(entitlement._id, {
          endsAt: nowMs,
          updatedAt: nowMs,
        });
      }
    }
    const nextTier = args.grantsAccess === true ? targetTier : "free";
    if (args.grantsAccess === true || args.grantsAccess === false) {
      await enqueueBuilderSubscriptionStateEmailInternal({
        ctx,
        userId: ownerUserId,
        previousTier,
        nextTier,
        subscriptionStatus: args.subscriptionStatus,
        providerSubscriptionId: args.providerSubscriptionId ?? row.providerSubscriptionId,
        periodMarker: String(
          args.currentPeriodStartAt ??
            args.currentPeriodEndAt ??
            row.currentPeriodStartAt ??
            row.currentPeriodEndAt ??
            args.localSessionId,
        ),
        nowMs,
      });
    }

    return {
      ok: true,
      ownerUserId: String(row.ownerUserId),
      targetTier,
      subscriptionStatus: String(args.subscriptionStatus ?? "").trim().toLowerCase(),
    };
  },
});

export const getLatestBuilderBillingCycleForOwnerInternal = internalQuery({
  args: {
    ownerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_owner_status", (q) => q.eq("ownerUserId", args.ownerUserId).eq("status", "complete"))
      .collect();
    const candidate = rows
      .filter(
        (row) =>
          row.mode === "builder_upgrade" &&
          row.targetTier === "builder" &&
          typeof row.currentPeriodStartAt === "number" &&
          typeof row.currentPeriodEndAt === "number",
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!candidate) return null;
    return {
      ownerUserId: candidate.ownerUserId,
      currentPeriodStartAt: candidate.currentPeriodStartAt ?? null,
      currentPeriodEndAt: candidate.currentPeriodEndAt ?? null,
      providerSubscriptionId: candidate.providerSubscriptionId ?? null,
      providerPriceId: candidate.providerPriceId ?? null,
      updatedAt: candidate.updatedAt,
    };
  },
});

export const startBuilderCheckout = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    tier: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const targetTier = normalizeBuilderTier(args.tier);
    if (targetTier !== "builder") throw new Error("builder_checkout_architect_unavailable");
    const successUrl = String(args.successUrl ?? "").trim();
    const cancelUrl = String(args.cancelUrl ?? "").trim();
    if (!successUrl) throw new Error("checkout_success_url_required");
    if (!cancelUrl) throw new Error("checkout_cancel_url_required");
    const sessionId = newOpaqueToken("builder");
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject ?? null,
    })) as { dbUserId?: unknown; email?: string | null };
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("user_not_found");
    const priceId = readStripeBuilderPriceId();
    await ctx.runMutation(internal.builderCommerce.createPendingBuilderCheckoutSessionInternal as any, {
      sessionId,
      ownerUserId: userId,
      targetTier,
      providerPriceId: priceId,
      expiresAt: nowMs + 14 * 24 * 60 * 60 * 1000,
      nowMs,
    });

    try {
      const stripe = getStripeClient();
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "subscription",
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
          target_tier: targetTier,
        },
        subscription_data: {
          metadata: {
            local_session_id: sessionId,
            target_tier: targetTier,
          },
        },
        ...(typeof actor?.email === "string" && actor.email.trim()
          ? { customer_email: actor.email.trim() }
          : {}),
      });
      const checkoutUrl = String(checkoutSession.url ?? "").trim();
      if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
      await ctx.runMutation(internal.builderCommerce.attachBuilderStripeCheckoutSessionInternal as any, {
        sessionId,
        providerCheckoutSessionId: checkoutSession.id,
        providerCustomerId:
          typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
        providerSubscriptionId:
          typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : null,
        providerPriceId: priceId,
        nowMs: Date.now(),
      });
      return {
        checkout_url: checkoutUrl,
      };
    } catch (error) {
      await ctx.runMutation(internal.builderCommerce.expireBuilderCheckoutSessionInternal as any, {
        sessionId,
        nowMs: Date.now(),
      });
      throw error;
    }

  },
});

export const openBuilderBillingPortal = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    returnUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    void args.returnUrl;
    throw new Error("builder_billing_portal_unavailable");
  },
});

export const startConnectOnboarding = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    returnUrl: v.string(),
    refreshUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    void args.returnUrl;
    void args.refreshUrl;
    throw new Error("builder_payout_onboarding_unavailable");
  },
});
