import { api, internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import {
  POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
  POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
  founderSubscriptionStatusGrantsAccess,
  type FounderSubscriptionStatus,
} from "../shared/founderPlan";
import { COMMUNITY_FUNDING_POLICY_MANAGED } from "../shared/founderInference";
import { resolveBuilderFundingProjection } from "../shared/builderFunding";
import {
  buildCheckoutSuccessUrl,
  newOpaqueToken,
  normalizeStripeCommunitySubscriptionStatus,
  requireCanonicalCheckoutReturnUrl,
} from "./billingCore";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";
import {
  getFounderSubscriptionByCommunity,
  getFounderSubscriptionByProviderSubscriptionId,
  syncFounderUsageCycle,
  type FounderSubscriptionRow,
} from "./founderPlanCore";
import {
  getExistingFounderInferenceGrant,
} from "./founderInferenceCore";
import { requireFounderInferencePricingFromEnv } from "./founderPlanPricing";
import { hasPlatformOwnerComplimentaryAccess } from "./operatorEntitlementsCore";
import { getStripeClient } from "./stripeCore";
import {
  attachStripeCustomerToUser,
  ensureStripeCustomerForUser,
} from "./stripeCustomers";
import {
  communityIsActive,
  communityLifecycleGenerationMatches,
  normalizeCommunityLifecycle,
} from "../shared/communityLifecycle";

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

export const createPendingFounderSubscriptionCheckoutInternal = internalMutation({
  args: {
    sessionId: v.string(),
    ownerUserId: v.id("users"),
    communityId: v.id("communities"),
    expiresAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || String(community.ownerId) !== String(args.ownerUserId)) {
      throw new Error("founder_subscription_community_forbidden");
    }
    const lifecycle = normalizeCommunityLifecycle(community);
    if (lifecycle.status !== "active") throw new Error("community_archived");
    const existingSubscription = await getFounderSubscriptionByCommunity(
      ctx,
      args.communityId,
      args.nowMs,
    );
    if (
      existingSubscription &&
      existingSubscription.status !== "canceled" &&
      existingSubscription.status !== "ended"
    ) {
      throw new Error("founder_subscription_community_already_managed");
    }
    const existing = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", args.communityId).eq("status", "pending"),
      )
      .collect();
    const activePending = existing.filter(
      (row) =>
        row.mode === "founder_subscription" &&
        row.expiresAt > args.nowMs &&
        communityLifecycleGenerationMatches(
          community,
          row.communityLifecycleGeneration,
        ),
    );
    if (activePending.length > 1) {
      throw new Error("founder_subscription_checkout_ambiguous");
    }
    if (activePending.length === 1) {
      const row = activePending[0]!;
      return {
        sessionId: row.sessionId,
        providerCheckoutSessionId: row.providerCheckoutSessionId ?? null,
        expiresAt: row.expiresAt,
        reused: true,
      };
    }
    for (const row of existing) {
      if (
        row.mode === "founder_subscription" &&
        (
          row.expiresAt <= args.nowMs ||
          !communityLifecycleGenerationMatches(
            community,
            row.communityLifecycleGeneration,
          )
        )
      ) {
        await ctx.db.patch(row._id, { status: "expired", updatedAt: args.nowMs });
      }
    }
    await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      mode: "founder_subscription",
      provider: "stripe",
      ownerUserId: args.ownerUserId,
      communityId: args.communityId,
      communityLifecycleGeneration: lifecycle.generation,
      billingPeriod: "monthly",
      amountBaseUnits: POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
      currency: "usd",
      currencyDecimals: 2,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return {
      sessionId: args.sessionId,
      providerCheckoutSessionId: null,
      expiresAt: args.expiresAt,
      reused: false,
    };
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
    if (
      !row ||
      row.mode !== "founder_subscription" ||
      !row.ownerUserId ||
      !row.communityId
    ) {
      throw new Error("founder_subscription_checkout_invalid");
    }
    const community = await ctx.db.get(row.communityId);
    if (!community || String(community.ownerId) !== String(row.ownerUserId)) {
      throw new Error("founder_subscription_community_forbidden");
    }
    if (!communityIsActive(community)) throw new Error("community_archived");
    if (
      !communityLifecycleGenerationMatches(
        community,
        row.communityLifecycleGeneration,
      )
    ) {
      throw new Error("community_lifecycle_generation_mismatch");
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
  if (checkout) {
    const checkoutCommunity = checkout.communityId
      ? await args.ctx.db.get(checkout.communityId)
      : null;
    if (
      !checkoutCommunity ||
      !communityIsActive(checkoutCommunity) ||
      !communityLifecycleGenerationMatches(
        checkoutCommunity,
        checkout.communityLifecycleGeneration,
      )
    ) {
      checkout = null;
    }
  }
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
  const communityId = existing?.communityId ?? checkout?.communityId;
  if (!ownerUserId) throw new Error("founder_subscription_owner_missing");
  if (!communityId) throw new Error("founder_subscription_community_missing");
  if (existing && checkout?.ownerUserId && String(existing.ownerUserId) !== String(checkout.ownerUserId)) {
    throw new Error("founder_subscription_owner_mismatch");
  }
  if (
    existing?.communityId &&
    checkout?.communityId &&
    String(existing.communityId) !== String(checkout.communityId)
  ) {
    throw new Error("founder_subscription_community_mismatch");
  }
  const community = await args.ctx.db.get(communityId);
  if (!community) throw new Error("founder_subscription_community_missing");
  if (String(community.ownerId) !== String(ownerUserId)) {
    throw new Error("founder_subscription_community_owner_mismatch");
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
      communityId,
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
    pricing: requireFounderInferencePricingFromEnv(),
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
  await args.ctx.db.patch(communityId, {
    inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED,
    updatedAt: args.providerEventCreatedAt,
  });
  return {
    ok: true,
    ignored: false,
    founderSubscriptionId: subscription._id,
    usageCycleId: usageCycle?._id ?? null,
    ownerUserId,
    communityId,
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

export const getFounderBillingOverview = query({
  args: { authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const [communities, grant, openAiConnection, operatorComped] = await Promise.all([
      ctx.db
        .query("communities")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerUserId))
        .collect(),
      getExistingFounderInferenceGrant(ctx, ownerUserId),
      ctx.db
        .query("userProviderConnections")
        .withIndex("by_user_provider", (q) =>
          q.eq("userId", ownerUserId).eq("provider", "openai"),
        )
        .first(),
      hasPlatformOwnerComplimentaryAccess(ctx, ownerUserId),
    ]);
    const rows = await Promise.all(
      communities
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (community) => {
          const [subscription, pendingCheckouts] =
            await Promise.all([
              getFounderSubscriptionByCommunity(ctx, community._id, nowMs),
              ctx.db
                .query("checkoutSessions")
                .withIndex("by_community_status", (q) =>
                  q.eq("communityId", community._id).eq("status", "pending"),
                )
                .collect(),
            ]);
          const fundingPolicy = community.inferenceFundingPolicy;
          const pendingCheckout = pendingCheckouts
            .filter(
              (checkout) =>
                checkout.mode === "founder_subscription" &&
                checkout.expiresAt > nowMs,
            )
            .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
          const fundingProjection = resolveBuilderFundingProjection({
            fundingPolicy,
            operatorComplimentaryAccess: operatorComped,
            checkoutPending: Boolean(pendingCheckout),
            subscription: subscription
              ? {
                  status: subscription.status,
                  currentPeriodEndAt: subscription.currentPeriodEndAt,
                }
              : null,
            legacyGrantStatus: grant?.status ?? null,
            legacyApiKeyConnected: Boolean(openAiConnection?.encryptedSecretHex),
            nowMs,
          });
          let status:
            | "operator_comped"
            | "legacy_ready"
            | "legacy_active"
            | "legacy_suspended"
            | "managed_required"
            | "managed_checkout_pending"
            | FounderSubscriptionStatus;
          if (operatorComped) {
            status = "operator_comped";
          } else if (
            subscription &&
            founderSubscriptionStatusGrantsAccess({
              status: subscription.status,
              currentPeriodEndAt: subscription.currentPeriodEndAt,
              nowMs,
            })
          ) {
            status = subscription.status;
          } else if (pendingCheckout) {
            status = "managed_checkout_pending";
          } else if (subscription) {
            status = subscription.status;
          } else if (fundingPolicy === COMMUNITY_FUNDING_POLICY_MANAGED) {
            status = "managed_required";
          } else if (grant?.status === "active" && openAiConnection?.encryptedSecretHex) {
            status = "legacy_active";
          } else if (grant?.status === "suspended") {
            status = "legacy_suspended";
          } else {
            status = "legacy_ready";
          }
          const managed = Boolean(subscription || pendingCheckout) ||
            fundingPolicy === COMMUNITY_FUNDING_POLICY_MANAGED;
          return {
            community_id: String(community._id),
            community_name: community.name,
            community_slug: community.slug,
            funding_policy: fundingPolicy,
            funding_lane: fundingProjection.lane,
            funding_state: fundingProjection.state,
            allowed_actions: fundingProjection.allowedActions,
            funding_mode: operatorComped
              ? "operator_comp"
              : managed
                ? "managed"
                : "legacy_byok",
            status,
            monthly_price_base_units: POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
            platform_fee_bps: POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
            checkout_pending: Boolean(pendingCheckout),
            subscription_id: subscription ? String(subscription._id) : null,
            current_period_start_at: subscription
              ? new Date(subscription.currentPeriodStartAt).toISOString()
              : null,
            current_period_end_at: subscription
              ? new Date(subscription.currentPeriodEndAt).toISOString()
              : null,
            cancel_at_period_end: subscription?.cancelAtPeriodEnd === true,
          };
        }),
    );
    return {
      monthly_price_base_units: POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
      communities: rows,
      managed_monthly_total_base_units: rows.filter(
        (row) => row.funding_mode === "managed",
      ).length * POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
    };
  },
});

export const getFounderBillingPortalTargetInternal = internalQuery({
  args: {
    ownerUserId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || String(community.ownerId) !== String(args.ownerUserId)) {
      throw new Error("founder_subscription_community_forbidden");
    }
    const subscription = await getFounderSubscriptionByCommunity(
      ctx,
      args.communityId,
      Date.now(),
    );
    if (!subscription?.providerCustomerId) {
      throw new Error("founder_subscription_required");
    }
    return {
      providerCustomerId: subscription.providerCustomerId,
      providerSubscriptionId: subscription.providerSubscriptionId,
    };
  },
});

export const getFounderBillingExemptionInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => ({
    operatorComped: await hasPlatformOwnerComplimentaryAccess(ctx, args.userId),
  }),
});

