// Prepaid Community Usage Boosts (docs/specs/agent-pricing-and-overage-v1.md, Step 2):
// Webhook-authoritative $30 -> +$20 AI allowance boosts bound strictly to one
// community's active Stripe Agent plan subscription and current billing cycle.
// Redirects are UX only; only verified platform Stripe webhooks grant or revoke boosts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import {
  buildCheckoutCancelUrl,
  buildCheckoutSuccessUrl,
  newOpaqueToken,
  requireCanonicalCheckoutReturnUrl,
} from "./billingCore";
import { recordCriticalAuditEvent } from "./criticalAudit";
import { getFounderSubscriptionByCommunity } from "./founderPlanCore";
import { getStripeClient } from "./stripeCore";
import { attachStripeCustomerToUser, ensureStripeCustomerForUser } from "./stripeCustomers";
import { expireStripeCheckoutSessionIfOpen } from "./stripeSubscriptionCancellation";
import {
  communityIsActive,
  communityLifecycleGenerationMatches,
  normalizeCommunityLifecycle,
} from "../shared/communityLifecycle";
import {
  founderPlanTierAllowsUsageBoosts,
  founderSubscriptionStatusGrantsAccess,
  normalizeFounderPlanTier,
} from "../shared/founderPlan";
import { computeAllowancePercentUsed } from "../shared/allowanceGuardrails";
import {
  FOUNDER_USAGE_BOOST_ALLOWANCE_MICROS,
  FOUNDER_USAGE_BOOST_PRICE_CENTS,
  canGrantAdditionalUsageBoost,
  computeEffectiveCycleAllowanceMicros,
  isSubscriptionInFirstBillingCycle,
  normalizeFounderUsageBoostCapCents,
} from "../shared/founderUsageBoosts";

const internalRefs = internal as any;
const BOOST_CHECKOUT_TTL_MS = 2 * 60 * 60_000; // 2 hours
const FOUNDER_RISK_REVOKED_REASONS = new Set([
  "subscription_refunded",
  "subscription_dispute_opened",
  "subscription_dispute_lost",
]);

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function subscriptionIsRiskRevoked(subscription: any): boolean {
  if (!subscription) return true;
  if (subscription.riskAccessState === "revoked") return true;
  const revokedReason = String(subscription.revokedReason ?? "").trim();
  return FOUNDER_RISK_REVOKED_REASONS.has(revokedReason);
}

async function readOpenActiveCycleForSubscription(
  ctx: any,
  subscriptionId: any,
  nowMs: number,
) {
  const cycles = await ctx.db
    .query("founderUsageCycles")
    .withIndex("by_subscription_status", (q: any) =>
      q.eq("founderSubscriptionId", subscriptionId).eq("status", "open"),
    )
    .collect();
  const active = cycles.filter(
    (cycle: any) => cycle.cycleStartAt <= nowMs && cycle.cycleEndAt > nowMs,
  );
  if (active.length !== 1) return null;
  return active[0];
}

export const prepareFounderUsageBoostCheckoutInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    ownerUserId: v.id("users"),
    communityId: v.id("communities"),
    expiresAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community: any = await ctx.db.get(args.communityId);
    if (!community || String(community.ownerId) !== String(args.ownerUserId)) {
      throw new Error("founder_usage_boost_owner_required");
    }
    if (!communityIsActive(community)) {
      throw new Error("founder_usage_boost_community_inactive");
    }
    const lifecycle = normalizeCommunityLifecycle(community);
    const subscription = await getFounderSubscriptionByCommunity(
      ctx,
      args.communityId,
      args.nowMs,
    );
    if (
      !subscription ||
      String(subscription.ownerUserId) !== String(args.ownerUserId) ||
      subscription.status !== "active" ||
      !founderSubscriptionStatusGrantsAccess({
        status: subscription.status,
        currentPeriodEndAt: subscription.currentPeriodEndAt,
        nowMs: args.nowMs,
      }) ||
      subscriptionIsRiskRevoked(subscription)
    ) {
      throw new Error("founder_usage_boost_subscription_required");
    }
    if (!founderPlanTierAllowsUsageBoosts(normalizeFounderPlanTier(subscription.planTier))) {
      throw new Error("founder_usage_boost_tier_required");
    }

    const cycle = await readOpenActiveCycleForSubscription(ctx, subscription._id, args.nowMs);
    if (!cycle || String(cycle.communityId) !== String(args.communityId)) {
      throw new Error("founder_usage_boost_cycle_unavailable");
    }

    const settings = await ctx.db
      .query("communityMemberCoachSettings")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .first();
    const requestedCapCents = normalizeFounderUsageBoostCapCents(settings?.usageBoostCapCents);
    const isFirstCycle = isSubscriptionInFirstBillingCycle({
      subscriptionCreatedAtMs: Number(subscription.createdAt ?? 0),
      cycleStartAtMs: Number(cycle.cycleStartAt ?? 0),
    });

    // Reuse an existing non-expired pending checkout for this cycle so double-clicks
    // cannot open parallel Stripe sessions that exceed the monthly safety cap.
    const existingPending = await ctx.db
      .query("founderUsageBoostReceipts")
      .withIndex("by_cycle_status", (q) =>
        q.eq("usageCycleId", cycle._id).eq("status", "pending"),
      )
      .collect();
    const livePending: any[] = [];
    for (const row of existingPending) {
      if (
        row.expiresAt <= args.nowMs ||
        !communityLifecycleGenerationMatches(community, row.communityLifecycleGeneration)
      ) {
        await ctx.db.patch(row._id, { status: "expired", updatedAt: args.nowMs });
      } else {
        livePending.push(row);
      }
    }

    const admission = canGrantAdditionalUsageBoost({
      requestedCapCents,
      isFirstCycle,
      paidBoostCountThisCycle: Number(cycle.paidBoostCount ?? 0),
    });
    if (!admission.allowed) {
      throw new Error(admission.code);
    }

    if (livePending.length > 0) {
      const reused = livePending.sort((a, b) => b.createdAt - a.createdAt)[0]!;
      return {
        receiptKey: reused.receiptKey,
        providerCheckoutSessionId: reused.providerCheckoutSessionId ?? null,
        expiresAt: reused.expiresAt,
        usageCycleId: String(cycle._id),
        cycleKey: cycle.cycleKey,
        communityName: String(community.name ?? "your community"),
        reused: true,
      };
    }

    await ctx.db.insert("founderUsageBoostReceipts", {
      receiptKey: args.receiptKey,
      communityId: args.communityId,
      communityLifecycleGeneration: lifecycle.generation,
      ownerUserId: args.ownerUserId,
      founderSubscriptionId: subscription._id,
      usageCycleId: cycle._id,
      cycleKey: cycle.cycleKey,
      priceCents: FOUNDER_USAGE_BOOST_PRICE_CENTS,
      currency: "usd",
      grantedAllowanceMicros: FOUNDER_USAGE_BOOST_ALLOWANCE_MICROS,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });

    return {
      receiptKey: args.receiptKey,
      providerCheckoutSessionId: null,
      expiresAt: args.expiresAt,
      usageCycleId: String(cycle._id),
      cycleKey: cycle.cycleKey,
      communityName: String(community.name ?? "your community"),
      reused: false,
    };
  },
});

export const attachFounderUsageBoostStripeSessionInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    providerCheckoutSessionId: v.string(),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("founderUsageBoostReceipts")
      .withIndex("by_receipt_key", (q) => q.eq("receiptKey", args.receiptKey))
      .first();
    if (!row || row.status !== "pending") {
      throw new Error("founder_usage_boost_receipt_invalid");
    }
    if (args.providerCustomerId) {
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
      updatedAt: args.nowMs,
    });
  },
});

