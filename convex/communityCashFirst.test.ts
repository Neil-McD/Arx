import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { sha256Hex } from "./communityCheckoutBuyer";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const SESSION = `chk_${"b".repeat(32)}`;
const SECRET = `buyer_${"c".repeat(32)}`;
const ACCOUNT = "acct_test_cash_first";

// A paid community and a checkout paid (or not yet) before signing in: no
// owner, only the hash of the paying browser's secret.
async function fixture() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const secretHash = await sha256Hex(SECRET);
  const ids = await t.run(async (ctx) => {
    const user = (handle: string, email?: string, verified = false) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle,
      ...(email ? { email, normalizedEmail: email } : {}), ...(verified ? { emailVerifiedAt: now } : {}),
      createdAt: now, updatedAt: now,
    });
    const ownerId = await user("owner");
    const buyerId = await user("buyer", "buyer@example.com", true);
    const otherId = await user("other");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Club", visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription", activeMemberCount: 1, createdAt: now, updatedAt: now,
    } as any);
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 500, currency: "usd", currencyDecimals: 2,
      isCurrent: true, providerAccountId: ACCOUNT, providerPriceId: "price_cash_first", createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("checkoutSessions", {
      sessionId: SESSION, mode: "community_join", communityId, communityLifecycleGeneration: 0, billingPeriod: "monthly",
      pricePointId, providerAccountId: ACCOUNT, providerPriceId: "price_cash_first", buyerSecretHash: secretHash,
      status: "pending", expiresAt: now + 60 * 60_000, createdAt: now, updatedAt: now,
    } as any);
    return { communityId, buyerId, otherId, pricePointId };
  });
  const finish = (userId: any, buyerSecret?: string) =>
    t.mutation(internal.communityAppJoin.finishCommunityAppCheckoutInternal, {
      userId, communityId: ids.communityId, sessionId: SESSION, ...(buyerSecret ? { buyerSecret } : {}),
    });
  // Stripe's verified notice (or the return page asking Stripe): paid.
  const paid = (buyerEmail: string | null, subscription = "sub_cash_first") =>
    t.mutation(internal.communityCommerce.syncPendingCommunityCheckoutSubscriptionInternal, {
      sessionId: SESSION, providerAccountId: ACCOUNT, providerCheckoutSessionId: "cs_cash_first", providerCustomerId: "cus_cash_first",
      providerSubscriptionId: subscription, providerPriceId: "price_cash_first", subscriptionStatus: "active",
      currentPeriodStartAt: Date.now(), currentPeriodEndAt: Date.now() + 30 * 86_400_000, markComplete: true, buyerEmail,
    });
  const state = () => t.run(async (ctx) => {
    const row = await ctx.db.query("checkoutSessions").withIndex("by_sessionId", (q) => q.eq("sessionId", SESSION)).first();
    const members = (await ctx.db.query("communityMemberships").collect())
      .filter((m) => m.communityId === ids.communityId && m.state === "active").map((m) => m.userId);
    return { owner: row?.ownerUserId ?? null, granted: typeof row?.membershipGrantedAt === "number", members };
  });
  return { t, ids, finish, paid, state };
}

test("paid before signing in, a checkout belongs to nobody until the browser that paid signs in", async () => {
  const { ids, finish, paid, state } = await fixture();
  await paid(null);
  expect(await finish(ids.buyerId)).toEqual({ status: "not_found" });
  expect(await finish(ids.buyerId, `buyer_${"d".repeat(32)}`)).toEqual({ status: "not_found" });
  expect(await state()).toEqual({ owner: null, granted: false, members: [] });
});

test("the paying browser's secret makes the payment theirs: in at once, the terms accepted, and nobody else's after", async () => {
  const { t, ids, finish, paid, state } = await fixture();
  await paid(null);
  expect(await finish(ids.buyerId, SECRET)).toEqual({ status: "joined" });
  expect(await state()).toEqual({ owner: ids.buyerId, granted: true, members: [ids.buyerId] });
  const legal = await t.run(async (ctx) => (await ctx.db.query("legalAcceptances").collect())
    .filter((row) => row.userId === ids.buyerId).map((row) => row.source));
  expect(legal).toEqual(["community_join", "community_join"]);
  expect(await finish(ids.otherId, SECRET)).toEqual({ status: "not_found" });
  expect((await state()).members).toEqual([ids.buyerId]);
});

test("signed in before Stripe confirms: the payment is theirs, and the confirmation makes them a member", async () => {
  const { ids, finish, paid, state } = await fixture();
  expect(await finish(ids.buyerId, SECRET)).toEqual({ status: "pending" });
  expect(await state()).toEqual({ owner: ids.buyerId, granted: false, members: [] });
  await paid("someone-else@example.com");
  expect(await state()).toEqual({ owner: ids.buyerId, granted: true, members: [ids.buyerId] });
});

