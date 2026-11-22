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
import { seatReasons, setChannelParticipantCore } from "./communityChannelParticipants";
import { ensureCommunityStripeCustomerForUser } from "./communityCommerce";
import { communityMembershipRowIsActive, getActiveCommunityBlock, getUniqueCommunityMembershipByPair, normalizeIdValue, requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { communitySubscriptionStatusGrantsAccess } from "./communitySubscriptionLifecycle";
import { canReceiveCommunityRevenue, getStripeConnectDestinationAccountId, isStripeConnectCheckoutCapabilityError } from "./stripeConnectAccountCore";
import { getStripeClient, requireStripeConnectWebhookConfiguration } from "./stripeCore";
import { cancelAndRefundDuplicateSubscription, cancelStripeSubscriptionAtPeriodEnd, cancelStripeSubscriptionIfActive } from "./stripeSubscriptionCancellation";
import { enqueueCommunityBillingIssueEmailInternal } from "./emailEvents";
import { POLYNET_COMMUNITY_PLATFORM_FEE_BPS } from "../shared/founderPlan";
import { communityIsActive } from "../shared/communityLifecycle";

// A little over Stripe's shortest checkout lifetime (30 minutes from when
// Stripe creates it). While one is open, Join reopens it rather than starting
// a second, so nobody pays twice from two tabs.
const CHECKOUT_LIFETIME_MS = 35 * 60 * 1000;
// A reservation with no Stripe checkout yet is another tab mid-request: shared
// for this long (its expiry still clears Stripe's minimum), then replaced.
const RESERVATION_SHARED_MS = 3 * 60 * 1000;
// $1 to $10,000 a month, in base units.
const PRICE_MIN = 100;
const PRICE_MAX = 1_000_000;
// Covers SEATS_MAX (500) + community_agent + buffer using by_channel_status directly.
const MEMBERS_CAP = 505;

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
    .withIndex("by_channel_status", (q: any) => q.eq("channelId", channelId).eq("status", "active"))
    .take(MEMBERS_CAP))
    .filter((row: any) => String(row.principalKey).startsWith("user:"));
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
    else await ctx.db.insert("communityPods", { communityId: args.communityId, channelId: args.channelId, purpose: "", visibility: "listed", ...patch, createdAt: nowMs, updatedAt: nowMs } as any);
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
    if (!record || record.visibility === "hidden" || !price) throw new Error("community_pod_not_paid");
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
      openPaymentId: open ? String(open._id) : null,
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
    // Reserved in one transaction: two tabs get the same row, so the same
    // Stripe checkout (one idempotency key), never two subscriptions.
    const pending = (await ctx.db.query("communityPodPayments")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", args.channelId).eq("userId", args.userId)).collect())
      .filter((row: any) => row.status === "pending");
    for (const row of pending) {
      const same = row.amountBaseUnits === args.amountBaseUnits && row.providerAccountId === args.providerAccountId && row.providerPriceId === args.providerPriceId;
      if (same && row.checkoutUrl && row.checkoutExpiresAt > nowMs + 60_000) {
        return { paymentId: row._id, checkoutExpiresAt: row.checkoutExpiresAt, checkoutUrl: row.checkoutUrl as string | null };
      }
      if (same && !row.checkoutUrl && row.createdAt > nowMs - RESERVATION_SHARED_MS) {
        return { paymentId: row._id, checkoutExpiresAt: row.checkoutExpiresAt, checkoutUrl: null as string | null };
      }
      // Unopened and stale, or for an old price: replaced.
      if (!row.checkoutUrl) await ctx.db.patch(row._id, { status: "expired", updatedAt: nowMs });
    }
    const blocked = await getActiveCommunityBlock({ ctx, communityId: args.communityId, userId: args.userId });
    if (blocked) throw new Error("community_access_blocked");
    const record = await podRecord(ctx, args.communityId, args.channelId);
    if (record?.visibility === "hidden") throw new Error("community_pod_not_paid");
    if (typeof record?.seats === "number") {
      const grants = await activeGrants(ctx, args.channelId);
      const userPrincipal = `user:${normalizeIdValue(args.userId)}`;
      if (grants.some((row: any) => row.principalKey === userPrincipal)) throw new Error("already_in_pod");
      const activePrincipals = new Set(grants.map((row: any) => String(row.principalKey)));
      const otherPendingUsers = new Set<string>();
      const channelPending = await ctx.db.query("communityPodPayments")
        .withIndex("by_channel_status", (q: any) => q.eq("channelId", args.channelId).eq("status", "pending"))
        .take(MEMBERS_CAP);
      for (const row of channelPending) {
        const otherUserId = normalizeIdValue(row.userId);
        if (otherUserId === normalizeIdValue(args.userId)) continue;
        if (activePrincipals.has(`user:${otherUserId}`)) continue;
        const stillLive = row.checkoutUrl
          ? row.checkoutExpiresAt > nowMs
          : row.createdAt > nowMs - RESERVATION_SHARED_MS;
        if (stillLive) otherPendingUsers.add(otherUserId);
      }
      if (grants.length + otherPendingUsers.size >= record.seats) throw new Error("community_pod_full");
    }
    const checkoutExpiresAt = nowMs + CHECKOUT_LIFETIME_MS;
    const paymentId = await ctx.db.insert("communityPodPayments", { ...rest, status: "pending", checkoutExpiresAt, createdAt: nowMs, updatedAt: nowMs });
    return { paymentId, checkoutExpiresAt, checkoutUrl: null as string | null };
  },
});

