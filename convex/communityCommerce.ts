import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getStripeClient,
  requireStripeConnectWebhookConfiguration,
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
  applyCommunitySubscriptionEntitlementToMembership,
  communitySubscriptionStatusGrantsAccess,
  communityUserIsBlocked,
  normalizeCommunitySubscriptionStatus,
  parseIsoMs,
  requireCommunityUserNotBlocked,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import { enqueueCommunityBillingIssueEmailInternal } from "./emailEvents";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import {
  canReceiveCommunityRevenue,
  getStripeConnectDestinationAccountId,
  type StripeConnectRevenueDestinationLike,
} from "./stripeConnectAccountCore";
import { POLYNET_COMMUNITY_PLATFORM_FEE_BPS } from "../shared/founderPlan";
import { requireCommunityProviderAccountMatch } from "./communityCommerceCore";
import { providerSubscriptionEventShouldApply } from "../shared/subscriptionEventOrdering";
import {
  communityAcceptsNewOperationsAtGeneration,
  normalizeCommunityLifecycleGeneration,
  requireActiveCommunity,
  requireMatchingCommunityLifecycleGeneration,
} from "./communityLifecycleCore";
import {
  compensateStaleStripeCheckout,
  normalizeStripeCheckoutSessionIdentity,
  stripeCheckoutCompensationIsTerminal,
  type StripeCheckoutCompensationClient,
} from "./stripeCheckoutEffectCore";

type CommunityCheckoutSessionRow = {
  _id: any;
  sessionId: string;
  mode: string;
  communityId?: any;
  communityLifecycleGeneration?: number;
  billingPeriod?: string;
  pricePointId?: any;
  amountBaseUnits?: number;
  currency?: string;
  currencyDecimals?: number;
  ownerUserId?: any;
  claimToken?: string;
  status: "pending" | "complete" | "expired";
  expiresAt: number;
  providerCheckoutSessionId?: string;
  providerAccountId?: string;
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
  lastProviderEventCreatedAt?: number;
  createdAt: number;
  updatedAt: number;
};

async function quarantineCommunityCheckoutRow(args: {
  ctx: any;
  row: CommunityCheckoutSessionRow;
  providerAccountId: string;
  providerCheckoutSessionId?: unknown;
  providerCustomerId?: unknown;
  providerSubscriptionId?: unknown;
  providerPriceId?: unknown;
  nowMs: number;
}) {
  const providerCheckoutSessionId = String(args.providerCheckoutSessionId ?? "").trim();
  const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
  await args.ctx.db.patch(args.row._id, {
    provider: "stripe",
    providerAccountId: args.providerAccountId,
    providerCheckoutSessionId:
      providerCheckoutSessionId || args.row.providerCheckoutSessionId,
    providerCustomerId:
      String(args.providerCustomerId ?? "").trim() || args.row.providerCustomerId,
    providerSubscriptionId:
      providerSubscriptionId || args.row.providerSubscriptionId,
    providerPriceId:
      String(args.providerPriceId ?? "").trim() || args.row.providerPriceId,
    cancelAtPeriodEnd: false,
    status: "expired",
    updatedAt: args.nowMs,
  });
  if (args.row.claimToken) {
    const claim = await args.ctx.db
      .query("purchaseClaims")
      .withIndex("by_claimToken", (q: any) => q.eq("claimToken", args.row.claimToken))
      .first();
    if (claim?.status === "pending") {
      await args.ctx.db.patch(claim._id, {
        status: "expired",
        updatedAt: args.nowMs,
      });
    }
  }
  return {
    ok: true,
    quarantined: true,
    provider_checkout_session_id: providerCheckoutSessionId || args.row.providerCheckoutSessionId || null,
    provider_subscription_id: providerSubscriptionId || args.row.providerSubscriptionId || null,
  };
}

function normalizeStripeObjectId(raw: unknown, code: string): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error(code);
  return value;
}

export const getCommunityStripeCustomerInternal = internalQuery({
  args: {
    userId: v.id("users"),
    providerAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    const providerAccountId = normalizeStripeObjectId(
      args.providerAccountId,
      "provider_account_id_required",
    );
    return await ctx.db
      .query("communityStripeCustomers" as any)
      .withIndex("by_user_account", (q: any) =>
        q.eq("userId", args.userId).eq("providerAccountId", providerAccountId),
      )
      .first();
  },
});