export const expireFounderUsageBoostCheckoutInternal = internalMutation({
  args: { receiptKey: v.string(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("founderUsageBoostReceipts")
      .withIndex("by_receipt_key", (q) => q.eq("receiptKey", args.receiptKey))
      .first();
    if (!row || row.status !== "pending") return;
    await ctx.db.patch(row._id, { status: "expired", updatedAt: args.nowMs });
  },
});

// Public owner action: creates a $30 one-time Stripe Checkout session for +$20 AI allowance.
export const createFounderUsageBoostCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = (await ctx.runQuery(
      internalRefs.authActor.resolveAuthenticatedActorInternal,
      { authSubject: args.authSubject ?? null },
    )) as { dbUserId?: any; email?: string | null };
    if (!actor?.dbUserId) throw new Error("user_not_found");

    const successUrl = requireCanonicalCheckoutReturnUrl(
      args.successUrl,
      "founder_usage_boost_success_url_invalid",
    );
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "founder_usage_boost_cancel_url_invalid",
    );

    const nowMs = Date.now();
    const providerCustomerId = await ensureStripeCustomerForUser({
      ctx,
      userId: actor.dbUserId,
      email: actor.email ?? null,
      nowMs,
    });

    const proposedKey = newOpaqueToken("boost");
    const expiresAt = nowMs + BOOST_CHECKOUT_TTL_MS;
    const prepared = (await ctx.runMutation(
      internalRefs.founderUsageBoosts.prepareFounderUsageBoostCheckoutInternal,
      {
        receiptKey: proposedKey,
        ownerUserId: actor.dbUserId,
        communityId: args.communityId,
        expiresAt,
        nowMs,
      },
    )) as {
      receiptKey: string;
      providerCheckoutSessionId: string | null;
      expiresAt: number;
      usageCycleId: string;
      cycleKey: string;
      communityName: string;
      reused: boolean;
    };

    const receiptKey = prepared.receiptKey;
    if (prepared.providerCheckoutSessionId) {
      const existing: any = await getStripeClient().checkout.sessions.retrieve(
        prepared.providerCheckoutSessionId,
      );
      const existingUrl = String(existing?.url ?? "").trim();
      if (existingUrl && existing?.status === "open") {
        return { ok: true, receipt_key: receiptKey, checkout_url: existingUrl };
      }
      // Keep completed/paid checkouts reserved until the Stripe webhook grants them
      // so a rapid retry cannot open a second checkout past the monthly safety cap.
      if (existing?.status === "complete" || existing?.payment_status === "paid") {
        throw new Error("founder_usage_boost_payment_settling");
      }
      // Truly expired/abandoned on Stripe; expire our stale pending row cleanly.
      await ctx.runMutation(
        internalRefs.founderUsageBoosts.expireFounderUsageBoostCheckoutInternal,
        { receiptKey, nowMs: Date.now() },
      );
      throw new Error("founder_usage_boost_checkout_expired_retry");
    }

    let checkoutSession: any = null;
    try {
      const metadata = {
        checkout_mode: "founder_usage_boost",
        boost_receipt_key: receiptKey,
        community_id: String(args.communityId),
        usage_cycle_id: prepared.usageCycleId,
        cycle_key: prepared.cycleKey,
        owner_user_id: String(actor.dbUserId),
      };
      checkoutSession = await getStripeClient().checkout.sessions.create(
        {
          mode: "payment",
          customer: providerCustomerId,
          success_url: buildCheckoutSuccessUrl(successUrl, receiptKey),
          cancel_url: buildCheckoutCancelUrl(cancelUrl, receiptKey),
          expires_at: Math.floor(prepared.expiresAt / 1000),
          client_reference_id: receiptKey,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: FOUNDER_USAGE_BOOST_PRICE_CENTS,
                product_data: {
                  name: `AI Usage Boost — ${prepared.communityName}`,
                  description:
                    "Adds +$20.00 in AI allowance for your community's current billing cycle.",
                },
              },
            },
          ],
          metadata,
          payment_intent_data: { metadata },
        },
        {
          idempotencyKey: `founder-usage-boost-checkout:${receiptKey}`,
        },
      );
      const checkoutUrl = String(checkoutSession?.url ?? "").trim();
      if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");

      await ctx.runMutation(
        internalRefs.founderUsageBoosts.attachFounderUsageBoostStripeSessionInternal,
        {
          receiptKey,
          providerCheckoutSessionId: checkoutSession.id,
          providerCustomerId:
            typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
          nowMs: Date.now(),
        },
      );
      return { ok: true, receipt_key: receiptKey, checkout_url: checkoutUrl };
    } catch (error) {
      if (checkoutSession?.id) {
        await expireStripeCheckoutSessionIfOpen({
          providerCheckoutSessionId: checkoutSession.id,
        }).catch(() => {});
      }
      await ctx.runMutation(
        internalRefs.founderUsageBoosts.expireFounderUsageBoostCheckoutInternal,
        { receiptKey, nowMs: Date.now() },
      );
      throw error;
    }
  },
});

