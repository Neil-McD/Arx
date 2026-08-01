import { api, internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import {
  POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
  founderSubscriptionStatusGrantsAccess,
  type FounderSubscriptionStatus,
} from "../shared/founderPlan";
import {
  buildCheckoutSuccessUrl,
  newOpaqueToken,
  normalizeStripeCommunitySubscriptionStatus,
  requireCanonicalCheckoutReturnUrl,
} from "./billingCore";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";
import {
  getFounderSubscriptionByProviderSubscriptionId,
  syncFounderUsageCycle,
  type FounderSubscriptionRow,
} from "./founderPlanCore";
import {
  readFounderInferencePricingFromEnv,
  requireFounderInferencePricingFromEnv,
} from "./founderPlanPricing";
import { getStripeClient } from "./stripeCore";
import {
  attachStripeCustomerToUser,
  ensureStripeCustomerForUser,
} from "./stripeCustomers";

const FOUNDER_CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;

function readFounderStripePriceIdOptional(): string {
  return String(
    (globalThis as any)?.process?.env?.POLYNET_FOUNDER_STRIPE_PRICE_ID ?? "",
  ).trim();
}

function readFounderStripePriceId(): string {
  const value = readFounderStripePriceIdOptional();
  if (!value) throw new Error("founder_stripe_price_id_missing");
  return value;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeFounderSubscriptionStatus(value: unknown): FounderSubscriptionStatus {
  return normalizeStripeCommunitySubscriptionStatus({
    subscriptionStatus: value,
    cancelAtPeriodEnd: value === "cancel_at_period_end",
  });
}

async function verifyFounderStripePrice(): Promise<string> {
  const providerPriceId = readFounderStripePriceId();
  const price: any = await getStripeClient().prices.retrieve(providerPriceId);
  if (
    price?.active !== true ||
    Number(price?.unit_amount ?? 0) !== POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS ||
    String(price?.currency ?? "").trim().toLowerCase() !== "usd" ||
    String(price?.recurring?.interval ?? "").trim().toLowerCase() !== "month" ||
    Number(price?.recurring?.interval_count ?? 1) !== 1
  ) {
    throw new Error("founder_stripe_price_contract_invalid");
  }
  return providerPriceId;
}

export const getFounderSubscriptionCheckoutSessionInternal = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    return row?.mode === "founder_subscription" ? row : null;
  },
});

export const getFounderSubscriptionByProviderSubscriptionIdInternal = internalQuery({
  args: { providerSubscriptionId: v.string() },
  handler: async (ctx, args) =>
    await getFounderSubscriptionByProviderSubscriptionId(
      ctx,
      args.providerSubscriptionId,
    ),
});

export const createPendingFounderSubscriptionCheckoutInternal = internalMutation({
  args: {
    sessionId: v.string(),
    ownerUserId: v.id("users"),
    expiresAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("status", "pending"),
      )
      .collect();
    if (existing.some((row) => row.mode === "founder_subscription" && row.expiresAt > args.nowMs)) {
      throw new Error("founder_subscription_checkout_already_pending");
    }
    await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      mode: "founder_subscription",
      provider: "stripe",
      ownerUserId: args.ownerUserId,
      billingPeriod: "monthly",
      amountBaseUnits: POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
      currency: "usd",
      currencyDecimals: 2,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  },
});

export const attachFounderStripeCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    providerCheckoutSessionId: v.string(),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    providerPriceId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row || row.mode !== "founder_subscription" || !row.ownerUserId) {
      throw new Error("founder_subscription_checkout_invalid");
    }
    if (args.providerPriceId !== readFounderStripePriceId()) {
      throw new Error("founder_subscription_price_mismatch");
    }
    await attachStripeCustomerToUser({
      ctx,
      userId: row.ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs: args.nowMs,
    });
    await ctx.db.patch(row._id, {
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      providerCustomerId: normalizeOptionalString(args.providerCustomerId),
      providerSubscriptionId: normalizeOptionalString(args.providerSubscriptionId),
      providerPriceId: args.providerPriceId,
      updatedAt: args.nowMs,
    });
  },
});

