/// <reference types="vite/client" />
// Paid joining is open only while the owner's Stripe account can take the card
// payment. A payouts-only account (Stripe's cross-border "recipient" agreement,
// e.g. Kuwait) looks ready but can't, so its join page closes checkout clearly.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { communityAppJoinProjection } from "./communityAppJoin";
import { canReceiveCommunityRevenue, isStripeConnectCheckoutCapabilityError } from "./stripeConnectAccountCore";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = 1_760_000_000_000;
const ready = { stripeAccountId: "acct_1", status: "ready", chargesEnabled: true, payoutsEnabled: true };

test("a payouts-only Stripe account can't receive community revenue, even when Stripe calls it ready", () => {
  expect(canReceiveCommunityRevenue(ready)).toBe(true);
  expect(canReceiveCommunityRevenue({ ...ready, serviceAgreement: "full" })).toBe(true);
  expect(canReceiveCommunityRevenue({ ...ready, serviceAgreement: "recipient" })).toBe(false);
  expect(canReceiveCommunityRevenue({ ...ready, chargesEnabled: false })).toBe(false);
});

test("Stripe refusing what the founder's account can sell is told apart from other errors", () => {
  const stripe = (message: string, type = "StripeInvalidRequestError") => Object.assign(new Error(message), { type });
  expect(isStripeConnectCheckoutCapabilityError(stripe(
    "Invalid currency: usd. Stripe accounts in KW do not support usd. Your account currently supports these currencies: .",
  ))).toBe(true);
  expect(isStripeConnectCheckoutCapabilityError(stripe("No such price: 'price_123'"))).toBe(false);
  expect(isStripeConnectCheckoutCapabilityError(stripe("Your card was declined.", "StripeCardError"))).toBe(false);
  expect(isStripeConnectCheckoutCapabilityError(new Error("network down"))).toBe(false);
});

async function paidCommunity(t: ReturnType<typeof convexTest>, serviceAgreement?: string) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "paid-owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "paid-club", name: "Paid club", lifecycleStatus: "active", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 2_900, currency: "usd", currencyDecimals: 2,
      isCurrent: true, createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("userStripeConnectAccounts", {
      userId: ownerId, stripeAccountId: "acct_owner", accountType: "express", country: serviceAgreement === "recipient" ? "KW" : "US",
      ...(serviceAgreement ? { serviceAgreement } : {}), transfersEnabled: true, status: "ready", detailsSubmitted: true,
      chargesEnabled: true, payoutsEnabled: true, requirementsCurrentlyDue: [], requirementsEventuallyDue: [], createdAt: NOW, updatedAt: NOW,
    });
    return communityId;
  });
}

const joinPage = (t: ReturnType<typeof convexTest>, communityId: any) =>
  t.run(async (ctx) => communityAppJoinProjection(ctx, (await ctx.db.get(communityId))!, null));

test("a paid community whose owner can take payments offers its plan on the join page", async () => {
  const t = convexTest(schema, modules);
  const page: any = await joinPage(t, await paidCommunity(t));
  expect(page.gate).toBe("checkout");
  expect(page.plans).toHaveLength(1);
  expect(page.plans[0]).toMatchObject({ billing_period: "monthly", price: "$29" });
});

test("a paid community whose owner's account is payouts-only offers no plan, so the join page says checkout is unavailable", async () => {
  const t = convexTest(schema, modules);
  const page: any = await joinPage(t, await paidCommunity(t, "recipient"));
  expect(page.gate).toBe("checkout");
  expect(page.plans).toEqual([]);
});
