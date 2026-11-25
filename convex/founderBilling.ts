import { api, internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import {
  POLYNET_FOUNDER_GUIDE_MONTHLY_PRICE_BASE_UNITS,
  POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
  POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
  founderSubscriptionStatusGrantsAccess,
  normalizeFounderPlanTier,
  type FounderPlanTier,
  type FounderSubscriptionStatus,
} from "../shared/founderPlan";
import { computeAllowancePercentUsed } from "../shared/allowanceGuardrails";
import { computeEffectiveCycleAllowanceMicros } from "../shared/founderUsageBoosts";
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
import {
  getFounderSubscriptionByCommunity,
  getFounderSubscriptionByProviderSubscriptionId,
  syncFounderUsageCycle,
  type FounderSubscriptionRow,
} from "./founderPlanCore";
import {
  expectedFounderStripeUnitAmountForTierPriceId,
  isConfiguredFounderTierPriceId,
  isGuideTierAvailableFromEnv,
  readFounderStripePriceIdForTierFromEnv,
  requireFounderInferencePricingFromEnv,
  requireFounderStripePriceIdForTierFromEnv,
  resolveFounderInferencePricingForTier,
  resolveFounderPlanTierFromPriceId,
  resolveFounderSubscriptionMonthlyPriceBaseUnits,
} from "./founderPlanPricing";
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
import {
  cancelStripeSubscriptionIfActive,
  expireStripeCheckoutSessionIfOpen,
} from "./stripeSubscriptionCancellation";
import { syncCommunityWeeklyDigestScheduleForCommunity } from "./communityWeeklyDigestSchedule";
import { recordCriticalAuditEvent } from "./criticalAudit";

const FOUNDER_CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;
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
  return readFounderStripePriceIdForTierFromEnv("chief_of_staff") ?? "";
}

function toStripeTimestampMs(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 1_000_000_000_000 ? Math.floor(numeric) : Math.floor(numeric * 1000);
}

function readStripeSubscriptionPeriodMs(subscription: any): {
  cycleStartedAt: number | null;
  cycleEndsAt: number | null;
} {
  const firstItem = subscription?.items?.data?.[0];
  const itemStart = toStripeTimestampMs(firstItem?.current_period_start);
  const itemEnd = toStripeTimestampMs(firstItem?.current_period_end);
  if (itemStart && itemEnd) {
    return { cycleStartedAt: itemStart, cycleEndsAt: itemEnd };
  }
  return {
    cycleStartedAt: toStripeTimestampMs(subscription?.current_period_start),
    cycleEndsAt: toStripeTimestampMs(subscription?.current_period_end),
  };
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
  // A plan is bought for a running community; an archived one is restored
  // without paying (communityColdArchive).
  const lifecycle = normalizeCommunityLifecycle(community);
  if (lifecycle.status === "archived") throw new Error("community_restore_payment_not_required");
  return lifecycle;
}

