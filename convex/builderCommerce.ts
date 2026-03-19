import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  newOpaqueToken,
  normalizeBuilderTier,
  resolveUserIdForAuthenticatedRequest,
} from "./billingCore";

export const startBuilderCheckout = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    tier: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const targetTier = normalizeBuilderTier(args.tier);
    const successUrl = String(args.successUrl ?? "").trim();
    const cancelUrl = String(args.cancelUrl ?? "").trim();
    if (!successUrl) throw new Error("checkout_success_url_required");
    if (!cancelUrl) throw new Error("checkout_cancel_url_required");

    await ctx.db.insert("userEntitlements", {
      userId,
      tier: targetTier,
      source: "manual_grant",
      startsAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const sessionId = newOpaqueToken("builder");
    await ctx.db.insert("checkoutSessions", {
      sessionId,
      mode: "builder_upgrade",
      targetTier,
      ownerUserId: userId,
      status: "complete",
      expiresAt: nowMs + 14 * 24 * 60 * 60 * 1000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    return {
      checkout_url: successUrl,
    };
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
