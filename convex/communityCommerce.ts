import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getStripeClient,
} from "./stripeCore";
import {
  buildCheckoutSuccessUrl,
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type PurchaseClaimLike,
  newOpaqueToken,
  normalizeBillingPeriod,
  normalizeClaimToken,
  normalizeSessionId,
  normalizeSlug,
  normalizeStripeCommunitySubscriptionStatus,
  requireCanonicalCheckoutReturnUrl,
  redeemClaimRow,
  resolveCheckoutPricePoint,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./billingCore";
import {
  adjustCommunityActiveMemberCountForMembershipTransition,
  communitySubscriptionStatusGrantsAccess,
  communityUserIsBlocked,
  normalizeCommunitySubscriptionStatus,
  parseIsoMs,
  requireCommunityUserNotBlocked,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import { enqueueCommunityBillingIssueEmailInternal } from "./emailEvents";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import { recordCommunityRevenuePartnerCommission } from "./builderPartners";
import {
  attachStripeCustomerToUser,
  ensureStripeCustomerForUser,
} from "./stripeCustomers";
import {
  canReceiveCommunityRevenue,
  getStripeConnectDestinationAccountId,
  type StripeConnectRevenueDestinationLike,
} from "./stripeConnectAccountCore";

type CommunityCheckoutSessionRow = {
  _id: any;
  sessionId: string;
  mode: string;
  communityId?: any;
  billingPeriod?: string;
  pricePointId?: any;
  amountBaseUnits?: number;
  settledRevenueBaseUnits?: number;
  currency?: string;
  currencyDecimals?: number;
  platformFeeBps?: number;
  ownerUserId?: any;
  claimToken?: string;
  status: "pending" | "complete" | "expired";
  expiresAt: number;
  providerCheckoutSessionId?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  sourceProviderInvoiceId?: string;
  sourceProviderPaymentIntentId?: string;
  sourceProviderChargeId?: string;
  providerPriceId?: string;
  currentPeriodStartAt?: number;
  currentPeriodEndAt?: number;
  communitySubscriptionStatus?: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
  cancelAtPeriodEnd?: boolean;
  createdAt: number;
  updatedAt: number;
};

export const syncCommunitySubscriptionLifecycleInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    source: v.union(v.literal("stripe"), v.literal("external_sync")),
    status: v.string(),
    pricePointId: v.optional(v.id("communityPricePoints")),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    platformFeeBps: v.optional(v.union(v.number(), v.null())),
    currentPeriodStartIso: v.optional(v.union(v.string(), v.null())),
    currentPeriodEndIso: v.optional(v.union(v.string(), v.null())),
    cancelAtPeriodEnd: v.optional(v.union(v.boolean(), v.null())),
    revokedReason: v.optional(v.string()),
    preserveRiskRevocation: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const source = args.source;
    const status = normalizeCommunitySubscriptionStatus(args.status);
    if (!status) throw new Error("community_subscription_status_invalid");
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    const membership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
      .first()) as CommunityMembershipLike | null;
    if (!membership) throw new Error("community_membership_not_found");
    if (String(membership.accessSource ?? "").trim().toLowerCase() !== "paid_subscription") {
      throw new Error("community_membership_not_subscription");
    }

    const currentRows = (await ctx.db
      .query("communitySubscriptions" as any)
      .withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id))
      .collect()) as Array<Record<string, any>>;
    const current =
      currentRows
        .slice()
        .sort((a, b) => {
          const aMatch =
            String(a.providerSubscriptionId ?? "").trim() &&
            String(a.providerSubscriptionId ?? "").trim() === String(args.providerSubscriptionId ?? "").trim();
          const bMatch =
            String(b.providerSubscriptionId ?? "").trim() &&
            String(b.providerSubscriptionId ?? "").trim() === String(args.providerSubscriptionId ?? "").trim();
          if (aMatch !== bMatch) return aMatch ? -1 : 1;
          return Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0);
        })[0] ?? null;
    await attachStripeCustomerToUser({
      ctx,
      userId: args.userId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    const currentSource = String(current?.source ?? "")
      .trim()
      .toLowerCase();
    if (
      currentSource &&
      currentSource !== "stripe" &&
      currentSource !== "external_sync"
    ) {
      throw new Error("community_subscription_source_invalid");
    }
    if (currentSource && currentSource !== source) {
      return {
        ok: true,
        ignored: true,
        reason: "community_subscription_source_conflict",
        community_id: String(args.communityId),
        user_id: String(args.userId),
        price_point_id: String(current?.pricePointId ?? membership.pricePointId ?? ""),
        source: currentSource,
        subscription_status: String(current?.status ?? status),
      };
    }
    const previousStatus = String(current?.status ?? "")
      .trim()
      .toLowerCase();

    let pricePointId = args.pricePointId ?? current?.pricePointId ?? membership.pricePointId ?? undefined;
    const providerPriceId = String(args.providerPriceId ?? "").trim();
    if (!pricePointId && providerPriceId) {
      const pricePoints = (await ctx.db
        .query("communityPricePoints" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect()) as CommunityPricePointLike[];
      const matched =
        pricePoints.find((row) => String(row.providerPriceId ?? "").trim() === providerPriceId) ?? null;
      pricePointId = matched?._id;
    }
    if (!pricePointId) throw new Error("community_subscription_price_point_required");

    const currentPeriodStartAt = parseIsoMs(args.currentPeriodStartIso);
    const currentPeriodEndAt = parseIsoMs(args.currentPeriodEndIso);
    const cancelAtPeriodEnd =
      args.cancelAtPeriodEnd === null
        ? false
        : Boolean(args.cancelAtPeriodEnd ?? current?.cancelAtPeriodEnd);
    const endedAt =
      status === "canceled" || status === "ended"
        ? nowMs
        : undefined;
    const nextProviderSubscriptionId =
      String(args.providerSubscriptionId ?? "").trim() ||
      String(current?.providerSubscriptionId ?? "").trim() ||
      undefined;
    const nextProviderCustomerId =
      String(args.providerCustomerId ?? "").trim() ||
      String(current?.providerCustomerId ?? "").trim() ||
      undefined;
    const requestedPlatformFeeBps =
      typeof args.platformFeeBps === "number" ? args.platformFeeBps : Number.NaN;
    const nextPlatformFeeBps =
      Number.isFinite(requestedPlatformFeeBps) &&
      requestedPlatformFeeBps >= 0 &&
      requestedPlatformFeeBps <= 10000
        ? Math.round(requestedPlatformFeeBps)
        : current?.platformFeeBps;

    const patch = {
      source: currentSource === "stripe" || currentSource === "external_sync" ? current?.source : source,
      pricePointId,
      status,
      providerSubscriptionId: nextProviderSubscriptionId,
      providerCustomerId: nextProviderCustomerId,
      platformFeeBps: nextPlatformFeeBps,
      currentPeriodStartAt:
        typeof currentPeriodStartAt === "number"
          ? currentPeriodStartAt
          : current?.currentPeriodStartAt,
      currentPeriodEndAt:
        typeof currentPeriodEndAt === "number"
          ? currentPeriodEndAt
          : current?.currentPeriodEndAt,
      cancelAtPeriodEnd,
      endedAt,
      updatedAt: nowMs,
    };

    if (current) {
      await ctx.db.patch(current._id, patch);
    } else {
      await ctx.db.insert("communitySubscriptions" as any, {
        communityId: args.communityId,
        userId: args.userId,
        membershipId: membership._id,
        createdAt: nowMs,
        ...patch,
      });
    }

    const grantsAccess = communitySubscriptionStatusGrantsAccess(status);
    const revokedReason = String(args.revokedReason ?? "")
      .trim()
      .slice(0, 160);
    const existingRevokedReason = String(membership.revokedReason ?? "").trim();
    const shouldPreserveRiskRevocation =
      grantsAccess &&
      args.preserveRiskRevocation === true &&
      membership.active === false &&
      (
        existingRevokedReason === "subscription_refunded" ||
        existingRevokedReason === "subscription_dispute_opened" ||
        existingRevokedReason === "subscription_dispute_lost"
      );
    const updatedMembership = {
      ...membership,
      pricePointId,
      active: shouldPreserveRiskRevocation ? false : grantsAccess,
      revokedAt: shouldPreserveRiskRevocation
        ? membership.revokedAt ?? nowMs
        : grantsAccess ? undefined : nowMs,
      revokedReason: shouldPreserveRiskRevocation
        ? existingRevokedReason
        : grantsAccess ? undefined : revokedReason || `subscription_${status}`,
      updatedAt: nowMs,
    } as CommunityMembershipLike;
    await ctx.db.patch(membership._id, {
      pricePointId,
      active: updatedMembership.active,
      revokedAt: updatedMembership.revokedAt,
      revokedReason: updatedMembership.revokedReason,
      updatedAt: nowMs,
    });
    await adjustCommunityActiveMemberCountForMembershipTransition({
      ctx,
      communityId: args.communityId,
      before: membership,
      after: updatedMembership,
    });

    if (status === "past_due" && previousStatus !== "past_due") {
      const issueMarker = [
        String(args.providerSubscriptionId ?? "").trim() || String(current?.providerSubscriptionId ?? "").trim() || String(membership._id),
        String(currentPeriodEndAt ?? current?.currentPeriodEndAt ?? nowMs),
      ].join(":");
      await enqueueCommunityBillingIssueEmailInternal({
        ctx,
        userId: args.userId,
        communityId: args.communityId,
        issueMarker,
        nowMs,
      });
    }

    return {
      ok: true,
      community_id: String(args.communityId),
      user_id: String(args.userId),
      price_point_id: String(pricePointId),
      source,
      subscription_status: status,
    };
  },
});

