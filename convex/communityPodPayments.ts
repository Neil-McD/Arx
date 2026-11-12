// Paid pods (docs/specs/pods-v0.md, "Money and access"; slice 2b). Three
// parts: a monthly price on the pod, charged on top of membership; the
// member's subscription for it on the builder's Stripe account (Polynet's
// 2.9%); and the pod room's existing access row, which a granting payment
// writes and an ended one removes. The access rule itself is unchanged.
//
// Only Stripe grants: its verified notice (httpBilling) or, on return from
// checkout, Polynet asking Stripe directly. The return page grants nothing.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { fillCheckoutSuccessUrl, normalizeStripeCommunitySubscriptionStatus, requireCanonicalCheckoutReturnUrl } from "./billingCore";
import { setChannelParticipantCore } from "./communityChannelParticipants";
import { ensureCommunityStripeCustomerForUser } from "./communityCommerce";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, normalizeIdValue, requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { communitySubscriptionStatusGrantsAccess } from "./communitySubscriptionLifecycle";
import { canReceiveCommunityRevenue, getStripeConnectDestinationAccountId, isStripeConnectCheckoutCapabilityError } from "./stripeConnectAccountCore";
import { getStripeClient, requireStripeConnectWebhookConfiguration } from "./stripeCore";
import { cancelAndRefundDuplicateSubscription, cancelStripeSubscriptionIfActive } from "./stripeSubscriptionCancellation";
import { POLYNET_COMMUNITY_PLATFORM_FEE_BPS } from "../shared/founderPlan";
import { communityIsActive } from "../shared/communityLifecycle";

// Stripe's shortest checkout lifetime. While one is open, Join reopens it
// rather than starting a second, so nobody pays twice from two tabs.
const CHECKOUT_LIFETIME_MS = 30 * 60 * 1000;
// $1 to $10,000 a month, in base units.
const PRICE_MIN = 100;
const PRICE_MAX = 1_000_000;
const MEMBERS_CAP = 200;

export const POD_PAYMENT_METADATA_KEY = "pod_payment_id";

type PodPaymentStatus = "pending" | "active" | "past_due" | "cancel_at_period_end" | "ended" | "expired";

async function podRoom(ctx: any, communityId: any, channelId: any) {
  const channel = await ctx.db.get(channelId);
  if (!channel || normalizeIdValue(channel.communityId) !== normalizeIdValue(communityId)
    || channel.accessMode !== "restricted" || channel.status !== "active") throw new Error("community_pod_not_found");
  return channel;
}

async function podRecord(ctx: any, communityId: any, channelId: any) {
  return await ctx.db.query("communityPods")
    .withIndex("by_community_channel", (q: any) => q.eq("communityId", communityId).eq("channelId", channelId)).first();
}

async function activeGrants(ctx: any, channelId: any) {
  return (await ctx.db.query("communityChannelParticipants")
    .withIndex("by_channel_principal", (q: any) => q.eq("channelId", channelId)).take(MEMBERS_CAP))
    .filter((row: any) => row.status === "active" && String(row.principalKey).startsWith("user:"));
}

async function ownerRevenueAccount(ctx: any, community: any): Promise<string | null> {
  const account = await ctx.runQuery(internal.creatorCommerce.getUserStripeConnectAccountInternal as any, { userId: community.ownerId });
  const accountId = getStripeConnectDestinationAccountId(account);
  return canReceiveCommunityRevenue(account) && accountId ? accountId : null;
}

// The pod's price, as the page shows it. Null when the pod isn't paid.
export function podPriceOf(record: any): { amount_base_units: number; currency: string } | null {
  return typeof record?.priceAmountBaseUnits === "number" && record.priceAmountBaseUnits > 0
    ? { amount_base_units: record.priceAmountBaseUnits, currency: String(record.priceCurrency ?? "usd") }
    : null;
}

