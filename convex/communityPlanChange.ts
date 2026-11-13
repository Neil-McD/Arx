// Changing plan (docs/specs/pods-v0.md "Plans include pods"; slice 3): a member
// who pays Polynet for their plan moves to another plan on sale, monthly. The
// founder's Stripe subscription moves to the new plan's price; Stripe's notice
// then records it (communityCommerce.syncCommunitySubscriptionLifecycleInternal:
// the price Stripe bills is theirs), and the plan's pods and grants follow
// (communityPlanPods.memberAccessChanged). Nothing changes here before Stripe says so.
//
// Up: charged the difference now, and only moved once that payment goes through
// (Stripe's pending_if_incomplete). Down: moved now, the unused part credited.
import { v } from "convex/values";
import { action, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair } from "./communityCore";
import { getStripeClient } from "./stripeCore";
import { ensureCommunityProviderPrice } from "./communityCommerce";

const PLAN_KEY = /^[a-z0-9][a-z0-9-]{0,31}$/;
const BASE = "member";

type Plan = { key: string | null; name: string; price: any; includes: string[] };

async function podNames(ctx: any, communityId: any, ids: any[] | undefined): Promise<string[]> {
  const names: string[] = [];
  for (const id of ids ?? []) {
    const room = await ctx.db.get(id) as any;
    if (room && String(room.communityId) === String(communityId) && room.status === "active" && room.accessMode === "restricted") names.push(String(room.name ?? ""));
  }
  return names.filter(Boolean).slice(0, 4);
}

// The plans on sale, monthly: the base membership, then every live named plan, in order.
async function plansOnSale(ctx: any, communityId: any): Promise<Plan[]> {
  const prices = (await ctx.db.query("communityPricePoints")
    .withIndex("by_community_current", (q: any) => q.eq("communityId", communityId).eq("isCurrent", true)).collect())
    .filter((row: any) => !row.archivedAt && row.billingPeriod === "monthly")
    .sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  const tiers = (await ctx.db.query("communityTiers").withIndex("by_community_key", (q: any) => q.eq("communityId", communityId)).collect())
    .filter((tier: any) => !tier.archivedAt).sort((a: any, b: any) => a.rank - b.rank);
  const plans: Plan[] = [];
  const basePrice = prices.find((row: any) => !row.tierKey);
  const baseTier = tiers.find((tier: any) => tier.key === BASE);
  if (basePrice) plans.push({ key: null, name: baseTier?.name ?? "Membership", price: basePrice, includes: await podNames(ctx, communityId, baseTier?.podChannelIds) });
  for (const tier of tiers) {
    if (tier.key === BASE || !PLAN_KEY.test(tier.key)) continue;
    const price = prices.find((row: any) => row.tierKey === tier.key);
    if (price) plans.push({ key: tier.key, name: tier.name, price, includes: await podNames(ctx, communityId, tier.podChannelIds) });
  }
  return plans;
}

// What a member pays Polynet now, if they can change it: an active (not leaving)
// Stripe subscription on a monthly price.
async function payingNow(ctx: any, communityId: any, userId: any) {
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId, userId });
  if (!membership || !communityMembershipRowIsActive(membership)) return { membership: null, subscription: null, price: null, reason: "not_member" as const };
  if (membership.accessSource !== "paid_subscription") return { membership, subscription: null, price: null, reason: "not_paying_polynet" as const };
  const subscription = (await ctx.db.query("communitySubscriptions").withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id)).collect())
    .find((row: any) => row.status === "active" && row.source === "stripe" && row.providerSubscriptionId && row.providerAccountId) ?? null;
  if (!subscription) return { membership, subscription: null, price: null, reason: "not_changeable_now" as const };
  const price = await ctx.db.get(subscription.pricePointId) as any;
  if (!price || price.billingPeriod !== "monthly") return { membership, subscription, price, reason: "not_changeable_now" as const };
  return { membership, subscription, price, reason: null };
}