// Webhook-authoritative grant: called ONLY from verified platform Stripe
// checkout.session.completed / checkout.session.async_payment_succeeded events.
export const grantFounderUsageBoostFromStripeInternal = internalMutation({
  args: {
    receiptKey: v.string(),
    providerCheckoutSessionId: v.string(),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerPaymentIntentId: v.optional(v.union(v.string(), v.null())),
    providerChargeId: v.optional(v.union(v.string(), v.null())),
    amountTotalCents: v.number(),
    currency: v.string(),
    providerEventCreatedAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = await ctx.db
      .query("founderUsageBoostReceipts")
      .withIndex("by_receipt_key", (q) => q.eq("receiptKey", args.receiptKey))
      .first();
    if (!receipt) {
      return { ok: true, ignored: true, reason: "boost_receipt_not_found" };
    }
    if (
      receipt.status === "granted" ||
      receipt.status === "refunded" ||
      receipt.status === "disputed"
    ) {
      return { ok: true, ignored: true, reason: "boost_receipt_already_processed" };
    }
    if (
      receipt.providerCheckoutSessionId &&
      receipt.providerCheckoutSessionId !== args.providerCheckoutSessionId
    ) {
      return { ok: true, ignored: true, reason: "boost_checkout_session_mismatch" };
    }
    if (
      Math.floor(args.amountTotalCents) !== receipt.priceCents ||
      String(args.currency ?? "").trim().toLowerCase() !== receipt.currency
    ) {
      return { ok: true, ignored: true, reason: "boost_amount_or_currency_mismatch" };
    }

    const [community, subscription] = await Promise.all([
      ctx.db.get(receipt.communityId),
      ctx.db.get(receipt.founderSubscriptionId),
    ]);
    if (
      !community ||
      !communityIsActive(community) ||
      !communityLifecycleGenerationMatches(community, receipt.communityLifecycleGeneration)
    ) {
      return { ok: true, ignored: true, reason: "boost_community_inactive" };
    }
    if (
      !subscription ||
      String(subscription.communityId ?? "") !== String(receipt.communityId) ||
      subscriptionIsRiskRevoked(subscription)
    ) {
      return { ok: true, ignored: true, reason: "boost_subscription_unavailable" };
    }

    // Grant into the bound open cycle; if the cycle rolled over while Checkout was
    // in flight, credit the subscription's newly opened cycle so the founder never loses $30.
    let targetCycle: any = await ctx.db.get(receipt.usageCycleId);
    if (!targetCycle || targetCycle.status !== "open" || targetCycle.cycleEndAt <= args.nowMs) {
      targetCycle = await readOpenActiveCycleForSubscription(ctx, subscription._id, args.nowMs);
    }
    if (!targetCycle || String(targetCycle.communityId) !== String(receipt.communityId)) {
      await recordCriticalAuditEvent(ctx, {
        eventKey: `founder_usage_boost_cycle_missing:${receipt.receiptKey}:${args.providerEventCreatedAt}`,
        eventType: "founder_usage_boost_cycle_missing",
        severity: "error",
        status: "failed",
        actorUserId: receipt.ownerUserId,
        communityId: receipt.communityId,
        provider: "stripe",
        providerObjectId: args.providerCheckoutSessionId,
        metadata: {
          receiptKey: receipt.receiptKey,
        },
        createdAt: args.nowMs,
      });
      // Signal retryable failure so httpBilling returns 500 and Stripe retries
      // once the subscription renewal webhook opens the next billing cycle.
      return {
        ok: false,
        ignored: false,
        retryable: true,
        reason: "boost_target_cycle_unavailable",
      };
    }

    const nextPaidBoostCostMicros =
      Math.max(0, Math.floor(Number(targetCycle.paidBoostCostMicros ?? 0))) +
      receipt.grantedAllowanceMicros;
    const nextPaidBoostCount =
      Math.max(0, Math.floor(Number(targetCycle.paidBoostCount ?? 0))) + 1;
    const nextEffectiveAllowanceMicros = computeEffectiveCycleAllowanceMicros({
      includedCostMicros: targetCycle.includedCostMicros,
      paidBoostCostMicros: nextPaidBoostCostMicros,
    });

    await ctx.db.patch(targetCycle._id, {
      paidBoostCostMicros: nextPaidBoostCostMicros,
      paidBoostCount: nextPaidBoostCount,
      updatedAt: args.nowMs,
    });

    // Re-arm allowance alerts cleanly if the new boosted ceiling puts usage back below 80%/100%.
    const settings = await ctx.db
      .query("communityMemberCoachSettings")
      .withIndex("by_community", (q) => q.eq("communityId", receipt.communityId))
      .first();
    if (settings && settings.allowanceAlertCycleKey === targetCycle.cycleKey) {
      const nextPercent = computeAllowancePercentUsed(
        targetCycle.settledCostMicros,
        nextEffectiveAllowanceMicros,
      );
      const nextNotified = nextPercent < 80 ? 0 : nextPercent < 100 ? 80 : 100;
      if (nextNotified < Number(settings.allowanceAlertNotifiedPercent ?? 0)) {
        await ctx.db.patch(settings._id, {
          allowanceAlertNotifiedPercent: nextNotified,
          updatedAt: args.nowMs,
        });
      }
    }

    await ctx.db.patch(receipt._id, {
      status: "granted",
      usageCycleId: targetCycle._id,
      cycleKey: targetCycle.cycleKey,
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      providerCustomerId:
        normalizeOptionalString(args.providerCustomerId) ?? receipt.providerCustomerId,
      providerPaymentIntentId: normalizeOptionalString(args.providerPaymentIntentId),
      providerChargeId: normalizeOptionalString(args.providerChargeId),
      providerEventCreatedAt: args.providerEventCreatedAt,
      grantedAt: args.nowMs,
      updatedAt: args.nowMs,
    });

    await recordCriticalAuditEvent(ctx, {
      eventKey: `founder_usage_boost_granted:${receipt.receiptKey}`,
      eventType: "founder_usage_boost_granted",
      severity: "info",
      status: "succeeded",
      actorUserId: receipt.ownerUserId,
      communityId: receipt.communityId,
      provider: "stripe",
      providerObjectId: args.providerCheckoutSessionId,
      metadata: {
        receiptKey: receipt.receiptKey,
        usageCycleId: String(targetCycle._id),
        grantedAllowanceMicros: receipt.grantedAllowanceMicros,
        paidBoostCount: nextPaidBoostCount,
      },
      createdAt: args.nowMs,
    });

    return {
      ok: true,
      ignored: false,
      receiptKey: receipt.receiptKey,
      usageCycleId: String(targetCycle._id),
      effectiveAllowanceMicros: nextEffectiveAllowanceMicros,
    };
  },
});