// Set a pod's monthly price (charged on top of membership), or 0 to make it
// not paid. Builders and admins, with Stripe connected. A new amount is for
// new joins only: existing members' subscriptions keep the price they paid.
export const savePodPrice = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
    amountBaseUnits: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    await podRoom(ctx, args.communityId, args.channelId);
    const amount = Math.floor(args.amountBaseUnits);
    if (amount !== 0 && (amount < PRICE_MIN || amount > PRICE_MAX)) throw new Error("community_pod_price_invalid");
    const community = await ctx.db.get(args.communityId);
    if (amount > 0 && !(await ownerRevenueAccount(ctx, community))) throw new Error("community_checkout_unavailable");
    const record = await podRecord(ctx, args.communityId, args.channelId);
    const nowMs = Date.now();
    const sameAmount = record?.priceAmountBaseUnits === amount;
    const patch = amount > 0
      ? { priceAmountBaseUnits: amount, priceCurrency: "usd", ...(sameAmount ? {} : { providerPriceId: undefined }) }
      : { priceAmountBaseUnits: undefined, providerPriceId: undefined };
    if (record) await ctx.db.patch(record._id, { ...patch, updatedAt: nowMs });
    else await ctx.db.insert("communityPods", { communityId: args.communityId, channelId: args.channelId, purpose: "", ...patch, createdAt: nowMs, updatedAt: nowMs } as any);
    return null;
  },
});

// Everything checkout needs, checked in one read: a member of this community
// (not already in the pod), a listed paid pod with a seat, and the builder
// able to take payments. An open checkout of theirs is returned to reuse.
export const podCheckoutConfigInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), channelId: v.id("communityChannels"), nowMs: v.number() },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId) as any;
    if (!community || !communityIsActive(community)) throw new Error("community_not_found");
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const channel = await podRoom(ctx, args.communityId, args.channelId);
    const record = await podRecord(ctx, args.communityId, args.channelId);
    const price = podPriceOf(record);
    if (!record || record.visibility !== "listed" || !price) throw new Error("community_pod_not_paid");
    const grants = await activeGrants(ctx, args.channelId);
    if (grants.some((row: any) => row.principalKey === `user:${normalizeIdValue(args.userId)}`)) throw new Error("already_in_pod");
    if (typeof record.seats === "number" && grants.length >= record.seats) throw new Error("community_pod_full");
    const providerAccountId = await ownerRevenueAccount(ctx, community);
    if (!providerAccountId) throw new Error("community_checkout_unavailable");
    const open = (await ctx.db.query("communityPodPayments")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", args.channelId).eq("userId", args.userId)).collect())
      .find((row: any) => row.status === "pending" && row.checkoutUrl && row.checkoutExpiresAt > args.nowMs + 60_000
        && row.amountBaseUnits === price.amount_base_units && row.providerAccountId === providerAccountId);
    return {
      communityName: String(community.name ?? ""),
      podName: String(channel.name ?? ""),
      amountBaseUnits: price.amount_base_units,
      currency: price.currency,
      providerAccountId,
      // Made on the builder's account for this amount; reused while it holds.
      providerProductId: record.providerAccountId === providerAccountId ? record.providerProductId ?? null : null,
      providerPriceId: record.providerAccountId === providerAccountId ? record.providerPriceId ?? null : null,
      openCheckoutUrl: open?.checkoutUrl ?? null,
    };
  },
});

export const attachPodProviderPriceInternal = internalMutation({
  args: { communityId: v.id("communities"), channelId: v.id("communityChannels"), providerAccountId: v.string(), providerProductId: v.string(), providerPriceId: v.string(), amountBaseUnits: v.number() },
  handler: async (ctx, args) => {
    const record = await podRecord(ctx, args.communityId, args.channelId);
    // The builder changed the price meanwhile: keep the new amount unpriced.
    if (!record || record.priceAmountBaseUnits !== args.amountBaseUnits) return null;
    await ctx.db.patch(record._id, { providerAccountId: args.providerAccountId, providerProductId: args.providerProductId, providerPriceId: args.providerPriceId, updatedAt: Date.now() });
    return null;
  },
});