async function syncFounderSubscription(args: {
  ctx: any;
  localSessionId?: string | null;
  providerCheckoutSessionId?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId: string;
  providerPriceId?: string | null;
  subscriptionStatus: string;
  currentPeriodStartAt?: number | null;
  currentPeriodEndAt?: number | null;
  cancelAtPeriodEnd?: boolean;
  providerEventCreatedAt: number;
}) {
  const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
  const providerCustomerId = String(args.providerCustomerId ?? "").trim();
  const providerPriceId = String(args.providerPriceId ?? "").trim();
  if (!providerSubscriptionId) {
    return { ok: true, ignored: true, reason: "founder_subscription_id_missing" };
  }
  let checkout = args.localSessionId
    ? await args.ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.localSessionId))
        .first()
    : null;
  if (checkout?.mode !== "founder_subscription") checkout = null;
  const existing = await getFounderSubscriptionByProviderSubscriptionId(
    args.ctx,
    providerSubscriptionId,
  );
  const expectedPriceId = String(
    existing?.providerPriceId ??
    checkout?.providerPriceId ??
    readFounderStripePriceIdOptional(),
  ).trim();
  if (!expectedPriceId) {
    return { ok: true, ignored: true, reason: "founder_subscription_price_not_configured" };
  }
  if (providerPriceId !== expectedPriceId) {
    if (!existing) {
      return { ok: true, ignored: true, reason: "founder_subscription_price_not_managed" };
    }
    if (args.providerEventCreatedAt < existing.lastProviderEventCreatedAt) {
      return { ok: true, ignored: true, reason: "founder_subscription_event_stale" };
    }
    await args.ctx.db.patch(existing._id, {
      status: "ended",
      endedAt: args.providerEventCreatedAt,
      revokedReason: "founder_subscription_price_changed",
      lastProviderEventCreatedAt: args.providerEventCreatedAt,
      updatedAt: args.providerEventCreatedAt,
    });
    return {
      ok: true,
      ignored: false,
      founderSubscriptionId: existing._id,
      subscriptionStatus: "ended",
      revokedReason: "founder_subscription_price_changed",
    };
  }
  if (!checkout && !existing) {
    return { ok: true, ignored: true, reason: "founder_subscription_not_local" };
  }
  const ownerUserId = existing?.ownerUserId ?? checkout?.ownerUserId;
  if (!ownerUserId) throw new Error("founder_subscription_owner_missing");
  if (existing && checkout?.ownerUserId && String(existing.ownerUserId) !== String(checkout.ownerUserId)) {
    throw new Error("founder_subscription_owner_mismatch");
  }
  if (
    checkout?.providerCustomerId &&
    String(checkout.providerCustomerId) !== providerCustomerId
  ) {
    throw new Error("founder_subscription_customer_mismatch");
  }
  if (
    checkout?.providerSubscriptionId &&
    String(checkout.providerSubscriptionId) !== providerSubscriptionId
  ) {
    throw new Error("founder_subscription_identity_mismatch");
  }
  if (
    existing?.providerCustomerId &&
    String(existing.providerCustomerId) !== providerCustomerId
  ) {
    throw new Error("founder_subscription_customer_mismatch");
  }
  if (existing && args.providerEventCreatedAt < existing.lastProviderEventCreatedAt) {
    return { ok: true, ignored: true, reason: "founder_subscription_event_stale" };
  }
  const cycleStartAt = Math.floor(Number(args.currentPeriodStartAt ?? 0));
  const cycleEndAt = Math.floor(Number(args.currentPeriodEndAt ?? 0));
  if (!(cycleStartAt > 0) || !(cycleEndAt > cycleStartAt)) {
    throw new Error("founder_subscription_cycle_invalid");
  }
  if (!providerCustomerId) throw new Error("founder_subscription_customer_missing");
  const status = normalizeFounderSubscriptionStatus(args.subscriptionStatus);
  const endedAt = status === "canceled" || status === "ended"
    ? args.providerEventCreatedAt
    : undefined;
  const revokedReason = endedAt ? "provider_subscription_ended" : undefined;
  await attachStripeCustomerToUser({
    ctx: args.ctx,
    userId: ownerUserId,
    providerCustomerId,
    nowMs: args.providerEventCreatedAt,
  });
  let subscription: FounderSubscriptionRow;
  if (existing) {
    await args.ctx.db.patch(existing._id as any, {
      providerCustomerId,
      providerPriceId,
      status,
      currentPeriodStartAt: cycleStartAt,
      currentPeriodEndAt: cycleEndAt,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd === true,
      endedAt,
      revokedReason,
      lastProviderEventCreatedAt: args.providerEventCreatedAt,
      updatedAt: args.providerEventCreatedAt,
    });
    subscription = {
      ...existing,
      providerCustomerId,
      providerPriceId,
      status,
      currentPeriodStartAt: cycleStartAt,
      currentPeriodEndAt: cycleEndAt,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd === true,
      endedAt,
      revokedReason,
      lastProviderEventCreatedAt: args.providerEventCreatedAt,
      updatedAt: args.providerEventCreatedAt,
    };
  } else {
    const id = await args.ctx.db.insert("founderSubscriptions", {
      ownerUserId,
      provider: "stripe",
      providerCustomerId,
      providerSubscriptionId,
      providerPriceId,
      status,
      currentPeriodStartAt: cycleStartAt,
      currentPeriodEndAt: cycleEndAt,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd === true,
      endedAt,
      revokedReason,
      lastProviderEventCreatedAt: args.providerEventCreatedAt,
      createdAt: args.providerEventCreatedAt,
      updatedAt: args.providerEventCreatedAt,
    });
    subscription = (await args.ctx.db.get(id)) as FounderSubscriptionRow;
  }
  const usageCycle = await syncFounderUsageCycle({
    ctx: args.ctx,
    subscription,
    cycleStartAt,
    cycleEndAt,
    pricing: readFounderInferencePricingFromEnv(),
    nowMs: args.providerEventCreatedAt,
  });
  if (checkout) {
    await args.ctx.db.patch(checkout._id, {
      providerCheckoutSessionId:
        normalizeOptionalString(args.providerCheckoutSessionId) ?? checkout.providerCheckoutSessionId,
      providerCustomerId,
      providerSubscriptionId,
      providerPriceId,
      currentPeriodStartAt: cycleStartAt,
      currentPeriodEndAt: cycleEndAt,
      communitySubscriptionStatus: status,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd === true,
      founderSubscriptionId: subscription._id,
      status: "complete",
      updatedAt: args.providerEventCreatedAt,
    });
  }
  return {
    ok: true,
    ignored: false,
    founderSubscriptionId: subscription._id,
    usageCycleId: usageCycle?._id ?? null,
    ownerUserId,
    subscriptionStatus: status,
  };
}

