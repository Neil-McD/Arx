import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getStripeClient,
} from "./stripeCore";
import {
  buildCheckoutSuccessUrl,
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  createCommunitySubscriptionForMembership,
  ensureCommunityMembership,
  newOpaqueToken,
  normalizeBillingPeriod,
  normalizeSessionId,
  normalizeSlug,
  normalizeStripeCommunitySubscriptionStatus,
  requireCanonicalCheckoutReturnUrl,
  resolveCheckoutPricePoint,
  resolveUserIdForAuthenticatedRequest,
} from "./billingCore";
import {
  adjustCommunityActiveMemberCountForMembershipTransition,
  communitySubscriptionStatusGrantsAccess,
  getUniqueCommunitySubscriptionByProviderSubscriptionId,
  getUniqueCommunitySubscriptionByMembership,
  getUniqueCommunityMembershipByPair,
  normalizeCommunitySubscriptionStatus,
  parseIsoMs,
  requireCommunityUserNotBlocked,
  resolveCommunityMembershipEntitlementState,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import {
  enqueueCommunityAccessGrantedEmailInternal,
  enqueueCommunityBillingIssueEmailInternal,
} from "./emailEvents";
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
import {
  PUBLIC_COMMUNITY_CHECKOUT_ATTEMPT_TTL_MS,
  executePublicCommunityCheckoutProviderStart,
  normalizePublicCommunityCheckoutAttemptId,
  requirePublicCommunityCheckoutMayStart,
  requirePublicCommunityCheckoutProviderAttachment,
  requirePublicCommunityCheckoutAttemptBinding,
  requireUniquePublicCommunityCheckoutAttempt,
  type ProviderCheckoutSessionSnapshot,
  type PublicCommunityCheckoutAttemptBinding,
  type PublicCommunityCheckoutAttemptSnapshot,
} from "./communityCheckoutStartCore";

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
  checkoutAttemptId?: string;
  checkoutAttemptExpiresAt?: number;
  checkoutCommunitySlug?: string;
  checkoutSuccessUrl?: string;
  checkoutCancelUrl?: string;
  providerDestinationAccountId?: string;
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

async function getUniqueCommunityCheckoutSessionBySessionId(args: {
  ctx: any;
  sessionId: string;
}): Promise<CommunityCheckoutSessionRow | null> {
  const rows = (await args.ctx.db
    .query("checkoutSessions")
    .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.sessionId))
    .take(2)) as CommunityCheckoutSessionRow[];
  if (rows.length > 1) throw new Error("community_checkout_session_duplicate_rows");
  return rows[0] ?? null;
}

function requireStoredPublicCommunityCheckoutAttempt(
  row: CommunityCheckoutSessionRow,
): PublicCommunityCheckoutAttemptSnapshot {
  const billingPeriod = normalizeBillingPeriod(row.billingPeriod);
  const snapshot: PublicCommunityCheckoutAttemptSnapshot = {
    ownerUserId: String(row.ownerUserId ?? "").trim(),
    communityId: String(row.communityId ?? "").trim(),
    communitySlug: normalizeSlug(row.checkoutCommunitySlug),
    billingPeriod,
    checkoutAttemptId: normalizePublicCommunityCheckoutAttemptId(row.checkoutAttemptId),
    successUrl: requireCanonicalCheckoutReturnUrl(
      row.checkoutSuccessUrl,
      "checkout_attempt_contract_invalid",
    ),
    cancelUrl: requireCanonicalCheckoutReturnUrl(
      row.checkoutCancelUrl,
      "checkout_attempt_contract_invalid",
    ),
    sessionId: normalizeSessionId(row.sessionId),
    pricePointId: String(row.pricePointId ?? "").trim(),
    providerPriceId: String(row.providerPriceId ?? "").trim(),
    providerCustomerId: String(row.providerCustomerId ?? "").trim(),
    providerDestinationAccountId: String(row.providerDestinationAccountId ?? "").trim(),
    platformFeeBps: Number(row.platformFeeBps),
    checkoutAttemptExpiresAt: Number(row.checkoutAttemptExpiresAt),
    status: row.status,
    providerCheckoutSessionId:
      String(row.providerCheckoutSessionId ?? "").trim() || null,
  };
  if (
    !snapshot.ownerUserId ||
    !snapshot.communityId ||
    !snapshot.pricePointId ||
    !snapshot.providerPriceId ||
    !snapshot.providerCustomerId ||
    !snapshot.providerDestinationAccountId ||
    !Number.isFinite(snapshot.platformFeeBps) ||
    snapshot.platformFeeBps < 0 ||
    snapshot.platformFeeBps > 10000 ||
    !Number.isFinite(snapshot.checkoutAttemptExpiresAt) ||
    snapshot.checkoutAttemptExpiresAt <= 0
  ) {
    throw new Error("checkout_attempt_contract_invalid");
  }
  return snapshot;
}