export const createPendingPodPaymentInternal = internalMutation({
  args: { communityId: v.id("communities"), channelId: v.id("communityChannels"), userId: v.id("users"), amountBaseUnits: v.number(), currency: v.string(), providerAccountId: v.string(), providerPriceId: v.string(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const { nowMs, ...rest } = args;
    return await ctx.db.insert("communityPodPayments", { ...rest, status: "pending", checkoutExpiresAt: nowMs + CHECKOUT_LIFETIME_MS, createdAt: nowMs, updatedAt: nowMs });
  },
});

export const attachPodCheckoutInternal = internalMutation({
  args: { paymentId: v.id("communityPodPayments"), providerCheckoutSessionId: v.string(), checkoutUrl: v.string(), providerCustomerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { paymentId, ...rest } = args;
    await ctx.db.patch(paymentId, { ...rest, updatedAt: Date.now() });
    return null;
  },
});

export const expirePodPaymentInternal = internalMutation({
  args: { paymentId: v.id("communityPodPayments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.paymentId);
    if (row?.status === "pending") await ctx.db.patch(args.paymentId, { status: "expired", updatedAt: Date.now() });
    return null;
  },
});

// Join a paid pod: returns Stripe's checkout page. Signed-in members only.
export const startPodCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
    // Polynet's own pages; {CHECKOUT_SESSION_ID} becomes the payment's id.
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ checkout_url: string }> => {
    const successUrl = requireCanonicalCheckoutReturnUrl(args.successUrl, "checkout_success_url_invalid");
    const cancelUrl = requireCanonicalCheckoutReturnUrl(args.cancelUrl, "checkout_cancel_url_invalid");
    if (!args.authSubject) throw new Error("auth_subject_required");
    const actor = await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, { authSubject: args.authSubject }) as { dbUserId?: any; email?: string | null } | null;
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("auth_subject_required");
    requireStripeConnectWebhookConfiguration();
    const nowMs = Date.now();
    const config = await ctx.runQuery(internal.communityPodPayments.podCheckoutConfigInternal, {
      userId, communityId: args.communityId, channelId: args.channelId, nowMs,
    });
    if (config.openCheckoutUrl) return { checkout_url: config.openCheckoutUrl };
    const stripe = getStripeClient();
    const stripeAccount = config.providerAccountId;
    const podKey = `${stripeAccount}:${String(args.channelId)}`;
    const metadata = { community_id: String(args.communityId), pod_channel_id: String(args.channelId) };
    try {
      let providerPriceId = config.providerPriceId;
      if (!providerPriceId) {
        const productId = config.providerProductId ?? (await stripe.products.create(
          { name: `${config.podName} (${config.communityName})`, metadata },
          { stripeAccount, idempotencyKey: `pod-product:${podKey}` },
        )).id;
        const price = await stripe.prices.create({
          currency: config.currency, unit_amount: config.amountBaseUnits, recurring: { interval: "month" }, product: productId, metadata,
        }, { stripeAccount, idempotencyKey: `pod-price:${podKey}:${productId}:${config.amountBaseUnits}:${config.currency}` });
        providerPriceId = price.id;
        await ctx.runMutation(internal.communityPodPayments.attachPodProviderPriceInternal, {
          communityId: args.communityId, channelId: args.channelId, providerAccountId: stripeAccount,
          providerProductId: productId, providerPriceId, amountBaseUnits: config.amountBaseUnits,
        });
      }
      const customer = await ensureCommunityStripeCustomerForUser({ ctx, userId, email: actor?.email ?? null, providerAccountId: stripeAccount, nowMs });
      const paymentId = await ctx.runMutation(internal.communityPodPayments.createPendingPodPaymentInternal, {
        communityId: args.communityId, channelId: args.channelId, userId, amountBaseUnits: config.amountBaseUnits,
        currency: config.currency, providerAccountId: stripeAccount, providerPriceId, nowMs,
      });
      const paymentMetadata = { ...metadata, [POD_PAYMENT_METADATA_KEY]: String(paymentId) };
      try {
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer,
          success_url: fillCheckoutSuccessUrl(successUrl, String(paymentId)),
          cancel_url: cancelUrl,
          client_reference_id: String(paymentId),
          expires_at: Math.floor((nowMs + CHECKOUT_LIFETIME_MS) / 1000),
          line_items: [{ price: providerPriceId, quantity: 1 }],
          metadata: paymentMetadata,
          subscription_data: { application_fee_percent: POLYNET_COMMUNITY_PLATFORM_FEE_BPS / 100, metadata: paymentMetadata },
        }, { stripeAccount, idempotencyKey: `pod-checkout:${stripeAccount}:${String(paymentId)}` });
        const checkoutUrl = String(session.url ?? "").trim();
        if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
        await ctx.runMutation(internal.communityPodPayments.attachPodCheckoutInternal, {
          paymentId, providerCheckoutSessionId: session.id, checkoutUrl,
        });
        return { checkout_url: checkoutUrl };
      } catch (error) {
        // Nothing was paid: an unopened checkout just lapses.
        await ctx.runMutation(internal.communityPodPayments.expirePodPaymentInternal, { paymentId });
        throw error;
      }
    } catch (error) {
      if (isStripeConnectCheckoutCapabilityError(error)) throw new Error("community_checkout_unavailable");
      throw error;
    }
  },
});

