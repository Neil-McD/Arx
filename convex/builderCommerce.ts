import Stripe from "stripe";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  newOpaqueToken,
  normalizeBuilderTier,
} from "./billingCore";
import { getStripeClient, readStripeBuilderPriceId } from "./stripeCore";
import { enqueueBuilderSubscriptionStateEmailInternal } from "./emailEvents";
import { buildCommunityTabPath, buildSettingsPath } from "../shared/webAppRouteState";
import {
  buildStripeConnectAccountSnapshot,
  normalizeOptionalStripeConnectString,
  normalizeStripeConnectRequirementList,
} from "./stripeConnectAccountCore";

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

function readEffectiveBuilderTier(rows: Array<{ tier: string }>): "free" | "builder" {
  let hasBuilder = false;
  for (const row of rows) {
    const tier = String(row.tier ?? "").trim().toLowerCase();
    if (tier === "builder" || tier === "architect" || tier === "pro") hasBuilder = true;
  }
  if (hasBuilder) return "builder";
  return "free";
}

const PUBLIC_APP_URL_ENV_KEYS = [
  "ARX_PUBLIC_APP_URL",
  "PUBLIC_APP_URL",
  "VITE_PUBLIC_APP_URL",
  "VITE_APP_URL",
] as const;

const BUILDER_BILLING_CONTEXT_VALIDATOR = v.union(
  v.literal("builder"),
  v.literal("create_community"),
);

const BUILDER_CONNECT_CONTEXT_VALIDATOR = v.union(
  v.literal("account"),
  v.literal("community"),
);

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function readCanonicalPublicAppOrigin(): string {
  for (const key of PUBLIC_APP_URL_ENV_KEYS) {
    const value = readEnv(key).replace(/\/+$/, "");
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed fallback envs; fail below if none are usable.
    }
  }
  throw new Error("public_app_url_missing");
}

function buildBuilderBillingRedirectUrls(args: {
  context: "builder" | "create_community";
}): { successUrl: string; cancelUrl: string; returnUrl: string } {
  const origin = readCanonicalPublicAppOrigin();
  const encodedContext = encodeURIComponent(args.context);
  return {
    successUrl: `${origin}/?billing=success&billing_source=web&billing_context=${encodedContext}`,
    cancelUrl: `${origin}/?billing=cancel&billing_source=web&billing_context=${encodedContext}`,
    returnUrl: `${origin}/?billing=return&billing_source=web&billing_context=${encodedContext}`,
  };
}