function toProviderCheckoutSessionSnapshot(
  checkoutSession: any,
): ProviderCheckoutSessionSnapshot {
  return {
    id: String(checkoutSession?.id ?? "").trim(),
    url: typeof checkoutSession?.url === "string" ? checkoutSession.url.trim() : null,
    status: String(checkoutSession?.status ?? "").trim().toLowerCase(),
    expiresAtMs: Number(checkoutSession?.expires_at ?? 0) * 1000,
    clientReferenceId:
      typeof checkoutSession?.client_reference_id === "string"
        ? checkoutSession.client_reference_id.trim()
        : null,
    localSessionId:
      typeof checkoutSession?.metadata?.local_session_id === "string"
        ? checkoutSession.metadata.local_session_id.trim()
        : null,
  };
}

export const syncCommunitySubscriptionLifecycleInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
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
    const status = normalizeCommunitySubscriptionStatus(args.status);
    if (!status) throw new Error("community_subscription_status_invalid");
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    const membership = await getUniqueCommunityMembershipByPair({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    if (!membership) throw new Error("community_membership_not_found");
    if (String(membership.accessSource ?? "").trim().toLowerCase() !== "paid_subscription") {
      throw new Error("community_membership_not_subscription");
    }

    const current = await getUniqueCommunitySubscriptionByMembership({
      ctx,
      membershipId: membership._id,
    });
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

    if (!nextProviderSubscriptionId) {
      throw new Error("community_subscription_provider_id_required");
    }
    await createCommunitySubscriptionForMembership({
      ctx,
      communityId: args.communityId,
      membershipId: membership._id,
      userId: args.userId,
      pricePointId,
      providerSubscriptionId: nextProviderSubscriptionId,
      providerCustomerId: nextProviderCustomerId,
      platformFeeBps: nextPlatformFeeBps,
      currentPeriodStartAt,
      currentPeriodEndAt,
      status,
      cancelAtPeriodEnd,
      nowMs,
    });

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
      source: "stripe",
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

export const getPublicCommunityCheckoutAttemptInternal = internalQuery({
  args: {
    ownerUserId: v.id("users"),
    checkoutAttemptId: v.string(),
  },
  handler: async (ctx, args) => {
    const checkoutAttemptId = normalizePublicCommunityCheckoutAttemptId(
      args.checkoutAttemptId,
    );
    const rows = (await ctx.db
      .query("checkoutSessions")
      .withIndex("by_owner_mode_checkoutAttemptId", (q: any) =>
        q
          .eq("ownerUserId", args.ownerUserId)
          .eq("mode", "community_join")
          .eq("checkoutAttemptId", checkoutAttemptId),
      )
      .take(2)) as CommunityCheckoutSessionRow[];
    return requireUniquePublicCommunityCheckoutAttempt(
      rows.map(requireStoredPublicCommunityCheckoutAttempt),
    );
  },
});

export const reservePublicCommunityCheckoutAttemptInternal = internalMutation({
  args: {
    sessionId: v.string(),
    communityId: v.id("communities"),
    communitySlug: v.string(),
    billingPeriod: v.string(),
    pricePointId: v.id("communityPricePoints"),
    amountBaseUnits: v.number(),
    currency: v.string(),
    currencyDecimals: v.number(),
    platformFeeBps: v.number(),
    providerPriceId: v.string(),
    providerCustomerId: v.string(),
    providerDestinationAccountId: v.string(),
    ownerUserId: v.id("users"),
    checkoutAttemptId: v.string(),
    checkoutAttemptExpiresAt: v.number(),
    successUrl: v.string(),
    cancelUrl: v.string(),
    expiresAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const checkoutAttemptId = normalizePublicCommunityCheckoutAttemptId(
      args.checkoutAttemptId,
    );
    const requested: PublicCommunityCheckoutAttemptBinding = {
      ownerUserId: String(args.ownerUserId),
      communityId: String(args.communityId),
      communitySlug: normalizeSlug(args.communitySlug),
      billingPeriod: normalizeBillingPeriod(args.billingPeriod),
      checkoutAttemptId,
      successUrl: requireCanonicalCheckoutReturnUrl(
        args.successUrl,
        "checkout_success_url_invalid",
      ),
      cancelUrl: requireCanonicalCheckoutReturnUrl(
        args.cancelUrl,
        "checkout_cancel_url_invalid",
      ),
    };
    const currentRows = (await ctx.db
      .query("checkoutSessions")
      .withIndex("by_owner_mode_checkoutAttemptId", (q: any) =>
        q
          .eq("ownerUserId", args.ownerUserId)
          .eq("mode", "community_join")
          .eq("checkoutAttemptId", checkoutAttemptId),
      )
      .take(2)) as CommunityCheckoutSessionRow[];
    const current = requireUniquePublicCommunityCheckoutAttempt(
      currentRows.map(requireStoredPublicCommunityCheckoutAttempt),
    );
    if (current) {
      return requirePublicCommunityCheckoutAttemptBinding({
        attempt: current,
        requested,
      });
    }
    const snapshot: PublicCommunityCheckoutAttemptSnapshot = {
      ...requested,
      sessionId: normalizeSessionId(args.sessionId),
      pricePointId: String(args.pricePointId),
      providerPriceId: String(args.providerPriceId).trim(),
      providerCustomerId: String(args.providerCustomerId).trim(),
      providerDestinationAccountId: String(args.providerDestinationAccountId).trim(),
      platformFeeBps: Math.max(0, Math.min(10000, Math.round(args.platformFeeBps))),
      checkoutAttemptExpiresAt: Number(args.checkoutAttemptExpiresAt),
      status: "pending",
      providerCheckoutSessionId: null,
    };
    if (
      !snapshot.providerPriceId ||
      !snapshot.providerCustomerId ||
      !snapshot.providerDestinationAccountId ||
      !Number.isFinite(snapshot.checkoutAttemptExpiresAt) ||
      snapshot.checkoutAttemptExpiresAt <= nowMs
    ) {
      throw new Error("checkout_attempt_contract_invalid");
    }
    await ctx.db.insert("checkoutSessions", {
      sessionId: snapshot.sessionId,
      mode: "community_join",
      communityId: args.communityId,
      billingPeriod: snapshot.billingPeriod,
      pricePointId: args.pricePointId,
      amountBaseUnits: args.amountBaseUnits,
      currency: args.currency,
      currencyDecimals: args.currencyDecimals,
      platformFeeBps: snapshot.platformFeeBps,
      providerPriceId: snapshot.providerPriceId,
      providerCustomerId: snapshot.providerCustomerId,
      providerDestinationAccountId: snapshot.providerDestinationAccountId,
      ownerUserId: args.ownerUserId,
      checkoutAttemptId: snapshot.checkoutAttemptId,
      checkoutAttemptExpiresAt: snapshot.checkoutAttemptExpiresAt,
      checkoutCommunitySlug: snapshot.communitySlug,
      checkoutSuccessUrl: snapshot.successUrl,
      checkoutCancelUrl: snapshot.cancelUrl,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `community_checkout_created:${snapshot.sessionId}`,
      eventType: "community_checkout_created",
      status: "started",
      actorUserId: args.ownerUserId,
      subjectUserId: args.ownerUserId,
      communityId: args.communityId,
      checkoutSessionId: snapshot.sessionId,
      provider: "stripe",
      providerObjectId: args.providerPriceId,
      metadata: {
        billingPeriod: snapshot.billingPeriod,
        checkoutAttemptId: snapshot.checkoutAttemptId,
        checkoutAttemptExpiresAt: snapshot.checkoutAttemptExpiresAt,
        pricePointId: String(args.pricePointId),
        amountBaseUnits: args.amountBaseUnits,
        currency: args.currency,
        currencyDecimals: args.currencyDecimals,
        platformFeeBps: args.platformFeeBps,
        expiresAt: args.expiresAt,
      },
      createdAt: nowMs,
    });
    return snapshot;
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
    const row = await getUniqueCommunityCheckoutSessionBySessionId({
      ctx,
      sessionId: args.sessionId,
    });
    if (!row) throw new Error("community_checkout_session_not_found");
    if (row.mode !== "community_join") throw new Error("community_checkout_session_invalid");
    const requestedProviderCheckoutSessionId = String(
      args.providerCheckoutSessionId ?? "",
    ).trim();
    const providerRows = (await ctx.db
      .query("checkoutSessions")
      .withIndex("by_providerCheckoutSessionId", (q: any) =>
        q.eq("providerCheckoutSessionId", requestedProviderCheckoutSessionId),
      )
      .take(2)) as CommunityCheckoutSessionRow[];
    const providerCheckoutSessionId =
      requirePublicCommunityCheckoutProviderAttachment({
        currentProviderSessionId: row.providerCheckoutSessionId,
        requestedProviderSessionId: requestedProviderCheckoutSessionId,
        belongsToAnotherCheckout: providerRows.some(
          (candidate) => String(candidate._id) !== String(row._id),
        ),
      });
    await attachStripeCustomerToUser({
      ctx,
      userId: row.ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId,
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
    const row = await getUniqueCommunityCheckoutSessionBySessionId({
      ctx,
      sessionId: args.sessionId,
    });
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
    const providerSubscriptionId =
      String(args.providerSubscriptionId ?? "").trim() ||
      String(row.providerSubscriptionId ?? "").trim();
    const providerCustomerId =
      String(args.providerCustomerId ?? "").trim() ||
      String(row.providerCustomerId ?? "").trim() ||
      undefined;
    const platformFeeBps =
      typeof args.platformFeeBps === "number"
        ? Math.max(0, Math.min(10000, Math.round(args.platformFeeBps)))
        : row.platformFeeBps;
    const currentPeriodStartAt =
      typeof args.currentPeriodStartAt === "number"
        ? args.currentPeriodStartAt
        : row.currentPeriodStartAt;
    const currentPeriodEndAt =
      typeof args.currentPeriodEndAt === "number"
        ? args.currentPeriodEndAt
        : row.currentPeriodEndAt;
    const cancelAtPeriodEnd = Boolean(
      args.cancelAtPeriodEnd ?? communitySubscriptionStatus === "cancel_at_period_end",
    );
    const shouldCompleteProjection =
      args.markComplete === true &&
      communitySubscriptionStatusGrantsAccess(communitySubscriptionStatus);
    const isFirstCompletedProjection = shouldCompleteProjection && row.status !== "complete";
    if (
      isFirstCompletedProjection &&
      communitySubscriptionStatusGrantsAccess(communitySubscriptionStatus)
    ) {
      if (!row.communityId || !row.ownerUserId || !row.pricePointId) {
        throw new Error("community_checkout_access_identity_missing");
      }
      if (!providerSubscriptionId) {
        throw new Error("community_subscription_provider_id_required");
      }
      const community = (await ctx.db.get(row.communityId)) as CommunityLike | null;
      if (!community) throw new Error("community_not_found");
      const { membership, accessGranted } = await ensureCommunityMembership({
        ctx,
        community,
        communityId: row.communityId,
        userId: row.ownerUserId,
        pricePointId: row.pricePointId,
        nowMs,
      });
      await createCommunitySubscriptionForMembership({
        ctx,
        communityId: row.communityId,
        membershipId: membership._id,
        userId: row.ownerUserId,
        pricePointId: row.pricePointId,
        providerSubscriptionId,
        providerCustomerId,
        platformFeeBps,
        currentPeriodStartAt,
        currentPeriodEndAt,
        status: communitySubscriptionStatus,
        cancelAtPeriodEnd,
        nowMs,
      });
      if (accessGranted) {
        await enqueueCommunityAccessGrantedEmailInternal({
          ctx,
          userId: row.ownerUserId,
          communityId: row.communityId,
          grantMarker: `${String(membership._id)}:${membership.updatedAt}`,
          nowMs,
        });
      }
    }
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId:
        String(args.providerCheckoutSessionId ?? "").trim() || row.providerCheckoutSessionId,
      providerCustomerId,
      providerSubscriptionId: providerSubscriptionId || undefined,
      providerPriceId: String(args.providerPriceId ?? "").trim() || row.providerPriceId,
      settledRevenueBaseUnits:
        typeof args.settledRevenueBaseUnits === "number"
          ? Math.max(0, args.settledRevenueBaseUnits)
          : row.settledRevenueBaseUnits,
      platformFeeBps,
      currentPeriodStartAt,
      currentPeriodEndAt,
      communitySubscriptionStatus,
      cancelAtPeriodEnd,
      status: shouldCompleteProjection ? "complete" : row.status,
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
        cancelAtPeriodEnd,
        markComplete: Boolean(args.markComplete),
        providerPriceId: args.providerPriceId ?? row.providerPriceId ?? null,
        currentPeriodStartAt: args.currentPeriodStartAt ?? row.currentPeriodStartAt ?? null,
        currentPeriodEndAt: args.currentPeriodEndAt ?? row.currentPeriodEndAt ?? null,
      },
      createdAt: nowMs,
    });
    if (
      isFirstCompletedProjection &&
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
          platformFeeBps,
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
    const row = await getUniqueCommunityCheckoutSessionBySessionId({
      ctx,
      sessionId: args.sessionId,
    });
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
    const row = await getUniqueCommunityCheckoutSessionBySessionId({
      ctx,
      sessionId: args.sessionId,
    });
    if (!row || row.mode !== "community_join") return null;
    return {
      sessionId: row.sessionId,
      communityId: row.communityId ?? null,
      ownerUserId: row.ownerUserId ?? null,
      pricePointId: row.pricePointId ?? null,
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
    const row = await getUniqueCommunitySubscriptionByProviderSubscriptionId({
      ctx,
      providerSubscriptionId,
    });
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
    checkoutAttemptId: v.string(),
    authSubject: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    checkout_attempt_id: string;
    session_id: string;
    checkout_url: string;
  }> => {
    const nowMs = Date.now();
    const communitySlug = normalizeSlug(args.communitySlug);
    const checkoutAttemptId = normalizePublicCommunityCheckoutAttemptId(
      args.checkoutAttemptId,
    );
    const successUrlTemplate = requireCanonicalCheckoutReturnUrl(
      args.successUrl,
      "checkout_success_url_invalid",
    );
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "checkout_cancel_url_invalid",
    );
    const billingPeriod = normalizeBillingPeriod(args.billingPeriod);
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject,
    })) as { dbUserId?: unknown; email?: string | null } | null;
    const ownerUserId: unknown = actor?.dbUserId;
    const ownerEmail: string | null = actor?.email ?? null;
    if (!ownerUserId) throw new Error("auth_subject_required");
    let attempt = (await ctx.runQuery(
      internal.communityCommerce.getPublicCommunityCheckoutAttemptInternal as any,
      {
        ownerUserId,
        checkoutAttemptId,
      },
    )) as PublicCommunityCheckoutAttemptSnapshot | null;
    if (attempt) {
      attempt = requirePublicCommunityCheckoutAttemptBinding({
        attempt,
        requested: {
          ownerUserId: String(ownerUserId),
          communityId: attempt.communityId,
          communitySlug,
          billingPeriod,
          checkoutAttemptId,
          successUrl: buildCheckoutSuccessUrl(successUrlTemplate, attempt.sessionId),
          cancelUrl,
        },
      });
    } else {
      const checkoutConfig = (await ctx.runQuery(
        internal.communityCommerce.resolvePublicCommunityCheckoutConfigInternal as any,
        {
          communitySlug,
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
      await ctx.runQuery(
        internal.communityCommerce.requirePublicCommunityCheckoutNotBlockedInternal as any,
        {
          communityId: checkoutConfig.communityId,
          userId: ownerUserId,
        },
      );
      const stripeCustomerId = await ensureStripeCustomerForUser({
        ctx,
        userId: ownerUserId,
        email: ownerEmail,
        nowMs,
      });
      let providerPriceId = String(checkoutConfig.providerPriceId ?? "").trim() || null;
      if (!providerPriceId) {
        const existingProviderPrice = (await ctx.runQuery(
          internal.communityCommerce.getCommunityPricePointProviderPriceInternal as any,
          { pricePointId: checkoutConfig.pricePointId },
        )) as { providerPriceId?: string | null } | null;
        providerPriceId = String(existingProviderPrice?.providerPriceId ?? "").trim() || null;
      }
      if (!providerPriceId) {
        const stripe = getStripeClient();
        const pricePointId = String(checkoutConfig.pricePointId);
        const product = await stripe.products.create(
          {
            name: `${checkoutConfig.communityName} (${checkoutConfig.billingPeriod})`,
            description: checkoutConfig.oneLiner ?? undefined,
            metadata: {
              community_id: String(checkoutConfig.communityId),
              community_slug: checkoutConfig.communitySlug,
              community_price_point_id: pricePointId,
              billing_period: checkoutConfig.billingPeriod,
            },
          },
          { idempotencyKey: `community-price-product:${pricePointId}` },
        );
        const price = await stripe.prices.create(
          {
            currency: checkoutConfig.currency,
            unit_amount: checkoutConfig.amountBaseUnits,
            recurring: {
              interval: checkoutConfig.billingPeriod === "annual" ? "year" : "month",
            },
            product: product.id,
            metadata: {
              community_id: String(checkoutConfig.communityId),
              community_slug: checkoutConfig.communitySlug,
              community_price_point_id: pricePointId,
              billing_period: checkoutConfig.billingPeriod,
            },
          },
          { idempotencyKey: `community-price:${pricePointId}` },
        );
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
      const sessionId = newOpaqueToken("chk");
      attempt = (await ctx.runMutation(
        internal.communityCommerce.reservePublicCommunityCheckoutAttemptInternal as any,
        {
          sessionId,
          communityId: checkoutConfig.communityId,
          communitySlug: checkoutConfig.communitySlug,
          billingPeriod,
          pricePointId: checkoutConfig.pricePointId,
          amountBaseUnits: checkoutConfig.amountBaseUnits,
          currency: checkoutConfig.currency,
          currencyDecimals: checkoutConfig.currencyDecimals,
          platformFeeBps: checkoutConfig.platformFeeBps,
          providerPriceId,
          providerCustomerId: stripeCustomerId,
          providerDestinationAccountId: checkoutConfig.destinationAccountId,
          ownerUserId,
          checkoutAttemptId,
          checkoutAttemptExpiresAt:
            nowMs + PUBLIC_COMMUNITY_CHECKOUT_ATTEMPT_TTL_MS,
          successUrl: buildCheckoutSuccessUrl(successUrlTemplate, sessionId),
          cancelUrl,
          expiresAt: nowMs + 14 * 24 * 60 * 60 * 1000,
          nowMs,
        },
      )) as PublicCommunityCheckoutAttemptSnapshot;
    }
    await ctx.runQuery(
      internal.communityCommerce.requirePublicCommunityCheckoutNotBlockedInternal as any,
      {
        communityId: attempt.communityId,
        userId: ownerUserId,
      },
    );
    try {
      const stripe = getStripeClient();
      const ready = await executePublicCommunityCheckoutProviderStart({
        attempt,
        nowMs: Date.now(),
        retrieveProviderSession: async (providerSessionId) =>
          toProviderCheckoutSessionSnapshot(
            await stripe.checkout.sessions.retrieve(providerSessionId),
          ),
        createProviderSession: async (idempotencyKey) =>
          toProviderCheckoutSessionSnapshot(
            await stripe.checkout.sessions.create(
              {
                mode: "subscription",
                customer: attempt.providerCustomerId,
                success_url: attempt.successUrl,
                cancel_url: attempt.cancelUrl,
                expires_at: Math.floor(attempt.checkoutAttemptExpiresAt / 1000),
                client_reference_id: attempt.sessionId,
                line_items: [{ price: attempt.providerPriceId, quantity: 1 }],
                metadata: {
                  local_session_id: attempt.sessionId,
                  community_id: attempt.communityId,
                  community_slug: attempt.communitySlug,
                  community_price_point_id: attempt.pricePointId,
                  billing_period: attempt.billingPeriod,
                },
                subscription_data: {
                  application_fee_percent: attempt.platformFeeBps / 100,
                  transfer_data: {
                    destination: attempt.providerDestinationAccountId,
                  },
                  metadata: {
                    local_session_id: attempt.sessionId,
                    community_id: attempt.communityId,
                    community_slug: attempt.communitySlug,
                    community_price_point_id: attempt.pricePointId,
                    billing_period: attempt.billingPeriod,
                  },
                },
              },
              { idempotencyKey },
            ),
          ),
        attachProviderSession: async (providerSession) => {
          await ctx.runMutation(
            internal.communityCommerce.attachCommunityStripeCheckoutSessionInternal as any,
            {
              sessionId: attempt.sessionId,
              providerCheckoutSessionId: providerSession.id,
              providerCustomerId: attempt.providerCustomerId,
              providerSubscriptionId: null,
              providerPriceId: attempt.providerPriceId,
              nowMs: Date.now(),
            },
          );
        },
      });
      return {
        checkout_attempt_id: checkoutAttemptId,
        session_id: attempt.sessionId,
        checkout_url: ready.checkoutUrl,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "checkout_attempt_expired") {
        await ctx.runMutation(
          internal.communityCommerce.expirePublicCommunityCheckoutSessionInternal as any,
          {
            sessionId: attempt.sessionId,
            nowMs: Date.now(),
          },
        );
      }
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
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    if (String(community.ownerId) === String(args.userId)) {
      throw new Error("community_owner_checkout_forbidden");
    }
    await requireCommunityUserNotBlocked({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const membership = await getUniqueCommunityMembershipByPair({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    requirePublicCommunityCheckoutMayStart(membership);
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
    const session = await getUniqueCommunityCheckoutSessionBySessionId({
      ctx,
      sessionId,
    });
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
    if (
      session.status === "expired" ||
      (session.status !== "complete" && session.expiresAt <= nowMs)
    ) {
      return {
        ok: false,
        status: "expired",
        message: "checkout_session_expired",
      };
    }
    if (session.status !== "complete") {
      return {
        ok: true,
        status: "pending",
      };
    }
    const grantsAccess = communitySubscriptionStatusGrantsAccess(
      normalizeCommunitySubscriptionStatus(session.communitySubscriptionStatus),
    );
    if (!grantsAccess) {
      return {
        ok: false,
        status: "unavailable",
        message: "checkout_access_unavailable",
      };
    }
    if (!session.communityId) {
      return {
        ok: false,
        status: "unavailable",
        message: "checkout_access_identity_missing",
      };
    }
    const community = (await ctx.db.get(session.communityId)) as CommunityLike | null;
    if (!community) {
      return {
        ok: false,
        status: "unavailable",
        message: "community_not_found",
      };
    }
    const membership = await getUniqueCommunityMembershipByPair({
      ctx,
      communityId: session.communityId,
      userId,
    });
    const entitlement = await resolveCommunityMembershipEntitlementState({
      ctx,
      community: community as any,
      membership,
      userId,
    });
    if (!entitlement.isEntitled) {
      return {
        ok: false,
        status: "unavailable",
        message: "checkout_access_unavailable",
      };
    }
    return {
      ok: true,
      status: "succeeded",
      community: {
        id: String(session.communityId),
        slug: String(community.slug ?? "") || null,
      },
    };
  },
});