export const attachCommunityStripeCustomerInternal = internalMutation({
  args: {
    userId: v.id("users"),
    providerAccountId: v.string(),
    providerCustomerId: v.string(),
    replacesProviderCustomerId: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const providerAccountId = normalizeStripeObjectId(
      args.providerAccountId,
      "provider_account_id_required",
    );
    const providerCustomerId = normalizeStripeObjectId(
      args.providerCustomerId,
      "provider_customer_id_required",
    );
    const replacesProviderCustomerId = String(
      args.replacesProviderCustomerId ?? "",
    ).trim();
    const email = String(args.email ?? "").trim().toLowerCase() || undefined;
    const customerOwner = await ctx.db
      .query("communityStripeCustomers" as any)
      .withIndex("by_account_customer", (q: any) =>
        q.eq("providerAccountId", providerAccountId).eq("providerCustomerId", providerCustomerId),
      )
      .first();
    if (customerOwner && String(customerOwner.userId) !== String(args.userId)) {
      throw new Error("community_stripe_customer_owner_conflict");
    }
    const existing = await ctx.db
      .query("communityStripeCustomers" as any)
      .withIndex("by_user_account", (q: any) =>
        q.eq("userId", args.userId).eq("providerAccountId", providerAccountId),
      )
      .first();
    if (existing) {
      if (String(existing.providerCustomerId) !== providerCustomerId) {
        if (String(existing.providerCustomerId) !== replacesProviderCustomerId) {
          throw new Error("community_stripe_customer_identity_conflict");
        }
        await ctx.db.patch(existing._id, {
          providerCustomerId,
          email,
          updatedAt: nowMs,
        });
        return { providerCustomerId, attached: true, replaced: true };
      }
      await ctx.db.patch(existing._id, { email, updatedAt: nowMs });
      return { providerCustomerId, attached: false };
    }
    await ctx.db.insert("communityStripeCustomers" as any, {
      userId: args.userId,
      provider: "stripe",
      providerAccountId,
      providerCustomerId,
      email,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { providerCustomerId, attached: true };
  },
});

async function ensureCommunityStripeCustomerForUser(args: {
  ctx: any;
  userId: any;
  email?: string | null;
  providerAccountId: string;
  nowMs: number;
}): Promise<string> {
  const providerAccountId = normalizeStripeObjectId(
    args.providerAccountId,
    "provider_account_id_required",
  );
  const existing = await args.ctx.runQuery(
    internal.communityCommerce.getCommunityStripeCustomerInternal as any,
    { userId: args.userId, providerAccountId },
  );
  const existingCustomerId = String(existing?.providerCustomerId ?? "").trim();
  const stripe = getStripeClient();
  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(
        existingCustomerId,
        {},
        { stripeAccount: providerAccountId },
      );
      if (!Boolean((customer as { deleted?: boolean }).deleted)) return existingCustomerId;
    } catch (error: any) {
      if (error?.statusCode !== 404 && error?.code !== "resource_missing") throw error;
    }
  }
  const customer = await stripe.customers.create(
    {
      email: String(args.email ?? "").trim().toLowerCase() || undefined,
      metadata: { polynet_user_id: String(args.userId) },
    },
    {
      stripeAccount: providerAccountId,
      idempotencyKey: `community-customer:${providerAccountId}:${String(args.userId)}:${existingCustomerId || "initial"}`,
    },
  );
  const attached = await args.ctx.runMutation(
    internal.communityCommerce.attachCommunityStripeCustomerInternal as any,
    {
      userId: args.userId,
      providerAccountId,
      providerCustomerId: customer.id,
      replacesProviderCustomerId: existingCustomerId || null,
      email: args.email ?? null,
      nowMs: args.nowMs,
    },
  );
  return normalizeStripeObjectId(
    attached?.providerCustomerId,
    "provider_customer_id_required",
  );
}

export const syncCommunitySubscriptionLifecycleInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    source: v.union(v.literal("stripe"), v.literal("external_sync")),
    status: v.string(),
    pricePointId: v.optional(v.id("communityPricePoints")),
    providerAccountId: v.optional(v.union(v.string(), v.null())),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    currentPeriodStartIso: v.optional(v.union(v.string(), v.null())),
    currentPeriodEndIso: v.optional(v.union(v.string(), v.null())),
    cancelAtPeriodEnd: v.optional(v.union(v.boolean(), v.null())),
    revokedReason: v.optional(v.string()),
    preserveRiskRevocation: v.optional(v.boolean()),
    sourceEventCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const sourceEventCreatedAt = args.sourceEventCreatedAt;
    if (!Number.isFinite(sourceEventCreatedAt) || sourceEventCreatedAt <= 0) {
      throw new Error("community_subscription_event_timestamp_invalid");
    }
    const nowMs = Date.now();
    const source = args.source;
    const providerAccountId = String(args.providerAccountId ?? "").trim();
    const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
    if (source === "stripe" && !providerAccountId) {
      throw new Error("community_subscription_provider_account_required");
    }
    if (source === "stripe" && !providerSubscriptionId) {
      throw new Error("community_subscription_provider_subscription_required");
    }
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
        .filter((row) =>
          source === "stripe"
            ? String(row.providerAccountId ?? "").trim() === providerAccountId &&
              String(row.providerSubscriptionId ?? "").trim() === providerSubscriptionId
            : row.source === "external_sync" &&
              row.communityLifecycleGeneration ===
                normalizeCommunityLifecycleGeneration(community.lifecycleGeneration)
        )
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
    if (current && !providerSubscriptionEventShouldApply({
      incomingCreatedAt: sourceEventCreatedAt,
      currentCreatedAt: Number(current.lastSourceEventCreatedAt ?? 0),
      incomingStatus: status,
      currentStatus: normalizeCommunitySubscriptionStatus(current.status),
    })) {
      return {
        ok: true,
        ignored: true,
        reason: "community_subscription_event_stale",
        community_id: String(args.communityId),
        user_id: String(args.userId),
      };
    }
    const currentSource = String(current?.source ?? "")
      .trim()
      .toLowerCase();
    if (source === "stripe" && !current) {
      return {
        ok: true,
        ignored: true,
        reason: "community_subscription_not_found",
        community_id: String(args.communityId),
        user_id: String(args.userId),
      };
    }
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
    const currentProviderAccountId = String(current?.providerAccountId ?? "").trim();
    if (
      source === "stripe" &&
      currentProviderAccountId &&
      currentProviderAccountId !== providerAccountId
    ) {
      throw new Error("community_subscription_provider_account_mismatch");
    }
    const communityLifecycleGeneration = current
      ? Number(current.communityLifecycleGeneration)
      : normalizeCommunityLifecycleGeneration(community.lifecycleGeneration);
    const lifecycleCurrent = communityAcceptsNewOperationsAtGeneration({
      community,
      expectedGeneration: communityLifecycleGeneration,
    });
    if (current && !lifecycleCurrent) {
      if (status === "canceled" || status === "ended") {
        await ctx.db.patch(current._id, {
          status: "ended",
          cancelAtPeriodEnd: false,
          endedAt: sourceEventCreatedAt,
          lastSourceEventCreatedAt: sourceEventCreatedAt,
          updatedAt: nowMs,
        });
        return {
          ok: true,
          ignored: false,
          community_id: String(args.communityId),
          user_id: String(args.userId),
          subscription_status: "ended",
        };
      }
      return {
        ok: true,
        ignored: true,
        quarantined: true,
        reason: "community_subscription_lifecycle_stale",
        community_id: String(args.communityId),
        user_id: String(args.userId),
      };
    }
    if (!current && !lifecycleCurrent) {
      return {
        ok: true,
        ignored: true,
        quarantined: true,
        reason: "community_subscription_lifecycle_stale",
        community_id: String(args.communityId),
        user_id: String(args.userId),
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
      const matched = pricePoints.find((row) =>
        String(row.providerPriceId ?? "").trim() === providerPriceId &&
        (
          source !== "stripe" ||
          String(row.providerAccountId ?? "").trim() === providerAccountId
        )
      ) ?? null;
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
        ? sourceEventCreatedAt
        : undefined;
    const nextProviderSubscriptionId =
      providerSubscriptionId ||
      String(current?.providerSubscriptionId ?? "").trim() ||
      undefined;
    const nextProviderCustomerId =
      String(args.providerCustomerId ?? "").trim() ||
      String(current?.providerCustomerId ?? "").trim() ||
      undefined;

    const patch = {
      source: currentSource === "stripe" || currentSource === "external_sync" ? current?.source : source,
      pricePointId,
      status,
      providerAccountId: providerAccountId || current?.providerAccountId,
      providerSubscriptionId: nextProviderSubscriptionId,
      providerCustomerId: nextProviderCustomerId,
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
      lastSourceEventCreatedAt: sourceEventCreatedAt,
      updatedAt: nowMs,
    };

    if (current) {
      await ctx.db.patch(current._id, patch);
    } else {
      await ctx.db.insert("communitySubscriptions" as any, {
        communityId: args.communityId,
        communityLifecycleGeneration,
        userId: args.userId,
        membershipId: membership._id,
        createdAt: nowMs,
        ...patch,
      });
    }

    await applyCommunitySubscriptionEntitlementToMembership({
      ctx,
      communityId: args.communityId,
      membership,
      userId: args.userId,
      pricePointId,
      status,
      revokedReason: args.revokedReason,
      preserveRiskRevocation: args.preserveRiskRevocation,
      nowMs,
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
    requireActiveCommunity(community);
    const communityLifecycleGeneration = normalizeCommunityLifecycleGeneration(
      community.lifecycleGeneration,
    );
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
    const connectAccount = (await ctx.runQuery(
      internal.creatorCommerce.getUserStripeConnectAccountInternal as any,
      {
        userId: community.ownerId,
      },
    )) as StripeConnectRevenueDestinationLike | null;
    const providerAccountId = getStripeConnectDestinationAccountId(connectAccount);
    if (!canReceiveCommunityRevenue(connectAccount) || providerAccountId === null) {
      throw new Error("community_checkout_unavailable");
    }
    return {
      communityId: community._id,
      communityLifecycleGeneration,
      communitySlug: community.slug,
      communityName: community.name,
      billingPeriod,
      pricePointId: pricePoint._id,
      amountBaseUnits: pricePoint.amountBaseUnits,
      currency: pricePoint.currency,
      currencyDecimals: pricePoint.currencyDecimals,
      providerPriceId:
        String(pricePoint.providerAccountId ?? "").trim() === providerAccountId
          ? String(pricePoint.providerPriceId ?? "").trim() || null
          : null,
      providerAccountId,
      platformFeeBps: POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
      oneLiner: typeof community.oneLiner === "string" ? community.oneLiner : null,
    };
  },
});

export const attachCommunityPricePointProviderPriceInternal = internalMutation({
  args: {
    pricePointId: v.id("communityPricePoints"),
    providerAccountId: v.string(),
    providerPriceId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const providerPriceId = String(args.providerPriceId).trim();
    if (!providerPriceId) throw new Error("provider_price_id_required");
    const providerAccountId = normalizeStripeObjectId(
      args.providerAccountId,
      "provider_account_id_required",
    );
    const pricePoint = (await ctx.db.get(args.pricePointId)) as CommunityPricePointLike | null;
    if (!pricePoint) throw new Error("community_price_point_not_found");
    const existingProviderPriceId = String(pricePoint.providerPriceId ?? "").trim();
    const existingProviderAccountId = String(pricePoint.providerAccountId ?? "").trim();
    if (existingProviderPriceId && existingProviderAccountId === providerAccountId) {
      return {
        providerPriceId: existingProviderPriceId,
        providerAccountId,
        attached: false,
      };
    }
    await ctx.db.patch(args.pricePointId, {
      providerAccountId,
      providerPriceId,
      updatedAt: nowMs,
    });
    return {
      providerPriceId,
      providerAccountId,
      attached: true,
    };
  },
});

export const getCommunityPricePointProviderPriceInternal = internalQuery({
  args: {
    pricePointId: v.id("communityPricePoints"),
    providerAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    const pricePoint = (await ctx.db.get(args.pricePointId)) as CommunityPricePointLike | null;
    if (!pricePoint) throw new Error("community_price_point_not_found");
    const providerAccountId = normalizeStripeObjectId(
      args.providerAccountId,
      "provider_account_id_required",
    );
    const storedProviderAccountId = String(pricePoint.providerAccountId ?? "").trim();
    return {
      providerPriceId:
        storedProviderAccountId === providerAccountId
          ? String(pricePoint.providerPriceId ?? "").trim() || null
          : null,
      providerAccountId: storedProviderAccountId || null,
    };
  },
});

export const createPendingPublicCommunityCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    communityId: v.id("communities"),
    communityLifecycleGeneration: v.number(),
    billingPeriod: v.string(),
    pricePointId: v.id("communityPricePoints"),
    amountBaseUnits: v.number(),
    currency: v.string(),
    currencyDecimals: v.number(),
    providerAccountId: v.string(),
    providerPriceId: v.string(),
    ownerUserId: v.optional(v.id("users")),
    claimToken: v.string(),
    expiresAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    requireActiveCommunity(community);
    requireMatchingCommunityLifecycleGeneration({
      community,
      expectedGeneration: args.communityLifecycleGeneration,
      errorCode: "community_checkout_lifecycle_stale",
    });
    await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      mode: "community_join",
      communityId: args.communityId,
      communityLifecycleGeneration: args.communityLifecycleGeneration,
      billingPeriod: args.billingPeriod,
      pricePointId: args.pricePointId,
      amountBaseUnits: args.amountBaseUnits,
      currency: args.currency,
      currencyDecimals: args.currencyDecimals,
      providerAccountId: normalizeStripeObjectId(
        args.providerAccountId,
        "provider_account_id_required",
      ),
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
        providerAccountId: args.providerAccountId,
        expiresAt: args.expiresAt,
      },
      createdAt: nowMs,
    });
    await ctx.db.insert("purchaseClaims", {
      claimToken: args.claimToken,
      communityId: args.communityId,
      communityLifecycleGeneration: args.communityLifecycleGeneration,
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
    providerAccountId: v.string(),
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
    if (!row.communityId) throw new Error("community_checkout_session_invalid");
    const community = (await ctx.db.get(row.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    const lifecycleCurrent = communityAcceptsNewOperationsAtGeneration({
      community,
      expectedGeneration: row.communityLifecycleGeneration,
    });
    const providerAccountId = normalizeStripeObjectId(
      args.providerAccountId,
      "provider_account_id_required",
    );
    requireCommunityProviderAccountMatch({
      expectedProviderAccountId: row.providerAccountId,
      actualProviderAccountId: providerAccountId,
      missingCode: "provider_account_id_required",
      mismatchCode: "community_checkout_provider_account_mismatch",
    });
    if (lifecycleCurrent) {
      await ctx.db.patch(row._id, {
        provider: "stripe",
        providerAccountId,
        providerCheckoutSessionId: String(args.providerCheckoutSessionId ?? "").trim() || undefined,
        providerCustomerId: String(args.providerCustomerId ?? "").trim() || row.providerCustomerId,
        providerSubscriptionId:
          String(args.providerSubscriptionId ?? "").trim() || row.providerSubscriptionId,
        providerPriceId: String(args.providerPriceId ?? "").trim() || row.providerPriceId,
        updatedAt: nowMs,
      });
    } else {
      await quarantineCommunityCheckoutRow({
        ctx,
        row,
        providerAccountId,
        providerCheckoutSessionId: args.providerCheckoutSessionId,
        providerCustomerId: args.providerCustomerId,
        providerSubscriptionId: args.providerSubscriptionId,
        providerPriceId: args.providerPriceId,
        nowMs,
      });
    }
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
        lifecycleCurrent,
        providerCustomerId: args.providerCustomerId ?? null,
        providerAccountId,
        providerSubscriptionId: args.providerSubscriptionId ?? null,
        providerPriceId: args.providerPriceId ?? row.providerPriceId ?? null,
      },
      createdAt: nowMs,
    });
    return {
      ok: true,
      lifecycle_current: lifecycleCurrent,
      provider_checkout_session_id: String(args.providerCheckoutSessionId ?? "").trim(),
    };
  },
});

