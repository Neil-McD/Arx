import { api, internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
  POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
  COMMUNITY_BUILDER_ACCESS_GRANDFATHERED,
  founderSubscriptionStatusGrantsAccess,
  parseCommunityBuilderAccessMode,
  type FounderSubscriptionStatus,
} from "../shared/founderPlan";
import { COMMUNITY_FUNDING_POLICY_MANAGED } from "../shared/founderInference";
import { resolveBuilderFundingProjection } from "../shared/builderFunding";
import {
  buildCheckoutCancelUrl,
  buildCheckoutSuccessUrl,
  newOpaqueToken,
  normalizeStripeCommunitySubscriptionStatus,
  requireCanonicalCheckoutReturnUrl,
} from "./billingCore";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { resolveAuthenticatedActor } from "./authActor";
import {
  getFounderSubscriptionByCommunity,
  getFounderSubscriptionByProviderSubscriptionId,
  syncFounderUsageCycle,
  type FounderSubscriptionRow,
} from "./founderPlanCore";
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
  restoreCommunityLifecycle,
} from "../shared/communityLifecycle";
import {
  cancelStripeSubscriptionIfActive,
  expireStripeCheckoutSessionIfOpen,
} from "./stripeSubscriptionCancellation";
import { requireCompletedCommunityArchiveBillingCleanup } from "./communityColdArchive";
import { recordCriticalAuditEvent } from "./criticalAudit";
import {
  FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION,
  hashFounderCheckoutAttemptId,
  hashFounderCheckoutClaimToken,
  hashFounderCheckoutRecoveryEmail,
  requireFounderCheckoutRecoverySecret,
} from "./founderCheckoutReceiptCore";

const FOUNDER_CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;
const FOUNDER_CHECKOUT_CLAIM_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const FOUNDER_RISK_REVOKED_REASONS = new Set([
  "subscription_refunded",
  "subscription_dispute_opened",
  "subscription_dispute_lost",
]);

type FounderRiskSnapshot = {
  state: "clear" | "revoked";
  changedAt: number;
  revokedReason?: string;
};

function normalizeFounderRiskRevokedReason(value: unknown): string {
  return String(value ?? "").trim().slice(0, 160) ||
    "founder_subscription_risk_revoked";
}

function readFounderSubscriptionRiskSnapshot(
  subscription: FounderSubscriptionRow | null | undefined,
): FounderRiskSnapshot {
  if (!subscription) return { state: "clear", changedAt: 0 };
  const revokedReason = String(subscription.revokedReason ?? "").trim();
  const legacyRiskRevoked = FOUNDER_RISK_REVOKED_REASONS.has(revokedReason);
  const state = subscription.riskAccessState ??
    (legacyRiskRevoked ? "revoked" : "clear");
  return {
    state,
    changedAt: Math.floor(Number(
      subscription.riskStateChangedAt ??
      (legacyRiskRevoked ? subscription.lastProviderEventCreatedAt : 0),
    )),
    revokedReason: state === "revoked"
      ? revokedReason || "founder_subscription_risk_revoked"
      : undefined,
  };
}

function readFounderCheckoutRiskSnapshot(checkout: any): FounderRiskSnapshot {
  if (!checkout) return { state: "clear", changedAt: 0 };
  const revokedReason = String(checkout.founderRiskRevokedReason ?? "").trim();
  const state = checkout.founderRiskState ?? (revokedReason ? "revoked" : "clear");
  return {
    state,
    changedAt: Math.floor(Number(checkout.founderRiskStateChangedAt ?? 0)),
    revokedReason: state === "revoked"
      ? revokedReason || "founder_subscription_risk_revoked"
      : undefined,
  };
}

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

async function requireFounderCheckoutLifecycle(
  ctx: any,
  community: any,
) {
  const lifecycle = normalizeCommunityLifecycle(community);
  if (lifecycle.status === "archived") {
    const builderAccessMode = parseCommunityBuilderAccessMode(
      community.builderAccessMode,
    );
    if (!builderAccessMode) {
      throw new Error("community_restore_access_mode_invalid");
    }
    if (builderAccessMode === COMMUNITY_BUILDER_ACCESS_GRANDFATHERED) {
      throw new Error("community_restore_payment_not_required");
    }
    await requireCompletedCommunityArchiveBillingCleanup(
      ctx,
      community._id,
      lifecycle.generation,
    );
  }
  return lifecycle;
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

export const getFounderCheckoutReceiptByClaimHashInternal = internalQuery({
  args: {
    sessionId: v.string(),
    claimTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (
      !row ||
      row.mode !== "founder_subscription" ||
      row.claimTokenHash !== args.claimTokenHash
    ) return null;
    return row;
  },
});

export const createPendingPublicBuilderCheckoutInternal = internalMutation({
  args: {
    sessionId: v.string(),
    claimTokenHash: v.string(),
    checkoutAttemptKeyHash: v.string(),
    expiresAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_mode_attempt_key", (q) =>
        q
          .eq("mode", "founder_subscription")
          .eq("checkoutAttemptKeyHash", args.checkoutAttemptKeyHash),
      )
      .collect();
    const activePending = existing.filter(
      (row) => row.status === "pending" && row.expiresAt > args.nowMs,
    );
    if (activePending.length > 1) {
      throw new Error("founder_subscription_checkout_ambiguous");
    }
    if (activePending.length === 1) {
      const row = activePending[0]!;
      if (row.claimTokenHash !== args.claimTokenHash) {
        throw new Error("founder_checkout_attempt_claim_mismatch");
      }
      return {
        sessionId: row.sessionId,
        providerCheckoutSessionId: row.providerCheckoutSessionId ?? null,
        expiresAt: row.expiresAt,
        reused: true,
      };
    }
    if (existing.some((row) => row.status === "complete")) {
      throw new Error("founder_checkout_attempt_already_complete");
    }
    for (const row of existing) {
      if (row.status === "pending" && row.expiresAt <= args.nowMs) {
        await ctx.db.patch(row._id, { status: "expired", updatedAt: args.nowMs });
      }
    }
    await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      mode: "founder_subscription",
      provider: "stripe",
      claimTokenHash: args.claimTokenHash,
      checkoutAttemptKeyHash: args.checkoutAttemptKeyHash,
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
    const lifecycle = await requireFounderCheckoutLifecycle(ctx, community);
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
    if (!row || row.mode !== "founder_subscription") {
      throw new Error("founder_subscription_checkout_invalid");
    }
    if (row.ownerUserId || row.communityId) {
      if (!row.ownerUserId || !row.communityId) {
        throw new Error("founder_subscription_checkout_identity_incomplete");
      }
      const community = await ctx.db.get(row.communityId);
      if (!community || String(community.ownerId) !== String(row.ownerUserId)) {
        throw new Error("founder_subscription_community_forbidden");
      }
      await requireFounderCheckoutLifecycle(ctx, community);
      if (
        !communityLifecycleGenerationMatches(
          community,
          row.communityLifecycleGeneration,
        )
      ) {
        throw new Error("community_lifecycle_generation_mismatch");
      }
    }
    if (args.providerPriceId !== readFounderStripePriceId()) {
      throw new Error("founder_subscription_price_mismatch");
    }
    if (row.ownerUserId) {
      await attachStripeCustomerToUser({
        ctx,
        userId: row.ownerUserId,
        providerCustomerId: args.providerCustomerId,
        nowMs: args.nowMs,
      });
    }
    await ctx.db.patch(row._id, {
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      providerCustomerId: normalizeOptionalString(args.providerCustomerId),
      providerSubscriptionId: normalizeOptionalString(args.providerSubscriptionId),
      providerPriceId: args.providerPriceId,
      updatedAt: args.nowMs,
    });
  },
});