export const resolvePublicCommunityCheckoutConfigInternal = internalQuery({
  args: {
    communitySlug: v.string(),
    billingPeriod: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const slug = normalizeSlug(args.communitySlug);
    const billingPeriod = normalizeBillingPeriod(args.billingPeriod);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    const entryPolicy = resolveCommunityEntryPolicy(community as any);
    if (entryPolicy !== "paid_subscription") {
      throw new Error("paid_plan_required");
    }
    const pricePoint = await resolveCheckoutPricePoint({
      ctx,
      community,
      billingPeriod,
      nowMs,
    });
    if (!pricePoint) throw new Error("paid_plan_required");
    const ownerBilling = (await ctx.runQuery(
      internal.auth.getAccountCommerceAccessForUserInternal as any,
      {
        userId: community.ownerId,
        nowMs,
      },
    )) as { account_tier?: unknown; platform_fee_bps?: unknown; has_payouts?: unknown } | null;
    if (ownerBilling?.has_payouts !== true) {
      throw new Error("community_checkout_unavailable");
    }
    const connectAccount = (await ctx.runQuery(
      internal.creatorCommerce.getUserStripeConnectAccountInternal as any,
      {
        userId: community.ownerId,
      },
    )) as StripeConnectRevenueDestinationLike | null;
    const destinationAccountId = getStripeConnectDestinationAccountId(connectAccount);
    if (!canReceiveCommunityRevenue(connectAccount) || destinationAccountId === null) {
      throw new Error("community_checkout_unavailable");
    }
    return {
      communityId: community._id,
      communitySlug: community.slug,
      communityName: community.name,
      billingPeriod,
      pricePointId: pricePoint._id,
      amountBaseUnits: pricePoint.amountBaseUnits,
      currency: pricePoint.currency,
      currencyDecimals: pricePoint.currencyDecimals,
      providerPriceId: String(pricePoint.providerPriceId ?? "").trim() || null,
      destinationAccountId,
      platformFeeBps: Math.max(0, Math.floor(Number(ownerBilling?.platform_fee_bps ?? 0))),
      oneLiner: typeof community.oneLiner === "string" ? community.oneLiner : null,
    };
  },
});