export const attachPodCheckoutInternal = internalMutation({
  args: { paymentId: v.id("communityPodPayments"), providerCheckoutSessionId: v.string(), checkoutUrl: v.string(), providerCustomerId: v.optional(v.string()),
    // When Stripe says this checkout closes.
    checkoutExpiresAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { paymentId, ...rest } = args;
    const row = await ctx.db.get(paymentId);
    if (!row) return null;
    // Recover if another tab expired this empty reservation while Stripe was creating the checkout.
    const statusPatch = row.status === "expired" ? { status: "pending" as const } : {};
    await ctx.db.patch(paymentId, { ...rest, ...statusPatch, updatedAt: Date.now() });
    return null;
  },
});

export const expirePodPaymentInternal = internalMutation({
  args: { paymentId: v.id("communityPodPayments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.paymentId);
    // Only a reservation Stripe never opened: another tab's open checkout stays.
    if (row?.status === "pending" && !row.checkoutUrl) await ctx.db.patch(args.paymentId, { status: "expired", updatedAt: Date.now() });
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
  handler: async (ctx, args): Promise<{ checkout_url: string; payment_id: string }> => {
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
    if (config.openCheckoutUrl && config.openPaymentId) return { checkout_url: config.openCheckoutUrl, payment_id: config.openPaymentId };
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
      const reserved: { paymentId: any; checkoutExpiresAt: number; checkoutUrl: string | null } =
        await ctx.runMutation(internal.communityPodPayments.createPendingPodPaymentInternal, {
          communityId: args.communityId, channelId: args.channelId, userId, amountBaseUnits: config.amountBaseUnits,
          currency: config.currency, providerAccountId: stripeAccount, providerPriceId, nowMs: Date.now(),
        });
      const paymentId = reserved.paymentId;
      if (reserved.checkoutUrl) return { checkout_url: reserved.checkoutUrl, payment_id: String(paymentId) };
      const paymentMetadata = { ...metadata, [POD_PAYMENT_METADATA_KEY]: String(paymentId) };
      try {
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer,
          success_url: fillCheckoutSuccessUrl(successUrl, String(paymentId)),
          cancel_url: cancelUrl,
          client_reference_id: String(paymentId),
          // The reservation's own expiry (35 minutes from when it was made),
          // so two tabs send Stripe the same request.
          expires_at: Math.floor(reserved.checkoutExpiresAt / 1000),
          line_items: [{ price: providerPriceId, quantity: 1 }],
          metadata: paymentMetadata,
          subscription_data: { application_fee_percent: POLYNET_COMMUNITY_PLATFORM_FEE_BPS / 100, metadata: paymentMetadata },
        }, { stripeAccount, idempotencyKey: `pod-checkout:${stripeAccount}:${String(paymentId)}` });
        const checkoutUrl = String(session.url ?? "").trim();
        if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
        await ctx.runMutation(internal.communityPodPayments.attachPodCheckoutInternal, {
          paymentId, providerCheckoutSessionId: session.id, checkoutUrl,
          ...(typeof session.expires_at === "number" ? { checkoutExpiresAt: session.expires_at * 1000 } : {}),
        });
        return { checkout_url: checkoutUrl, payment_id: String(paymentId) };
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
      const community = await ctx.db.get(row.communityId) as any;
      const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: row.communityId, userId: row.userId });
      const blocked = await getActiveCommunityBlock({ ctx, communityId: row.communityId, userId: row.userId });
      const room = await ctx.db.get(row.channelId) as any;
      const record = await podRecord(ctx, row.communityId, row.channelId);
      // Already paying for this pod through another subscription.
      const duplicate = (await ctx.db.query("communityPodPayments")
        .withIndex("by_channel_user", (q: any) => q.eq("channelId", row.channelId).eq("userId", row.userId)).collect())
        .some((other: any) => String(other._id) !== String(row._id) && other.grantedAt && GRANTING.includes(other.status));
      let hasSeat = true;
      if (typeof record?.seats === "number") {
        const currentGrants = await activeGrants(ctx, row.channelId);
        const userPrincipal = `user:${normalizeIdValue(row.userId)}`;
        const otherActiveSeats = currentGrants.filter((grant: any) => grant.principalKey !== userPrincipal).length;
        hasSeat = otherActiveSeats < record.seats;
      }
      const canLetIn = !duplicate && !blocked && hasSeat && community && communityIsActive(community)
        && membership && communityMembershipRowIsActive(membership)
        && room?.status === "active" && room?.accessMode === "restricted";
      if (!canLetIn) {
        // Paid, but it can't let them in (the community was archived, they
        // left, the pod closed, or they already pay for it): never granted,
        // ended, and a full refund is owed until Stripe has made it.
        await ctx.db.patch(row._id, {
          status: "ended", refundDue: true, providerSubscriptionId: args.providerSubscriptionId,
          ...(args.providerCustomerId ? { providerCustomerId: args.providerCustomerId } : {}),
          lastProviderEventAt: args.providerEventAt, updatedAt: nowMs,
        });
        await ctx.scheduler.runAfter(0, internal.communityPodPayments.processPodRefundsInternal, {});
        return { ok: true, status: "ended" as PodPaymentStatus, granted: false };
      }
      await setChannelParticipantCore(ctx, { communityId: row.communityId, channelId: row.channelId, createdByUserId: row.userId, active: true, target: { kind: "member", userId: row.userId }, reason: "paid" });
      grantedAt = nowMs;
    } else if (!grants && grantedAt) {
      const others = (await ctx.db.query("communityPodPayments")
        .withIndex("by_channel_user", (q: any) => q.eq("channelId", row.channelId).eq("userId", row.userId)).collect())
        .some((other: any) => String(other._id) !== String(row._id) && other.grantedAt);
      if (!others) await setChannelParticipantCore(ctx, { communityId: row.communityId, channelId: row.channelId, createdByUserId: row.userId, active: false, target: { kind: "member", userId: row.userId }, reason: "paid" });
      grantedAt = undefined;
    }
    // A payment that just failed: the same email communities send, naming the pod.
    if (status === "past_due" && row.status !== "past_due") {
      const room = await ctx.db.get(row.channelId) as any;
      await enqueueCommunityBillingIssueEmailInternal({
        ctx, userId: row.userId, communityId: row.communityId, nowMs,
        issueMarker: `${String(row._id)}:${String(args.currentPeriodEndAt ?? row.currentPeriodEndAt ?? nowMs)}`,
        podName: String(room?.name ?? "your pod"),
      });
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
    if (!others) await setChannelParticipantCore(ctx, { communityId: row.communityId, channelId: row.channelId, createdByUserId: row.userId, active: false, target: { kind: "member", userId: row.userId }, reason: "paid" });
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

const SWEEP_PAGE = 100;
const MAX_SWEEP_PAGES_PER_RUN = 10;
const MAX_SWEEP_CONTINUATION_ROUNDS = 50;
const GRANTING: PodPaymentStatus[] = ["active", "past_due", "cancel_at_period_end"];
// An unpaid checkout row is kept a day past Stripe's own expiry, then marked.
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export const getPodPaymentByProviderSubscriptionInternal = internalQuery({
  args: { providerAccountId: v.string(), providerSubscriptionId: v.string() },
  handler: async (ctx, args) => await ctx.db.query("communityPodPayments")
    .withIndex("by_provider_subscription", (q: any) => q.eq("providerAccountId", args.providerAccountId).eq("providerSubscriptionId", args.providerSubscriptionId)).first(),
});

// The one rule: a pod payment is reachable while its community runs, the
// member is an active member, the pod's room is open, and they are on its
// list under their current membership. Anything else means paying for a pod
// they can't reach.
async function reachable(ctx: any, row: any): Promise<boolean> {
  const community = await ctx.db.get(row.communityId) as any;
  if (!community || !communityIsActive(community)) return false;
  const room = await ctx.db.get(row.channelId) as any;
  if (room?.status !== "active") return false;
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: row.communityId, userId: row.userId });
  if (!membership || !communityMembershipRowIsActive(membership)) return false;
  const grant = (await ctx.db.query("communityChannelParticipants")
    .withIndex("by_channel_principal", (q: any) => q.eq("channelId", row.channelId).eq("principalKey", `user:${row.userId}`)).first()) as any;
  return grant?.status === "active" && normalizeIdValue(grant.membershipId) === normalizeIdValue(membership._id)
    && Number(grant.membershipActivationSequence ?? 0) === Math.max(0, Math.floor(Number(membership.activationSequence ?? 0)));
}