async function verifyFounderStripePrice(
  tier: FounderPlanTier = "chief_of_staff",
): Promise<{ providerPriceId: string; unitAmount: number }> {
  const providerPriceId = requireFounderStripePriceIdForTierFromEnv(tier);
  const expectedUnitAmount = expectedFounderStripeUnitAmountForTierPriceId(
    tier,
    providerPriceId,
  );
  const price: any = await getStripeClient().prices.retrieve(providerPriceId);
  if (
    price?.active !== true ||
    Number(price?.unit_amount ?? 0) !== expectedUnitAmount ||
    String(price?.currency ?? "").trim().toLowerCase() !== "usd" ||
    String(price?.recurring?.interval ?? "").trim().toLowerCase() !== "month" ||
    Number(price?.recurring?.interval_count ?? 1) !== 1
  ) {
    throw new Error("founder_stripe_price_contract_invalid");
  }
  return { providerPriceId, unitAmount: expectedUnitAmount };
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
    providerPriceId: v.optional(v.string()),
    amountBaseUnits: v.optional(v.number()),
    expiresAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || String(community.ownerId) !== String(args.ownerUserId)) {
      throw new Error("founder_subscription_community_forbidden");
    }
    const lifecycle = await requireFounderCheckoutLifecycle(ctx, community);
    const requestedPriceId = normalizeOptionalString(args.providerPriceId);
    if (requestedPriceId && !isConfiguredFounderTierPriceId(requestedPriceId)) {
      throw new Error("founder_subscription_price_mismatch");
    }
    const effectiveAmountBaseUnits =
      typeof args.amountBaseUnits === "number" &&
      Number.isSafeInteger(args.amountBaseUnits) &&
      args.amountBaseUnits > 0
        ? args.amountBaseUnits
        : resolveFounderSubscriptionMonthlyPriceBaseUnits(
            requestedPriceId ?? readFounderStripePriceIdOptional(),
          );
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
        providerPriceId: row.providerPriceId ?? null,
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
      providerPriceId: requestedPriceId,
      billingPeriod: "monthly",
      amountBaseUnits: effectiveAmountBaseUnits,
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
      providerPriceId: requestedPriceId ?? null,
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
    if (
      !isConfiguredFounderTierPriceId(args.providerPriceId) ||
      (row.providerPriceId && row.providerPriceId !== args.providerPriceId)
    ) {
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
      // A plan is never bought for an archived community.
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
  // An existing subscription may switch between configured Polynet founder tiers
  // (Guide <-> Chief of Staff); unknown prices and mismatched initial checkouts
  // continue to fail closed with `founder_subscription_price_changed`.
  const allowedExistingTierSwitch = Boolean(
    existing && providerPriceId && isConfiguredFounderTierPriceId(providerPriceId),
  );
  if (providerPriceId !== expectedPriceId && !allowedExistingTierSwitch) {
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
  let ownerUserId = existing?.ownerUserId ?? checkout?.ownerUserId;
  const communityId = existing?.communityId ?? checkout?.communityId;
  // Every founder checkout is started signed in; the anonymous Builder
  // purchase (and its recovery by email) is gone.
  if (!ownerUserId) throw new Error("founder_subscription_owner_missing");
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
  // Billing evidence for an archived community never touches it.
  if (community && !communityIsActive(community)) {
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
  await attachStripeCustomerToUser({
    ctx: args.ctx,
    userId: ownerUserId,
    providerCustomerId,
    nowMs: args.providerEventCreatedAt,
  });
  const planTier = resolveFounderPlanTierFromPriceId(providerPriceId);
  let subscription: FounderSubscriptionRow;
  if (existing) {
    await args.ctx.db.patch(existing._id as any, {
      attachedAt: existing.communityId
        ? existing.attachedAt ?? args.providerEventCreatedAt
        : existing.attachedAt,
      providerCustomerId,
      providerPriceId,
      planTier,
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
      planTier,
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
      planTier,
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
        pricing: resolveFounderInferencePricingForTier(
          planTier,
          requireFounderInferencePricingFromEnv(),
        ),
        nowMs: args.providerEventCreatedAt,
      })
    : null;
  // Mid-cycle tier upgrades (e.g. Guide $3 -> Chief of Staff $20) expand the
  // cycle ceiling; re-arm 80%/100% allowance alerts cleanly if percent used
  // dropped below the last notified threshold.
  if (usageCycle && subscription.communityId) {
    const coachSettings = await args.ctx.db
      .query("communityMemberCoachSettings")
      .withIndex("by_community", (q: any) => q.eq("communityId", subscription.communityId))
      .first();
    if (coachSettings && coachSettings.allowanceAlertCycleKey === usageCycle.cycleKey) {
      const effectiveAllowanceMicros = computeEffectiveCycleAllowanceMicros({
        includedCostMicros: usageCycle.includedCostMicros,
        paidBoostCostMicros: usageCycle.paidBoostCostMicros,
      });
      const nextPercent = computeAllowancePercentUsed(
        usageCycle.settledCostMicros,
        effectiveAllowanceMicros,
      );
      const nextNotified = nextPercent < 80 ? 0 : nextPercent < 100 ? 80 : 100;
      if (nextNotified < Number(coachSettings.allowanceAlertNotifiedPercent ?? 0)) {
        await args.ctx.db.patch(coachSettings._id, {
          allowanceAlertNotifiedPercent: nextNotified,
          updatedAt: Math.max(Number(coachSettings.updatedAt ?? 0), args.providerEventCreatedAt),
        });
      }
    }
  }
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
      ownerUserId,
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
  if (communityId) {
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
    const guideTierAvailable = isGuideTierAvailableFromEnv();
    const defaultChiefOfStaffMonthlyPriceBaseUnits =
      resolveFounderSubscriptionMonthlyPriceBaseUnits(
        readFounderStripePriceIdForTierFromEnv("chief_of_staff"),
        "chief_of_staff",
      );
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
          const planTier: FounderPlanTier | null = subscription
            ? normalizeFounderPlanTier(
                subscription.planTier ??
                  resolveFounderPlanTierFromPriceId(subscription.providerPriceId),
              )
            : operatorComped
              ? "chief_of_staff"
              : null;
          const pendingCheckoutPlanTier: FounderPlanTier | null =
            pendingCheckout?.providerPriceId
              ? resolveFounderPlanTierFromPriceId(pendingCheckout.providerPriceId)
              : null;
          const rowMonthlyPriceBaseUnits = subscription
            ? resolveFounderSubscriptionMonthlyPriceBaseUnits(
                subscription.providerPriceId,
                planTier,
              )
            : defaultChiefOfStaffMonthlyPriceBaseUnits;
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
            funding_lane: fundingProjection.lane,
            funding_state: fundingProjection.state,
            allowed_actions: lifecycle.status === "active" ? fundingProjection.allowedActions : [],
            funding_mode: subscription
              ? "managed"
              : operatorComped
                ? "operator_comp"
                : "managed",
            status,
            plan_tier: planTier,
            pending_checkout_plan_tier: pendingCheckoutPlanTier,
            monthly_price_base_units: rowMonthlyPriceBaseUnits,
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
      .map((subscription) => {
        const subPlanTier = normalizeFounderPlanTier(
          subscription.planTier ??
            resolveFounderPlanTierFromPriceId(subscription.providerPriceId),
        );
        return {
          subscription_id: String(subscription._id),
          status: subscription.status,
          plan_tier: subPlanTier,
          grants_setup: founderSubscriptionStatusGrantsAccess({
            status: subscription.status,
            currentPeriodEndAt: subscription.currentPeriodEndAt,
            nowMs,
          }),
          monthly_price_base_units: resolveFounderSubscriptionMonthlyPriceBaseUnits(
            subscription.providerPriceId,
            subPlanTier,
          ),
          current_period_start_at: new Date(subscription.currentPeriodStartAt).toISOString(),
          current_period_end_at: new Date(subscription.currentPeriodEndAt).toISOString(),
          cancel_at_period_end: subscription.cancelAtPeriodEnd === true,
        };
      });
    const activeCommunityMonthlyTotal = rows
      .filter(
        (row) =>
          row.lifecycle_status === "active" &&
          row.funding_mode === "managed" &&
          row.subscription_id !== null &&
          row.status !== "canceled" &&
          row.status !== "ended",
      )
      .reduce((sum, row) => sum + row.monthly_price_base_units, 0);
    const unassignedMonthlyTotal = unassignedSubscriptions
      .filter((subscription) => subscription.grants_setup)
      .reduce((sum, subscription) => sum + subscription.monthly_price_base_units, 0);
    return {
      monthly_price_base_units: defaultChiefOfStaffMonthlyPriceBaseUnits,
      guide_tier_available: guideTierAvailable,
      guide_monthly_price_base_units: POLYNET_FOUNDER_GUIDE_MONTHLY_PRICE_BASE_UNITS,
      chief_of_staff_monthly_price_base_units: defaultChiefOfStaffMonthlyPriceBaseUnits,
      communities: rows,
      unassigned_subscriptions: unassignedSubscriptions,
      managed_monthly_total_base_units:
        activeCommunityMonthlyTotal + unassignedMonthlyTotal,
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

export const prepareFounderSubscriptionTierSwitchInternal = internalQuery({
  args: {
    ownerUserId: v.id("users"),
    communityId: v.id("communities"),
    targetTier: v.union(v.literal("guide"), v.literal("chief_of_staff")),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || String(community.ownerId) !== String(args.ownerUserId)) {
      throw new Error("founder_subscription_community_forbidden");
    }
    await requireFounderCheckoutLifecycle(ctx, community);
    const subscription = await getFounderSubscriptionByCommunity(
      ctx,
      args.communityId,
      args.nowMs,
    );
    if (
      !subscription ||
      String(subscription.ownerUserId) !== String(args.ownerUserId) ||
      !founderSubscriptionStatusGrantsAccess({
        status: subscription.status,
        currentPeriodEndAt: subscription.currentPeriodEndAt,
        nowMs: args.nowMs,
      }) ||
      readFounderSubscriptionRiskSnapshot(subscription).state === "revoked"
    ) {
      throw new Error("founder_subscription_required");
    }
    const currentTier = normalizeFounderPlanTier(
      subscription.planTier ??
        resolveFounderPlanTierFromPriceId(subscription.providerPriceId),
    );
    if (currentTier === args.targetTier) {
      throw new Error("founder_subscription_tier_unchanged");
    }
    return {
      founderSubscriptionId: subscription._id,
      providerSubscriptionId: subscription.providerSubscriptionId,
      providerCustomerId: subscription.providerCustomerId,
      currentPriceId: subscription.providerPriceId,
      currentTier,
      lastProviderEventCreatedAt: subscription.lastProviderEventCreatedAt,
    };
  },
});

export const switchFounderSubscriptionTier = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetTier: v.union(v.literal("guide"), v.literal("chief_of_staff")),
  },
  handler: async (ctx, args) => {
    const actor = (await ctx.runQuery(
      (internal as any).authActor.resolveAuthenticatedActorInternal,
      { authSubject: args.authSubject ?? null },
    )) as { dbUserId?: any };
    if (!actor?.dbUserId) throw new Error("user_not_found");
    const exemption = (await ctx.runQuery(
      (internal as any).founderBilling.getFounderBillingExemptionInternal,
      { userId: actor.dbUserId },
    )) as { operatorComped?: boolean } | null;
    if (exemption?.operatorComped) throw new Error("operator_billing_exempt");
    requireFounderInferencePricingFromEnv();

    const nowMs = Date.now();
    const target = (await ctx.runQuery(
      (internal as any).founderBilling.prepareFounderSubscriptionTierSwitchInternal,
      {
        ownerUserId: actor.dbUserId,
        communityId: args.communityId,
        targetTier: args.targetTier,
        nowMs,
      },
    )) as {
      founderSubscriptionId: string;
      providerSubscriptionId: string;
      providerCustomerId: string;
      currentPriceId: string;
      currentTier: FounderPlanTier;
      lastProviderEventCreatedAt: number;
    };

    const verifiedTargetPrice = await verifyFounderStripePrice(args.targetTier);
    const stripe = getStripeClient();
    const liveSubscription: any = await stripe.subscriptions.retrieve(
      target.providerSubscriptionId,
    );
    const liveCustomerId =
      typeof liveSubscription?.customer === "string"
        ? liveSubscription.customer
        : String(liveSubscription?.customer?.id ?? "").trim();
    if (
      !liveSubscription ||
      liveCustomerId !== target.providerCustomerId ||
      String(liveSubscription.status ?? "").trim().toLowerCase() !== "active"
    ) {
      throw new Error("founder_subscription_not_active_on_provider");
    }
    const items = Array.isArray(liveSubscription?.items?.data)
      ? liveSubscription.items.data
      : [];
    if (items.length !== 1 || !items[0]?.id) {
      throw new Error("founder_subscription_items_invalid");
    }
    const currentLiveItem = items[0];
    const currentLivePriceId = String(currentLiveItem?.price?.id ?? "").trim();

    let updatedSubscription = liveSubscription;
    if (currentLivePriceId !== verifiedTargetPrice.providerPriceId) {
      const isUpgrade = args.targetTier === "chief_of_staff";
      // Upgrades invoice and collect the prorated difference immediately,
      // failing atomically if the card on file cannot be charged so unpaid
      // Chief of Staff access or $20 AI allowance is never granted.
      updatedSubscription = await stripe.subscriptions.update(
        target.providerSubscriptionId,
        {
          items: [
            {
              id: currentLiveItem.id,
              price: verifiedTargetPrice.providerPriceId,
            },
          ],
          proration_behavior: isUpgrade ? "always_invoice" : "create_prorations",
          ...(isUpgrade
            ? {
                payment_behavior: "error_if_incomplete" as const,
                cancel_at_period_end: false,
              }
            : {}),
          metadata: {
            ...(liveSubscription.metadata ?? {}),
            plan_tier: args.targetTier,
          },
        },
      );
    }

    const updatedPriceId = String(
      updatedSubscription?.items?.data?.[0]?.price?.id ??
        verifiedTargetPrice.providerPriceId,
    ).trim();
    const { cycleStartedAt, cycleEndsAt } =
      readStripeSubscriptionPeriodMs(updatedSubscription);

    // Sync immediately without advancing `lastProviderEventCreatedAt` past
    // Stripe's clock so the authoritative `customer.subscription.updated`
    // webhook that follows is never treated as stale.
    await ctx.runMutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      {
        providerCustomerId: target.providerCustomerId,
        providerSubscriptionId: target.providerSubscriptionId,
        providerPriceId: updatedPriceId,
        subscriptionStatus: normalizeStripeCommunitySubscriptionStatus({
          subscriptionStatus: updatedSubscription?.status ?? "active",
          cancelAtPeriodEnd: Boolean(updatedSubscription?.cancel_at_period_end),
        }),
        currentPeriodStartAt: cycleStartedAt,
        currentPeriodEndAt: cycleEndsAt,
        cancelAtPeriodEnd: Boolean(updatedSubscription?.cancel_at_period_end),
        providerEventCreatedAt: target.lastProviderEventCreatedAt,
      },
    );

    await ctx.runMutation(
      (internal as any).criticalAudit.recordCriticalAuditEventInternal,
      {
        eventKey: `founder_subscription_tier_switched:${target.providerSubscriptionId}:${target.currentPriceId}:${updatedPriceId}:${nowMs}`,
        eventType: "founder_subscription_tier_switched",
        severity: "info",
        status: "succeeded",
        actorUserId: actor.dbUserId,
        communityId: args.communityId,
        provider: "stripe",
        providerObjectId: target.providerSubscriptionId,
        metadata: {
          fromTier: target.currentTier,
          toTier: args.targetTier,
          fromPriceId: target.currentPriceId,
          toPriceId: updatedPriceId,
          providerSubscriptionId: target.providerSubscriptionId,
        },
        createdAt: nowMs,
      },
    );

    return {
      ok: true,
      plan_tier: args.targetTier,
      monthly_price_base_units: verifiedTargetPrice.unitAmount,
    };
  },
});

export const startFounderSubscriptionCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    planTier: v.optional(v.union(v.literal("guide"), v.literal("chief_of_staff"))),
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
    const requestedTier: FounderPlanTier = normalizeFounderPlanTier(
      args.planTier ?? "chief_of_staff",
    );
    const nowMs = Date.now();
    const { providerPriceId, unitAmount } = await verifyFounderStripePrice(requestedTier);
    const providerCustomerId = await ensureStripeCustomerForUser({
      ctx,
      userId: actor.dbUserId,
      email: actor.email ?? null,
      nowMs,
    });
    const expiresAt = nowMs + FOUNDER_CHECKOUT_TTL_MS;
    let prepared = (await ctx.runMutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: newOpaqueToken("founder"),
        ownerUserId: actor.dbUserId,
        communityId: args.communityId,
        providerPriceId,
        amountBaseUnits: unitAmount,
        expiresAt,
        nowMs,
      },
    )) as {
      sessionId: string;
      providerCheckoutSessionId?: string | null;
      providerPriceId?: string | null;
      expiresAt: number;
      reused: boolean;
    };
    if (prepared.reused) {
      const samePrice =
        !prepared.providerPriceId || prepared.providerPriceId === providerPriceId;
      if (prepared.providerCheckoutSessionId) {
        const existingCheckout: any = await getStripeClient().checkout.sessions.retrieve(
          prepared.providerCheckoutSessionId,
        );
        if (
          existingCheckout?.status === "complete" ||
          existingCheckout?.payment_status === "paid" ||
          existingCheckout?.subscription
        ) {
          throw new Error("founder_subscription_payment_settling");
        }
        const existingCheckoutUrl = String(existingCheckout?.url ?? "").trim();
        if (samePrice && existingCheckout?.status === "open" && existingCheckoutUrl) {
          return { ok: true, session_id: prepared.sessionId, checkout_url: existingCheckoutUrl };
        }
        // Either the founder picked a different tier or the prior Stripe session
        // expired/closed; expire it cleanly on Stripe and confirm it did not
        // complete mid-race before issuing a fresh session.
        if (existingCheckout?.status === "open") {
          const expireResult = await expireStripeCheckoutSessionIfOpen({
            providerCheckoutSessionId: prepared.providerCheckoutSessionId,
          });
          if (expireResult.providerSubscriptionId) {
            throw new Error("founder_subscription_payment_settling");
          }
          if (expireResult.outcome === "already_closed") {
            const rechecked: any = await getStripeClient().checkout.sessions.retrieve(
              prepared.providerCheckoutSessionId,
            );
            if (
              rechecked?.status === "complete" ||
              rechecked?.payment_status === "paid" ||
              rechecked?.subscription
            ) {
              throw new Error("founder_subscription_payment_settling");
            }
          }
        }
        await ctx.runMutation(
          (internal as any).founderBilling.expireFounderSubscriptionCheckoutInternal,
          { sessionId: prepared.sessionId, nowMs: Date.now() },
        );
        prepared = (await ctx.runMutation(
          (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
          {
            sessionId: newOpaqueToken("founder"),
            ownerUserId: actor.dbUserId,
            communityId: args.communityId,
            providerPriceId,
            amountBaseUnits: unitAmount,
            expiresAt: Date.now() + FOUNDER_CHECKOUT_TTL_MS,
            nowMs: Date.now(),
          },
        )) as {
          sessionId: string;
          providerCheckoutSessionId?: string | null;
          providerPriceId?: string | null;
          expiresAt: number;
          reused: boolean;
        };
        if (prepared.reused) {
          throw new Error("founder_subscription_checkout_in_progress");
        }
      } else if (!samePrice) {
        throw new Error("founder_subscription_checkout_in_progress");
      }
    }
    const sessionId = prepared.sessionId;
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
          plan_tier: requestedTier,
          user_id: String(actor.dbUserId),
          community_id: String(args.communityId),
        },
        subscription_data: {
          metadata: {
            local_session_id: sessionId,
            checkout_mode: "founder_subscription",
            plan_tier: requestedTier,
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