export const attachCommunityPricePointProviderPriceInternal = internalMutation({
  args: {
    pricePointId: v.id("communityPricePoints"),
    providerPriceId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const providerPriceId = String(args.providerPriceId).trim();
    if (!providerPriceId) throw new Error("provider_price_id_required");
    const pricePoint = (await ctx.db.get(args.pricePointId)) as CommunityPricePointLike | null;
    if (!pricePoint) throw new Error("community_price_point_not_found");
    const existingProviderPriceId = String(pricePoint.providerPriceId ?? "").trim();
    if (existingProviderPriceId) {
      return {
        providerPriceId: existingProviderPriceId,
        attached: false,
      };
    }
    await ctx.db.patch(args.pricePointId, {
      providerPriceId,
      updatedAt: nowMs,
    });
    return {
      providerPriceId,
      attached: true,
    };
  },
});

export const getCommunityPricePointProviderPriceInternal = internalQuery({
  args: {
    pricePointId: v.id("communityPricePoints"),
  },
  handler: async (ctx, args) => {
    const pricePoint = (await ctx.db.get(args.pricePointId)) as CommunityPricePointLike | null;
    if (!pricePoint) throw new Error("community_price_point_not_found");
    return {
      providerPriceId: String(pricePoint.providerPriceId ?? "").trim() || null,
    };
  },
});