// What Stripe says about a pod payment's subscription, applied: the row's
// status, then the grant. Older notices than the last one applied are ignored.
export const syncPodPaymentInternal = internalMutation({
  args: {
    paymentId: v.id("communityPodPayments"),
    providerAccountId: v.string(),
    providerSubscriptionId: v.string(),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    subscriptionStatus: v.string(),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    currentPeriodEndAt: v.optional(v.union(v.number(), v.null())),
    providerEventAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.paymentId);
    if (!row) return { ignored: true, reason: "pod_payment_not_found" };
    if (row.providerAccountId !== args.providerAccountId) throw new Error("community_subscription_provider_account_mismatch");
    if (row.providerSubscriptionId && row.providerSubscriptionId !== args.providerSubscriptionId) return { ignored: true, reason: "pod_payment_subscription_mismatch" };
    if (typeof row.lastProviderEventAt === "number" && args.providerEventAt < row.lastProviderEventAt) return { ignored: true, reason: "stale_event" };
    if (row.status === "ended") return { ignored: true, reason: "pod_payment_ended" };
    const normalized = normalizeStripeCommunitySubscriptionStatus({ subscriptionStatus: args.subscriptionStatus, cancelAtPeriodEnd: args.cancelAtPeriodEnd });
    const status: PodPaymentStatus = normalized === "canceled" ? "ended" : normalized;
    const nowMs = Date.now();
    const grants = communitySubscriptionStatusGrantsAccess(status);
    let grantedAt: number | undefined = row.grantedAt;
    if (grants && !grantedAt) {
      // A member who has since left the community isn't added; slice 2c stops
      // their billing.
      const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: row.communityId, userId: row.userId });
      const room = await ctx.db.get(row.channelId) as any;
      if (membership && communityMembershipRowIsActive(membership) && room?.status === "active") {
        await setChannelParticipantCore(ctx, { communityId: row.communityId, channelId: row.channelId, createdByUserId: row.userId, active: true, target: { kind: "member", userId: row.userId } });
        grantedAt = nowMs;
      }
    } else if (!grants && grantedAt) {
      const others = (await ctx.db.query("communityPodPayments")
        .withIndex("by_channel_user", (q: any) => q.eq("channelId", row.channelId).eq("userId", row.userId)).collect())
        .some((other: any) => String(other._id) !== String(row._id) && other.grantedAt);
      if (!others) await setChannelParticipantCore(ctx, { communityId: row.communityId, channelId: row.channelId, createdByUserId: row.userId, active: false, target: { kind: "member", userId: row.userId } });
      grantedAt = undefined;
    }
    await ctx.db.patch(row._id, {
      status,
      providerSubscriptionId: args.providerSubscriptionId,
      ...(args.providerCustomerId ? { providerCustomerId: args.providerCustomerId } : {}),
      ...(typeof args.currentPeriodEndAt === "number" ? { currentPeriodEndAt: args.currentPeriodEndAt } : {}),
      grantedAt,
      lastProviderEventAt: args.providerEventAt,
      updatedAt: nowMs,
    });
    return { ok: true, status, granted: Boolean(grantedAt) };
  },
});

export const getPodPaymentInternal = internalQuery({
  args: { paymentId: v.id("communityPodPayments") },
  handler: async (ctx, args) => await ctx.db.get(args.paymentId),
});

function periodEndOf(subscription: any): number | null {
  const seconds = Number(subscription?.items?.data?.[0]?.current_period_end ?? subscription?.current_period_end ?? 0);
  return seconds > 0 ? seconds * 1000 : null;
}