async function compensateCommunityCheckout(args: {
  providerAccountId: string;
  providerCheckoutSessionId: string;
}): Promise<void> {
  const result = await compensateStaleStripeCheckout({
    stripe: getStripeClient() as unknown as StripeCheckoutCompensationClient,
    identity: normalizeStripeCheckoutSessionIdentity({
      accountScope: "connected",
      providerAccountId: args.providerAccountId,
      providerCheckoutSessionId: args.providerCheckoutSessionId,
    }),
  });
  if (!stripeCheckoutCompensationIsTerminal(result)) {
    throw new Error(
      `community_checkout_compensation_${result.state}:${result.errorCode ?? "unknown"}`,
    );
  }
}

export const syncPendingCommunityCheckoutSubscriptionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    providerAccountId: v.string(),
    providerCheckoutSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    sourceProviderInvoiceId: v.optional(v.union(v.string(), v.null())),
    sourceProviderPaymentIntentId: v.optional(v.union(v.string(), v.null())),
    sourceProviderChargeId: v.optional(v.union(v.string(), v.null())),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    subscriptionStatus: v.string(),
    currentPeriodStartAt: v.optional(v.union(v.number(), v.null())),
    currentPeriodEndAt: v.optional(v.union(v.number(), v.null())),
    cancelAtPeriodEnd: v.optional(v.union(v.boolean(), v.null())),
    markComplete: v.optional(v.boolean()),
    providerEventCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.providerEventCreatedAt) || args.providerEventCreatedAt <= 0) {
      throw new Error("community_subscription_event_timestamp_invalid");
    }
    const nowMs = Date.now();
    const row = (await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.sessionId))
      .first()) as CommunityCheckoutSessionRow | null;
    if (!row) throw new Error("community_checkout_session_not_found");
    if (row.mode !== "community_join") throw new Error("community_checkout_session_invalid");
    const incomingSubscriptionStatus = normalizeStripeCommunitySubscriptionStatus({
      subscriptionStatus: args.subscriptionStatus,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
    });
    if (!providerSubscriptionEventShouldApply({
      incomingCreatedAt: args.providerEventCreatedAt,
      currentCreatedAt: Number(row.lastProviderEventCreatedAt ?? 0),
      incomingStatus: incomingSubscriptionStatus,
      currentStatus: row.communitySubscriptionStatus ?? null,
    })) {
      return {
        ok: true,
        ignored: true,
        reason: "community_checkout_subscription_event_stale",
      };
    }
    const providerAccountId = normalizeStripeObjectId(
      args.providerAccountId,
      "provider_account_id_required",
    );
    requireCommunityProviderAccountMatch({
      expectedProviderAccountId: row.providerAccountId,
      actualProviderAccountId: providerAccountId,
      missingCode: "provider_account_id_required",
      mismatchCode: "community_checkout_provider_account_mismatch",
    });
    const community = row.communityId
      ? (await ctx.db.get(row.communityId)) as CommunityLike | null
      : null;
    if (!communityAcceptsNewOperationsAtGeneration({
      community,
      expectedGeneration: row.communityLifecycleGeneration,
    })) {
      return await quarantineCommunityCheckoutRow({
        ctx,
        row,
        providerAccountId,
        providerCheckoutSessionId: args.providerCheckoutSessionId,
        providerCustomerId: args.providerCustomerId,
        providerSubscriptionId: args.providerSubscriptionId,
        providerPriceId: args.providerPriceId,
        nowMs,
      });
    }
    const communitySubscriptionStatus = incomingSubscriptionStatus;
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerAccountId,
      providerCheckoutSessionId:
        String(args.providerCheckoutSessionId ?? "").trim() || row.providerCheckoutSessionId,
      providerCustomerId: String(args.providerCustomerId ?? "").trim() || row.providerCustomerId,
      providerSubscriptionId:
        String(args.providerSubscriptionId ?? "").trim() || row.providerSubscriptionId,
      providerPriceId: String(args.providerPriceId ?? "").trim() || row.providerPriceId,
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
      lastProviderEventCreatedAt: args.providerEventCreatedAt,
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
        providerAccountId,
        providerPriceId: args.providerPriceId ?? row.providerPriceId ?? null,
        currentPeriodStartAt: args.currentPeriodStartAt ?? row.currentPeriodStartAt ?? null,
        currentPeriodEndAt: args.currentPeriodEndAt ?? row.currentPeriodEndAt ?? null,
      },
      createdAt: nowMs,
    });
    return { ok: true, quarantined: false };
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
      providerAccountId: row.providerAccountId ?? null,
      providerCustomerId: row.providerCustomerId ?? null,
      providerSubscriptionId: row.providerSubscriptionId ?? null,
      providerPriceId: row.providerPriceId ?? null,
      currentPeriodStartAt: row.currentPeriodStartAt ?? null,
      currentPeriodEndAt: row.currentPeriodEndAt ?? null,
      communitySubscriptionStatus: row.communitySubscriptionStatus ?? null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
      lastProviderEventCreatedAt: row.lastProviderEventCreatedAt ?? null,
      status: row.status,
      expiresAt: row.expiresAt,
    };
  },
});