// Webhook-authoritative refund/dispute clawback: called from verified platform
// Stripe refund & dispute events. Clamps clawback safely so active ledger invariants
// (reserved + settled <= effectiveAllowance) never break even if part of the boost
// was already consumed.
export const revokeFounderUsageBoostFromStripeInternal = internalMutation({
  args: {
    providerPaymentIntentId: v.optional(v.union(v.string(), v.null())),
    receiptKey: v.optional(v.union(v.string(), v.null())),
    outcome: v.union(v.literal("refunded"), v.literal("disputed")),
    revokedReason: v.string(),
    providerEventCreatedAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    let receipt: any = null;
    const pi = normalizeOptionalString(args.providerPaymentIntentId);
    const key = normalizeOptionalString(args.receiptKey);
    if (pi) {
      receipt = await ctx.db
        .query("founderUsageBoostReceipts")
        .withIndex("by_provider_payment_intent", (q) => q.eq("providerPaymentIntentId", pi))
        .first();
    }
    if (!receipt && key) {
      receipt = await ctx.db
        .query("founderUsageBoostReceipts")
        .withIndex("by_receipt_key", (q) => q.eq("receiptKey", key))
        .first();
    }
    if (!receipt) {
      return { ok: true, ignored: true, reason: "boost_receipt_not_found" };
    }
    if (receipt.status === "refunded" || receipt.status === "disputed") {
      return { ok: true, ignored: true, reason: "boost_receipt_already_revoked" };
    }

    const wasGranted = receipt.status === "granted";
    if (wasGranted) {
      const cycle: any = await ctx.db.get(receipt.usageCycleId);
      if (cycle) {
        const currentBoost = Math.max(0, Math.floor(Number(cycle.paidBoostCostMicros ?? 0)));
        const currentCount = Math.max(0, Math.floor(Number(cycle.paidBoostCount ?? 0)));
        const minRequiredTotal = Math.max(
          0,
          Math.floor(Number(cycle.reservedCostMicros ?? 0)) +
            Math.floor(Number(cycle.settledCostMicros ?? 0)),
        );
        const minRequiredBoost = Math.max(
          0,
          minRequiredTotal - Number(cycle.includedCostMicros ?? 0),
        );
        const targetBoost = Math.max(0, currentBoost - receipt.grantedAllowanceMicros);
        const nextBoost = Math.max(targetBoost, minRequiredBoost);
        // Preserve the (paidBoostCostMicros === 0) === (paidBoostCount === 0) ledger invariant.
        const nextCount = nextBoost === 0 ? 0 : Math.max(1, currentCount - 1);

        await ctx.db.patch(cycle._id, {
          paidBoostCostMicros: nextBoost,
          paidBoostCount: nextCount,
          updatedAt: args.nowMs,
        });
      }
    }

    // Persist terminal revocation even on pending/expired receipts so an out-of-order
    // checkout.session.completed webhook can never grant refunded or disputed funds.
    await ctx.db.patch(receipt._id, {
      status: args.outcome,
      providerPaymentIntentId: pi ?? receipt.providerPaymentIntentId,
      revokedReason: String(args.revokedReason).slice(0, 160),
      providerEventCreatedAt: Math.max(
        Number(receipt.providerEventCreatedAt ?? 0),
        args.providerEventCreatedAt,
      ),
      revokedAt: args.nowMs,
      updatedAt: args.nowMs,
    });

    // On a chargeback dispute, apply the canonical risk-revocation transition
    // (status: "ended" + riskAccessState: "revoked") so both inference admission
    // and boost purchases fail closed immediately.
    if (args.outcome === "disputed") {
      const subscription: any = await ctx.db.get(receipt.founderSubscriptionId);
      if (subscription) {
        const priorRiskChangedAt = Number(subscription.riskStateChangedAt ?? 0);
        if (args.providerEventCreatedAt >= priorRiskChangedAt) {
          await ctx.db.patch(subscription._id, {
            status: "ended",
            endedAt: args.providerEventCreatedAt,
            riskAccessState: "revoked",
            riskStateChangedAt: args.providerEventCreatedAt,
            revokedReason: "subscription_dispute_opened",
            lastProviderEventCreatedAt: Math.max(
              Number(subscription.lastProviderEventCreatedAt ?? 0),
              args.providerEventCreatedAt,
            ),
            updatedAt: args.nowMs,
          });
        }
      }
    }

    await recordCriticalAuditEvent(ctx, {
      eventKey: `founder_usage_boost_revoked:${receipt.receiptKey}:${args.outcome}`,
      eventType: "founder_usage_boost_revoked",
      severity: args.outcome === "disputed" ? "error" : "warning",
      status: "succeeded",
      actorUserId: receipt.ownerUserId,
      communityId: receipt.communityId,
      provider: "stripe",
      providerObjectId: pi ?? receipt.providerPaymentIntentId ?? receipt.providerCheckoutSessionId ?? null,
      metadata: {
        receiptKey: receipt.receiptKey,
        outcome: args.outcome,
        revokedReason: args.revokedReason,
      },
      createdAt: args.nowMs,
    });

    return { ok: true, ignored: false, receiptKey: receipt.receiptKey, outcome: args.outcome };
  },
});