export const createPendingPublicCommunityCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    communityId: v.id("communities"),
    billingPeriod: v.string(),
    pricePointId: v.id("communityPricePoints"),
    amountBaseUnits: v.number(),
    currency: v.string(),
    currencyDecimals: v.number(),
    platformFeeBps: v.number(),
    providerPriceId: v.string(),
    ownerUserId: v.optional(v.id("users")),
    claimToken: v.string(),
    expiresAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      mode: "community_join",
      communityId: args.communityId,
      billingPeriod: args.billingPeriod,
      pricePointId: args.pricePointId,
      amountBaseUnits: args.amountBaseUnits,
      currency: args.currency,
      currencyDecimals: args.currencyDecimals,
      platformFeeBps: args.platformFeeBps,
      providerPriceId: args.providerPriceId,
      ownerUserId: args.ownerUserId ?? undefined,
      claimToken: args.claimToken,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `community_checkout_created:${args.sessionId}`,
      eventType: "community_checkout_created",
      status: "started",
      actorUserId: args.ownerUserId,
      subjectUserId: args.ownerUserId,
      communityId: args.communityId,
      checkoutSessionId: args.sessionId,
      provider: "stripe",
      providerObjectId: args.providerPriceId,
      metadata: {
        billingPeriod: args.billingPeriod,
        pricePointId: String(args.pricePointId),
        amountBaseUnits: args.amountBaseUnits,
        currency: args.currency,
        currencyDecimals: args.currencyDecimals,
        platformFeeBps: args.platformFeeBps,
        expiresAt: args.expiresAt,
      },
      createdAt: nowMs,
    });
    await ctx.db.insert("purchaseClaims", {
      claimToken: args.claimToken,
      communityId: args.communityId,
      billingPeriod: args.billingPeriod,
      pricePointId: args.pricePointId,
      amountBaseUnits: args.amountBaseUnits,
      currency: args.currency,
      currencyDecimals: args.currencyDecimals,
      ownerUserId: args.ownerUserId ?? undefined,
      status: "pending",
      sourceSessionId: args.sessionId,
      expiresAt: args.expiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `community_purchase_claim_created:${args.claimToken}`,
      eventType: "community_purchase_claim_created",
      status: "started",
      actorUserId: args.ownerUserId,
      subjectUserId: args.ownerUserId,
      communityId: args.communityId,
      checkoutSessionId: args.sessionId,
      provider: "stripe",
      providerObjectId: args.providerPriceId,
      metadata: {
        billingPeriod: args.billingPeriod,
        pricePointId: String(args.pricePointId),
        amountBaseUnits: args.amountBaseUnits,
        currency: args.currency,
      },
      createdAt: nowMs,
    });
  },
});

export const attachCommunityStripeCheckoutSessionInternal = internalMutation({
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
    const row = (await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.sessionId))
      .first()) as CommunityCheckoutSessionRow | null;
    if (!row) throw new Error("community_checkout_session_not_found");
    if (row.mode !== "community_join") throw new Error("community_checkout_session_invalid");
    await attachStripeCustomerToUser({
      ctx,
      userId: row.ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId: String(args.providerCheckoutSessionId ?? "").trim() || undefined,
      providerCustomerId: String(args.providerCustomerId ?? "").trim() || row.providerCustomerId,
      providerSubscriptionId:
        String(args.providerSubscriptionId ?? "").trim() || row.providerSubscriptionId,
      providerPriceId: String(args.providerPriceId ?? "").trim() || row.providerPriceId,
      updatedAt: nowMs,
    });
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `community_checkout_attached_to_stripe:${args.sessionId}`,
      eventType: "community_checkout_attached_to_stripe",
      status: "succeeded",
      actorUserId: row.ownerUserId,
      subjectUserId: row.ownerUserId,
      communityId: row.communityId,
      checkoutSessionId: args.sessionId,
      provider: "stripe",
      providerObjectId: args.providerCheckoutSessionId,
      metadata: {
        providerCustomerId: args.providerCustomerId ?? null,
        providerSubscriptionId: args.providerSubscriptionId ?? null,
        providerPriceId: args.providerPriceId ?? row.providerPriceId ?? null,
      },
      createdAt: nowMs,
    });
  },
});