export const startFounderBillingPortal = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    returnUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const returnUrl = requireCanonicalCheckoutReturnUrl(
      args.returnUrl,
      "founder_billing_portal_return_url_invalid",
    );
    const actor = (await ctx.runQuery(
      (internal as any).authActor.resolveAuthenticatedActorInternal,
      { authSubject: args.authSubject ?? null },
    )) as { dbUserId?: any };
    if (!actor?.dbUserId) throw new Error("user_not_found");
    const target = (await ctx.runQuery(
      (internal as any).founderBilling.getFounderBillingPortalTargetInternal,
      { ownerUserId: actor.dbUserId, communityId: args.communityId },
    )) as { providerCustomerId?: string };
    const portalSession: any = await getStripeClient().billingPortal.sessions.create({
      customer: target.providerCustomerId,
      return_url: returnUrl,
    });
    const portalUrl = String(portalSession.url ?? "").trim();
    if (!portalUrl) throw new Error("stripe_billing_portal_url_missing");
    return { ok: true, portal_url: portalUrl };
  },
});

export const startFounderSubscriptionCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = (await ctx.runQuery(
      (internal as any).authActor.resolveAuthenticatedActorInternal,
      { authSubject: args.authSubject ?? null },
    )) as { dbUserId?: any; email?: string | null };
    if (!actor?.dbUserId) throw new Error("user_not_found");
    const exemption = (await ctx.runQuery(
      (internal as any).founderBilling.getFounderBillingExemptionInternal,
      { userId: actor.dbUserId },
    )) as { operatorComped?: boolean } | null;
    if (exemption?.operatorComped) throw new Error("operator_billing_exempt");
    requireFounderInferencePricingFromEnv();
    const successUrl = requireCanonicalCheckoutReturnUrl(
      args.successUrl,
      "founder_subscription_success_url_invalid",
    );
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "founder_subscription_cancel_url_invalid",
    );
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
    const proposedSessionId = newOpaqueToken("founder");
    const expiresAt = nowMs + FOUNDER_CHECKOUT_TTL_MS;
    const prepared = (await ctx.runMutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: proposedSessionId,
        ownerUserId: actor.dbUserId,
        communityId: args.communityId,
        expiresAt,
        nowMs,
      },
    )) as {
      sessionId: string;
      providerCheckoutSessionId?: string | null;
      expiresAt: number;
      reused: boolean;
    };
    const sessionId = prepared.sessionId;
    if (prepared.providerCheckoutSessionId) {
      const existingCheckout: any = await getStripeClient().checkout.sessions.retrieve(
        prepared.providerCheckoutSessionId,
      );
      const existingCheckoutUrl = String(existingCheckout?.url ?? "").trim();
      if (!existingCheckoutUrl) throw new Error("stripe_checkout_url_missing");
      return { ok: true, session_id: sessionId, checkout_url: existingCheckoutUrl };
    }
    const checkoutSession: any = await getStripeClient().checkout.sessions.create({
      mode: "subscription",
      customer: providerCustomerId,
      success_url: buildCheckoutSuccessUrl(successUrl, sessionId),
      cancel_url: cancelUrl,
      expires_at: Math.floor(prepared.expiresAt / 1000),
      client_reference_id: sessionId,
      line_items: [{ price: providerPriceId, quantity: 1 }],
      metadata: {
        local_session_id: sessionId,
        checkout_mode: "founder_subscription",
        user_id: String(actor.dbUserId),
        community_id: String(args.communityId),
      },
      subscription_data: {
        metadata: {
          local_session_id: sessionId,
          checkout_mode: "founder_subscription",
          user_id: String(actor.dbUserId),
          community_id: String(args.communityId),
        },
      },
    }, {
      idempotencyKey: `founder-subscription-checkout:${sessionId}`,
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
