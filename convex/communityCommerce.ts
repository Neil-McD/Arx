import { internal } from "./_generated/api";
import { enrollWorkflowMilestoneTimers } from "./communityMemberWorkflowTimerCore";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getStripeClient,
  requireStripeConnectWebhookConfiguration,
} from "./stripeCore";
import {
  fillCheckoutSuccessUrl,
  type CommunityLike,
  type CommunityPricePointLike,
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
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  communitySubscriptionStatusGrantsAccess,
  normalizeCommunitySubscriptionStatus,
  parseIsoMs,
  requireCommunityChatAccess,
  requireCommunityUserNotBlocked,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import { enqueueCommunityBillingIssueEmailInternal } from "./emailEvents";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import {
  attachCommunityCheckoutToUser,
  checkoutAlreadyGranted,
  guestCheckoutAllowed,
  settleCommunityCheckout,
  sha256Hex,
  verifiedUserIdForEmail,
} from "./communityCheckoutBuyer";
import { normalizeAuthRelinkEmail } from "../shared/authRelinkPolicy";
import {
  canReceiveCommunityRevenue,
  getStripeConnectDestinationAccountId,
  type StripeConnectRevenueDestinationLike,
} from "./stripeConnectAccountCore";
import { POLYNET_COMMUNITY_PLATFORM_FEE_BPS } from "../shared/founderPlan";
import { requireCommunityProviderAccountMatch } from "./communityCommerceCore";
import {
  communityIsActive,
  communityLifecycleGenerationMatches,
  normalizeCommunityLifecycle,
} from "../shared/communityLifecycle";
import {
  cancelAndRefundDuplicateSubscription,
  cancelStripeSubscriptionIfActive,
  expireStripeCheckoutSessionIfOpen,
} from "./stripeSubscriptionCancellation";
import { requireCommunityBuilderAccess } from "./communityBuilderAccessCore";

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
  createdAt: number;
  updatedAt: number;
};

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
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const source = args.source;
    const providerAccountId = String(args.providerAccountId ?? "").trim();
    if (source === "stripe" && !providerAccountId) {
      throw new Error("community_subscription_provider_account_required");
    }
    const normalizedStatus = normalizeCommunitySubscriptionStatus(args.status);
    if (!normalizedStatus) throw new Error("community_subscription_status_invalid");
    let status = normalizedStatus;
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    // Archive freezes membership state. Provider webhooks remain valid billing
    // evidence, but they cannot reactivate or revoke the frozen product model.
    // The archive billing worker owns the terminal local subscription write.
    if (!communityIsActive(community)) {
      return {
        ok: true,
        ignored: true,
        reason: "community_archived",
        community_id: String(args.communityId),
        user_id: String(args.userId),
        subscription_status: "ended",
      };
    }
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
          source !== "stripe" ||
          String(row.providerAccountId ?? "").trim() === providerAccountId
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
    const currentProviderAccountId = String(current?.providerAccountId ?? "").trim();
    if (
      source === "stripe" &&
      currentProviderAccountId &&
      currentProviderAccountId !== providerAccountId
    ) {
      throw new Error("community_subscription_provider_account_mismatch");
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
    let cancelAtPeriodEnd =
      args.cancelAtPeriodEnd === null
        ? false
        : Boolean(args.cancelAtPeriodEnd ?? current?.cancelAtPeriodEnd);
    // The member left (cancelRequestedAt) but Stripe still says it renews: keep
    // their leave (billing stops at the period's end) and ask Stripe again.
    const cancelRequestedAt = typeof current?.cancelRequestedAt === "number" ? current.cancelRequestedAt : null;
    let reCancel = false;
    // Only for the very subscription they left: a later purchase is a new subscription.
    const sameSubscription = String(args.providerSubscriptionId ?? "").trim() !== ""
      && String(args.providerSubscriptionId).trim() === String(current?.providerSubscriptionId ?? "").trim();
    if (cancelRequestedAt !== null && sameSubscription && status === "active" && !cancelAtPeriodEnd) {
      status = "cancel_at_period_end";
      cancelAtPeriodEnd = true;
      reCancel = Boolean(String(args.providerSubscriptionId ?? current?.providerSubscriptionId ?? "").trim());
    }
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
      updatedAt: nowMs,
    };

    if (reCancel) {
      await ctx.scheduler.runAfter(0, internal.communityAdmin.cancelCommunitySubscriptionsAtPeriodEndInternal, {
        targets: [{ providerSubscriptionId: String(nextProviderSubscriptionId), providerAccountId: providerAccountId || current?.providerAccountId || null }],
      });
    }
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
    const wasActive = communityMembershipRowIsActive(membership);
    const willBeActive = !shouldPreserveRiskRevocation && grantsAccess;
    const updatedMembership = {
      ...membership,
      pricePointId,
      active: willBeActive,
      activationSequence:
        !wasActive && willBeActive
          ? Math.max(0, Math.floor(Number(membership.activationSequence ?? 0))) + 1
          : membership.activationSequence,
      activatedAt:
        !wasActive && willBeActive ? nowMs : membership.activatedAt,
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
      activationSequence: updatedMembership.activationSequence,
      activatedAt: updatedMembership.activatedAt,
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
    if (!wasActive && willBeActive) {
      await enrollWorkflowMilestoneTimers({ ctx, membership: updatedMembership, nowMs });
    }
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
    const lifecycle = normalizeCommunityLifecycle(community);
    if (lifecycle.status !== "active") throw new Error("community_archived");
    await requireCommunityBuilderAccess({ ctx, community, nowMs });
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
      communityLifecycleGeneration: lifecycle.generation,
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
    buyerSecretHash: v.optional(v.string()),
    buyerVisitorHash: v.optional(v.string()),
    expiresAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_not_found");
    if (!communityIsActive(community)) throw new Error("community_archived");
    if (
      !communityLifecycleGenerationMatches(
        community,
        args.communityLifecycleGeneration,
      )
    ) {
      throw new Error("community_lifecycle_generation_mismatch");
    }
    // Every checkout belongs to someone: a signed-in buyer, or the browser that paid.
    if (!args.ownerUserId && !args.buyerSecretHash) throw new Error("checkout_buyer_required");
    if (!args.ownerUserId && !(await guestCheckoutAllowed(ctx, args.communityId, nowMs, args.buyerVisitorHash ?? ""))) {
      throw new Error("community_checkout_unavailable");
    }
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
      ownerUserId: args.ownerUserId,
      buyerSecretHash: args.buyerSecretHash,
      buyerVisitorHash: args.buyerVisitorHash,
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
    const community = (row.communityId
      ? await ctx.db.get(row.communityId)
      : null) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    if (!communityIsActive(community)) throw new Error("community_archived");
    if (
      !communityLifecycleGenerationMatches(
        community,
        row.communityLifecycleGeneration,
      )
    ) {
      throw new Error("community_lifecycle_generation_mismatch");
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
        providerAccountId,
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
    providerAccountId: v.string(),
    providerCheckoutSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    sourceProviderInvoiceId: v.optional(v.union(v.string(), v.null())),
    sourceProviderPaymentIntentId: v.optional(v.union(v.string(), v.null())),
    sourceProviderChargeId: v.optional(v.union(v.string(), v.null())),
    // The email the buyer gave Stripe: who a payment made before signing in is for.
    buyerEmail: v.optional(v.union(v.string(), v.null())),
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
    const community = (row.communityId
      ? await ctx.db.get(row.communityId)
      : null) as CommunityLike | null;
    const lifecycleMatches = Boolean(
      community &&
      communityIsActive(community) &&
      communityLifecycleGenerationMatches(
        community,
        row.communityLifecycleGeneration,
      ),
    );
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
    const communitySubscriptionStatus = normalizeStripeCommunitySubscriptionStatus({
      subscriptionStatus: args.subscriptionStatus,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
    });
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
      status: lifecycleMatches
        ? args.markComplete
          ? "complete"
          : row.status
        : "expired",
      updatedAt: nowMs,
    });
    // Paid: settle it for its buyer. Paid before signing in (cash first), the
    // buyer is whoever Stripe's email belongs to, if that account exists and
    // verified it; otherwise the payment waits for the buyer to sign in.
    if (args.markComplete && lifecycleMatches && row.communityId) {
      const buyerEmail = normalizeAuthRelinkEmail(args.buyerEmail);
      if (!row.ownerUserId && buyerEmail) {
        await ctx.db.patch(row._id, { buyerEmailNormalized: buyerEmail });
        const byEmail = await verifiedUserIdForEmail(ctx, buyerEmail);
        if (byEmail) await attachCommunityCheckoutToUser(ctx, row.sessionId, byEmail, nowMs);
      } else if (row.ownerUserId) {
        await settleCommunityCheckout(ctx, row.sessionId, nowMs, {
          paymentIntentId: String(args.sourceProviderPaymentIntentId ?? "").trim() || null,
          chargeId: String(args.sourceProviderChargeId ?? "").trim() || null,
        });
      }
    }
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
        lifecycleMatches,
        providerAccountId,
        providerPriceId: args.providerPriceId ?? row.providerPriceId ?? null,
        currentPeriodStartAt: args.currentPeriodStartAt ?? row.currentPeriodStartAt ?? null,
        currentPeriodEndAt: args.currentPeriodEndAt ?? row.currentPeriodEndAt ?? null,
      },
      createdAt: nowMs,
    });
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