// Webhook-authoritative dispute closure (won / lost / funds_reinstated) for one-time boost charges.
export const resolveFounderUsageBoostDisputeFromStripeInternal = internalMutation({
  args: {
    providerPaymentIntentId: v.optional(v.union(v.string(), v.null())),
    receiptKey: v.optional(v.union(v.string(), v.null())),
    outcome: v.union(
      v.literal("won"),
      v.literal("lost"),
      v.literal("funds_reinstated"),
      v.literal("unknown"),
    ),
    providerEventCreatedAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    let receipt: any = null;
    const pi = normalizeOptionalString(args.providerPaymentIntentId);
    const key = normalizeOptionalString(args.receiptKey);
    if (pi) {
      receipt = await ctx.db
        .query("founderUsageBoostReceipts")
        .withIndex("by_provider_payment_intent", (q) => q.eq("providerPaymentIntentId", pi))
        .first();
    }
    if (!receipt && key) {
      receipt = await ctx.db
        .query("founderUsageBoostReceipts")
        .withIndex("by_receipt_key", (q) => q.eq("receiptKey", key))
        .first();
    }
    if (!receipt) {
      return { ok: true, ignored: true, reason: "boost_receipt_not_found" };
    }
    if (args.outcome === "unknown") {
      return { ok: true, ignored: true, reason: "boost_dispute_outcome_unknown" };
    }
    const priorEventAt = Number(receipt.providerEventCreatedAt ?? 0);
    if (args.providerEventCreatedAt < priorEventAt) {
      return { ok: true, ignored: true, reason: "boost_dispute_event_stale" };
    }

    if (args.outcome === "lost") {
      await ctx.db.patch(receipt._id, {
        status: "disputed",
        revokedReason: "boost_dispute_lost",
        providerEventCreatedAt: args.providerEventCreatedAt,
        updatedAt: args.nowMs,
      });
      const subscription: any = await ctx.db.get(receipt.founderSubscriptionId);
      if (subscription && args.providerEventCreatedAt >= Number(subscription.riskStateChangedAt ?? 0)) {
        await ctx.db.patch(subscription._id, {
          status: "ended",
          endedAt: args.providerEventCreatedAt,
          riskAccessState: "revoked",
          riskStateChangedAt: args.providerEventCreatedAt,
          revokedReason: "subscription_dispute_lost",
          lastProviderEventCreatedAt: Math.max(
            Number(subscription.lastProviderEventCreatedAt ?? 0),
            args.providerEventCreatedAt,
          ),
          updatedAt: args.nowMs,
        });
      }
      return { ok: true, ignored: false, receiptKey: receipt.receiptKey, outcome: "lost" };
    }

    // Won or funds_reinstated: clear this receipt's dispute and restore the parent
    // subscription hold if no other disputed boost receipts remain on it.
    if (receipt.status !== "disputed") {
      return { ok: true, ignored: true, reason: "boost_receipt_not_disputed" };
    }

    const restoredStatus = receipt.grantedAt ? "granted" : "expired";
    await ctx.db.patch(receipt._id, {
      status: restoredStatus,
      revokedReason: undefined,
      revokedAt: undefined,
      providerEventCreatedAt: args.providerEventCreatedAt,
      updatedAt: args.nowMs,
    });

    // If this boost had been granted into a cycle that is still open, restore its allowance.
    if (restoredStatus === "granted") {
      const cycle: any = await ctx.db.get(receipt.usageCycleId);
      if (cycle && cycle.status === "open" && cycle.cycleEndAt > args.nowMs) {
        const grantedReceiptsInCycle = await ctx.db
          .query("founderUsageBoostReceipts")
          .withIndex("by_cycle_status", (q) =>
            q.eq("usageCycleId", cycle._id).eq("status", "granted"),
          )
          .collect();
        const totalGrantedMicros = grantedReceiptsInCycle.reduce(
          (sum, row) => sum + Number(row.grantedAllowanceMicros ?? 0),
          0,
        );
        const totalGrantedCount = grantedReceiptsInCycle.length;
        const nextBoost = Math.max(
          Math.max(0, Math.floor(Number(cycle.paidBoostCostMicros ?? 0))),
          totalGrantedMicros,
        );
        const nextCount = nextBoost === 0 ? 0 : Math.max(1, totalGrantedCount);
        await ctx.db.patch(cycle._id, {
          paidBoostCostMicros: nextBoost,
          paidBoostCount: nextCount,
          updatedAt: args.nowMs,
        });
      }
    }

    const remainingDisputed = await ctx.db
      .query("founderUsageBoostReceipts")
      .withIndex("by_subscription_status", (q) =>
        q.eq("founderSubscriptionId", receipt.founderSubscriptionId).eq("status", "disputed"),
      )
      .take(1);

    const subscription: any = await ctx.db.get(receipt.founderSubscriptionId);
    const shouldRestoreSubscription = Boolean(
      subscription &&
        remainingDisputed.length === 0 &&
        subscription.riskAccessState === "revoked" &&
        subscription.revokedReason === "subscription_dispute_opened" &&
        args.providerEventCreatedAt > Number(subscription.riskStateChangedAt ?? 0),
    );
    const restoreProviderSubscriptionId =
      shouldRestoreSubscription && typeof subscription.providerSubscriptionId === "string"
        ? subscription.providerSubscriptionId
        : null;

    await recordCriticalAuditEvent(ctx, {
      eventKey: `founder_usage_boost_revoked:${receipt.receiptKey}:${args.outcome}`,
      eventType: "founder_usage_boost_revoked",
      severity: "info",
      status: "succeeded",
      actorUserId: receipt.ownerUserId,
      communityId: receipt.communityId,
      provider: "stripe",
      providerObjectId: pi ?? receipt.providerPaymentIntentId ?? receipt.providerCheckoutSessionId ?? null,
      metadata: {
        receiptKey: receipt.receiptKey,
        outcome: args.outcome,
        revokedReason: "boost_dispute_cleared",
      },
      createdAt: args.nowMs,
    });

    return {
      ok: true,
      ignored: false,
      receiptKey: receipt.receiptKey,
      outcome: args.outcome,
      restoreProviderSubscriptionId,
    };
  },
});