export const syncPendingCommunityCheckoutSubscriptionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    providerCheckoutSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    sourceProviderInvoiceId: v.optional(v.union(v.string(), v.null())),
    sourceProviderPaymentIntentId: v.optional(v.union(v.string(), v.null())),
    sourceProviderChargeId: v.optional(v.union(v.string(), v.null())),
    settledRevenueBaseUnits: v.optional(v.union(v.number(), v.null())),
    platformFeeBps: v.optional(v.union(v.number(), v.null())),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    subscriptionStatus: v.string(),
    currentPeriodStartAt: v.optional(v.union(v.number(), v.null())),
    currentPeriodEndAt: v.optional(v.union(v.number(), v.null())),
    cancelAtPeriodEnd: v.optional(v.union(v.boolean(), v.null())),
    markComplete: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = (await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.sessionId))
      .first()) as CommunityCheckoutSessionRow | null;
    if (!row) throw new Error("community_checkout_session_not_found");
    if (row.mode !== "community_join") throw new Error("community_checkout_session_invalid");
    await attachStripeCustomerToUser({
      ctx,
      userId: row.ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    const communitySubscriptionStatus = normalizeStripeCommunitySubscriptionStatus({
      subscriptionStatus: args.subscriptionStatus,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
    });
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId:
        String(args.providerCheckoutSessionId ?? "").trim() || row.providerCheckoutSessionId,
      providerCustomerId: String(args.providerCustomerId ?? "").trim() || row.providerCustomerId,
      providerSubscriptionId:
        String(args.providerSubscriptionId ?? "").trim() || row.providerSubscriptionId,
      providerPriceId: String(args.providerPriceId ?? "").trim() || row.providerPriceId,
      settledRevenueBaseUnits:
        typeof args.settledRevenueBaseUnits === "number"
          ? Math.max(0, args.settledRevenueBaseUnits)
          : row.settledRevenueBaseUnits,
      platformFeeBps:
        typeof args.platformFeeBps === "number"
          ? Math.max(0, Math.min(10000, Math.round(args.platformFeeBps)))
          : row.platformFeeBps,
      currentPeriodStartAt:
        typeof args.currentPeriodStartAt === "number"
          ? args.currentPeriodStartAt
          : row.currentPeriodStartAt,
      currentPeriodEndAt:
        typeof args.currentPeriodEndAt === "number"
          ? args.currentPeriodEndAt
          : row.currentPeriodEndAt,
      communitySubscriptionStatus,
      cancelAtPeriodEnd: Boolean(args.cancelAtPeriodEnd ?? communitySubscriptionStatus === "cancel_at_period_end"),
      status: args.markComplete ? "complete" : row.status,
      updatedAt: nowMs,
    });
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `community_subscription_synced:${args.providerSubscriptionId ?? row.providerSubscriptionId ?? args.sessionId}:${communitySubscriptionStatus}:${nowMs}`,
      eventType: "community_subscription_synced",
      status: "succeeded",
      actorUserId: row.ownerUserId,
      subjectUserId: row.ownerUserId,
      communityId: row.communityId,
      checkoutSessionId: args.sessionId,
      provider: "stripe",
      providerObjectId: String(args.providerSubscriptionId ?? row.providerSubscriptionId ?? "").trim() || undefined,
      metadata: {
        communitySubscriptionStatus,
        cancelAtPeriodEnd: Boolean(args.cancelAtPeriodEnd ?? communitySubscriptionStatus === "cancel_at_period_end"),
        markComplete: Boolean(args.markComplete),
        providerPriceId: args.providerPriceId ?? row.providerPriceId ?? null,
        currentPeriodStartAt: args.currentPeriodStartAt ?? row.currentPeriodStartAt ?? null,
        currentPeriodEndAt: args.currentPeriodEndAt ?? row.currentPeriodEndAt ?? null,
      },
      createdAt: nowMs,
    });
    if (
      args.markComplete &&
      row.communityId &&
      communitySubscriptionStatusGrantsAccess(communitySubscriptionStatus)
    ) {
      await recordCommunityRevenuePartnerCommission(ctx, {
        communityId: row.communityId,
        sourceCheckoutSessionId: row.sessionId,
        sourceProviderSubscriptionId:
          String(args.providerSubscriptionId ?? row.providerSubscriptionId ?? "").trim() || undefined,
        sourceProviderInvoiceId:
          String(args.sourceProviderInvoiceId ?? row.sourceProviderInvoiceId ?? "").trim() || undefined,
        sourceProviderPaymentIntentId:
          String(args.sourceProviderPaymentIntentId ?? row.sourceProviderPaymentIntentId ?? "").trim() || undefined,
        sourceProviderChargeId:
          String(args.sourceProviderChargeId ?? row.sourceProviderChargeId ?? "").trim() || undefined,
        amountBaseUnits:
          typeof args.settledRevenueBaseUnits === "number"
            ? Math.max(0, args.settledRevenueBaseUnits)
            : row.settledRevenueBaseUnits,
        currency: row.currency,
        currencyDecimals: row.currencyDecimals,
        platformFeeBps:
          typeof args.platformFeeBps === "number"
            ? Math.max(0, Math.min(10000, Math.round(args.platformFeeBps)))
            : undefined,
        nowMs,
      });
    }
  },
});

export const expirePublicCommunityCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = (await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.sessionId))
      .first()) as CommunityCheckoutSessionRow | null;
    if (!row || row.mode !== "community_join") return;
    await ctx.db.patch(row._id, {
      status: "expired",
      updatedAt: nowMs,
    });
  },
});