export const getCommunitySubscriptionByProviderSubscriptionIdInternal = internalQuery({
  args: {
    providerAccountId: v.string(),
    providerSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
    const providerAccountId = String(args.providerAccountId ?? "").trim();
    if (!providerSubscriptionId || !providerAccountId) return null;
    const row = await ctx.db
      .query("communitySubscriptions" as any)
      .withIndex("by_providerAccount_subscription", (q: any) =>
        q.eq("providerAccountId", providerAccountId).eq("providerSubscriptionId", providerSubscriptionId),
      )
      .first();
    if (!row) return null;
    return {
      communityId: row.communityId,
      userId: row.userId,
      pricePointId: row.pricePointId ?? null,
      providerAccountId: row.providerAccountId ?? null,
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
      communityLifecycleGeneration: number;
      communitySlug: string;
      communityName: string;
      billingPeriod: "monthly" | "annual";
      pricePointId: any;
      amountBaseUnits: number;
      currency: string;
      currencyDecimals: number;
      providerPriceId: string | null;
      providerAccountId: string;
      platformFeeBps: number;
      oneLiner: string | null;
    };
    requireStripeConnectWebhookConfiguration();
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
    await ctx.runQuery(internal.communityCommerce.requirePublicCommunityCheckoutNotBlockedInternal as any, {
      communityId: checkoutConfig.communityId,
      userId: ownerUserId,
    });
    const stripeCustomerId = await ensureCommunityStripeCustomerForUser({
      ctx,
      userId: ownerUserId,
      email: ownerEmail,
      providerAccountId: checkoutConfig.providerAccountId,
      nowMs,
    });
    let providerPriceId = String(checkoutConfig.providerPriceId ?? "").trim() || null;
    if (!providerPriceId) {
      const existingProviderPrice = (await ctx.runQuery(
        internal.communityCommerce.getCommunityPricePointProviderPriceInternal as any,
        {
          pricePointId: checkoutConfig.pricePointId,
          providerAccountId: checkoutConfig.providerAccountId,
        },
      )) as { providerPriceId?: string | null; providerAccountId?: string | null } | null;
      providerPriceId = String(existingProviderPrice?.providerPriceId ?? "").trim() || null;
    }
    if (!providerPriceId) {
      const stripe = getStripeClient();
      const pricePointId = String(checkoutConfig.pricePointId);
      const productIdempotencyKey = `community-price-product:${checkoutConfig.providerAccountId}:${pricePointId}`;
      const priceIdempotencyKey = `community-price:${checkoutConfig.providerAccountId}:${pricePointId}`;
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
        stripeAccount: checkoutConfig.providerAccountId,
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
        stripeAccount: checkoutConfig.providerAccountId,
        idempotencyKey: priceIdempotencyKey,
      });
      const attachResult = (await ctx.runMutation(
        internal.communityCommerce.attachCommunityPricePointProviderPriceInternal as any,
        {
          pricePointId: checkoutConfig.pricePointId,
          providerAccountId: checkoutConfig.providerAccountId,
          providerPriceId: price.id,
          nowMs,
        },
      )) as { providerPriceId?: string | null; providerAccountId?: string | null } | null;
      providerPriceId = String(attachResult?.providerPriceId ?? price.id).trim();
      if (!providerPriceId) throw new Error("provider_price_id_required");
    }
    await ctx.runMutation(
      internal.communityCommerce.createPendingPublicCommunityCheckoutSessionInternal as any,
      {
        sessionId,
        communityId: checkoutConfig.communityId,
        communityLifecycleGeneration: checkoutConfig.communityLifecycleGeneration,
        billingPeriod,
        pricePointId: checkoutConfig.pricePointId,
        amountBaseUnits: checkoutConfig.amountBaseUnits,
        currency: checkoutConfig.currency,
        currencyDecimals: checkoutConfig.currencyDecimals,
        providerAccountId: checkoutConfig.providerAccountId,
        providerPriceId,
        ownerUserId: ownerUserId ?? undefined,
        claimToken,
        expiresAt,
        nowMs,
      },
    );

    let providerCheckoutSessionId: string | null = null;
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
          community_lifecycle_generation: String(checkoutConfig.communityLifecycleGeneration),
          community_slug: checkoutConfig.communitySlug,
          community_price_point_id: String(checkoutConfig.pricePointId),
          billing_period: billingPeriod,
        },
        subscription_data: {
          application_fee_percent: checkoutConfig.platformFeeBps / 100,
          metadata: {
            local_session_id: sessionId,
            claim_token: claimToken,
            community_id: String(checkoutConfig.communityId),
            community_lifecycle_generation: String(checkoutConfig.communityLifecycleGeneration),
            community_slug: checkoutConfig.communitySlug,
            community_price_point_id: String(checkoutConfig.pricePointId),
            billing_period: billingPeriod,
          },
        },
      }, {
        stripeAccount: checkoutConfig.providerAccountId,
        idempotencyKey: `community-checkout:${checkoutConfig.providerAccountId}:${sessionId}`,
      });
      providerCheckoutSessionId = String(checkoutSession.id ?? "").trim() || null;
      const checkoutUrl: string = String(checkoutSession.url ?? "").trim();
      if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
      const attached = (await ctx.runMutation(
        internal.communityCommerce.attachCommunityStripeCheckoutSessionInternal as any,
        {
          sessionId,
          providerAccountId: checkoutConfig.providerAccountId,
          providerCheckoutSessionId: checkoutSession.id,
          providerCustomerId:
            typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
          providerSubscriptionId:
            typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : null,
          providerPriceId,
          nowMs: Date.now(),
        },
      )) as { lifecycle_current?: boolean } | null;
      if (attached?.lifecycle_current !== true) {
        throw new Error("community_checkout_lifecycle_stale");
      }
      return {
        ok: true,
        session_id: sessionId,
        checkout_url: checkoutUrl,
      };
    } catch (error) {
      let compensationError: unknown = null;
      if (providerCheckoutSessionId) {
        try {
          await compensateCommunityCheckout({
            providerAccountId: checkoutConfig.providerAccountId,
            providerCheckoutSessionId,
          });
        } catch (caught) {
          compensationError = caught;
        }
      }
      await ctx.runMutation(
        internal.communityCommerce.expirePublicCommunityCheckoutSessionInternal as any,
        {
          sessionId,
          nowMs: Date.now(),
        },
      );
      if (compensationError) throw compensationError;
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
    if (session.mode === "community_join" && session.communityId) {
      const community = (await ctx.db.get(session.communityId)) as CommunityLike | null;
      let lifecycleIsCurrent = false;
      if (community) {
        try {
          requireActiveCommunity(community);
          requireMatchingCommunityLifecycleGeneration({
            community,
            expectedGeneration: session.communityLifecycleGeneration,
            errorCode: "community_checkout_lifecycle_stale",
          });
          lifecycleIsCurrent = true;
        } catch {
          lifecycleIsCurrent = false;
        }
      }
      if (!lifecycleIsCurrent) {
        return {
          ok: false,
          status: "expired",
          message: "community_checkout_lifecycle_stale",
        };
      }
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