test("the email given to Stripe finds its account: at once if it exists and is verified, else when they sign in with it", async () => {
  const { t, ids, paid, state } = await fixture();
  await paid("Buyer@Example.com");
  expect(await state()).toEqual({ owner: ids.buyerId, granted: true, members: [ids.buyerId] });

  // Unverified, or no account yet: it waits for a verified sign-in with that email.
  const second = await fixture();
  await second.t.run(async (ctx) => ctx.db.patch(second.ids.buyerId, { emailVerifiedAt: undefined }));
  await second.paid("buyer@example.com");
  expect(await second.state()).toEqual({ owner: null, granted: false, members: [] });
  await second.t.run(async (ctx) => ctx.db.patch(second.ids.buyerId, { emailVerifiedAt: Date.now() }));
  expect(await second.t.mutation(internal.communityCheckoutBuyer.attachPaidCheckoutsForVerifiedEmailInternal, {
    userId: second.ids.buyerId, email: "buyer@example.com",
  })).toEqual({ attached: 1 });
  expect(await second.state()).toEqual({ owner: second.ids.buyerId, granted: true, members: [second.ids.buyerId] });
  void t;
});

test("someone already paying who pays again before signing in is refunded, not charged twice", async () => {
  const { t, ids, finish, paid, state } = await fixture();
  await t.run(async (ctx) => {
    const now = Date.now();
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId: ids.communityId, userId: ids.buyerId, role: "member", accessSource: "paid_subscription", state: "active",
      createdAt: now, updatedAt: now,
    } as any);
    await ctx.db.insert("communitySubscriptions", {
      communityId: ids.communityId, userId: ids.buyerId, membershipId, pricePointId: ids.pricePointId, source: "stripe",
      status: "active", cancelAtPeriodEnd: false, providerAccountId: ACCOUNT, providerSubscriptionId: "sub_first", createdAt: now, updatedAt: now,
    } as any);
  });
  await paid(null, "sub_second");
  await finish(ids.buyerId, SECRET);
  expect((await state()).granted).toBe(false);
  const refund = (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()))
    .find((job: any) => job.name === "communityCommerce:refundDuplicateCommunitySubscriptionInternal") as any;
  expect(refund?.args[0]).toMatchObject({ providerSubscriptionId: "sub_second", providerAccountId: ACCOUNT });
});

test("one visitor can start only a few guest checkouts, and can't use up a community's for everyone", async () => {
  const { t, ids } = await fixture();
  const allowed = (visitorHash: string, nowMs = Date.now()) =>
    t.query(internal.communityCheckoutBuyer.guestCheckoutAllowedInternal, { communityId: ids.communityId, nowMs, visitorHash });
  const record = (index: number, visitorHash: string) => t.mutation(internal.communityCommerce.createPendingPublicCommunityCheckoutSessionInternal, {
    sessionId: `chk_${String(index).padStart(32, "0")}`, communityId: ids.communityId, communityLifecycleGeneration: 0, billingPeriod: "monthly",
    pricePointId: ids.pricePointId, amountBaseUnits: 500, currency: "usd", currencyDecimals: 2, providerAccountId: ACCOUNT,
    providerPriceId: "price_cash_first", buyerSecretHash: String(index).padStart(64, "0"), buyerVisitorHash: visitorHash, expiresAt: Date.now() + 60_000,
  });
  const busy = "a".repeat(64);
  const other = "b".repeat(64);
  // The fixture's own checkout has no visitor; this visitor gets a few of their own.
  for (const index of [1, 2, 3]) await record(index, busy);
  expect(await allowed(busy)).toBe(false);
  await expect(record(4, busy)).rejects.toThrow("community_checkout_unavailable");
  // Someone else is unaffected, and ten minutes on the first can try again.
  expect(await allowed(other)).toBe(true);
  expect(await allowed(busy, Date.now() + 11 * 60 * 1000)).toBe(true);
  // Every checkout belongs to someone.
  await expect(t.mutation(internal.communityCommerce.createPendingPublicCommunityCheckoutSessionInternal, {
    sessionId: `chk_${"e".repeat(32)}`, communityId: ids.communityId, communityLifecycleGeneration: 0, billingPeriod: "monthly",
    pricePointId: ids.pricePointId, amountBaseUnits: 500, currency: "usd", currencyDecimals: 2, providerAccountId: ACCOUNT,
    providerPriceId: "price_cash_first", expiresAt: Date.now() + 60_000,
  })).rejects.toThrow("checkout_buyer_required");
});

test("someone blocked from the community who pays before signing in is refunded, never let in", async () => {
  const { t, ids, finish, paid, state } = await fixture();
  await t.run(async (ctx) => {
    const now = Date.now();
    const owner = (await ctx.db.query("users").collect()).find((user) => user.handle === "owner")!;
    await ctx.db.insert("communityBlocks", { communityId: ids.communityId, userId: ids.buyerId, createdByUserId: owner._id, createdAt: now, updatedAt: now });
  });
  await paid(null);
  expect(await finish(ids.buyerId, SECRET)).toEqual({ status: "expired" });
  expect((await state()).members).toEqual([]);
  const refund = (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()))
    .find((job: any) => job.name === "communityCommerce:refundDuplicateCommunitySubscriptionInternal") as any;
  expect(refund?.args[0]).toMatchObject({ providerSubscriptionId: "sub_cash_first", providerAccountId: ACCOUNT });
});

