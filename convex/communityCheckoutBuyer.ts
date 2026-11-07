// Who a community checkout belongs to, and settling it once it's paid: the
// paying browser's secret or a verified email attaches a payment made before
// signing in; settling grants the membership once, or cancels and refunds a
// second payment (or a blocked buyer's); refunds and disputes on a payment not
// granted yet are kept on the checkout. The checkout itself is started in
// communityCommerce.ts; Stripe's notice reaches it through
// syncPendingCommunityCheckoutSubscriptionInternal there.
import { v } from "convex/values";

import { normalizeAuthRelinkEmail } from "../shared/authRelinkPolicy";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { grantCommunityCheckout } from "./billingCore";
import { communitySubscriptionStatusGrantsAccess, requireCommunityUserNotBlocked } from "./communityCore";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import { acceptCommunityJoin } from "./starterProfile";

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Cash first lets anyone start a checkout without signing in, and each one
// makes a Stripe session and a row. In this window each visitor (a hash of
// their address, from the edge) starts a few, and a community takes this many
// in all; past either, "Checkout is temporarily unavailable". One visitor can't
// use up a community's checkouts for everyone else.
export const GUEST_CHECKOUT_WINDOW_MS = 10 * 60 * 1000;
export const GUEST_CHECKOUTS_PER_VISITOR = 3;
export const GUEST_CHECKOUTS_PER_WINDOW = 100;

export async function guestCheckoutAllowed(ctx: any, communityId: any, nowMs: number, visitorHash = ""): Promise<boolean> {
  const since = nowMs - GUEST_CHECKOUT_WINDOW_MS;
  // Newest first, only as far back as the window: every guest in it is counted.
  let guests = 0;
  let fromVisitor = 0;
  for await (const row of ctx.db
    .query("checkoutSessions")
    .withIndex("by_community_status", (q: any) => q.eq("communityId", communityId).eq("status", "pending"))
    .order("desc")) {
    if (row.createdAt < since) break;
    if (row.ownerUserId) continue;
    if (++guests >= GUEST_CHECKOUTS_PER_WINDOW) return false;
    if (visitorHash && row.buyerVisitorHash === visitorHash && ++fromVisitor >= GUEST_CHECKOUTS_PER_VISITOR) return false;
  }
  return true;
}

// An early answer, before any Stripe work. The binding check is in the
// mutation that records the checkout (one transaction with the insert), so a
// burst of parallel requests can't all pass on the same count.
export const guestCheckoutAllowedInternal = internalQuery({
  args: { communityId: v.id("communities"), nowMs: v.number(), visitorHash: v.optional(v.string()) },
  handler: async (ctx, args) => await guestCheckoutAllowed(ctx, args.communityId, args.nowMs, args.visitorHash ?? ""),
});