export const recordStaleFounderStripeCheckoutSessionInternal = internalMutation({
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
      row.status !== "pending"
    ) {
      return;
    }
    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      providerCustomerId:
        normalizeOptionalString(args.providerCustomerId) ?? row.providerCustomerId,
      providerSubscriptionId:
        normalizeOptionalString(args.providerSubscriptionId) ?? row.providerSubscriptionId,
      providerPriceId: args.providerPriceId,
      updatedAt: args.nowMs,
    });
  },
});

export const expireFounderSubscriptionCheckoutInternal = internalMutation({
  args: {
    sessionId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row || row.mode !== "founder_subscription") return;
    if (row.status === "pending") {
      await ctx.db.patch(row._id, {
        status: "expired",
        updatedAt: args.nowMs,
      });
    }
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
  verifiedCheckoutPayment?: boolean;
  providerEventCreatedAt: number;
  allowRiskRestoration?: boolean;
  recoveryEmailHash?: string | null;
  recoveryEmailHashVersion?: "hmac_sha256_v1" | null;
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
  let restoresArchivedCommunity = false;
  if (checkout?.communityId) {
    const checkoutCommunity = checkout.communityId
      ? await args.ctx.db.get(checkout.communityId)
      : null;
    if (
      !checkoutCommunity ||
      !communityLifecycleGenerationMatches(
        checkoutCommunity,
        checkout.communityLifecycleGeneration,
      )
    ) {
      checkout = null;
    } else if (!communityIsActive(checkoutCommunity)) {
      if (args.verifiedCheckoutPayment !== true) {
        checkout = null;
      } else {
        const lifecycle = normalizeCommunityLifecycle(checkoutCommunity);
        await requireCompletedCommunityArchiveBillingCleanup(
          args.ctx,
          checkoutCommunity._id,
          lifecycle.generation,
        );
        restoresArchivedCommunity = true;
      }
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
      if (checkout) {
        if (
          checkout.lastProviderEventCreatedAt &&
          args.providerEventCreatedAt < checkout.lastProviderEventCreatedAt
        ) {
          return { ok: true, ignored: true, reason: "founder_checkout_event_stale" };
        }
        await args.ctx.db.patch(checkout._id, {
          providerCheckoutSessionId:
            normalizeOptionalString(args.providerCheckoutSessionId) ??
            checkout.providerCheckoutSessionId,
          providerCustomerId: normalizeOptionalString(args.providerCustomerId),
          providerSubscriptionId,
          providerPriceId,
          communitySubscriptionStatus: "ended",
          founderRiskState: "revoked",
          founderRiskStateChangedAt: args.providerEventCreatedAt,
          founderRiskRevokedReason: "founder_subscription_price_changed",
          lastProviderEventCreatedAt: args.providerEventCreatedAt,
          status: "complete",
          updatedAt: args.providerEventCreatedAt,
        });
        return {
          ok: true,
          ignored: false,
          founderSubscriptionId: null,
          receiptStatus: "revoked",
          revokedReason: "founder_subscription_price_changed",
        };
      }
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
  if (!ownerUserId && !checkout?.claimTokenHash) {
    throw new Error("founder_subscription_owner_missing");
  }
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
  const community = communityId ? await args.ctx.db.get(communityId) : null;
  if (communityId && !community) throw new Error("founder_subscription_community_missing");
  if (community && String(community.ownerId) !== String(ownerUserId)) {
    throw new Error("founder_subscription_community_owner_mismatch");
  }
  // Only a payment-authoritative checkout event for this exact archived
  // generation may cross the lifecycle boundary. Ordinary subscription
  // webhooks remain billing evidence and cannot restore product access.
  if (community && !communityIsActive(community) && !restoresArchivedCommunity) {
    return { ok: true, ignored: true, reason: "community_archived" };
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
  const riskSnapshot = existing
    ? readFounderSubscriptionRiskSnapshot(existing)
    : readFounderCheckoutRiskSnapshot(checkout);
  const riskRestorationAuthorized = Boolean(
    args.allowRiskRestoration &&
    riskSnapshot.state === "revoked" &&
    args.providerEventCreatedAt > riskSnapshot.changedAt,
  );
  if (
    existing &&
    args.providerEventCreatedAt < existing.lastProviderEventCreatedAt &&
    !riskRestorationAuthorized
  ) {
    return { ok: true, ignored: true, reason: "founder_subscription_event_stale" };
  }
  if (
    checkout?.lastProviderEventCreatedAt &&
    args.providerEventCreatedAt < checkout.lastProviderEventCreatedAt &&
    !riskRestorationAuthorized
  ) {
    return { ok: true, ignored: true, reason: "founder_checkout_event_stale" };
  }
  const cycleStartAt = Math.floor(Number(args.currentPeriodStartAt ?? 0));
  const cycleEndAt = Math.floor(Number(args.currentPeriodEndAt ?? 0));
  if (!(cycleStartAt > 0) || !(cycleEndAt > cycleStartAt)) {
    throw new Error("founder_subscription_cycle_invalid");
  }
  if (!providerCustomerId) throw new Error("founder_subscription_customer_missing");
  const incomingStatus = normalizeFounderSubscriptionStatus(args.subscriptionStatus);
  const preserveRiskRevocation =
    riskSnapshot.state === "revoked" && !riskRestorationAuthorized;
  const nextRiskState = riskRestorationAuthorized ? "clear" : riskSnapshot.state;
  const nextRiskStateChangedAt = riskRestorationAuthorized
    ? args.providerEventCreatedAt
    : riskSnapshot.changedAt || undefined;
  const nextLifecycleCursor = Math.max(
    args.providerEventCreatedAt,
    Number(existing?.lastProviderEventCreatedAt ?? checkout?.lastProviderEventCreatedAt ?? 0),
  );
  const status = preserveRiskRevocation
    ? existing?.status ?? checkout?.communitySubscriptionStatus ?? "ended"
    : incomingStatus;
  if (
    restoresArchivedCommunity &&
    !founderSubscriptionStatusGrantsAccess({
      status,
      currentPeriodEndAt: cycleEndAt,
      nowMs: args.providerEventCreatedAt,
    })
  ) {
    return {
      ok: true,
      ignored: true,
      reason: "community_restore_subscription_inactive",
    };
  }
  const endedAt = preserveRiskRevocation
    ? existing?.endedAt ?? args.providerEventCreatedAt
    : status === "canceled" || status === "ended"
      ? args.providerEventCreatedAt
      : undefined;
  const revokedReason = preserveRiskRevocation
    ? riskSnapshot.revokedReason
    : endedAt
      ? "provider_subscription_ended"
      : undefined;
  if (!ownerUserId) {
    if (!checkout?.claimTokenHash) throw new Error("founder_checkout_claim_missing");
    const grantsAccess = founderSubscriptionStatusGrantsAccess({
      status,
      currentPeriodEndAt: cycleEndAt,
      nowMs: args.providerEventCreatedAt,
    });
    await args.ctx.db.patch(checkout._id, {
      providerCheckoutSessionId:
        normalizeOptionalString(args.providerCheckoutSessionId) ??
        checkout.providerCheckoutSessionId,
      providerCustomerId,
      providerSubscriptionId,
      providerPriceId,
      currentPeriodStartAt: cycleStartAt,
      currentPeriodEndAt: cycleEndAt,
      communitySubscriptionStatus: status,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd === true,
      recoveryEmailHash:
        normalizeOptionalString(args.recoveryEmailHash) ?? checkout.recoveryEmailHash,
      recoveryEmailHashVersion:
        args.recoveryEmailHashVersion ?? checkout.recoveryEmailHashVersion,
      founderRiskState: nextRiskStateChangedAt === undefined ? undefined : nextRiskState,
      founderRiskStateChangedAt: nextRiskStateChangedAt,
      founderRiskRevokedReason:
        nextRiskState === "revoked" ? riskSnapshot.revokedReason : undefined,
      lastProviderEventCreatedAt: nextLifecycleCursor,
      status: "complete",
      expiresAt: Math.max(
        checkout.expiresAt,
        args.providerEventCreatedAt + FOUNDER_CHECKOUT_CLAIM_TTL_MS,
      ),
      updatedAt: args.providerEventCreatedAt,
    });
    return {
      ok: true,
      ignored: false,
      founderSubscriptionId: null,
      usageCycleId: null,
      ownerUserId: null,
      communityId: null,
      subscriptionStatus: status,
      receiptStatus: grantsAccess ? "paid_unclaimed" : "revoked",
    };
  }
  await attachStripeCustomerToUser({
    ctx: args.ctx,
    userId: ownerUserId,
    providerCustomerId,
    nowMs: args.providerEventCreatedAt,
  });
  let subscription: FounderSubscriptionRow;
  if (existing) {
    await args.ctx.db.patch(existing._id as any, {
      attachedAt: existing.communityId
        ? existing.attachedAt ?? args.providerEventCreatedAt
        : existing.attachedAt,
      providerCustomerId,
      providerPriceId,
      status,
      currentPeriodStartAt: cycleStartAt,
      currentPeriodEndAt: cycleEndAt,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd === true,
      endedAt,
      revokedReason,
      riskAccessState: nextRiskStateChangedAt === undefined ? undefined : nextRiskState,
      riskStateChangedAt: nextRiskStateChangedAt,
      lastProviderEventCreatedAt: nextLifecycleCursor,
      updatedAt: Math.max(existing.updatedAt, args.providerEventCreatedAt),
    });
    subscription = {
      ...existing,
      attachedAt: existing.communityId
        ? existing.attachedAt ?? args.providerEventCreatedAt
        : existing.attachedAt,
      providerCustomerId,
      providerPriceId,
      status,
      currentPeriodStartAt: cycleStartAt,
      currentPeriodEndAt: cycleEndAt,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd === true,
      endedAt,
      revokedReason,
      riskAccessState: nextRiskStateChangedAt === undefined ? undefined : nextRiskState,
      riskStateChangedAt: nextRiskStateChangedAt,
      lastProviderEventCreatedAt: nextLifecycleCursor,
      updatedAt: Math.max(existing.updatedAt, args.providerEventCreatedAt),
    };
  } else {
    const id = await args.ctx.db.insert("founderSubscriptions", {
      ownerUserId,
      communityId: communityId ?? undefined,
      attachedAt: communityId ? args.providerEventCreatedAt : undefined,
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
      riskAccessState: nextRiskStateChangedAt === undefined ? undefined : nextRiskState,
      riskStateChangedAt: nextRiskStateChangedAt,
      lastProviderEventCreatedAt: nextLifecycleCursor,
      createdAt: args.providerEventCreatedAt,
      updatedAt: args.providerEventCreatedAt,
    });
    subscription = (await args.ctx.db.get(id)) as FounderSubscriptionRow;
  }
  const usageCycle = subscription.communityId
    ? await syncFounderUsageCycle({
        ctx: args.ctx,
        subscription,
        cycleStartAt,
        cycleEndAt,
        pricing: requireFounderInferencePricingFromEnv(),
        nowMs: args.providerEventCreatedAt,
      })
    : null;
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
      founderRiskState: nextRiskStateChangedAt === undefined ? undefined : nextRiskState,
      founderRiskStateChangedAt: nextRiskStateChangedAt,
      founderRiskRevokedReason:
        nextRiskState === "revoked" ? riskSnapshot.revokedReason : undefined,
      lastProviderEventCreatedAt: nextLifecycleCursor,
      status: "complete",
      updatedAt: args.providerEventCreatedAt,
    });
  }
  let restoredLifecycleGeneration: number | null = null;
  if (communityId && community && restoresArchivedCommunity) {
    const transition = restoreCommunityLifecycle(community);
    if (!transition.changed) {
      throw new Error("community_restore_lifecycle_conflict");
    }
    restoredLifecycleGeneration = transition.next.generation;
    await args.ctx.db.patch(communityId, {
      lifecycleStatus: transition.next.status,
      lifecycleGeneration: transition.next.generation,
      inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED,
      updatedAt: args.providerEventCreatedAt,
    });
    await recordCriticalAuditEvent(args.ctx, {
      eventKey: `community_restored:${String(communityId)}:${transition.next.generation}`,
      eventType: "community_restored",
      status: "succeeded",
      actorUserId: ownerUserId,
      communityId,
      checkoutSessionId: checkout?.sessionId ?? null,
      provider: "stripe",
      providerObjectId: providerSubscriptionId,
      metadata: { lifecycleGeneration: transition.next.generation },
      createdAt: args.providerEventCreatedAt,
    });
  } else if (communityId) {
    await args.ctx.db.patch(communityId, {
      inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED,
      updatedAt: args.providerEventCreatedAt,
    });
  }
  return {
    ok: true,
    ignored: false,
    founderSubscriptionId: subscription._id,
    usageCycleId: usageCycle?._id ?? null,
    ownerUserId,
    communityId: communityId ?? null,
    subscriptionStatus: status,
    communityRestored: restoresArchivedCommunity,
    lifecycleGeneration: restoredLifecycleGeneration,
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
    verifiedCheckoutPayment: v.optional(v.boolean()),
    providerEventCreatedAt: v.number(),
    allowRiskRestoration: v.optional(v.boolean()),
    recoveryEmailHash: v.optional(v.union(v.string(), v.null())),
    recoveryEmailHashVersion: v.optional(
      v.union(v.literal("hmac_sha256_v1"), v.null()),
    ),
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
    const revokedReason = normalizeFounderRiskRevokedReason(args.revokedReason);
    const createsDurableRiskHold = FOUNDER_RISK_REVOKED_REASONS.has(revokedReason);
    const existing = await getFounderSubscriptionByProviderSubscriptionId(
      ctx,
      args.providerSubscriptionId,
    );
    if (!existing) {
      const checkouts = await ctx.db
        .query("checkoutSessions")
        .withIndex("by_providerSubscriptionId", (q) =>
          q.eq("providerSubscriptionId", args.providerSubscriptionId),
        )
        .take(2);
      if (checkouts.length > 1) {
        throw new Error("founder_checkout_subscription_ambiguous");
      }
      const checkout = checkouts[0] ?? null;
      if (!checkout || checkout.mode !== "founder_subscription") {
        return { ok: true, ignored: true, reason: "founder_subscription_not_found" };
      }
      const riskSnapshot = readFounderCheckoutRiskSnapshot(checkout);
      if (!createsDurableRiskHold) {
        if (riskSnapshot.state === "revoked") {
          return { ok: true, ignored: true, reason: "founder_risk_revocation_preserved" };
        }
        if (
          checkout.lastProviderEventCreatedAt &&
          args.providerEventCreatedAt < checkout.lastProviderEventCreatedAt
        ) {
          return { ok: true, ignored: true, reason: "founder_checkout_event_stale" };
        }
        await ctx.db.patch(checkout._id, {
          communitySubscriptionStatus: args.status,
          lastProviderEventCreatedAt: args.providerEventCreatedAt,
          updatedAt: Math.max(checkout.updatedAt, args.providerEventCreatedAt),
        });
        return {
          ok: true,
          ignored: false,
          founderSubscriptionId: null,
          subscriptionStatus: args.status,
          receiptStatus: "revoked",
          revokedReason,
        };
      }
      if (args.providerEventCreatedAt < riskSnapshot.changedAt) {
        return { ok: true, ignored: true, reason: "founder_risk_event_stale" };
      }
      if (
        args.providerEventCreatedAt === riskSnapshot.changedAt &&
        riskSnapshot.state === "revoked"
      ) {
        return { ok: true, ignored: true, reason: "founder_risk_event_duplicate" };
      }
      await ctx.db.patch(checkout._id, {
        communitySubscriptionStatus: args.status,
        founderRiskState: "revoked",
        founderRiskStateChangedAt: args.providerEventCreatedAt,
        founderRiskRevokedReason: revokedReason,
        lastProviderEventCreatedAt: Math.max(
          Number(checkout.lastProviderEventCreatedAt ?? 0),
          args.providerEventCreatedAt,
        ),
        updatedAt: Math.max(checkout.updatedAt, args.providerEventCreatedAt),
      });
      return {
        ok: true,
        ignored: false,
        founderSubscriptionId: null,
        subscriptionStatus: args.status,
        receiptStatus: "revoked",
        revokedReason,
      };
    }
    const riskSnapshot = readFounderSubscriptionRiskSnapshot(existing);
    if (!createsDurableRiskHold) {
      if (riskSnapshot.state === "revoked") {
        return { ok: true, ignored: true, reason: "founder_risk_revocation_preserved" };
      }
      if (args.providerEventCreatedAt < existing.lastProviderEventCreatedAt) {
        return { ok: true, ignored: true, reason: "founder_subscription_event_stale" };
      }
      if (existing.communityId) {
        const community = await ctx.db.get(existing.communityId as any) as any;
        if (!community || !communityIsActive(community)) {
          return { ok: true, ignored: true, reason: "community_archived" };
        }
      }
      await ctx.db.patch(existing._id, {
        status: args.status,
        endedAt: args.status === "ended" ? args.providerEventCreatedAt : undefined,
        revokedReason,
        lastProviderEventCreatedAt: args.providerEventCreatedAt,
        updatedAt: Math.max(existing.updatedAt, args.providerEventCreatedAt),
      });
      return {
        ok: true,
        ignored: false,
        founderSubscriptionId: existing._id,
        subscriptionStatus: args.status,
        revokedReason,
      };
    }
    if (args.providerEventCreatedAt < riskSnapshot.changedAt) {
      return { ok: true, ignored: true, reason: "founder_risk_event_stale" };
    }
    if (
      args.providerEventCreatedAt === riskSnapshot.changedAt &&
      riskSnapshot.state === "revoked"
    ) {
      return { ok: true, ignored: true, reason: "founder_risk_event_duplicate" };
    }
    await ctx.db.patch(existing._id, {
      status: args.status,
      endedAt: args.status === "ended" ? args.providerEventCreatedAt : undefined,
      revokedReason,
      riskAccessState: "revoked",
      riskStateChangedAt: args.providerEventCreatedAt,
      lastProviderEventCreatedAt: Math.max(
        existing.lastProviderEventCreatedAt,
        args.providerEventCreatedAt,
      ),
      updatedAt: Math.max(existing.updatedAt, args.providerEventCreatedAt),
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
    const [communities, subscriptions, operatorComped] = await Promise.all([
      ctx.db
        .query("communities")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerUserId))
        .collect(),
      ctx.db
        .query("founderSubscriptions")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      hasPlatformOwnerComplimentaryAccess(ctx, ownerUserId),
    ]);
    const rows = await Promise.all(
      communities
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (community) => {
          const lifecycle = normalizeCommunityLifecycle(community);
          const [subscription, pendingCheckouts, archiveJobs] =
            await Promise.all([
              getFounderSubscriptionByCommunity(ctx, community._id, nowMs),
              ctx.db
                .query("checkoutSessions")
                .withIndex("by_community_status", (q) =>
                  q.eq("communityId", community._id).eq("status", "pending"),
                )
                .collect(),
              ctx.db
                .query("communityArchiveBillingJobs")
                .withIndex("by_community_generation", (q) =>
                  q
                    .eq("communityId", community._id)
                    .eq("lifecycleGeneration", lifecycle.generation),
                )
                .take(2),
            ]);
          if (archiveJobs.length > 1) {
            throw new Error("community_archive_billing_job_ambiguous");
          }
          const archiveJob = archiveJobs[0] ?? null;
          const builderAccessMode = parseCommunityBuilderAccessMode(
            community.builderAccessMode,
          );
          const pendingCheckout = pendingCheckouts
            .filter(
              (checkout) =>
                checkout.mode === "founder_subscription" &&
                checkout.expiresAt > nowMs &&
                communityLifecycleGenerationMatches(
                  community,
                  checkout.communityLifecycleGeneration,
                ),
            )
            .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
          const fundingProjection = resolveBuilderFundingProjection({
            operatorComplimentaryAccess: operatorComped,
            checkoutPending: Boolean(pendingCheckout),
            subscription: subscription
              ? {
                  status: subscription.status,
                  currentPeriodEndAt: subscription.currentPeriodEndAt,
                }
              : null,
            nowMs,
          });
          let status:
            | "operator_comped"
            | "managed_required"
            | "managed_checkout_pending"
            | "archived"
            | FounderSubscriptionStatus;
          if (lifecycle.status === "archived") {
            status = "archived";
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
          } else if (operatorComped) {
            status = "operator_comped";
          } else {
            status = "managed_required";
          }
          return {
            community_id: String(community._id),
            community_name: community.name,
            community_slug: community.slug,
            lifecycle_status: lifecycle.status,
            lifecycle_generation: lifecycle.generation,
            archive_billing_cleanup_status:
              lifecycle.status === "archived"
                ? archiveJob?.status ?? "pending"
                : null,
            builder_access_mode: builderAccessMode ?? "invalid",
            funding_lane: fundingProjection.lane,
            funding_state: fundingProjection.state,
            allowed_actions:
              lifecycle.status === "active"
                ? fundingProjection.allowedActions
                : archiveJob?.status === "complete" &&
                    !operatorComped &&
                    builderAccessMode === "subscription_required"
                  ? ["buy_builder" as const]
                  : [],
            funding_mode: subscription
              ? "managed"
              : operatorComped
                ? "operator_comp"
                : "managed",
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
    const unassignedSubscriptions = (subscriptions as FounderSubscriptionRow[])
      .filter(
        (subscription) =>
          !subscription.communityId &&
          subscription.riskAccessState !== "revoked" &&
          subscription.status !== "canceled" &&
          subscription.status !== "ended",
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((subscription) => ({
        subscription_id: String(subscription._id),
        status: subscription.status,
        grants_setup: founderSubscriptionStatusGrantsAccess({
          status: subscription.status,
          currentPeriodEndAt: subscription.currentPeriodEndAt,
          nowMs,
        }),
        monthly_price_base_units: POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
        current_period_start_at: new Date(subscription.currentPeriodStartAt).toISOString(),
        current_period_end_at: new Date(subscription.currentPeriodEndAt).toISOString(),
        cancel_at_period_end: subscription.cancelAtPeriodEnd === true,
      }));
    return {
      monthly_price_base_units: POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
      communities: rows,
      unassigned_subscriptions: unassignedSubscriptions,
      managed_monthly_total_base_units: rows.filter(
        (row) =>
          row.lifecycle_status === "active" &&
          row.funding_mode === "managed" &&
          row.subscription_id !== null &&
          row.status !== "canceled" &&
          row.status !== "ended",
      ).length * POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS +
        unassignedSubscriptions.filter((subscription) => subscription.grants_setup).length *
          POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
    };
  },
});

export const getFounderBillingPortalTargetInternal = internalQuery({
  args: {
    ownerUserId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    founderSubscriptionId: v.optional(v.id("founderSubscriptions")),
  },
  handler: async (ctx, args) => {
    if (Boolean(args.communityId) === Boolean(args.founderSubscriptionId)) {
      throw new Error("founder_billing_portal_target_invalid");
    }
    let subscription: FounderSubscriptionRow | null = null;
    if (args.communityId) {
      const community = await ctx.db.get(args.communityId);
      if (!community || String(community.ownerId) !== String(args.ownerUserId)) {
        throw new Error("founder_subscription_community_forbidden");
      }
      subscription = await getFounderSubscriptionByCommunity(
        ctx,
        args.communityId,
        Date.now(),
      );
    } else if (args.founderSubscriptionId) {
      const target = (await ctx.db.get(
        args.founderSubscriptionId,
      )) as FounderSubscriptionRow | null;
      if (
        !target ||
        target.communityId ||
        String(target.ownerUserId) !== String(args.ownerUserId)
      ) {
        throw new Error("founder_subscription_forbidden");
      }
      subscription = target;
    }
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
    communityId: v.optional(v.id("communities")),
    founderSubscriptionId: v.optional(v.id("founderSubscriptions")),
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
      {
        ownerUserId: actor.dbUserId,
        communityId: args.communityId,
        founderSubscriptionId: args.founderSubscriptionId,
      },
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
    let checkoutSession: any = null;
    try {
      checkoutSession = await getStripeClient().checkout.sessions.create({
        mode: "subscription",
        customer: providerCustomerId,
        success_url: buildCheckoutSuccessUrl(successUrl, sessionId),
        cancel_url: buildCheckoutCancelUrl(cancelUrl, prepared.sessionId),
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
    } catch (error) {
      let providerCleanupComplete = !checkoutSession?.id;
      if (checkoutSession?.id) {
        try {
          await ctx.runMutation(
            (internal as any).founderBilling.recordStaleFounderStripeCheckoutSessionInternal,
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
        } catch (persistenceError) {
          console.error("stale_founder_checkout_persistence_failed", {
            sessionId,
            error:
              persistenceError instanceof Error
                ? persistenceError.message
                : String(persistenceError),
          });
        }
        try {
          const expired = await expireStripeCheckoutSessionIfOpen({
            providerCheckoutSessionId: checkoutSession.id,
          });
          if (expired.providerSubscriptionId) {
            await cancelStripeSubscriptionIfActive({
              providerSubscriptionId: expired.providerSubscriptionId,
            });
          }
          providerCleanupComplete = true;
        } catch (cleanupError) {
          console.error("stale_founder_checkout_cleanup_failed", {
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
          (internal as any).founderBilling.expireFounderSubscriptionCheckoutInternal,
          { sessionId, nowMs: Date.now() },
        );
      }
      throw error;
    }
  },
});

// Canonical public Builder entry: payment first, account and community second.
// Kept separate from startFounderSubscriptionCheckout so cached authenticated
// clients retain their existing community-scoped contract.
export const startPublicBuilderCheckout = action({
  args: {
    checkoutAttemptId: v.string(),
    claimToken: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    requireFounderInferencePricingFromEnv();
    requireFounderCheckoutRecoverySecret();
    const successUrl = requireCanonicalCheckoutReturnUrl(
      args.successUrl,
      "founder_subscription_success_url_invalid",
    );
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "founder_subscription_cancel_url_invalid",
    );
    const nowMs = Date.now();
    const providerPriceId = await verifyFounderStripePrice();
    const prepared = (await ctx.runMutation(
      (internal as any).founderBilling.createPendingPublicBuilderCheckoutInternal,
      {
        sessionId: newOpaqueToken("founder"),
        claimTokenHash: await hashFounderCheckoutClaimToken(args.claimToken),
        checkoutAttemptKeyHash: await hashFounderCheckoutAttemptId(
          args.checkoutAttemptId,
        ),
        expiresAt: nowMs + FOUNDER_CHECKOUT_TTL_MS,
        nowMs,
      },
    )) as {
      sessionId: string;
      providerCheckoutSessionId?: string | null;
      expiresAt: number;
    };
    if (prepared.providerCheckoutSessionId) {
      const existingCheckout: any = await getStripeClient().checkout.sessions.retrieve(
        prepared.providerCheckoutSessionId,
      );
      const checkoutUrl = String(existingCheckout?.url ?? "").trim();
      if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
      return { ok: true, session_id: prepared.sessionId, checkout_url: checkoutUrl };
    }
    let checkoutSession: any = null;
    try {
      const metadata = {
        local_session_id: prepared.sessionId,
        checkout_mode: "founder_subscription",
        offer_version: "polynet_builder_79_monthly_v1",
      };
      checkoutSession = await getStripeClient().checkout.sessions.create({
        mode: "subscription",
        success_url: buildCheckoutSuccessUrl(successUrl, prepared.sessionId),
        cancel_url: buildCheckoutCancelUrl(cancelUrl, prepared.sessionId),
        expires_at: Math.floor(prepared.expiresAt / 1000),
        client_reference_id: prepared.sessionId,
        line_items: [{ price: providerPriceId, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
      }, {
        idempotencyKey: `founder-subscription-checkout:${prepared.sessionId}`,
      });
      const checkoutUrl = String(checkoutSession.url ?? "").trim();
      if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
      await ctx.runMutation(
        (internal as any).founderBilling.attachFounderStripeCheckoutSessionInternal,
        {
          sessionId: prepared.sessionId,
          providerCheckoutSessionId: checkoutSession.id,
          providerCustomerId:
            typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
          providerSubscriptionId:
            typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : null,
          providerPriceId,
          nowMs: Date.now(),
        },
      );
      return { ok: true, session_id: prepared.sessionId, checkout_url: checkoutUrl };
    } catch (error) {
      let providerCleanupComplete = !checkoutSession?.id;
      if (checkoutSession?.id) {
        try {
          await ctx.runMutation(
            (internal as any).founderBilling.recordStaleFounderStripeCheckoutSessionInternal,
            {
              sessionId: prepared.sessionId,
              providerCheckoutSessionId: checkoutSession.id,
              providerCustomerId:
                typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
              providerSubscriptionId:
                typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : null,
              providerPriceId,
              nowMs: Date.now(),
            },
          );
        } catch (persistenceError) {
          console.error("stale_public_builder_checkout_persistence_failed", {
            sessionId: prepared.sessionId,
            error: persistenceError instanceof Error
              ? persistenceError.message
              : String(persistenceError),
          });
        }
        try {
          const expired = await expireStripeCheckoutSessionIfOpen({
            providerCheckoutSessionId: checkoutSession.id,
          });
          if (expired.providerSubscriptionId) {
            await cancelStripeSubscriptionIfActive({
              providerSubscriptionId: expired.providerSubscriptionId,
            });
          }
          providerCleanupComplete = true;
        } catch (cleanupError) {
          console.error("stale_public_builder_checkout_cleanup_failed", {
            sessionId: prepared.sessionId,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
        }
      }
      if (providerCleanupComplete) {
        await ctx.runMutation(
          (internal as any).founderBilling.expireFounderSubscriptionCheckoutInternal,
          { sessionId: prepared.sessionId, nowMs: Date.now() },
        );
      }
      throw error;
    }
  },
});

export const getFounderCheckoutReceiptStatus = action({
  args: {
    sessionId: v.string(),
    claimToken: v.string(),
  },
  handler: async (ctx, args) => {
    const receipt = (await ctx.runQuery(
      (internal as any).founderBilling.getFounderCheckoutReceiptByClaimHashInternal,
      {
        sessionId: String(args.sessionId ?? "").trim(),
        claimTokenHash: await hashFounderCheckoutClaimToken(args.claimToken),
      },
    )) as any;
    if (!receipt) throw new Error("founder_checkout_receipt_not_found");
    const nowMs = Date.now();
    if (receipt.ownerUserId && receipt.founderSubscriptionId) {
      return { ok: true, status: "claimed" as const };
    }
    if (receipt.status === "complete") {
      const grantsAccess = Boolean(
        receipt.communitySubscriptionStatus &&
        receipt.currentPeriodEndAt &&
        founderSubscriptionStatusGrantsAccess({
          status: receipt.communitySubscriptionStatus,
          currentPeriodEndAt: receipt.currentPeriodEndAt,
          nowMs,
        }),
      );
      if (!grantsAccess || receipt.founderRiskState === "revoked") {
        return { ok: true, status: "revoked" as const };
      }
      if (
        receipt.providerCustomerId &&
        receipt.providerSubscriptionId &&
        receipt.lastProviderEventCreatedAt
      ) {
        return {
          ok: true,
          status: "paid_unclaimed" as const,
          verified_at: new Date(receipt.lastProviderEventCreatedAt).toISOString(),
          expires_at: new Date(receipt.currentPeriodEndAt).toISOString(),
        };
      }
    }
    if (receipt.expiresAt <= nowMs || receipt.status === "expired") {
      return { ok: true, status: "expired" as const };
    }
    return { ok: true, status: "pending_payment" as const };
  },
});

async function claimFounderCheckoutReceiptForOwner(args: {
  ctx: any;
  receipt: any;
  ownerUserId: any;
  nowMs: number;
}) {
  const { ctx, receipt, ownerUserId, nowMs } = args;
  if (receipt.ownerUserId && String(receipt.ownerUserId) !== String(ownerUserId)) {
    throw new Error("founder_checkout_receipt_already_claimed");
  }
  if (receipt.founderSubscriptionId) {
    const existing = (await ctx.db.get(
      receipt.founderSubscriptionId,
    )) as FounderSubscriptionRow | null;
    if (!existing || String(existing.ownerUserId) !== String(ownerUserId)) {
      throw new Error("founder_checkout_receipt_claim_invalid");
    }
    return {
      ok: true,
      founder_subscription_id: String(existing._id),
      already_claimed: true,
    };
  }
  const subscriptionStatus = receipt.communitySubscriptionStatus;
  if (
    receipt.status !== "complete" ||
    receipt.founderRiskState === "revoked" ||
    !subscriptionStatus ||
    !receipt.currentPeriodStartAt ||
    !receipt.currentPeriodEndAt ||
    !founderSubscriptionStatusGrantsAccess({
      status: subscriptionStatus,
      currentPeriodEndAt: receipt.currentPeriodEndAt,
      nowMs,
    })
  ) {
    if (receipt.status !== "complete" && receipt.expiresAt <= nowMs) {
      throw new Error("founder_checkout_receipt_expired");
    }
    throw new Error("founder_checkout_payment_not_verified");
  }
  const providerCustomerId = String(receipt.providerCustomerId ?? "").trim();
  const providerSubscriptionId = String(receipt.providerSubscriptionId ?? "").trim();
  const providerPriceId = String(receipt.providerPriceId ?? "").trim();
  if (!providerCustomerId || !providerSubscriptionId || !providerPriceId) {
    throw new Error("founder_checkout_provider_identity_missing");
  }
  const existingProviderSubscription = await getFounderSubscriptionByProviderSubscriptionId(
    ctx,
    providerSubscriptionId,
  );
  if (existingProviderSubscription) {
    if (String(existingProviderSubscription.ownerUserId) !== String(ownerUserId)) {
      throw new Error("founder_checkout_receipt_already_claimed");
    }
    await ctx.db.patch(receipt._id, {
      ownerUserId,
      founderSubscriptionId: existingProviderSubscription._id,
      updatedAt: nowMs,
    });
    return {
      ok: true,
      founder_subscription_id: String(existingProviderSubscription._id),
      already_claimed: true,
    };
  }
  await attachStripeCustomerToUser({
    ctx,
    userId: ownerUserId,
    providerCustomerId,
    nowMs,
  });
  const founderSubscriptionId = await ctx.db.insert("founderSubscriptions", {
    ownerUserId,
    provider: "stripe",
    providerCustomerId,
    providerSubscriptionId,
    providerPriceId,
    status: subscriptionStatus,
    currentPeriodStartAt: receipt.currentPeriodStartAt,
    currentPeriodEndAt: receipt.currentPeriodEndAt,
    cancelAtPeriodEnd: receipt.cancelAtPeriodEnd === true,
    revokedReason: receipt.founderRiskRevokedReason,
    riskAccessState: receipt.founderRiskState,
    riskStateChangedAt: receipt.founderRiskStateChangedAt,
    lastProviderEventCreatedAt: receipt.lastProviderEventCreatedAt ?? nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  await ctx.db.patch(receipt._id, {
    ownerUserId,
    founderSubscriptionId,
    updatedAt: nowMs,
  });
  return {
    ok: true,
    founder_subscription_id: String(founderSubscriptionId),
    already_claimed: false,
  };
}

export const claimFounderCheckoutReceipt = mutation({
  args: {
    authSubject: v.optional(v.string()),
    sessionId: v.string(),
    claimToken: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const receipt = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", String(args.sessionId).trim()))
      .first();
    if (
      !receipt ||
      receipt.mode !== "founder_subscription" ||
      receipt.claimTokenHash !== await hashFounderCheckoutClaimToken(args.claimToken)
    ) {
      throw new Error("founder_checkout_receipt_not_found");
    }
    return await claimFounderCheckoutReceiptForOwner({
      ctx,
      receipt,
      ownerUserId,
      nowMs: Date.now(),
    });
  },
});

export const claimFounderCheckoutReceiptByVerifiedEmail = mutation({
  args: {
    authSubject: v.optional(v.string()),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const receipt = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", String(args.sessionId).trim()))
      .first();
    if (!receipt || receipt.mode !== "founder_subscription") {
      throw new Error("founder_checkout_receipt_not_found");
    }
    if (receipt.ownerUserId && String(receipt.ownerUserId) === String(actor.dbUserId)) {
      return await claimFounderCheckoutReceiptForOwner({
        ctx,
        receipt,
        ownerUserId: actor.dbUserId,
        nowMs: Date.now(),
      });
    }
    if (receipt.status !== "complete") {
      if (receipt.expiresAt <= Date.now() || receipt.status === "expired") {
        throw new Error("founder_checkout_receipt_expired");
      }
      throw new Error("founder_checkout_payment_not_verified");
    }
    if (!actor.email || !actor.emailVerifiedAt) {
      throw new Error("founder_checkout_verified_email_required");
    }
    if (
      receipt.recoveryEmailHashVersion !== FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION ||
      !receipt.recoveryEmailHash
    ) {
      throw new Error("founder_checkout_email_recovery_unavailable");
    }
    if (await hashFounderCheckoutRecoveryEmail(actor.email) !== receipt.recoveryEmailHash) {
      throw new Error("founder_checkout_recovery_email_mismatch");
    }
    return await claimFounderCheckoutReceiptForOwner({
      ctx,
      receipt,
      ownerUserId: actor.dbUserId,
      nowMs: Date.now(),
    });
  },
});
