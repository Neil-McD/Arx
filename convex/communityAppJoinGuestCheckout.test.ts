import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const SESSION = `chk_${"b".repeat(32)}`;
const CLAIM = `claim_${"c".repeat(32)}`;

// A paid community and a guest checkout (no owner yet) still waiting on Stripe.
async function fixture() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: now, updatedAt: now,
    });
    const ownerId = await user("owner");
    const buyerId = await user("buyer");
    const otherId = await user("other");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Club", visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription", activeMemberCount: 1, createdAt: now, updatedAt: now,
    } as any);
    await ctx.db.insert("checkoutSessions", {
      sessionId: SESSION, mode: "community_join", communityId, communityLifecycleGeneration: 0, billingPeriod: "monthly",
      claimToken: CLAIM, status: "pending", expiresAt: now + 60_000, createdAt: now, updatedAt: now,
    } as any);
    await ctx.db.insert("purchaseClaims", {
      claimToken: CLAIM, communityId, billingPeriod: "monthly", status: "pending", sourceSessionId: SESSION,
      expiresAt: now + 60_000, createdAt: now, updatedAt: now,
    } as any);
    return { communityId, buyerId, otherId };
  });
  const finish = (userId: any, claimToken?: string) =>
    t.mutation(internal.communityAppJoin.finishCommunityAppCheckoutInternal, {
      userId, communityId: ids.communityId, sessionId: SESSION, ...(claimToken ? { claimToken } : {}),
    });
  const owners = () => t.run(async (ctx) => {
    const session = await ctx.db.query("checkoutSessions").withIndex("by_sessionId", (q) => q.eq("sessionId", SESSION)).first();
    const claim = await ctx.db.query("purchaseClaims").withIndex("by_claimToken", (q) => q.eq("claimToken", CLAIM)).first();
    return [session?.ownerUserId ?? null, claim?.ownerUserId ?? null];
  });
  return { t, ids, finish, owners };
}

test("a guest checkout belongs to nobody until someone signs in holding its claim", async () => {
  const { ids, finish, owners } = await fixture();
  expect(await finish(ids.buyerId)).toEqual({ status: "not_found" });
  expect(await finish(ids.buyerId, `claim_${"d".repeat(32)}`)).toEqual({ status: "not_found" });
  expect(await owners()).toEqual([null, null]);
});

test("the buyer's claim makes the payment theirs (still pending on Stripe), and nobody else's after", async () => {
  const { ids, finish, owners } = await fixture();
  expect(await finish(ids.buyerId, CLAIM)).toEqual({ status: "pending" });
  expect(await owners()).toEqual([ids.buyerId, ids.buyerId]);
  // The same claim in another account's hands finds nothing.
  expect(await finish(ids.otherId, CLAIM)).toEqual({ status: "not_found" });
  expect(await owners()).toEqual([ids.buyerId, ids.buyerId]);
  // The buyer keeps finishing without it, as any signed-in checkout does.
  expect(await finish(ids.buyerId)).toEqual({ status: "pending" });
});

test("a community takes a limited number of unclaimed guest checkouts at a time", async () => {
  const { t, ids } = await fixture();
  const allowed = () => t.query(internal.communityCommerce.guestCheckoutAllowedInternal, { communityId: ids.communityId, nowMs: Date.now() });
  expect(await allowed()).toBe(true);
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 1; index < 20; index += 1) {
      await ctx.db.insert("checkoutSessions", {
        sessionId: `chk_${String(index).padStart(32, "0")}`, mode: "community_join", communityId: ids.communityId,
        status: "pending", expiresAt: now + 60_000, createdAt: now, updatedAt: now,
      } as any);
    }
  });
  expect(await allowed()).toBe(false);
  // Ten minutes on, those have aged out of the window.
  expect(await t.query(internal.communityCommerce.guestCheckoutAllowedInternal, {
    communityId: ids.communityId, nowMs: Date.now() + 11 * 60 * 1000,
  })).toBe(true);
});

test("recording a guest checkout re-checks the limit in the same transaction", async () => {
  const { t, ids } = await fixture();
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 1; index < 20; index += 1) {
      await ctx.db.insert("checkoutSessions", {
        sessionId: `chk_${String(index).padStart(32, "0")}`, mode: "community_join", communityId: ids.communityId,
        status: "pending", expiresAt: now + 60_000, createdAt: now, updatedAt: now,
      } as any);
    }
  });
  const pricePointId = await t.run((ctx) => ctx.db.insert("communityPricePoints", {
    communityId: ids.communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 500, currency: "usd",
    currencyDecimals: 2, isCurrent: true, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  await expect(t.mutation(internal.communityCommerce.createPendingPublicCommunityCheckoutSessionInternal, {
    sessionId: `chk_${"f".repeat(32)}`, communityId: ids.communityId, communityLifecycleGeneration: 0, billingPeriod: "monthly",
    pricePointId, amountBaseUnits: 500, currency: "usd", currencyDecimals: 2, providerAccountId: "acct_test123",
    providerPriceId: "price_test", claimToken: `claim_${"f".repeat(32)}`, expiresAt: Date.now() + 60_000,
  })).rejects.toThrow("community_checkout_unavailable");
});

test("the finish-joining email: only for a paid, unclaimed guest checkout, once, linking to the twin's /join with its claim", async () => {
  const { t, ids, finish } = await fixture();
  const TWIN_ORIGIN = "https://club--me.polynet.page";
  await t.run(async (ctx) => {
    await ctx.db.insert("communityDomains", { communityId: ids.communityId, origin: TWIN_ORIGIN, kind: "private", createdAt: Date.now() });
    const row = await ctx.db.query("checkoutSessions").withIndex("by_sessionId", (q) => q.eq("sessionId", SESSION)).first();
    await ctx.db.patch(row!._id, { status: "complete" });
  });
  const plan = () => t.query(internal.communityAppJoin.finishJoiningEmailPlanInternal, { sessionId: SESSION });
  expect((await plan())?.actionUrl).toBe(`${TWIN_ORIGIN}/join?checkout=${SESSION}&claim=${CLAIM}`);
  // Sent once, however many times it's asked (a webhook Stripe retries).
  for (let index = 0; index < 2; index += 1) {
    await t.action(internal.communityAppJoin.sendFinishJoiningEmailInternal, { sessionId: SESSION, recipientEmail: "buyer@example.com" });
  }
  const outbox = await t.run((ctx) => ctx.db.query("emailOutbox").collect());
  expect(outbox.map((row) => [row.templateKey, row.recipientEmail, row.dedupeKey])).toEqual([
    ["community_finish_joining", "buyer@example.com", `community_finish_joining:${SESSION}`],
  ]);
  // Claimed: no plan, so no email.
  await finish(ids.buyerId, CLAIM);
  expect(await plan()).toBeNull();
});