export const syncFounderSubscriptionFromStripeInternal = internalMutation({
  args: {
    localSessionId: v.optional(v.union(v.string(), v.null())),
    providerCheckoutSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.string(),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    subscriptionStatus: v.string(),
    currentPeriodStartAt: v.optional(v.union(v.number(), v.null())),
    currentPeriodEndAt: v.optional(v.union(v.number(), v.null())),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    providerEventCreatedAt: v.number(),
  },
  handler: async (ctx, args) => await syncFounderSubscription({ ctx, ...args }),
});

export const syncFounderSubscriptionRiskStatusInternal = internalMutation({
  args: {
    providerSubscriptionId: v.string(),
    status: v.union(v.literal("past_due"), v.literal("ended")),
    revokedReason: v.string(),
    providerEventCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await getFounderSubscriptionByProviderSubscriptionId(
      ctx,
      args.providerSubscriptionId,
    );
    if (!existing) {
      return { ok: true, ignored: true, reason: "founder_subscription_not_found" };
    }
    if (args.providerEventCreatedAt < existing.lastProviderEventCreatedAt) {
      return { ok: true, ignored: true, reason: "founder_subscription_event_stale" };
    }
    const revokedReason = String(args.revokedReason ?? "")
      .trim()
      .slice(0, 160) || "founder_subscription_risk_revoked";
    await ctx.db.patch(existing._id, {
      status: args.status,
      endedAt: args.status === "ended" ? args.providerEventCreatedAt : undefined,
      revokedReason,
      lastProviderEventCreatedAt: args.providerEventCreatedAt,
      updatedAt: args.providerEventCreatedAt,
    });
    return {
      ok: true,
      ignored: false,
      founderSubscriptionId: existing._id,
      subscriptionStatus: args.status,
      revokedReason,
    };
  },
});

