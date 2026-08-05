/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityCommerce.ts",
  "./email.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "subscription-generation-owner",
      displayName: "Subscription generation owner",
      handle: "subscription-generation-owner",
      normalizedHandle: "subscription-generation-owner",
      createdAt: 100,
      updatedAt: 100,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "subscription-generation-member",
      displayName: "Subscription generation member",
      handle: "subscription-generation-member",
      normalizedHandle: "subscription-generation-member",
      createdAt: 100,
      updatedAt: 100,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "subscription-generation",
      name: "Subscription generation",
      visibility: "unlisted",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription",
      activeMemberCount: 2,
      createdAt: 100,
      updatedAt: 100,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "paid_subscription",
      active: true,
      activationSequence: 1,
      activatedAt: 100,
      createdAt: 100,
      updatedAt: 100,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Monthly",
      amountBaseUnits: 2_900,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      providerAccountId: "acct_generation",
      providerPriceId: "price_generation",
      createdAt: 100,
      updatedAt: 100,
    });
    const oldSubscriptionId = await ctx.db.insert("communitySubscriptions", {
      communityId,
      communityLifecycleGeneration: 0,
      userId: memberId,
      membershipId,
      pricePointId,
      source: "stripe",
      status: "active",
      providerSubscriptionId: "sub_generation_old",
      providerAccountId: "acct_generation",
      providerCustomerId: "cus_generation",
      currentPeriodStartAt: 100,
      currentPeriodEndAt: 10_000,
      cancelAtPeriodEnd: false,
      lastSourceEventCreatedAt: 200,
      createdAt: 100,
      updatedAt: 200,
    });
    return {
      communityId,
      memberId,
      membershipId,
      pricePointId,
      oldSubscriptionId,
    };
  });
}

function syncArgs(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    communityId: fixture.communityId,
    userId: fixture.memberId,
    source: "stripe" as const,
    pricePointId: fixture.pricePointId,
    providerAccountId: "acct_generation",
    providerPriceId: "price_generation",
    providerSubscriptionId: "sub_generation_old",
    providerCustomerId: "cus_generation",
    status: "active",
    currentPeriodStartIso: new Date(100).toISOString(),
    currentPeriodEndIso: new Date(10_000).toISOString(),
    cancelAtPeriodEnd: false,
    sourceEventCreatedAt: 300,
    ...overrides,
  };
}

test("community subscription events are monotonic and lifecycle-generation fenced", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);

  await expect(
    t.mutation(
      internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal,
      syncArgs(fixture, { status: "ended", sourceEventCreatedAt: 199 }),
    ),
  ).resolves.toMatchObject({
    ignored: true,
    reason: "community_subscription_event_stale",
  });

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      updatedAt: 250,
    });
    await ctx.db.patch(fixture.oldSubscriptionId, {
      status: "ended",
      cancelAtPeriodEnd: false,
      endedAt: 250,
      lastSourceEventCreatedAt: 250,
      updatedAt: 250,
    });
    await ctx.db.patch(fixture.membershipId, {
      active: false,
      revokedAt: 250,
      revokedReason: "community_archived",
      updatedAt: 250,
    });
  });

  await expect(
    t.mutation(
      internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal,
      syncArgs(fixture, { sourceEventCreatedAt: 300 }),
    ),
  ).resolves.toMatchObject({
    ignored: true,
    quarantined: true,
    reason: "community_subscription_lifecycle_stale",
  });

  const currentSubscriptionId = await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      updatedAt: 400,
    });
    await ctx.db.patch(fixture.membershipId, {
      active: true,
      revokedAt: undefined,
      revokedReason: undefined,
      activationSequence: 2,
      activatedAt: 400,
      updatedAt: 400,
    });
    return await ctx.db.insert("communitySubscriptions", {
      communityId: fixture.communityId,
      communityLifecycleGeneration: 2,
      userId: fixture.memberId,
      membershipId: fixture.membershipId,
      pricePointId: fixture.pricePointId,
      source: "stripe",
      status: "active",
      providerSubscriptionId: "sub_generation_current",
      providerAccountId: "acct_generation",
      providerCustomerId: "cus_generation",
      currentPeriodStartAt: 400,
      currentPeriodEndAt: 20_000,
      cancelAtPeriodEnd: false,
      lastSourceEventCreatedAt: 400,
      createdAt: 400,
      updatedAt: 400,
    });
  });

  await expect(
    t.mutation(
      internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal,
      syncArgs(fixture, { status: "ended", sourceEventCreatedAt: 500 }),
    ),
  ).resolves.toMatchObject({ ignored: false, subscription_status: "ended" });
  await t.run(async (ctx) => {
    await expect(ctx.db.get(fixture.membershipId)).resolves.toMatchObject({ active: true });
  });

  await expect(
    t.mutation(
      internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal,
      syncArgs(fixture, {
        providerSubscriptionId: "sub_generation_current",
        status: "ended",
        sourceEventCreatedAt: 700,
      }),
    ),
  ).resolves.toMatchObject({ subscription_status: "ended" });
  await t.run(async (ctx) => {
    await expect(ctx.db.get(currentSubscriptionId)).resolves.toMatchObject({
      communityLifecycleGeneration: 2,
      status: "ended",
      lastSourceEventCreatedAt: 700,
    });
    await expect(ctx.db.get(fixture.membershipId)).resolves.toMatchObject({
      active: false,
    });
  });
});

test("pre-redemption checkout subscription events are monotonic", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("checkoutSessions", {
      sessionId: "community-generation-checkout",
      mode: "community_join",
      communityId: fixture.communityId,
      communityLifecycleGeneration: 0,
      pricePointId: fixture.pricePointId,
      providerAccountId: "acct_generation",
      providerSubscriptionId: "sub_generation_checkout",
      communitySubscriptionStatus: "active",
      lastProviderEventCreatedAt: 500,
      status: "pending",
      expiresAt: 10_000,
      createdAt: 100,
      updatedAt: 500,
    });
  });

  await expect(
    t.mutation(
      internal.communityCommerce.syncPendingCommunityCheckoutSubscriptionInternal,
      {
        sessionId: "community-generation-checkout",
        providerAccountId: "acct_generation",
        providerSubscriptionId: "sub_generation_checkout",
        subscriptionStatus: "ended",
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: 499,
      },
    ),
  ).resolves.toMatchObject({
    ignored: true,
    reason: "community_checkout_subscription_event_stale",
  });
  await t.run(async (ctx) => {
    const checkout = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) =>
        q.eq("sessionId", "community-generation-checkout"),
      )
      .unique();
    expect(checkout).toMatchObject({
      communitySubscriptionStatus: "active",
      lastProviderEventCreatedAt: 500,
      status: "pending",
    });
  });
});