// From a Stripe subscription (a notice, or a fresh read) to the payment row.
export async function syncPodPaymentFromStripeSubscription(ctx: any, args: {
  paymentId: string; providerAccountId: string; subscription: any; providerEventAt: number;
}) {
  return await ctx.runMutation(internal.communityPodPayments.syncPodPaymentInternal, {
    paymentId: args.paymentId as any,
    providerAccountId: args.providerAccountId,
    providerSubscriptionId: String(args.subscription.id),
    providerCustomerId: typeof args.subscription.customer === "string" ? args.subscription.customer : null,
    subscriptionStatus: String(args.subscription.status ?? ""),
    cancelAtPeriodEnd: Boolean(args.subscription.cancel_at_period_end),
    currentPeriodEndAt: periodEndOf(args.subscription),
    providerEventAt: args.providerEventAt,
  });
}

// A completed checkout (a notice, or the member back from Stripe): only a
// complete, paid checkout on the builder's account for this payment counts.
export async function syncPodPaymentFromCheckoutSession(ctx: any, args: {
  paymentId: string; providerAccountId: string; session: any; providerEventAt: number;
}): Promise<"synced" | "not_paid" | "mismatch"> {
  const row = await ctx.runQuery(internal.communityPodPayments.getPodPaymentInternal, { paymentId: args.paymentId as any });
  if (!row || row.providerAccountId !== args.providerAccountId) return "mismatch";
  if (args.session?.metadata?.[POD_PAYMENT_METADATA_KEY] !== String(row._id)) return "mismatch";
  if (args.session.status !== "complete" || args.session.payment_status === "unpaid") return "not_paid";
  const subscriptionId = typeof args.session.subscription === "string" ? args.session.subscription : args.session.subscription?.id;
  if (!subscriptionId) return "not_paid";
  const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId, {}, { stripeAccount: args.providerAccountId });
  await syncPodPaymentFromStripeSubscription(ctx, { paymentId: args.paymentId, providerAccountId: args.providerAccountId, subscription, providerEventAt: args.providerEventAt });
  return "synced";
}

// Back from Stripe: if Polynet hasn't heard yet, ask Stripe about this
// payment. Only its own buyer can ask.
export const confirmPodCheckout = action({
  args: { authSubject: v.optional(v.string()), paymentId: v.string() },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const actor = await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, { authSubject: args.authSubject }) as { dbUserId?: any } | null;
    if (!actor?.dbUserId) throw new Error("auth_subject_required");
    const paymentId = await ctx.runQuery(internal.communityPodPayments.normalizePodPaymentIdInternal, { paymentId: args.paymentId });
    if (!paymentId) return { status: "not_found" };
    const row = await ctx.runQuery(internal.communityPodPayments.getPodPaymentInternal, { paymentId });
    if (!row || String(row.userId) !== String(actor.dbUserId)) return { status: "not_found" };
    if (row.status !== "pending" || !row.providerCheckoutSessionId) return { status: row.status };
    const session = await getStripeClient().checkout.sessions.retrieve(row.providerCheckoutSessionId, {}, { stripeAccount: row.providerAccountId });
    const outcome = await syncPodPaymentFromCheckoutSession(ctx, { paymentId: String(row._id), providerAccountId: row.providerAccountId, session, providerEventAt: Date.now() });
    if (outcome !== "synced") return { status: "pending" };
    const after = await ctx.runQuery(internal.communityPodPayments.getPodPaymentInternal, { paymentId });
    return { status: after?.status ?? "pending" };
  },
});

export const normalizePodPaymentIdInternal = internalQuery({
  args: { paymentId: v.string() },
  handler: async (ctx, args) => ctx.db.normalizeId("communityPodPayments", args.paymentId),
});


// Slice 2c: the endings Stripe doesn't send as a subscription change.