type SweepTarget = { paymentId: any; providerAccountId: string; providerSubscriptionId: string; refund: boolean };

async function unreachableTargets(ctx: any, rows: any[]): Promise<SweepTarget[]> {
  const found: SweepTarget[] = [];
  for (const row of rows) {
    if (!GRANTING.includes(row.status) || !row.providerSubscriptionId) continue;
    if (await reachable(ctx, row)) continue;
    // Never let in (paid as they left): refunded in full. Let in, then off:
    // what was already paid stays paid.
    found.push({ paymentId: row._id, providerAccountId: row.providerAccountId, providerSubscriptionId: row.providerSubscriptionId, refund: !row.grantedAt });
  }
  return found;
}

const sweepScope = {
  communityId: v.optional(v.id("communities")),
  userId: v.optional(v.id("users")),
  channelId: v.optional(v.id("communityChannels")),
};

// A targeted check (one member, one pod, or one community): small, one read.
export const listUnreachablePodPaymentsForScopeInternal = internalQuery({
  args: sweepScope,
  handler: async (ctx, args) => {
    let rows: any[] = [];
    if (args.channelId && args.userId) {
      rows = await ctx.db.query("communityPodPayments").withIndex("by_channel_user", (q: any) => q.eq("channelId", args.channelId).eq("userId", args.userId)).collect();
    } else if (args.userId) {
      rows = (await ctx.db.query("communityPodPayments").withIndex("by_user", (q: any) => q.eq("userId", args.userId)).collect())
        .filter((row: any) => !args.communityId || String(row.communityId) === String(args.communityId));
    } else if (args.communityId) {
      rows = await ctx.db.query("communityPodPayments").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).collect();
    }
    return await unreachableTargets(ctx, rows);
  },
});

