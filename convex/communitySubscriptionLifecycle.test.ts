/// <reference types="vite/client" />
// A community subscription's status, cancelAtPeriodEnd and endedAt move
// together, written only by communitySubscriptionLifecycle.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  communitySubscriptionStatusFields,
  normalizeCommunitySubscriptionStatus,
} from "./communitySubscriptionLifecycle";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();
const PERIOD_END = NOW + 20 * 86_400_000;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("owner");
    const payerId = await user("payer");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "sub-club", name: "Sub club", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW,
    } as any);
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 500, currency: "usd", currencyDecimals: 2,
      isCurrent: true, providerAccountId: "acct_sub", providerPriceId: "price_sub", createdAt: NOW, updatedAt: NOW,
    } as any);
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId, userId: payerId, role: "member", accessSource: "paid_subscription", pricePointId,
      state: "active", activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    const subscriptionId = await ctx.db.insert("communitySubscriptions", {
      communityId, userId: payerId, membershipId, pricePointId, source: "stripe", status: "active",
      providerSubscriptionId: "sub_1", providerAccountId: "acct_sub", currentPeriodStartAt: NOW, currentPeriodEndAt: PERIOD_END,
      cancelAtPeriodEnd: false, createdAt: NOW, updatedAt: NOW,
    } as any);
    return { communityId, payerId, membershipId, subscriptionId };
  });
  const sync = (status: string, nowMs: number) => t.mutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
    communityId: ids.communityId, userId: ids.payerId, source: "stripe", status,
    providerAccountId: "acct_sub", providerSubscriptionId: "sub_1", nowMs,
  });
  const row = () => t.run((ctx) => ctx.db.get(ids.subscriptionId)) as Promise<any>;
  const membership = () => t.run((ctx) => ctx.db.get(ids.membershipId)) as Promise<any>;
  return { t, ids, sync, row, membership };
}

test("status, cancelAtPeriodEnd and endedAt can't disagree", () => {
  expect(normalizeCommunitySubscriptionStatus("canceled")).toBe("ended");
  expect(normalizeCommunitySubscriptionStatus("trialing")).toBeNull();
  expect(communitySubscriptionStatusFields({ status: "cancel_at_period_end", cancelAtPeriodEnd: false, nowMs: 5 }))
    .toEqual({ status: "cancel_at_period_end", cancelAtPeriodEnd: true, endedAt: undefined });
  expect(communitySubscriptionStatusFields({ status: "ended", cancelAtPeriodEnd: true, nowMs: 5 }))
    .toEqual({ status: "ended", cancelAtPeriodEnd: false, endedAt: 5 });
  expect(communitySubscriptionStatusFields({ status: "ended", current: { status: "ended", endedAt: 3 }, nowMs: 5 }).endedAt).toBe(3);
  expect(communitySubscriptionStatusFields({ status: "active", current: { status: "ended", endedAt: 3 }, nowMs: 5 }).endedAt).toBeUndefined();
  expect(communitySubscriptionStatusFields({ status: "past_due", cancelAtPeriodEnd: true, nowMs: 5 }).cancelAtPeriodEnd).toBe(true);
});

test("Stripe's canceled is stored as ended, and a later notice keeps when it first ended", async () => {
  const { sync, row, membership } = await fixture();
  await sync("canceled", NOW + 1);
  expect(await row()).toMatchObject({ status: "ended", cancelAtPeriodEnd: false, endedAt: NOW + 1 });
  expect((await membership()).state).toBe("lapsed");
  await sync("ended", NOW + 2);
  expect((await row()).endedAt).toBe(NOW + 1);
});

test("leaving marks the subscription to stop at the period's end; Stripe's end then ends it and the membership", async () => {
  const { t, ids, sync, row, membership } = await fixture();
  await t.withIdentity({ subject: "payer-subject" }).mutation(api.communityAdmin.leaveCommunity, { communityId: ids.communityId });
  const leaving = await row();
  expect(leaving).toMatchObject({ status: "cancel_at_period_end", cancelAtPeriodEnd: true });
  expect(leaving.endedAt).toBeUndefined();
  expect(typeof leaving.cancelRequestedAt).toBe("number");
  expect((await membership()).state).toBe("active");
  await sync("canceled", PERIOD_END);
  expect(await row()).toMatchObject({ status: "ended", cancelAtPeriodEnd: false, endedAt: PERIOD_END });
  expect((await membership()).state).toBe("lapsed");
});