function buildStripeConnectRedirectUrls(args: {
  context: "account" | "community";
  communitySlug?: string | null;
}): { refreshUrl: string; returnUrl: string } {
  const origin = readCanonicalPublicAppOrigin();
  const fallbackPath = buildSettingsPath("account");
  const communitySettingsPath =
    args.context === "community"
      ? buildCommunityTabPath(args.communitySlug ?? null, "settings")
      : null;
  const path = communitySettingsPath ?? fallbackPath;
  return {
    refreshUrl: `${origin}${path}`,
    returnUrl: `${origin}${path}`,
  };
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

export const getLatestBuilderBillingCustomerForOwnerInternal = internalQuery({
  args: {
    ownerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_owner_status", (q) => q.eq("ownerUserId", args.ownerUserId).eq("status", "complete"))
      .collect();
    const candidate = rows
      .filter((row) => {
        const providerCustomerId = String(row.providerCustomerId ?? "").trim();
        return row.mode === "builder_upgrade" && row.provider === "stripe" && Boolean(providerCustomerId);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!candidate) return null;
    return {
      ownerUserId: candidate.ownerUserId,
      providerCustomerId: candidate.providerCustomerId ?? null,
      providerSubscriptionId: candidate.providerSubscriptionId ?? null,
      providerPriceId: candidate.providerPriceId ?? null,
      targetTier: candidate.targetTier ?? null,
      updatedAt: candidate.updatedAt,
    };
  },
});

export const getUserStripeConnectAccountInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userStripeConnectAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row) return null;
    return {
      userId: row.userId,
      stripeAccountId: row.stripeAccountId,
      accountType: row.accountType,
      status: row.status,
      detailsSubmitted: row.detailsSubmitted,
      chargesEnabled: row.chargesEnabled,
      payoutsEnabled: row.payoutsEnabled,
      requirementsCurrentlyDue: row.requirementsCurrentlyDue ?? [],
      requirementsEventuallyDue: row.requirementsEventuallyDue ?? [],
      requirementsDisabledReason: row.requirementsDisabledReason ?? null,
      onboardingCompleteAt: row.onboardingCompleteAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

export const getUserStripeConnectAccountByStripeAccountIdInternal = internalQuery({
  args: {
    stripeAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    const stripeAccountId = String(args.stripeAccountId ?? "").trim();
    if (!stripeAccountId) return null;
    const row = await ctx.db
      .query("userStripeConnectAccounts")
      .withIndex("by_stripeAccountId", (q) => q.eq("stripeAccountId", stripeAccountId))
      .first();
    if (!row) return null;
    return {
      userId: row.userId,
      stripeAccountId: row.stripeAccountId,
      status: row.status,
      chargesEnabled: row.chargesEnabled,
      payoutsEnabled: row.payoutsEnabled,
      requirementsDisabledReason: row.requirementsDisabledReason ?? null,
    };
  },
});

export const syncUserStripeConnectAccountInternal = internalMutation({
  args: {
    userId: v.id("users"),
    stripeAccountId: v.string(),
    accountType: v.optional(v.literal("express")),
    status: v.union(
      v.literal("onboarding_required"),
      v.literal("pending_requirements"),
      v.literal("ready"),
      v.literal("restricted"),
    ),
    detailsSubmitted: v.boolean(),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
    requirementsCurrentlyDue: v.array(v.string()),
    requirementsEventuallyDue: v.array(v.string()),
    requirementsDisabledReason: v.optional(v.union(v.string(), v.null())),
    onboardingCompleteAt: v.optional(v.union(v.number(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existingByUser = await ctx.db
      .query("userStripeConnectAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const existingByAccount =
      existingByUser && String(existingByUser.stripeAccountId) === String(args.stripeAccountId)
        ? existingByUser
        : await ctx.db
            .query("userStripeConnectAccounts")
            .withIndex("by_stripeAccountId", (q) => q.eq("stripeAccountId", args.stripeAccountId))
            .first();
    const existing = existingByUser ?? existingByAccount ?? null;
    const patch = {
      userId: args.userId,
      stripeAccountId: String(args.stripeAccountId ?? "").trim(),
      accountType: args.accountType ?? "express",
      status: args.status,
      detailsSubmitted: args.detailsSubmitted === true,
      chargesEnabled: args.chargesEnabled === true,
      payoutsEnabled: args.payoutsEnabled === true,
      requirementsCurrentlyDue: normalizeStripeConnectRequirementList(args.requirementsCurrentlyDue),
      requirementsEventuallyDue: normalizeStripeConnectRequirementList(args.requirementsEventuallyDue),
      requirementsDisabledReason:
        normalizeOptionalStripeConnectString(args.requirementsDisabledReason) ?? undefined,
      onboardingCompleteAt:
        typeof args.onboardingCompleteAt === "number" && Number.isFinite(args.onboardingCompleteAt)
          ? args.onboardingCompleteAt
          : existing?.onboardingCompleteAt,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return {
        userId: String(args.userId),
        stripeAccountId: patch.stripeAccountId,
        status: patch.status,
      };
    }
    await ctx.db.insert("userStripeConnectAccounts", {
      ...patch,
      createdAt: nowMs,
    });
    return {
      userId: String(args.userId),
      stripeAccountId: patch.stripeAccountId,
      status: patch.status,
    };
  },
});

export const startBuilderCheckout = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    tier: v.string(),
    context: BUILDER_BILLING_CONTEXT_VALIDATOR,
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const targetTier = normalizeBuilderTier(args.tier);
    const { successUrl, cancelUrl } = buildBuilderBillingRedirectUrls({
      context: args.context,
    });
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

export const openBuilderBillingPortal = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    context: BUILDER_BILLING_CONTEXT_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const { returnUrl } = buildBuilderBillingRedirectUrls({
      context: args.context,
    });
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject ?? null,
    })) as { dbUserId?: unknown };
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("user_not_found");
    if (args.userId && String(args.userId) !== String(userId)) {
      throw new Error("user_id_mismatch");
    }
    const customer = (await ctx.runQuery(
      internal.builderCommerce.getLatestBuilderBillingCustomerForOwnerInternal as any,
      { ownerUserId: userId },
    )) as { providerCustomerId?: unknown } | null;
    const providerCustomerId = String(customer?.providerCustomerId ?? "").trim();
    if (!providerCustomerId) {
      return {
        url: null,
        unavailable_code: "builder_billing_customer_missing" as const,
      };
    }

    try {
      const stripe = getStripeClient();
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: providerCustomerId,
        return_url: returnUrl,
      });
      const portalUrl = String(portalSession.url ?? "").trim();
      if (!portalUrl) throw new Error("builder_billing_portal_url_missing");
      return { url: portalUrl };
    } catch (error) {
      console.error("builder_billing_portal_unavailable", error);
      throw new Error("builder_billing_portal_unavailable");
    }
  },
});