// The hourly pass: one page of paying rows at a time, every status, to the end.
export const listUnreachablePodPaymentsPageInternal = internalQuery({
  args: { status: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("communityPodPayments").withIndex("by_status", (q: any) => q.eq("status", args.status))
      .paginate({ cursor: args.cursor, numItems: SWEEP_PAGE });
    return { targets: await unreachableTargets(ctx, page.page), continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

// Checkouts nobody paid: marked expired a day after Stripe closed them.
export const expireAbandonedPodCheckoutsInternal = internalMutation({
  args: { nowMs: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("communityPodPayments").withIndex("by_status", (q: any) => q.eq("status", "pending")).take(SWEEP_PAGE);
    let expired = 0;
    for (const row of rows) {
      if (row.checkoutExpiresAt + ABANDONED_AFTER_MS > args.nowMs) continue;
      await ctx.db.patch(row._id, { status: "expired", updatedAt: args.nowMs });
      expired += 1;
    }
    return { expired, more: rows.length === SWEEP_PAGE && expired > 0 };
  },
});

export const endUnreachablePodPaymentInternal = internalMutation({
  args: { paymentId: v.id("communityPodPayments"), refundDue: v.optional(v.boolean()), cancelDue: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.paymentId);
    if (!row || row.status === "ended") return { ended: false };
    // Checked again inside the write: re-added meanwhile means keep billing.
    if (await reachable(ctx, row)) return { ended: false };
    await endPodPayment(ctx, row, Date.now());
    if (args.refundDue || args.cancelDue) {
      await ctx.db.patch(row._id, {
        ...(args.refundDue ? { refundDue: true } : {}),
        ...(args.cancelDue ? { cancelDue: true } : {}),
      });
    }
    return { ended: true };
  },
});

// Refunds owed (paid but never let in). Recorded on the payment before Stripe
// is asked, and kept until Stripe has cancelled and refunded, so a failure
// partway is retried whatever the payment's status has become.
export const listPodRefundsDueInternal = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("communityPodPayments").withIndex("by_refundDue", (q: any) => q.eq("refundDue", true)).take(SWEEP_PAGE))
    .filter((row: any) => row.providerSubscriptionId)
    .map((row: any) => ({ paymentId: row._id, providerAccountId: row.providerAccountId as string, providerSubscriptionId: row.providerSubscriptionId as string })),
});

