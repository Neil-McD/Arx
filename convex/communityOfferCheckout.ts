import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalQuery, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair } from "./communityCore";
import { ensureCommunityProviderPriceId } from "./communityCommerce";
import {
  communityOfferDefinitionOf,
  readCommunityOfferRows,
  resolveCommunityOfferCheckoutPricePoint,
  resolveMemberOfferKey,
} from "./communityOfferAccessCore";
import { getStripeClient } from "./stripeCore";
import { resolveCommunityOfferLadder } from "../shared/communityOffers";

// Buying a higher offer. A visitor buys it at checkout (startPublicCommunityCheckout
// with offerKey). A member who already pays switches their plan to it here, so
// they never pay for two plans; Stripe charges the difference for the rest of
// the period straight away, and the switch only happens once that is paid.

const LIVE = new Set(["active", "past_due", "cancel_at_period_end"]);

function priceOf(row: any) {
  return { billing_period: row.billingPeriod as "monthly" | "annual", amount_base_units: row.amountBaseUnits as number,
    currency: row.currency as string, currency_decimals: row.currencyDecimals as number };
}

/** What a visitor or member sees: the offers on sale, lowest first, and the one they are on. Empty until the owner saves an offer. */
export const getCommunityOffersForVisitor = query({
  args: { communityId: v.id("communities"), userId: v.optional(v.id("users")), authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const offerRows = await readCommunityOfferRows(ctx, args.communityId);
    const community = await ctx.db.get(args.communityId);
    if (!community || !offerRows.length) return { offers: [], current_offer_key: null, can_upgrade_here: false };
    const prices = await ctx.db.query("communityPricePoints").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).take(200);
    const ladder = resolveCommunityOfferLadder(offerRows.map(communityOfferDefinitionOf));
    const offers = ladder.filter((offer) => !offer.archived).flatMap((offer) => {
      const row = offerRows.find((item: any) => item.key === offer.key);
      if (row && !offer.isBase && !row.showOnSalesPage) return [];
      const own = prices.filter((price: any) => !price.archivedAt && (offer.isBase
        ? !price.offerId && price.isCurrent
        : String(price.offerId) === String(row?._id)));
      const latest = (period: string) => own.filter((price: any) => price.billingPeriod === period).sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
      const monthly = latest("monthly");
      const annual = latest("annual");
      if (!offer.isBase && !monthly && !annual) return [];
      return [{ key: offer.key, name: offer.name, blurb: row?.blurb ?? null, rank: offer.rank, is_base: Boolean(offer.isBase),
        prices: [monthly, annual].filter(Boolean).map(priceOf) }];
    });

    // Signed out is fine here: a visitor sees the offers and no current one.
    const userId: any = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null })
      .catch(() => null);
    const membership = userId ? await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId }) : null;
    const current = membership ? await resolveMemberOfferKey(ctx, { communityId: args.communityId, membership, offerRows }) : null;
    let canUpgradeHere = false;
    if (membership && current) {
      const subscriptions = await ctx.db.query("communitySubscriptions")
        .withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id)).take(20);
      canUpgradeHere = subscriptions.some((row: any) => row.source === "stripe" && LIVE.has(row.status) && row.providerSubscriptionId);
    }
    return { offers, current_offer_key: current, can_upgrade_here: canUpgradeHere };
  },
});

export const planCommunityOfferUpgradeInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users"), offerKey: v.string() },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_not_found");
    const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: args.userId });
    if (!membership || !communityMembershipRowIsActive(membership)) return { kind: "checkout" as const };
    const offerRows = await readCommunityOfferRows(ctx, args.communityId);
    const currentKey = await resolveMemberOfferKey(ctx, { communityId: args.communityId, membership, offerRows });
    const currentRank = offerRows.find((row: any) => row.key === currentKey)?.rank ?? 0;

    const subscriptions = await ctx.db.query("communitySubscriptions")
      .withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id)).take(20);
    const live = subscriptions.filter((row: any) => row.source === "stripe" && LIVE.has(row.status) && row.providerSubscriptionId)
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
    // Access the owner gave by hand changes the same way: the owner changes it.
    if (!live) throw new Error("offer_upgrade_ask_owner");
    if (live.status !== "active") throw new Error("offer_upgrade_payment_issue");
    const currentPrice = live.pricePointId ? await ctx.db.get(live.pricePointId) : null;
    const period: "monthly" | "annual" = currentPrice?.billingPeriod === "annual" ? "annual" : "monthly";
    let target = null;
    for (const billingPeriod of [period, period === "monthly" ? "annual" as const : "monthly" as const]) {
      try {
        target = await resolveCommunityOfferCheckoutPricePoint(ctx, { communityId: args.communityId, offerKey: args.offerKey, billingPeriod });
        if (target) break;
      } catch (error) {
        if (!(error instanceof Error && error.message === "offer_price_missing")) throw error;
      }
    }
    if (!target) throw new Error(args.offerKey === currentKey ? "offer_upgrade_not_higher" : "offer_price_missing");
    if (target.rank <= currentRank) throw new Error("offer_upgrade_not_higher");
    const providerAccountId = String(live.providerAccountId ?? "").trim();
    const pricePoint = target.pricePoint;
    return {
      kind: "update" as const,
      communityId: args.communityId,
      communitySlug: community.slug as string,
      communityName: community.name as string,
      oneLiner: typeof community.oneLiner === "string" ? community.oneLiner : null,
      offerKey: target.offerKey,
      offerName: target.offerName,
      billingPeriod: pricePoint.billingPeriod as "monthly" | "annual",
      pricePointId: pricePoint._id,
      amountBaseUnits: pricePoint.amountBaseUnits as number,
      currency: pricePoint.currency as string,
      providerPriceId: String(pricePoint.providerAccountId ?? "").trim() === providerAccountId
        ? String(pricePoint.providerPriceId ?? "").trim() || null : null,
      providerAccountId,
      providerSubscriptionId: String(live.providerSubscriptionId),
    };
  },
});

/** A paying member moves up to a higher offer. Returns checkout_required when they are not a member yet. */
export const startCommunityOfferUpgrade = action({
  args: {
    communityId: v.id("communities"),
    offerKey: v.string(),
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<
    | { status: "checkout_required" }
    | { status: "upgraded"; offer_key: string }
    | { status: "payment_needed"; offer_key: string; invoice_url: string | null }
  > => {
    const nowMs = Date.now();
    if (!args.authSubject) throw new Error("auth_subject_required");
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject,
    })) as { dbUserId?: any } | null;
    if (!actor?.dbUserId) throw new Error("auth_subject_required");
    const plan = (await ctx.runQuery(internal.communityOfferCheckout.planCommunityOfferUpgradeInternal as any, {
      communityId: args.communityId, userId: actor.dbUserId, offerKey: args.offerKey,
    })) as any;
    if (plan.kind === "checkout") return { status: "checkout_required" };

    const providerPriceId = await ensureCommunityProviderPriceId(ctx, plan, nowMs);
    const stripe = getStripeClient();
    const options = { stripeAccount: plan.providerAccountId };
    const subscription: any = await stripe.subscriptions.retrieve(plan.providerSubscriptionId, {}, options);
    const item = subscription.items?.data?.[0];
    if (!item) throw new Error("offer_upgrade_unavailable");
    const updated: any = await stripe.subscriptions.update(plan.providerSubscriptionId, {
      items: [{ id: item.id, price: providerPriceId }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      metadata: { ...(subscription.metadata ?? {}), community_price_point_id: String(plan.pricePointId), offer_key: plan.offerKey },
      expand: ["latest_invoice"],
    }, { ...options, idempotencyKey: `community-offer-upgrade:${plan.providerSubscriptionId}:${String(plan.pricePointId)}` });
    if (updated.pending_update) {
      const invoice = typeof updated.latest_invoice === "object" ? updated.latest_invoice : null;
      return { status: "payment_needed", offer_key: plan.offerKey, invoice_url: invoice?.hosted_invoice_url ?? null };
    }
    // The webhook says the same thing a moment later; this makes it show now.
    await ctx.runMutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal as any, {
      communityId: plan.communityId,
      userId: actor.dbUserId,
      source: "stripe",
      status: updated.cancel_at_period_end ? "cancel_at_period_end" : updated.status === "past_due" ? "past_due" : "active",
      pricePointId: plan.pricePointId,
      providerAccountId: plan.providerAccountId,
      providerPriceId,
      providerSubscriptionId: plan.providerSubscriptionId,
      cancelAtPeriodEnd: Boolean(updated.cancel_at_period_end),
      nowMs: Date.now(),
    });
    return { status: "upgraded", offer_key: plan.offerKey };
  },
});