export const recordStalePublicCommunityCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.string(),
    providerAccountId: v.string(),
    providerCheckoutSessionId: v.string(),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerSubscriptionId: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = (await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.sessionId))
      .first()) as CommunityCheckoutSessionRow | null;
    if (!row || row.mode !== "community_join" || row.status !== "pending") return;
    requireCommunityProviderAccountMatch({
      expectedProviderAccountId: row.providerAccountId,
      actualProviderAccountId: args.providerAccountId,
      missingCode: "provider_account_id_required",
      mismatchCode: "community_checkout_provider_account_mismatch",
    });
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerAccountId: args.providerAccountId,
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      providerCustomerId:
        String(args.providerCustomerId ?? "").trim() || row.providerCustomerId,
      providerSubscriptionId:
        String(args.providerSubscriptionId ?? "").trim() || row.providerSubscriptionId,
      updatedAt: args.nowMs ?? Date.now(),
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
    // Studio's funnel: both return addresses on Studio's own origin.
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "checkout_cancel_url_invalid",
    );
    const successUrl = requireCanonicalCheckoutReturnUrl(
      args.successUrl,
      "checkout_success_url_invalid",
    );
    return await startCommunityJoinCheckoutCore(ctx, {
      communitySlug: args.communitySlug,
      billingPeriod: args.billingPeriod,
      successUrl,
      cancelUrl,
      authSubject: args.authSubject,
    });
  },
});