export const clearPodRefundDueInternal = internalMutation({
  args: { paymentId: v.id("communityPodPayments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, { refundDue: undefined, updatedAt: Date.now() });
    return null;
  },
});

// Stripe cancellations owed after a pod became unreachable and the row was
// locked ended. Retried by the hourly pass if the first Stripe call failed.
export const listPodCancelsDueInternal = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("communityPodPayments").withIndex("by_cancelDue", (q: any) => q.eq("cancelDue", true)).take(SWEEP_PAGE))
    .filter((row: any) => row.providerSubscriptionId)
    .map((row: any) => ({ paymentId: row._id, providerAccountId: row.providerAccountId as string, providerSubscriptionId: row.providerSubscriptionId as string })),
});

export const clearPodCancelDueInternal = internalMutation({
  args: { paymentId: v.id("communityPodPayments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, { cancelDue: undefined, updatedAt: Date.now() });
    return null;
  },
});

export const processPodRefundsInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<{ refunded: number; waiting: number }> => {
    const due: Array<{ paymentId: any; providerAccountId: string; providerSubscriptionId: string }> =
      await ctx.runQuery(internal.communityPodPayments.listPodRefundsDueInternal, {});
    let refunded = 0;
    for (const target of due) {
      try {
        await cancelAndRefundDuplicateSubscription({ providerAccountId: target.providerAccountId, providerSubscriptionId: target.providerSubscriptionId });
        await ctx.runMutation(internal.communityPodPayments.clearPodRefundDueInternal, { paymentId: target.paymentId });
        refunded += 1;
      } catch (error) {
        // Still owed; the hourly pass tries again.
        console.error("pod_refund_failed", { paymentId: String(target.paymentId), error: error instanceof Error ? error.message : String(error) });
      }
    }
    const cancelsDue: Array<{ paymentId: any; providerAccountId: string; providerSubscriptionId: string }> =
      await ctx.runQuery(internal.communityPodPayments.listPodCancelsDueInternal, {});
    for (const target of cancelsDue) {
      try {
        await cancelStripeSubscriptionIfActive({ providerAccountId: target.providerAccountId, providerSubscriptionId: target.providerSubscriptionId });
        await ctx.runMutation(internal.communityPodPayments.clearPodCancelDueInternal, { paymentId: target.paymentId });
      } catch (error) {
        console.error("pod_cancel_retry_failed", { paymentId: String(target.paymentId), error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { refunded, waiting: due.length - refunded };
  },
});

async function stopBilling(ctx: any, targets: SweepTarget[]): Promise<number> {
  let stopped = 0;
  for (const target of targets) {
    try {
      if (target.refund) {
        // Recorded as owed first; the refund pass (below, and hourly) pays it.
        const ended = await ctx.runMutation(internal.communityPodPayments.endUnreachablePodPaymentInternal, { paymentId: target.paymentId, refundDue: true });
        if (ended.ended) stopped += 1;
      } else {
        // Re-check reachability and lock the row ended BEFORE canceling Stripe,
        // so a re-added member never has their live Stripe subscription canceled.
        const ended = await ctx.runMutation(internal.communityPodPayments.endUnreachablePodPaymentInternal, { paymentId: target.paymentId, cancelDue: true });
        if (!ended.ended) continue;
        await cancelStripeSubscriptionIfActive({ providerAccountId: target.providerAccountId, providerSubscriptionId: target.providerSubscriptionId });
        await ctx.runMutation(internal.communityPodPayments.clearPodCancelDueInternal, { paymentId: target.paymentId });
        stopped += 1;
      }
    } catch (error) {
      // If ended with cancelDue: true, the hourly pass retries Stripe cancellation.
      console.error("pod_payment_stop_failed", { paymentId: String(target.paymentId), error: error instanceof Error ? error.message : String(error) });
    }
  }
  return stopped;
}

// Run right after access may have ended (scheduled by the code that ended
// it), and hourly over everything as the safety net. Self-continues across
// bounded page slices so large sweeps never time out.
export const sweepUnreachablePodPaymentsInternal = internalAction({
  args: {
    ...sweepScope,
    statusIndex: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    continuationRound: v.optional(v.number()),
    maxPagesPerRun: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ checked: number; stopped: number; expired: number; continued?: boolean }> => {
    if (args.communityId || args.userId || args.channelId) {
      const targets: SweepTarget[] = await ctx.runQuery(internal.communityPodPayments.listUnreachablePodPaymentsForScopeInternal, {
        communityId: args.communityId,
        userId: args.userId,
        channelId: args.channelId,
      });
      const stoppedNow = await stopBilling(ctx, targets);
      if (targets.some((target) => target.refund)) await ctx.runAction(internal.communityPodPayments.processPodRefundsInternal, {});
      return { checked: targets.length, stopped: stoppedNow, expired: 0 };
    }
    const maxPagesPerRun = Math.max(1, Math.min(MAX_SWEEP_PAGES_PER_RUN, Math.floor(args.maxPagesPerRun ?? MAX_SWEEP_PAGES_PER_RUN)));
    const continuationRound = Math.max(0, Math.floor(args.continuationRound ?? 0));
    let statusIndex = Math.max(0, Math.floor(args.statusIndex ?? 0));
    let cursor: string | null = args.cursor ?? null;
    let pagesProcessed = 0;
    let checked = 0;
    let stopped = 0;
    let hasMoreStatuses = false;

    while (statusIndex < GRANTING.length) {
      if (pagesProcessed >= maxPagesPerRun) {
        hasMoreStatuses = true;
        break;
      }
      const status = GRANTING[statusIndex]!;
      const page: { targets: SweepTarget[]; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.communityPodPayments.listUnreachablePodPaymentsPageInternal, { status, cursor });
      pagesProcessed += 1;
      checked += page.targets.length;
      stopped += await stopBilling(ctx, page.targets);
      if (page.isDone) {
        statusIndex += 1;
        cursor = null;
      } else {
        cursor = page.continueCursor;
      }
    }

    if (hasMoreStatuses && continuationRound < MAX_SWEEP_CONTINUATION_ROUNDS) {
      await ctx.scheduler.runAfter(1_000, internal.communityPodPayments.sweepUnreachablePodPaymentsInternal, {
        statusIndex,
        cursor,
        continuationRound: continuationRound + 1,
        maxPagesPerRun,
      });
      return { checked, stopped, expired: 0, continued: true };
    }

    await ctx.runAction(internal.communityPodPayments.processPodRefundsInternal, {});
    let expired = 0;
    let moreExpired = false;
    for (let round = 0; round < 20; round += 1) {
      const result: { expired: number; more: boolean } = await ctx.runMutation(internal.communityPodPayments.expireAbandonedPodCheckoutsInternal, { nowMs: Date.now() });
      expired += result.expired;
      moreExpired = result.more;
      if (!result.more) break;
    }
    if (moreExpired && continuationRound < MAX_SWEEP_CONTINUATION_ROUNDS) {
      await ctx.scheduler.runAfter(1_000, internal.communityPodPayments.sweepUnreachablePodPaymentsInternal, {
        statusIndex: GRANTING.length,
        cursor: null,
        continuationRound: continuationRound + 1,
        maxPagesPerRun,
      });
      return { checked, stopped, expired, continued: true };
    }
    return { checked, stopped, expired, continued: false };
  },
});


// A member's own pod payment, as their pod shows it, or null when they were
// added by a host (no payment).
export function podPaymentStateOf(rows: any[]): { state: "paying" | "leaving" | "payment_problem"; until: string | null; amount_base_units: number; currency: string } | null {
  const row = rows.filter((entry) => entry.grantedAt && GRANTING.includes(entry.status))
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))[0];
  if (!row) return null;
  return {
    state: row.status === "cancel_at_period_end" ? "leaving" : row.status === "past_due" ? "payment_problem" : "paying",
    until: typeof row.currentPeriodEndAt === "number" ? new Date(row.currentPeriodEndAt).toISOString() : null,
    amount_base_units: row.amountBaseUnits,
    currency: row.currency,
  };
}

// What leaving needs to do: a paying member's subscriptions to stop renewing,
// or (no payment) take them off now.
export const podLeavePlanInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), channelId: v.id("communityChannels") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.channelId) as any;
    if (!room || String(room.communityId) !== String(args.communityId) || room.accessMode !== "restricted") throw new Error("community_pod_not_found");
    // Their plan includes this pod: the seat goes with the plan, though a separate payment for it can still be stopped.
    const seat = (await ctx.db.query("communityChannelParticipants")
      .withIndex("by_channel_principal", (q: any) => q.eq("channelId", args.channelId).eq("principalKey", `user:${args.userId}`)).take(1))[0];
    const fromPlan = seatReasons(seat).includes("plan");
    const rows = await ctx.db.query("communityPodPayments")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", args.channelId).eq("userId", args.userId)).collect();
    const renewing = rows.filter((row: any) => row.grantedAt && (row.status === "active" || row.status === "past_due") && row.providerSubscriptionId)
      .map((row: any) => ({ paymentId: row._id, providerAccountId: row.providerAccountId, providerSubscriptionId: row.providerSubscriptionId }));
    const leaving = rows.some((row: any) => row.grantedAt && row.status === "cancel_at_period_end");
    return { renewing, leaving, fromPlan };
  },
});