// Ends a payment for good and takes its grant away (unless another payment of
// theirs still grants). Returns what to stop in Stripe, or null.
async function endPodPayment(ctx: any, row: any, nowMs: number) {
  if (row.grantedAt) {
    const others = (await ctx.db.query("communityPodPayments")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", row.channelId).eq("userId", row.userId)).collect())
      .some((other: any) => String(other._id) !== String(row._id) && other.grantedAt);
    if (!others) await setChannelParticipantCore(ctx, { communityId: row.communityId, channelId: row.channelId, createdByUserId: row.userId, active: false, target: { kind: "member", userId: row.userId } });
  }
  await ctx.db.patch(row._id, { status: "ended", grantedAt: undefined, updatedAt: nowMs });
}

// A full refund or an opened (or lost) dispute on a pod payment: that pod's
// access ends and its subscription stops. A won dispute doesn't reopen it;
// the member can join again.
export const endPodPaymentForRiskInternal = internalMutation({
  args: { providerAccountId: v.string(), providerSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("communityPodPayments")
      .withIndex("by_provider_subscription", (q: any) => q.eq("providerAccountId", args.providerAccountId).eq("providerSubscriptionId", args.providerSubscriptionId)).first();
    if (!row) return { found: false as const };
    if (row.status !== "ended") await endPodPayment(ctx, row, Date.now());
    return { found: true as const };
  },
});

export async function endPodPaymentForRisk(ctx: any, args: { providerAccountId: string; providerSubscriptionId: string; reason: string }) {
  const result = await ctx.runMutation(internal.communityPodPayments.endPodPaymentForRiskInternal, {
    providerAccountId: args.providerAccountId, providerSubscriptionId: args.providerSubscriptionId,
  });
  if (!result.found) return null;
  await cancelStripeSubscriptionIfActive({ providerAccountId: args.providerAccountId, providerSubscriptionId: args.providerSubscriptionId });
  return { ok: true, pod_payment: true, provider_subscription_id: args.providerSubscriptionId, revoked_reason: args.reason };
}

const SWEEP_BATCH = 200;
const GRANTING: PodPaymentStatus[] = ["active", "past_due", "cancel_at_period_end"];

// Paying for a pod you can't reach: you left or were removed from the
// community, a host took you off the pod, or the pod's room closed. One rule
// covers all of them. Never let in (paid as they left): cancel and refund in
// full. Let in, then off: cancel, keeping what was already paid.
export const listUnreachablePodPaymentsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const found: Array<{ paymentId: any; providerAccountId: string; providerSubscriptionId: string; refund: boolean }> = [];
    for (const status of GRANTING) {
      const rows = await ctx.db.query("communityPodPayments").withIndex("by_status", (q: any) => q.eq("status", status)).take(SWEEP_BATCH);
      for (const row of rows) {
        if (!row.providerSubscriptionId) continue;
        const room = await ctx.db.get(row.channelId) as any;
        const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: row.communityId, userId: row.userId });
        const grant = (await ctx.db.query("communityChannelParticipants")
          .withIndex("by_channel_principal", (q: any) => q.eq("channelId", row.channelId).eq("principalKey", `user:${row.userId}`)).first()) as any;
        const reachable = Boolean(room?.status === "active" && membership && communityMembershipRowIsActive(membership)
          && grant?.status === "active" && normalizeIdValue(grant.membershipId) === normalizeIdValue(membership._id)
          && Number(grant.membershipActivationSequence ?? 0) === Math.max(0, Math.floor(Number(membership.activationSequence ?? 0))));
        if (!reachable) found.push({ paymentId: row._id, providerAccountId: row.providerAccountId, providerSubscriptionId: row.providerSubscriptionId, refund: !row.grantedAt });
      }
    }
    return found;
  },
});

export const endUnreachablePodPaymentInternal = internalMutation({
  args: { paymentId: v.id("communityPodPayments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.paymentId);
    if (row && row.status !== "ended") await endPodPayment(ctx, row, Date.now());
    return null;
  },
});

export const sweepUnreachablePodPaymentsInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; stopped: number }> => {
    const targets: Array<{ paymentId: any; providerAccountId: string; providerSubscriptionId: string; refund: boolean }> =
      await ctx.runQuery(internal.communityPodPayments.listUnreachablePodPaymentsInternal, {});
    let stopped = 0;
    for (const target of targets) {
      try {
        const stripeTarget = { providerAccountId: target.providerAccountId, providerSubscriptionId: target.providerSubscriptionId };
        if (target.refund) await cancelAndRefundDuplicateSubscription(stripeTarget);
        else await cancelStripeSubscriptionIfActive(stripeTarget);
        await ctx.runMutation(internal.communityPodPayments.endUnreachablePodPaymentInternal, { paymentId: target.paymentId });
        stopped += 1;
      } catch (error) {
        // Left as it was; the next sweep tries again.
        console.error("pod_payment_sweep_failed", { paymentId: String(target.paymentId), error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { checked: targets.length, stopped };
  },
});