// The one checkout for a community's paid plan, for Studio's funnel and for
// Join on the community site's private twin. Each caller validates its own
// return addresses first (Studio's origin; the twin's own /join). Access comes
// only from the provider's verified webhook, never from the return.
export async function startCommunityJoinCheckoutCore(
  ctx: any,
  args: {
    communitySlug: string;
    billingPeriod: string;
    successUrl: string;
    cancelUrl: string;
    authSubject?: string;
    // Set only by a caller that verified the session itself (the twin's edge
    // session, in an http action that has no Convex identity of its own).
    trustedUserId?: string;
    // Cash first: a buyer not signed in yet, on a site's private twin. The
    // secret goes back to that browser only (HttpOnly, via the edge); the
    // checkout keeps its hash. Paying, then signing in there (or with the
    // email given to Stripe), makes it theirs.
    guest?: boolean;
    // Who's asking, as the edge saw them (a keyed hash of their address).
    visitorHash?: string;
  },
): Promise<{ ok: true; session_id: string; checkout_url: string; buyer_secret?: string }> {
  const nowMs = Date.now();
  const cancelUrl = args.cancelUrl;
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
    providerAccountId: string;
    platformFeeBps: number;
    oneLiner: string | null;
    communityLifecycleGeneration: number;
  };
  requireStripeConnectWebhookConfiguration();
  const sessionId = newOpaqueToken("chk");
  const expiresAt = nowMs + 14 * 24 * 60 * 60 * 1000;
  let ownerUserId: unknown = null;
  let stripeCustomerId: string | null = null;
  let buyerSecret: string | null = null;
  if (args.guest) {
    // An early answer before any Stripe work; the binding check is where the
    // checkout is recorded (one transaction with the insert).
    if (!(await ctx.runQuery(internal.communityCheckoutBuyer.guestCheckoutAllowedInternal, {
      communityId: checkoutConfig.communityId, nowMs, visitorHash: args.visitorHash,
    }))) {
      throw new Error("community_checkout_unavailable");
    }
    buyerSecret = newOpaqueToken("buyer");
  } else {
    if (!args.authSubject) throw new Error("auth_subject_required");
    // Studio: the caller's verified Polynet identity. The twin: the member its
    // edge-verified session belongs to.
    const actor = (args.trustedUserId
      ? await ctx.runQuery(internal.authActor.resolveAuthenticatedActorByTrustedSubjectInternal as any, {
        authSubject: args.authSubject, userId: args.trustedUserId,
      })
      : await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
        authSubject: args.authSubject,
      })) as { dbUserId?: unknown; email?: string | null } | null;
    ownerUserId = actor?.dbUserId ?? null;
    if (!ownerUserId) throw new Error("auth_subject_required");
    await ctx.runQuery(internal.communityCommerce.requirePublicCommunityCheckoutNotBlockedInternal as any, {
      communityId: checkoutConfig.communityId,
      userId: ownerUserId,
    });
    // Already in (a member, or the owner): no checkout, so nobody pays twice.
    if (await ctx.runQuery(internal.communityCommerce.userHasCommunityAccessInternal, {
      communityId: checkoutConfig.communityId, userId: ownerUserId as any,
    })) {
      throw new Error("already_member");
    }
    // Join's click accepts the terms shown under it and fills the starter profile.
    await ctx.runMutation(internal.starterProfile.acceptCommunityJoinInternal, { userId: ownerUserId as any });
    stripeCustomerId = await ensureCommunityStripeCustomerForUser({
      ctx,
      userId: ownerUserId,
      email: actor?.email ?? null,
      providerAccountId: checkoutConfig.providerAccountId,
      nowMs,
    });
  }
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
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(buyerSecret ? { buyerSecretHash: await sha256Hex(buyerSecret) } : {}),
      ...(args.visitorHash ? { buyerVisitorHash: args.visitorHash } : {}),
      expiresAt,
      nowMs,
    },
  );

  let createdCheckoutSession: any = null;
  try {
    const stripe = getStripeClient();
    const checkoutSession: any = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
      success_url: fillCheckoutSuccessUrl(args.successUrl, sessionId),
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
        community_id: String(checkoutConfig.communityId),
        community_slug: checkoutConfig.communitySlug,
        community_price_point_id: String(checkoutConfig.pricePointId),
        billing_period: billingPeriod,
      },
      subscription_data: {
        application_fee_percent: checkoutConfig.platformFeeBps / 100,
        metadata: {
          local_session_id: sessionId,
            community_id: String(checkoutConfig.communityId),
          community_slug: checkoutConfig.communitySlug,
          community_price_point_id: String(checkoutConfig.pricePointId),
          billing_period: billingPeriod,
        },
      },
    }, {
      stripeAccount: checkoutConfig.providerAccountId,
      idempotencyKey: `community-checkout:${checkoutConfig.providerAccountId}:${sessionId}`,
    });
    createdCheckoutSession = checkoutSession;
    const checkoutUrl: string = String(checkoutSession.url ?? "").trim();
    if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
    await ctx.runMutation(
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
    );
    return {
      ok: true,
      session_id: sessionId,
      checkout_url: checkoutUrl,
      ...(buyerSecret ? { buyer_secret: buyerSecret } : {}),
    };
  } catch (error) {
    let providerCleanupComplete = !createdCheckoutSession?.id;
    if (createdCheckoutSession?.id) {
      try {
        await ctx.runMutation(
          internal.communityCommerce.recordStalePublicCommunityCheckoutSessionInternal as any,
          {
            sessionId,
            providerAccountId: checkoutConfig.providerAccountId,
            providerCheckoutSessionId: createdCheckoutSession.id,
            providerCustomerId:
              typeof createdCheckoutSession.customer === "string"
                ? createdCheckoutSession.customer
                : null,
            providerSubscriptionId:
              typeof createdCheckoutSession.subscription === "string"
                ? createdCheckoutSession.subscription
                : null,
            nowMs: Date.now(),
          },
        );
      } catch (persistenceError) {
        console.error("stale_community_checkout_persistence_failed", {
          sessionId,
          error:
            persistenceError instanceof Error
              ? persistenceError.message
              : String(persistenceError),
        });
      }
      try {
        const expired = await expireStripeCheckoutSessionIfOpen({
          providerCheckoutSessionId: createdCheckoutSession.id,
          providerAccountId: checkoutConfig.providerAccountId,
        });
        if (expired.providerSubscriptionId) {
          await cancelStripeSubscriptionIfActive({
            providerSubscriptionId: expired.providerSubscriptionId,
            providerAccountId: checkoutConfig.providerAccountId,
          });
        }
        providerCleanupComplete = true;
      } catch (cleanupError) {
        console.error("stale_community_checkout_cleanup_failed", {
          sessionId,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }
    }
    if (providerCleanupComplete) {
      await ctx.runMutation(
        internal.communityCommerce.expirePublicCommunityCheckoutSessionInternal as any,
        {
          sessionId,
          nowMs: Date.now(),
        },
      );
    }
    throw error;
  }
}

export const userHasCommunityAccessInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users") },
  handler: async (ctx, args) =>
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId }).then(() => true, () => false),
});

