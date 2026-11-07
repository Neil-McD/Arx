import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { requireCommunityChatAccess } from "./communityCore";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();

// No rug pulls: a founder changing the price never touches anyone already
// paying. Existing members keep the price they joined at (their Stripe
// subscription is fixed to it); new members pay the new one; both are members.
test("raising the price leaves existing members on the price they joined at", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("owner");
    const payerId = await user("payer");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "price-club", name: "Price club", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW,
    } as any);
    const oldPriceId = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Price club", amountBaseUnits: 500, currency: "usd", currencyDecimals: 2,
      isCurrent: true, providerAccountId: "acct_price", providerPriceId: "price_old", createdAt: NOW, updatedAt: NOW,
    } as any);
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId, userId: payerId, role: "member", accessSource: "paid_subscription", pricePointId: oldPriceId,
      state: "active", activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("communitySubscriptions", {
      communityId, userId: payerId, membershipId, pricePointId: oldPriceId, source: "stripe", status: "active",
      providerSubscriptionId: "sub_payer", providerAccountId: "acct_price", currentPeriodEndAt: NOW + 86_400_000, cancelAtPeriodEnd: false,
      createdAt: NOW, updatedAt: NOW,
    } as any);
    // Setting a price needs the founder's Stripe connected and ready.
    await ctx.db.insert("userStripeConnectAccounts", {
      userId: ownerId, stripeAccountId: "acct_price", accountType: "express", transfersEnabled: true, status: "ready",
      detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, requirementsCurrentlyDue: [], requirementsEventuallyDue: [],
      createdAt: NOW, updatedAt: NOW,
    } as any);
    return { communityId, payerId, oldPriceId };
  });
  const before = await t.run((ctx) => ctx.db.query("communitySubscriptions").first());

  await t.withIdentity({ subject: "owner-subject" }).mutation(api.communityLifecycle.saveCommunitySettings, {
    communityId: ids.communityId, name: "Price club", slug: "price-club", monthlyAmountBaseUnits: 900, currency: "usd", currencyDecimals: 2,
  });

  // New members see the new price...
  const prices = await t.run((ctx) => ctx.db.query("communityPricePoints").collect());
  expect(prices.find((row) => row.isCurrent)?.amountBaseUnits).toBe(900);
  // ...the old one is kept (no longer offered), and the payer's subscription is untouched.
  expect(prices.find((row) => String(row._id) === String(ids.oldPriceId))).toMatchObject({ amountBaseUnits: 500, isCurrent: false });
  expect(await t.run((ctx) => ctx.db.query("communitySubscriptions").first())).toEqual(before);
  expect(await t.run((ctx) => requireCommunityChatAccess({ ctx, communityId: ids.communityId, userId: ids.payerId }).then(() => true))).toBe(true);
});