export const getCommunityJoinCheckoutSessionInternal = internalQuery({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = (await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.sessionId))
      .first()) as CommunityCheckoutSessionRow | null;
    if (!row || row.mode !== "community_join") return null;
    return {
      sessionId: row.sessionId,
      communityId: row.communityId ?? null,
      ownerUserId: row.ownerUserId ?? null,
      pricePointId: row.pricePointId ?? null,
      claimToken: row.claimToken ?? null,
      providerCheckoutSessionId: row.providerCheckoutSessionId ?? null,
      providerCustomerId: row.providerCustomerId ?? null,
      providerSubscriptionId: row.providerSubscriptionId ?? null,
      providerPriceId: row.providerPriceId ?? null,
      currentPeriodStartAt: row.currentPeriodStartAt ?? null,
      currentPeriodEndAt: row.currentPeriodEndAt ?? null,
      communitySubscriptionStatus: row.communitySubscriptionStatus ?? null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
      status: row.status,
      expiresAt: row.expiresAt,
    };
  },
});

export const getCommunitySubscriptionByProviderSubscriptionIdInternal = internalQuery({
  args: {
    providerSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
    if (!providerSubscriptionId) return null;
    const row = await ctx.db
      .query("communitySubscriptions" as any)
      .withIndex("by_providerSubscriptionId", (q: any) =>
        q.eq("providerSubscriptionId", providerSubscriptionId),
      )
      .first();
    if (!row) return null;
    return {
      communityId: row.communityId,
      userId: row.userId,
      pricePointId: row.pricePointId ?? null,
    };
  },
});