export const getCurrentFounderPlanStatus = query({
  args: { authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const subscriptions = (await ctx.db
      .query("founderSubscriptions")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect()) as FounderSubscriptionRow[];
    return {
      eligible: subscriptions.some((row) => founderSubscriptionStatusGrantsAccess({
        status: row.status,
        currentPeriodEndAt: row.currentPeriodEndAt,
        nowMs,
      })),
      subscriptions: subscriptions.map((row) => ({
        id: String(row._id),
        community_id: row.communityId ? String(row.communityId) : null,
        status: row.status,
        current_period_start_at: new Date(row.currentPeriodStartAt).toISOString(),
        current_period_end_at: new Date(row.currentPeriodEndAt).toISOString(),
        cancel_at_period_end: row.cancelAtPeriodEnd,
      })),
    };
  },
});

export const startFounderSubscriptionCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    requireFounderInferencePricingFromEnv();
    const successUrl = requireCanonicalCheckoutReturnUrl(
      args.successUrl,
      "founder_subscription_success_url_invalid",
    );
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "founder_subscription_cancel_url_invalid",
    );
    const actor = (await ctx.runQuery(
      (internal as any).authActor.resolveAuthenticatedActorInternal,
      { authSubject: args.authSubject ?? null },
    )) as { dbUserId?: any; email?: string | null };
    if (!actor?.dbUserId) throw new Error("user_not_found");
    const setupStatus = (await ctx.runQuery(
      api.profiles.getMyAccountSetupStatus,
      { authSubject: args.authSubject ?? undefined },
    )) as { steps?: Array<{ step?: string; completed?: boolean }> } | null;
    if (!setupStatus?.steps?.some((step) => step.step === "identity" && step.completed)) {
      throw new Error("profile_setup_required");
    }
    const nowMs = Date.now();
    const providerPriceId = await verifyFounderStripePrice();
    const providerCustomerId = await ensureStripeCustomerForUser({
      ctx,
      userId: actor.dbUserId,
      email: actor.email ?? null,
      nowMs,
    });
    const sessionId = newOpaqueToken("founder");
    const expiresAt = nowMs + FOUNDER_CHECKOUT_TTL_MS;
    await ctx.runMutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      { sessionId, ownerUserId: actor.dbUserId, expiresAt, nowMs },
    );
    const checkoutSession: any = await getStripeClient().checkout.sessions.create({
      mode: "subscription",
      customer: providerCustomerId,
      success_url: buildCheckoutSuccessUrl(successUrl, sessionId),
      cancel_url: cancelUrl,
      expires_at: Math.floor(expiresAt / 1000),
      client_reference_id: sessionId,
      line_items: [{ price: providerPriceId, quantity: 1 }],
      metadata: {
        local_session_id: sessionId,
        checkout_mode: "founder_subscription",
        user_id: String(actor.dbUserId),
      },
      subscription_data: {
        metadata: {
          local_session_id: sessionId,
          checkout_mode: "founder_subscription",
          user_id: String(actor.dbUserId),
        },
      },
    });
    const checkoutUrl = String(checkoutSession.url ?? "").trim();
    if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
    await ctx.runMutation(
      (internal as any).founderBilling.attachFounderStripeCheckoutSessionInternal,
      {
        sessionId,
        providerCheckoutSessionId: checkoutSession.id,
        providerCustomerId:
          typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
        providerSubscriptionId:
          typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : null,
        providerPriceId,
        nowMs: Date.now(),
      },
    );
    return { ok: true, session_id: sessionId, checkout_url: checkoutUrl };
  },
});