test("refunded or disputed before signing in, a payment never grants: signing in after finds nothing to join", async () => {
  const { t, ids, finish, paid, state } = await fixture();
  await paid(null);
  expect(await t.mutation(internal.communityCheckoutBuyer.revokeUngrantedCommunityCheckoutInternal, {
    providerAccountId: ACCOUNT, providerSubscriptionId: "sub_cash_first", revokedReason: "subscription_refunded",
  })).toEqual({ revoked: true });
  expect(await finish(ids.buyerId, SECRET)).toEqual({ status: "expired" });
  expect(await state()).toEqual({ owner: ids.buyerId, granted: false, members: [] });
  // Once granted, a refund goes through the member's subscription instead.
  void t;
});

test("an email with many past checkouts still finds the one waiting for it", async () => {
  const { t, ids, paid, state } = await fixture();
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.buyerId, { emailVerifiedAt: undefined });
    const now = Date.now();
    for (let index = 0; index < 25; index += 1) {
      await ctx.db.insert("checkoutSessions", {
        sessionId: `chk_${String(index).padStart(32, "a")}`, mode: "community_join", communityId: ids.communityId,
        ownerUserId: ids.otherId, buyerEmailNormalized: "buyer@example.com", status: "complete",
        expiresAt: now + 60_000, createdAt: now - 1_000 - index, updatedAt: now,
      } as any);
    }
  });
  await paid("buyer@example.com");
  await t.run(async (ctx) => ctx.db.patch(ids.buyerId, { emailVerifiedAt: Date.now() }));
  expect(await t.mutation(internal.communityCheckoutBuyer.attachPaidCheckoutsForVerifiedEmailInternal, {
    userId: ids.buyerId, email: "buyer@example.com",
  })).toEqual({ attached: 1 });
  expect(await state()).toEqual({ owner: ids.buyerId, granted: true, members: [ids.buyerId] });
});

test("a payment made before signing in still grants when its buyer first signs in weeks later", async () => {
  const { t, ids, paid, state } = await fixture();
  await t.run(async (ctx) => ctx.db.patch(ids.buyerId, { emailVerifiedAt: undefined }));
  await paid("buyer@example.com");
  // Past the checkout's own expiry (it was for starting it).
  await t.run(async (ctx) => {
    const row = await ctx.db.query("checkoutSessions").withIndex("by_sessionId", (q) => q.eq("sessionId", SESSION)).first();
    await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 });
    await ctx.db.patch(ids.buyerId, { emailVerifiedAt: Date.now() });
  });
  expect(await t.mutation(internal.communityCheckoutBuyer.attachPaidCheckoutsForVerifiedEmailInternal, {
    userId: ids.buyerId, email: "buyer@example.com",
  })).toEqual({ attached: 1 });
  expect(await state()).toEqual({ owner: ids.buyerId, granted: true, members: [ids.buyerId] });
});

test("a dispute won on a payment not granted yet lifts its block; a refund doesn't", async () => {
  const { t, ids, finish, paid, state } = await fixture();
  await paid(null);
  await t.mutation(internal.communityCheckoutBuyer.revokeUngrantedCommunityCheckoutInternal, {
    providerAccountId: ACCOUNT, providerSubscriptionId: "sub_cash_first", revokedReason: "subscription_dispute_opened",
  });
  expect(await t.mutation(internal.communityCheckoutBuyer.restoreUngrantedCommunityCheckoutInternal, {
    providerAccountId: ACCOUNT, providerSubscriptionId: "sub_cash_first",
  })).toEqual({ restored: true });
  expect(await finish(ids.buyerId, SECRET)).toEqual({ status: "joined" });
  expect((await state()).members).toEqual([ids.buyerId]);

  const second = await fixture();
  await second.paid(null);
  await second.t.mutation(internal.communityCheckoutBuyer.revokeUngrantedCommunityCheckoutInternal, {
    providerAccountId: ACCOUNT, providerSubscriptionId: "sub_cash_first", revokedReason: "subscription_refunded",
  });
  // A dispute after the refund, then won: the refund still holds.
  await second.t.mutation(internal.communityCheckoutBuyer.revokeUngrantedCommunityCheckoutInternal, {
    providerAccountId: ACCOUNT, providerSubscriptionId: "sub_cash_first", revokedReason: "subscription_dispute_opened",
  });
  expect(await second.t.mutation(internal.communityCheckoutBuyer.restoreUngrantedCommunityCheckoutInternal, {
    providerAccountId: ACCOUNT, providerSubscriptionId: "sub_cash_first",
  })).toEqual({ restored: false });
  expect(await second.finish(second.ids.buyerId, SECRET)).toEqual({ status: "expired" });
});