// Settles a paid community checkout for its buyer, once: the membership, or,
// if they already pay for this community (two tabs, or paid again before
// signing in), the second payment cancelled and refunded. Safe to repeat.
export async function settleCommunityCheckout(
  ctx: any,
  sessionId: string,
  nowMs: number,
  evidence: { paymentIntentId: string | null; chargeId: string | null } = { paymentIntentId: null, chargeId: null },
): Promise<void> {
  const row = await ctx.db.query("checkoutSessions").withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId)).first();
  if (row && row.communityHold === "buyer_blocked" && row.status === "complete" && row.providerSubscriptionId) {
    const providerSubscriptionId = String(row.providerSubscriptionId);
    await ctx.scheduler.runAfter(0, internal.communityCommerce.refundDuplicateCommunitySubscriptionInternal, {
      providerSubscriptionId, providerAccountId: String(row.providerAccountId ?? ""),
      paymentIntentId: evidence.paymentIntentId, chargeId: evidence.chargeId,
    });
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `community_blocked_buyer_refunded:${providerSubscriptionId}`, eventType: "community_blocked_buyer_refunded",
      status: "started", actorUserId: row.ownerUserId, subjectUserId: row.ownerUserId, communityId: row.communityId,
      checkoutSessionId: row.sessionId, provider: "stripe", providerObjectId: providerSubscriptionId,
      metadata: { providerAccountId: String(row.providerAccountId ?? "") }, createdAt: nowMs,
    });
    return;
  }
  if (row && row.ownerUserId && row.communityId && row.status === "complete" && !(await checkoutAlreadyGranted(ctx, row))) {
    const newSubscriptionId = String(row.providerSubscriptionId ?? "").trim();
    const others = await ctx.db.query("communitySubscriptions")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", row.communityId).eq("userId", row.ownerUserId))
      .collect();
    const alreadyPaying = others.some((other: any) =>
      communitySubscriptionStatusGrantsAccess(other.status)
      && String(other.providerSubscriptionId ?? "").trim()
      && String(other.providerSubscriptionId).trim() !== newSubscriptionId);
    if (alreadyPaying && newSubscriptionId) {
      await ctx.scheduler.runAfter(0, internal.communityCommerce.refundDuplicateCommunitySubscriptionInternal, {
        providerSubscriptionId: newSubscriptionId, providerAccountId: String(row.providerAccountId ?? ""),
        paymentIntentId: evidence.paymentIntentId,
        chargeId: evidence.chargeId,
      });
      await recordCriticalAuditEventBestEffort(ctx, {
        eventKey: `community_duplicate_subscription_refunded:${newSubscriptionId}`, eventType: "community_duplicate_subscription_refunded",
        status: "started", actorUserId: row.ownerUserId, subjectUserId: row.ownerUserId, communityId: row.communityId,
        checkoutSessionId: row.sessionId, provider: "stripe", providerObjectId: newSubscriptionId, metadata: { providerAccountId: String(row.providerAccountId ?? "") }, createdAt: nowMs,
      });
    } else {
      try {
        const granted = await grantCommunityCheckout({ ctx, checkoutSession: await ctx.db.get(row._id), nowMs });
        await recordCriticalAuditEventBestEffort(ctx, {
          eventKey: `community_checkout_granted:${row.sessionId}`, eventType: "community_checkout_granted",
          status: granted.accessGranted ? "succeeded" : "ignored", actorUserId: row.ownerUserId, subjectUserId: row.ownerUserId,
          communityId: row.communityId, checkoutSessionId: row.sessionId, provider: "stripe",
          providerObjectId: newSubscriptionId || undefined,
          metadata: { accessGranted: granted.accessGranted, grantMarker: granted.grantMarker, pricePointId: row.pricePointId ? String(row.pricePointId) : null },
          createdAt: nowMs,
        });
      } catch (error) {
        // Blocked or no longer allowed: the return page shows it; nothing is lost.
        console.error("community_checkout_grant_failed", { sessionId: row.sessionId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

export async function verifiedUserIdForEmail(ctx: any, email: string): Promise<any | null> {
  const users = await ctx.db.query("users").withIndex("by_normalizedEmail", (q: any) => q.eq("normalizedEmail", email)).take(2);
  return users.length === 1 && typeof users[0].emailVerifiedAt === "number" ? users[0]._id : null;
}

// A checkout paid before signing in becomes this account's: the buyer's own
// browser (its secret) or a sign-in that verified the email given to Stripe.
// Joining accepts the terms; then, if Stripe has confirmed it, it settles.
export async function attachCommunityCheckoutToUser(ctx: any, sessionId: string, userId: any, nowMs: number): Promise<boolean> {
  const row = await ctx.db.query("checkoutSessions").withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId)).first();
  if (!row || row.mode !== "community_join" || !row.communityId) return false;
  if (row.ownerUserId) return String(row.ownerUserId) === String(userId);
  try {
    await requireCommunityUserNotBlocked({ ctx, communityId: row.communityId, userId });
  } catch {
    // Blocked from this community, but they paid: theirs, never granted, and
    // the payment cancelled and refunded (now, or once Stripe confirms it).
    await ctx.db.patch(row._id, { ownerUserId: userId, buyerEmailNormalized: undefined, communityHold: "buyer_blocked", updatedAt: nowMs });
    if (row.status === "complete") await settleCommunityCheckout(ctx, sessionId, nowMs);
    return false;
  }
  await ctx.db.patch(row._id, { ownerUserId: userId, buyerEmailNormalized: undefined, updatedAt: nowMs });
  await acceptCommunityJoin(ctx, userId, nowMs);
  await recordCriticalAuditEventBestEffort(ctx, {
    eventKey: `community_checkout_attached:${sessionId}`, eventType: "community_checkout_attached", status: "succeeded",
    actorUserId: userId, subjectUserId: userId, communityId: row.communityId, checkoutSessionId: sessionId, provider: "polynet",
    metadata: { paid: row.status === "complete" }, createdAt: nowMs,
  });
  if (row.status === "complete") await settleCommunityCheckout(ctx, sessionId, nowMs);
  return true;
}

// Signing in with a verified email collects every payment made with it before
// signing in (another device, a closed tab).
export async function attachPaidCheckoutsForVerifiedEmail(ctx: any, userId: any, email: unknown, nowMs: number): Promise<number> {
  const normalized = normalizeAuthRelinkEmail(email);
  if (!normalized) return 0;
  // Only payments still waiting for their buyer (attaching clears the email), oldest first.
  const rows = await ctx.db.query("checkoutSessions")
    .withIndex("by_buyerEmailNormalized", (q: any) => q.eq("buyerEmailNormalized", normalized))
    .filter((q: any) => q.and(q.eq(q.field("ownerUserId"), undefined), q.eq(q.field("status"), "complete")))
    .take(20);
  let attached = 0;
  for (const row of rows) {
    if (row.mode !== "community_join" || row.ownerUserId || row.status !== "complete") continue;
    if (await attachCommunityCheckoutToUser(ctx, row.sessionId, userId, nowMs)) attached += 1;
  }
  return attached;
}

export const revokeUngrantedCommunityCheckoutInternal = internalMutation({
  args: { providerAccountId: v.string(), providerSubscriptionId: v.string(), revokedReason: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("checkoutSessions")
      .withIndex("by_providerSubscriptionId", (q: any) => q.eq("providerSubscriptionId", args.providerSubscriptionId))
      .take(5);
    let revoked = false;
    for (const row of rows) {
      if (row.mode !== "community_join" || String(row.providerAccountId ?? "") !== args.providerAccountId) continue;
      if (typeof row.membershipGrantedAt === "number") continue;
      // A refund is final: a dispute recorded after it never replaces it (so
      // winning that dispute can't lift the refund's block).
      const hold = args.revokedReason === "subscription_refunded" ? "refunded" : "disputed";
      if (!row.communityHold || row.communityHold === "disputed") {
        await ctx.db.patch(row._id, { communityHold: hold, updatedAt: Date.now() });
      }
      revoked = true;
    }
    return { revoked };
  },
});

// A dispute the founder won (or funds reinstated) on a payment not granted yet:
// only a dispute's block lifts; a refund stays.
export const restoreUngrantedCommunityCheckoutInternal = internalMutation({
  args: { providerAccountId: v.string(), providerSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("checkoutSessions")
      .withIndex("by_providerSubscriptionId", (q: any) => q.eq("providerSubscriptionId", args.providerSubscriptionId))
      .take(5);
    let restored = false;
    for (const row of rows) {
      if (row.mode !== "community_join" || String(row.providerAccountId ?? "") !== args.providerAccountId) continue;
      if (row.communityHold !== "disputed") continue;
      await ctx.db.patch(row._id, { communityHold: undefined, updatedAt: Date.now() });
      restored = true;
      if (row.ownerUserId) await settleCommunityCheckout(ctx, row.sessionId, Date.now());
    }
    return { restored };
  },
});

export const attachPaidCheckoutsForVerifiedEmailInternal = internalMutation({
  args: { userId: v.id("users"), email: v.string() },
  handler: async (ctx, args) => ({ attached: await attachPaidCheckoutsForVerifiedEmail(ctx, args.userId, args.email, Date.now()) }),
});

// Granted once, from Stripe's notice (the checkout keeps when).
export async function checkoutAlreadyGranted(_ctx: any, session: any): Promise<boolean> {
  return typeof session.membershipGrantedAt === "number";
}