// Stripe said it will stop at the period's end: shown at once, before its notice.
export const markPodPaymentLeavingInternal = internalMutation({
  args: { paymentId: v.id("communityPodPayments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.paymentId);
    if (row && (row.status === "active" || row.status === "past_due")) await ctx.db.patch(row._id, { status: "cancel_at_period_end", updatedAt: Date.now() });
    return null;
  },
});

// No payment (added by a host, or a free pod): off the pod now. A host who
// leaves stops being its host.
export const leavePodNowInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), channelId: v.id("communityChannels") },
  handler: async (ctx, args) => {
    await setChannelParticipantCore(ctx, { communityId: args.communityId, channelId: args.channelId, createdByUserId: args.userId, active: false, target: { kind: "member", userId: args.userId } });
    const record = await podRecord(ctx, args.communityId, args.channelId);
    if (record?.hostUserIds?.some((id: any) => String(id) === String(args.userId))) {
      await ctx.db.patch(record._id, { hostUserIds: record.hostUserIds.filter((id: any) => String(id) !== String(args.userId)), updatedAt: Date.now() });
    }
    return null;
  },
});

// Leave a pod. Paying: Stripe stops renewing and access lasts to the end of
// the period already paid (its notice then ends it). Not paying: out now.
export const leavePod = action({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels") },
  handler: async (ctx, args): Promise<{ left: "now" | "at_period_end" }> => {
    const actor = await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, { authSubject: args.authSubject }) as { dbUserId?: any } | null;
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("auth_subject_required");
    const plan: { renewing: Array<{ paymentId: any; providerAccountId: string; providerSubscriptionId: string }>; leaving: boolean; fromPlan: boolean } =
      await ctx.runQuery(internal.communityPodPayments.podLeavePlanInternal, { userId, communityId: args.communityId, channelId: args.channelId });
    // Nothing of their own to stop, and the seat comes with their plan: it ends when the plan does.
    if (plan.fromPlan && plan.renewing.length === 0) throw new Error("community_pod_seat_from_plan");
    if (plan.renewing.length === 0 && plan.leaving) return { left: "at_period_end" };
    if (plan.renewing.length === 0) {
      await ctx.runMutation(internal.communityPodPayments.leavePodNowInternal, { userId, communityId: args.communityId, channelId: args.channelId });
      return { left: "now" };
    }
    for (const payment of plan.renewing) {
      await cancelStripeSubscriptionAtPeriodEnd({ providerAccountId: payment.providerAccountId, providerSubscriptionId: payment.providerSubscriptionId });
      await ctx.runMutation(internal.communityPodPayments.markPodPaymentLeavingInternal, { paymentId: payment.paymentId });
    }
    return { left: "at_period_end" };
  },
});