const view = (plan: Plan) => ({
  key: plan.key, name: plan.name, includes: plan.includes,
  amount_base_units: plan.price.amountBaseUnits, currency: plan.price.currency, currency_decimals: plan.price.currencyDecimals ?? 2,
});

/** A member's own plan in this community, and the others they could move to. */
export const getMyCommunityPlan = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const now = await payingNow(ctx, args.communityId, userId);
    if (!now.membership) return { member: false, can_change: false, reason: now.reason, current: null, plans: [] };
    const plans = await plansOnSale(ctx, args.communityId);
    const heldKey = now.price ? (now.price.tierKey ?? null) : null;
    const current = now.price ? (plans.find((plan) => plan.key === heldKey) ?? null) : null;
    return {
      member: true,
      can_change: now.reason === null && plans.length > 1,
      reason: now.reason,
      current: current ? { key: current.key, name: current.name, includes: current.includes } : null,
      plans: plans.map((plan) => ({ ...view(plan), current: Boolean(now.price) && plan.key === heldKey })),
    };
  },
});

/** The move asked for, checked: what to charge and on which Stripe account. */
export const planChangeTargetInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), plan: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const now = await payingNow(ctx, args.communityId, args.userId);
    if (now.reason || !now.subscription || !now.price) throw new Error(now.reason === "not_member" ? "community_membership_required" : "plan_change_unavailable");
    const plans = await plansOnSale(ctx, args.communityId);
    const target = plans.find((plan) => plan.key === args.plan);
    if (!target) throw new Error("plan_unavailable");
    if ((now.price.tierKey ?? null) === target.key) throw new Error("already_on_plan");
    const account = String(now.subscription.providerAccountId);
    if (target.price.providerAccountId && String(target.price.providerAccountId) !== account) throw new Error("plan_change_unavailable");
    const community = await ctx.db.get(args.communityId) as any;
    return {
      providerAccountId: account,
      providerSubscriptionId: String(now.subscription.providerSubscriptionId),
      up: target.price.amountBaseUnits > now.price.amountBaseUnits,
      price: {
        pricePointId: target.price._id, providerAccountId: account, providerPriceId: target.price.providerPriceId ?? null,
        communityId: args.communityId, communitySlug: String(community?.slug ?? ""), communityName: String(community?.name ?? ""),
        tierName: target.key ? target.name : null, oneLiner: community?.oneLiner ?? null,
        billingPeriod: "monthly", currency: target.price.currency, amountBaseUnits: target.price.amountBaseUnits,
      },
    };
  },
});

/** Move my plan. Stripe's notice records it; until then the plan shown is the old one. */
export const changeMyCommunityPlan = action({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), plan: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ status: "changing" | "payment_problem" }> => {
    const actor = await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, { authSubject: args.authSubject }) as { dbUserId?: any } | null;
    if (!actor?.dbUserId) throw new Error("auth_subject_required");
    if (args.plan !== null && !PLAN_KEY.test(args.plan)) throw new Error("plan_unavailable");
    const target = await ctx.runQuery(internal.communityPlanChange.planChangeTargetInternal, { userId: actor.dbUserId, communityId: args.communityId, plan: args.plan }) as any;
    const priceId = await ensureCommunityProviderPrice(ctx, target.price, Date.now());
    const stripe = getStripeClient();
    const options = { stripeAccount: target.providerAccountId };
    const subscription = await stripe.subscriptions.retrieve(target.providerSubscriptionId, {}, options);
    const item = subscription.items?.data?.[0];
    if (!item?.id) throw new Error("plan_change_unavailable");
    if (item.price?.id === priceId) return { status: "changing" };
    const updated = await stripe.subscriptions.update(target.providerSubscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: target.up ? "always_invoice" : "create_prorations",
      payment_behavior: "pending_if_incomplete",
    }, { ...options, idempotencyKey: `community-plan-change:${target.providerSubscriptionId}:${priceId}:${Math.floor(Date.now() / 60_000)}` });
    // An upgrade whose payment didn't go through stays pending: still on the old plan.
    return { status: (updated as any).pending_update ? "payment_problem" : "changing" };
  },
});