// A second subscription that slipped past the checkout guard (say, two tabs):
// cancel it and refund it in full, retrying with growing gaps (about a day).
const DUPLICATE_REFUND_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000];
export const refundDuplicateCommunitySubscriptionInternal = internalAction({
  args: {
    providerSubscriptionId: v.string(),
    providerAccountId: v.string(),
    paymentIntentId: v.union(v.string(), v.null()),
    chargeId: v.union(v.string(), v.null()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attempt = args.attempt ?? 0;
    try {
      return { ok: true, ...(await cancelAndRefundDuplicateSubscription(args)) };
    } catch (error) {
      console.error("community_duplicate_subscription_refund_failed", {
        providerSubscriptionId: args.providerSubscriptionId, attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      const delay = DUPLICATE_REFUND_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) return { ok: false };
      await ctx.scheduler.runAfter(delay, internal.communityCommerce.refundDuplicateCommunitySubscriptionInternal, { ...args, attempt: attempt + 1 });
      return { ok: false, retrying: true };
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
    return await resolveCheckoutSessionFinalization(ctx, userId, args.sessionId);
  },
});

// Where a checkout stands for its own buyer, read only from what the provider's
// verified webhook recorded (never from a redirect): pending until then, and
// its claim once it grants access. Studio's checkout return and the twin's Join
// both read it.
export async function resolveCheckoutSessionFinalization(ctx: any, userId: any, sessionIdRaw: unknown) {
  const nowMs = Date.now();
  const sessionId = normalizeSessionId(sessionIdRaw);
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
  if (session.status === "expired" || (session.status !== "complete" && session.expiresAt <= nowMs)) {
    return {
      ok: false,
      status: "expired",
      message: "checkout_session_expired",
    };
  }
  if (session.mode === "community_join") {
    const community = session.communityId
      ? await ctx.db.get(session.communityId)
      : null;
    if (
      !community ||
      !communityIsActive(community) ||
      !communityLifecycleGenerationMatches(
        community,
        session.communityLifecycleGeneration,
      )
    ) {
      return {
        ok: false,
        status: "expired",
        message: "checkout_session_inactive",
      };
    }
  }
  if (session.status !== "complete") {
    return {
      ok: true,
      status: "pending",
    };
  }
  const grantsAccess = communitySubscriptionStatusGrantsAccess(
    normalizeCommunitySubscriptionStatus(session.communitySubscriptionStatus ?? "active") ?? "active",
  );
  if (!grantsAccess || (session.mode === "community_join" && !(await checkoutBuyerIsIn(ctx, session)))) {
    return {
      ok: false,
      status: "expired",
      message: "checkout_session_inactive",
    };
  }
  const community = session.communityId ? ((await ctx.db.get(session.communityId)) as CommunityLike | null) : null;
  return {
    ok: true,
    status: "succeeded",
    community_id: session.communityId ? String(session.communityId) : null,
    community_slug: String(community?.slug ?? "") || null,
    // Studio tabs opened before the claims were retired redeem this; the
    // redeem below only confirms it. Next release: removed.
    claim: {
      token: session.sessionId,
    },
  };
}

// Paid and in: the grant happened (or the buyer was already a member, as after
// a refunded second payment). A refused grant (blocked since) is not "in".
async function checkoutBuyerIsIn(ctx: any, session: any): Promise<boolean> {
  if (!session.ownerUserId || !session.communityId) return false;
  return await requireCommunityChatAccess({ ctx, communityId: session.communityId, userId: session.ownerUserId }).then(() => true, () => false);
}

// Retired: Stripe's notice grants membership from the checkout itself. Kept
// one release for Studio tabs opened before then: redeeming a checkout's id
// only confirms the buyer is in and says where; the lists are empty.
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
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", String(args.token ?? "").trim()))
      .first();
    if (!session || session.mode !== "community_join" || String(session.ownerUserId ?? "") !== String(userId)
      || !(await checkoutBuyerIsIn(ctx, session))) {
      throw new Error("claim_not_found");
    }
    const community = (await ctx.db.get(session.communityId as any)) as CommunityLike | null;
    return [{ community_id: String(session.communityId), community_slug: String(community?.slug ?? "") || null }];
  },
});

export const listPendingPurchaseClaims = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async () => [] as Array<{ community_id: string; community_slug: string; community_name: string; expires_at: string }>,
});

export const redeemPendingPurchaseClaims = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async () => [] as Array<{ community_id: string; community_slug: string | null }>,
});
