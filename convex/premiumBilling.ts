import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  POLYNET_PREMIUM_MONTHLY_PRICE_BASE_UNITS,
} from "../shared/accountCommerce";
import {
  buildCheckoutSuccessUrl,
  newOpaqueToken,
  requireCanonicalCheckoutReturnUrl,
} from "./billingCore";
import { getStripeClient } from "./stripeCore";
import {
  attachStripeCustomerToUser,
  ensureStripeCustomerForUser,
} from "./stripeCustomers";

const PREMIUM_CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;
const PREMIUM_SUBSCRIPTION_GRANTING_STATUSES = new Set([
  "active",
  "trialing",
  "cancel_at_period_end",
]);

function readPremiumStripePriceId(): string {
  const value = String(
    (globalThis as any)?.process?.env?.POLYNET_PREMIUM_STRIPE_PRICE_ID ??
      (globalThis as any)?.process?.env?.ARX_PREMIUM_STRIPE_PRICE_ID ??
      "",
  ).trim();
  if (!value) throw new Error("premium_stripe_price_id_missing");
  return value;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function premiumSubscriptionGrantsAccess(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return PREMIUM_SUBSCRIPTION_GRANTING_STATUSES.has(normalized);
}

async function syncPremiumEntitlement(args: {
  ctx: any;
  userId: any;
  subscriptionStatus: string;
  currentPeriodEndAt?: number;
  cancelAtPeriodEnd?: boolean;
  nowMs: number;
}) {
  const grantsAccess = premiumSubscriptionGrantsAccess(args.subscriptionStatus);
  const existing = await args.ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
    .collect();
  for (const row of existing) {
    if (row.source !== "premium_subscription") continue;
    if (typeof row.endsAt === "number" && row.endsAt <= args.nowMs) continue;
    await args.ctx.db.patch(row._id, {
      endsAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
  if (!grantsAccess) return;
  await args.ctx.db.insert("userEntitlements", {
    userId: args.userId,
    tier: "architect",
    source: "premium_subscription",
    startsAt: args.nowMs,
    endsAt:
      args.cancelAtPeriodEnd === true && typeof args.currentPeriodEndAt === "number"
        ? args.currentPeriodEndAt
        : undefined,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

export const getPremiumSubscriptionCheckoutSessionInternal = internalQuery({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row || row.mode !== "premium_subscription") return null;
    return row;
  },
});

export const getPremiumSubscriptionCheckoutByProviderSubscriptionIdInternal = internalQuery({
  args: {
    providerSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
    if (!providerSubscriptionId) return null;
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_providerSubscriptionId", (q) =>
        q.eq("providerSubscriptionId", providerSubscriptionId),
      )
      .first();
    if (!row || row.mode !== "premium_subscription") return null;
    return row;
  },
});

export const createPendingPremiumSubscriptionCheckoutInternal = internalMutation({
  args: {
    sessionId: v.string(),
    ownerUserId: v.id("users"),
    expiresAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      mode: "premium_subscription",
      provider: "stripe",
      ownerUserId: args.ownerUserId,
      billingPeriod: "monthly",
      amountBaseUnits: POLYNET_PREMIUM_MONTHLY_PRICE_BASE_UNITS,
      currency: "usd",
      currencyDecimals: 2,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

export const attachPremiumSubscriptionStripeCheckoutSessionInternal = internalMutation({
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
    if (!row) throw new Error("premium_subscription_checkout_session_not_found");
    if (row.mode !== "premium_subscription") throw new Error("premium_subscription_checkout_session_invalid");
    if (!row.ownerUserId) throw new Error("premium_subscription_owner_missing");
    await attachStripeCustomerToUser({
      ctx,
      userId: row.ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      providerCustomerId: normalizeOptionalString(args.providerCustomerId),
      providerSubscriptionId:
        normalizeOptionalString(args.providerSubscriptionId) ??
        normalizeOptionalString(row.providerSubscriptionId),
      providerPriceId:
        normalizeOptionalString(args.providerPriceId) ??
        normalizeOptionalString(row.providerPriceId),
      updatedAt: nowMs,
    });
  },
});

export const completePremiumSubscriptionCheckoutSessionInternal = internalMutation({
  args: {
    localSessionId: v.string(),
    providerCheckoutSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.string(),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    subscriptionStatus: v.string(),
    currentPeriodStartAt: v.optional(v.union(v.number(), v.null())),
    currentPeriodEndAt: v.optional(v.union(v.number(), v.null())),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.localSessionId))
      .first();
    if (!row) throw new Error("premium_subscription_checkout_session_not_found");
    if (row.mode !== "premium_subscription") throw new Error("premium_subscription_checkout_session_invalid");
    if (!row.ownerUserId) throw new Error("premium_subscription_owner_missing");
    await attachStripeCustomerToUser({
      ctx,
      userId: row.ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
    if (!providerSubscriptionId) throw new Error("premium_subscription_id_missing");
    await syncPremiumEntitlement({
      ctx,
      userId: row.ownerUserId,
      subscriptionStatus: args.subscriptionStatus,
      currentPeriodEndAt:
        typeof args.currentPeriodEndAt === "number" ? args.currentPeriodEndAt : undefined,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      nowMs,
    });
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId:
        normalizeOptionalString(args.providerCheckoutSessionId) ??
        normalizeOptionalString(row.providerCheckoutSessionId),
      providerCustomerId:
        normalizeOptionalString(args.providerCustomerId) ??
        normalizeOptionalString(row.providerCustomerId),
      providerSubscriptionId,
      providerPriceId:
        normalizeOptionalString(args.providerPriceId) ??
        normalizeOptionalString(row.providerPriceId),
      currentPeriodStartAt:
        typeof args.currentPeriodStartAt === "number" ? args.currentPeriodStartAt : undefined,
      currentPeriodEndAt:
        typeof args.currentPeriodEndAt === "number" ? args.currentPeriodEndAt : undefined,
      communitySubscriptionStatus: args.subscriptionStatus as any,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd === true,
      status: "complete",
      updatedAt: nowMs,
    });
    return {
      ok: true,
      ownerUserId: row.ownerUserId,
      subscriptionStatus: args.subscriptionStatus,
    };
  },
});

export const syncPremiumSubscriptionFromStripeInternal = internalMutation({
  args: {
    localSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.string(),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    subscriptionStatus: v.string(),
    currentPeriodStartAt: v.optional(v.union(v.number(), v.null())),
    currentPeriodEndAt: v.optional(v.union(v.number(), v.null())),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const localSessionId = String(args.localSessionId ?? "").trim();
    const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
    if (!providerSubscriptionId) return { ok: true, ignored: true, reason: "premium_subscription_id_missing" };
    let row = localSessionId
      ? await ctx.db
          .query("checkoutSessions")
          .withIndex("by_sessionId", (q) => q.eq("sessionId", localSessionId))
          .first()
      : null;
    if (!row) {
      row = await ctx.db
        .query("checkoutSessions")
        .withIndex("by_providerSubscriptionId", (q) =>
          q.eq("providerSubscriptionId", providerSubscriptionId),
        )
        .first();
    }
    if (!row || row.mode !== "premium_subscription") {
      return { ok: true, ignored: true, reason: "premium_subscription_checkout_not_found" };
    }
    if (!row.ownerUserId) throw new Error("premium_subscription_owner_missing");
    await attachStripeCustomerToUser({
      ctx,
      userId: row.ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    await syncPremiumEntitlement({
      ctx,
      userId: row.ownerUserId,
      subscriptionStatus: args.subscriptionStatus,
      currentPeriodEndAt:
        typeof args.currentPeriodEndAt === "number" ? args.currentPeriodEndAt : undefined,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      nowMs,
    });
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCustomerId:
        normalizeOptionalString(args.providerCustomerId) ??
        normalizeOptionalString(row.providerCustomerId),
      providerSubscriptionId,
      providerPriceId:
        normalizeOptionalString(args.providerPriceId) ??
        normalizeOptionalString(row.providerPriceId),
      currentPeriodStartAt:
        typeof args.currentPeriodStartAt === "number" ? args.currentPeriodStartAt : undefined,
      currentPeriodEndAt:
        typeof args.currentPeriodEndAt === "number" ? args.currentPeriodEndAt : undefined,
      communitySubscriptionStatus: args.subscriptionStatus as any,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd === true,
      status: "complete",
      updatedAt: nowMs,
    });
    return {
      ok: true,
      ownerUserId: row.ownerUserId,
      subscriptionStatus: args.subscriptionStatus,
    };
  },
});

export const startPremiumSubscriptionCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const successUrl = requireCanonicalCheckoutReturnUrl(
      args.successUrl,
      "premium_subscription_success_url_invalid",
    );
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "premium_subscription_cancel_url_invalid",
    );
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject ?? null,
    })) as { dbUserId?: any; email?: string | null };
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("user_not_found");
    const providerCustomerId = await ensureStripeCustomerForUser({
      ctx,
      userId,
      email: actor.email ?? null,
      nowMs,
    });
    const sessionId = newOpaqueToken("premium");
    const expiresAt = nowMs + PREMIUM_CHECKOUT_TTL_MS;
    await ctx.runMutation(
      (internal as any).premiumBilling.createPendingPremiumSubscriptionCheckoutInternal,
      {
        sessionId,
        ownerUserId: userId,
        expiresAt,
        nowMs,
      },
    );
    try {
      const stripe = getStripeClient();
      const premiumPriceId = readPremiumStripePriceId();
      const checkoutSession: any = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: providerCustomerId,
        success_url: buildCheckoutSuccessUrl(successUrl, sessionId),
        cancel_url: cancelUrl,
        expires_at: Math.floor(expiresAt / 1000),
        client_reference_id: sessionId,
        line_items: [
          {
            price: premiumPriceId,
            quantity: 1,
          },
        ],
        metadata: {
          local_session_id: sessionId,
          checkout_mode: "premium_subscription",
          user_id: String(userId),
        },
        subscription_data: {
          metadata: {
            local_session_id: sessionId,
            checkout_mode: "premium_subscription",
            user_id: String(userId),
          },
        },
      });
      const checkoutUrl = String(checkoutSession.url ?? "").trim();
      if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
      await ctx.runMutation(
        (internal as any).premiumBilling.attachPremiumSubscriptionStripeCheckoutSessionInternal,
        {
          sessionId,
          providerCheckoutSessionId: checkoutSession.id,
          providerCustomerId:
            typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
          providerSubscriptionId:
            typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : null,
          providerPriceId: premiumPriceId,
          nowMs: Date.now(),
        },
      );
      return {
        ok: true,
        session_id: sessionId,
        checkout_url: checkoutUrl,
      };
    } catch (error) {
      throw error;
    }
  },
});