export const startConnectOnboarding = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    context: BUILDER_CONNECT_CONTEXT_VALIDATOR,
    communitySlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject ?? null,
    })) as { dbUserId?: unknown; email?: string | null };
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("user_not_found");
    if (args.userId && String(args.userId) !== String(userId)) {
      throw new Error("user_id_mismatch");
    }
    const builderAccess = (await ctx.runQuery(
      internal.auth.getBuilderCommerceAccessForUserInternal as any,
      { userId, nowMs: Date.now() },
    )) as { builder_tier?: unknown; has_payouts?: unknown } | null;
    const hasBuilderPayoutAccess =
      String(builderAccess?.builder_tier ?? "").trim().toLowerCase() === "builder" &&
      builderAccess?.has_payouts === true;
    if (!hasBuilderPayoutAccess) {
      throw new Error("builder_connect_builder_required");
    }

    const existing = (await ctx.runQuery(
      internal.builderCommerce.getUserStripeConnectAccountInternal as any,
      { userId },
    )) as {
      stripeAccountId?: string | null;
    } | null;
    const stripe = getStripeClient();
    let account: Stripe.Account;
    const existingAccountId = normalizeOptionalStripeConnectString(existing?.stripeAccountId);
    if (existingAccountId) {
      account = await stripe.accounts.retrieve(existingAccountId);
    } else {
      account = await stripe.accounts.create({
        type: "express",
        email: normalizeOptionalStripeConnectString(actor?.email, 200) ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          user_id: String(userId),
        },
      });
    }

    const nowMs = Date.now();
    const snapshot = buildStripeConnectAccountSnapshot(account, { readyAtMs: nowMs });
    await ctx.runMutation(internal.builderCommerce.syncUserStripeConnectAccountInternal as any, {
      userId,
      stripeAccountId: snapshot.stripeAccountId,
      accountType: snapshot.accountType,
      status: snapshot.status,
      detailsSubmitted: snapshot.detailsSubmitted,
      chargesEnabled: snapshot.chargesEnabled,
      payoutsEnabled: snapshot.payoutsEnabled,
      requirementsCurrentlyDue: snapshot.requirementsCurrentlyDue,
      requirementsEventuallyDue: snapshot.requirementsEventuallyDue,
      requirementsDisabledReason: snapshot.requirementsDisabledReason,
      onboardingCompleteAt: snapshot.status === "ready" ? nowMs : null,
      nowMs,
    });

    const { returnUrl, refreshUrl } = buildStripeConnectRedirectUrls({
      context: args.context,
      communitySlug: args.communitySlug ?? null,
    });
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    const url = String(accountLink.url ?? "").trim();
    if (!url) throw new Error("builder_payout_onboarding_url_missing");
    return { url };
  },
});