export const startPublicCommunityCheckout = action({
  args: {
    communitySlug: v.string(),
    billingPeriod: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; session_id: string; checkout_url: string }> => {
    const nowMs = Date.now();
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "checkout_cancel_url_invalid",
    );
    const billingPeriod = normalizeBillingPeriod(args.billingPeriod);
    const checkoutConfig = (await ctx.runQuery(
      internal.communityCommerce.resolvePublicCommunityCheckoutConfigInternal as any,
      {
        communitySlug: args.communitySlug,
        billingPeriod,
        nowMs,
      },
    )) as {
      communityId: any;
      communitySlug: string;
      communityName: string;
      billingPeriod: "monthly" | "annual";
      pricePointId: any;
      amountBaseUnits: number;
      currency: string;
      currencyDecimals: number;
      providerPriceId: string | null;
      destinationAccountId: string;
      platformFeeBps: number;
      oneLiner: string | null;
    };
    const sessionId = newOpaqueToken("chk");
    const claimToken = newOpaqueToken("claim");
    const expiresAt = nowMs + 14 * 24 * 60 * 60 * 1000;
    if (!args.authSubject) {
      throw new Error("auth_subject_required");
    }
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject,
    })) as { dbUserId?: unknown; email?: string | null } | null;
    const ownerUserId: unknown = actor?.dbUserId;
    const ownerEmail: string | null = actor?.email ?? null;
    if (!ownerUserId) throw new Error("auth_subject_required");
    const stripeCustomerId = await ensureStripeCustomerForUser({
      ctx,
      userId: ownerUserId,
      email: ownerEmail,
      nowMs,
    });
    await ctx.runQuery(internal.communityCommerce.requirePublicCommunityCheckoutNotBlockedInternal as any, {
      communityId: checkoutConfig.communityId,
      userId: ownerUserId,
    });
    let providerPriceId = String(checkoutConfig.providerPriceId ?? "").trim() || null;
    if (!providerPriceId) {
      const existingProviderPrice = (await ctx.runQuery(
        internal.communityCommerce.getCommunityPricePointProviderPriceInternal as any,
        {
          pricePointId: checkoutConfig.pricePointId,
        },
      )) as { providerPriceId?: string | null } | null;
      providerPriceId = String(existingProviderPrice?.providerPriceId ?? "").trim() || null;
    }
    if (!providerPriceId) {
      const stripe = getStripeClient();
      const pricePointId = String(checkoutConfig.pricePointId);
      const productIdempotencyKey = `community-price-product:${pricePointId}`;
      const priceIdempotencyKey = `community-price:${pricePointId}`;
      const product = await stripe.products.create({
        name: `${checkoutConfig.communityName} (${checkoutConfig.billingPeriod})`,
        description: checkoutConfig.oneLiner ?? undefined,
        metadata: {
          community_id: String(checkoutConfig.communityId),
          community_slug: checkoutConfig.communitySlug,
          community_price_point_id: String(checkoutConfig.pricePointId),
          billing_period: checkoutConfig.billingPeriod,
        },
      }, {
        idempotencyKey: productIdempotencyKey,
      });
      const price = await stripe.prices.create({
        currency: checkoutConfig.currency,
        unit_amount: checkoutConfig.amountBaseUnits,
        recurring: {
          interval: checkoutConfig.billingPeriod === "annual" ? "year" : "month",
        },
        product: product.id,
        metadata: {
          community_id: String(checkoutConfig.communityId),
          community_slug: checkoutConfig.communitySlug,
          community_price_point_id: String(checkoutConfig.pricePointId),
          billing_period: checkoutConfig.billingPeriod,
        },
      }, {
        idempotencyKey: priceIdempotencyKey,
      });
      const attachResult = (await ctx.runMutation(
        internal.communityCommerce.attachCommunityPricePointProviderPriceInternal as any,
        {
          pricePointId: checkoutConfig.pricePointId,
          providerPriceId: price.id,
          nowMs,
        },
      )) as { providerPriceId?: string | null } | null;
      providerPriceId = String(attachResult?.providerPriceId ?? price.id).trim();
      if (!providerPriceId) throw new Error("provider_price_id_required");
    }
    await ctx.runMutation(
      internal.communityCommerce.createPendingPublicCommunityCheckoutSessionInternal as any,
      {
        sessionId,
        communityId: checkoutConfig.communityId,
        billingPeriod,
        pricePointId: checkoutConfig.pricePointId,
        amountBaseUnits: checkoutConfig.amountBaseUnits,
        currency: checkoutConfig.currency,
        currencyDecimals: checkoutConfig.currencyDecimals,
        platformFeeBps: checkoutConfig.platformFeeBps,
        providerPriceId,
        ownerUserId: ownerUserId ?? undefined,
        claimToken,
        expiresAt,
        nowMs,
      },
    );

    try {
      const stripe = getStripeClient();
      const checkoutSession: any = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        success_url: buildCheckoutSuccessUrl(args.successUrl, sessionId),
        cancel_url: cancelUrl,
        client_reference_id: sessionId,
        line_items: [
          {
            price: providerPriceId,
            quantity: 1,
          },
        ],
        metadata: {
          local_session_id: sessionId,
          claim_token: claimToken,
          community_id: String(checkoutConfig.communityId),
          community_slug: checkoutConfig.communitySlug,
          community_price_point_id: String(checkoutConfig.pricePointId),
          billing_period: billingPeriod,
        },
        subscription_data: {
          application_fee_percent: checkoutConfig.platformFeeBps / 100,
          transfer_data: {
            destination: checkoutConfig.destinationAccountId,
          },
          metadata: {
            local_session_id: sessionId,
            claim_token: claimToken,
            community_id: String(checkoutConfig.communityId),
            community_slug: checkoutConfig.communitySlug,
            community_price_point_id: String(checkoutConfig.pricePointId),
            billing_period: billingPeriod,
          },
        },
      });
      const checkoutUrl: string = String(checkoutSession.url ?? "").trim();
      if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
      await ctx.runMutation(
        internal.communityCommerce.attachCommunityStripeCheckoutSessionInternal as any,
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
      return {
        ok: true,
        session_id: sessionId,
        checkout_url: checkoutUrl,
      };
    } catch (error) {
      await ctx.runMutation(
        internal.communityCommerce.expirePublicCommunityCheckoutSessionInternal as any,
        {
          sessionId,
          nowMs: Date.now(),
        },
      );
      throw error;
    }
  },
});

export const requirePublicCommunityCheckoutNotBlockedInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireCommunityUserNotBlocked({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    return { ok: true };
  },
});

export const finalizeCheckoutSession = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const sessionId = normalizeSessionId(args.sessionId);
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId))
      .first();
    if (!session) {
      return {
        ok: true,
        status: "pending",
      };
    }
    if (!session.ownerUserId || String(session.ownerUserId) !== String(userId)) {
      return {
        ok: false,
        status: "forbidden",
        message: "checkout_session_forbidden",
      };
    }
    if (session.expiresAt <= nowMs || session.status === "expired") {
      return {
        ok: false,
        status: "expired",
        message: "checkout_session_expired",
      };
    }
    if (session.status !== "complete" || !session.claimToken) {
      return {
        ok: true,
        status: "pending",
      };
    }
    const grantsAccess = communitySubscriptionStatusGrantsAccess(
      normalizeCommunitySubscriptionStatus(session.communitySubscriptionStatus ?? "active") ?? "active",
    );
    if (!grantsAccess) {
      return {
        ok: false,
        status: "expired",
        message: "checkout_session_inactive",
      };
    }
    return {
      ok: true,
      status: "succeeded",
      claim: {
        token: session.claimToken,
      },
    };
  },
});

export const redeemPurchaseClaim = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const token = normalizeClaimToken(args.token);
    const claim = (await ctx.db
      .query("purchaseClaims")
      .withIndex("by_claimToken", (q: any) => q.eq("claimToken", token))
      .first()) as PurchaseClaimLike | null;
    if (!claim) throw new Error("claim_not_found");
    if (claim.ownerUserId && String(claim.ownerUserId) !== String(userId)) {
      throw new Error("claim_owner_mismatch");
    }
    if (claim.expiresAt <= nowMs || claim.status === "expired") {
      await ctx.db.patch(claim._id, {
        status: "expired",
        updatedAt: nowMs,
      });
      throw new Error("claim_expired");
    }
    if (claim.status === "redeemed" && claim.redeemedByUserId !== userId) {
      throw new Error("claim_already_redeemed");
    }

    const redemption = await redeemClaimRow({
      ctx,
      claim,
      userId,
      nowMs,
    });
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `community_purchase_claim_redeemed:${token}:${userId}`,
      eventType: "community_purchase_claim_redeemed",
      status: redemption.accessGranted ? "succeeded" : "ignored",
      actorUserId: userId,
      subjectUserId: userId,
      communityId: claim.communityId,
      checkoutSessionId: claim.sourceSessionId ?? undefined,
      provider: "polynet",
      providerObjectId: claim.claimToken,
      metadata: {
        accessGranted: redemption.accessGranted,
        grantMarker: redemption.grantMarker,
        pricePointId: claim.pricePointId ? String(claim.pricePointId) : null,
      },
      createdAt: nowMs,
    });
    const communityId = redemption.communityId;
    if (!communityId) throw new Error("claim_not_redeemable");
    const community = (await ctx.db.get(communityId as any)) as CommunityLike | null;
    return [{ community_id: communityId, community_slug: String(community?.slug ?? "") || null }];
  },
});

export const listPendingPurchaseClaims = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const rows = (await ctx.db
      .query("purchaseClaims")
      .withIndex("by_owner_status", (q: any) => q.eq("ownerUserId", userId).eq("status", "pending"))
      .collect()) as PurchaseClaimLike[];
    const out: Array<{
      community_id: string;
      community_slug: string;
      community_name: string;
      expires_at: string;
    }> = [];
    for (const claim of rows) {
      if (claim.expiresAt <= nowMs) continue;
      if (claim.sourceSessionId) {
        const session = (await ctx.db
          .query("checkoutSessions")
          .withIndex("by_sessionId", (q: any) => q.eq("sessionId", claim.sourceSessionId))
          .first()) as CommunityCheckoutSessionRow | null;
        if (
          !session ||
          session.status !== "complete" ||
          !communitySubscriptionStatusGrantsAccess(
            normalizeCommunitySubscriptionStatus(session.communitySubscriptionStatus ?? "active") ??
              "active",
          )
        ) {
          continue;
        }
      }
      const community = (await ctx.db.get(claim.communityId)) as CommunityLike | null;
      if (
        community &&
        await communityUserIsBlocked({
          ctx,
          communityId: claim.communityId,
          userId,
        })
      ) {
        continue;
      }
      const communityId = String(claim.communityId);
      out.push({
        community_id: communityId,
        community_slug: String(community?.slug ?? communityId),
        community_name: String(community?.name ?? community?.slug ?? communityId),
        expires_at: toIsoString(claim.expiresAt),
      });
    }
    out.sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
    return out;
  },
});

export const redeemPendingPurchaseClaims = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const rows = (await ctx.db
      .query("purchaseClaims")
      .withIndex("by_owner_status", (q: any) => q.eq("ownerUserId", userId).eq("status", "pending"))
      .collect()) as PurchaseClaimLike[];
    const out: Array<{ community_id: string; community_slug: string | null }> = [];
    const seen = new Set<string>();
    for (const claim of rows) {
      if (
        await communityUserIsBlocked({
          ctx,
          communityId: claim.communityId,
          userId,
        })
      ) {
        continue;
      }
      const redemption = await redeemClaimRow({
        ctx,
        claim,
        userId,
        nowMs,
      });
      const communityId = redemption.communityId;
      if (!communityId) continue;
      if (seen.has(communityId)) continue;
      seen.add(communityId);
      const community = (await ctx.db.get(communityId as any)) as CommunityLike | null;
      out.push({
        community_id: communityId,
        community_slug: String(community?.slug ?? "") || null,
      });
    }
    return out;
  },
});
