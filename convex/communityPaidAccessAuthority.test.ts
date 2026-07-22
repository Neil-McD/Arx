/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityCommerce.ts",
  "./email.ts",
  "./userPlatformAppMounts.ts",
  "./_generated/**/*.*s",
]);

const NOW_MS = 1_753_000_000_000;

beforeEach(() => {
  vi.stubEnv("POLYNET_PUBLIC_APP_URL", "https://polynet-staging.vercel.app");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function createFixture(
  t: ReturnType<typeof convexTest>,
  suffix: string,
) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `paid-access-owner-${suffix}`,
      displayName: "Paid access owner",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const userSubject = `paid-access-member-${suffix}`;
    const userId = await ctx.db.insert("users", {
      authSubject: userSubject,
      email: `${suffix}@example.test`,
      displayName: "Paid access member",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `paid-access-${suffix}`,
      name: "Paid access community",
      visibility: "unlisted",
      entryPolicy: "paid_subscription",
      activeMemberCount: 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Monthly",
      amountBaseUnits: 1_000,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      providerPriceId: `price_${suffix}`,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const sessionId = `checkout_${suffix}`;
    await ctx.db.insert("checkoutSessions", {
      sessionId,
      mode: "community_join",
      provider: "stripe",
      providerCheckoutSessionId: `cs_${suffix}`,
      providerCustomerId: `cus_${suffix}`,
      providerPriceId: `price_${suffix}`,
      communityId,
      billingPeriod: "monthly",
      pricePointId,
      amountBaseUnits: 1_000,
      currency: "usd",
      currencyDecimals: 2,
      platformFeeBps: 1_000,
      ownerUserId: userId,
      checkoutAttemptId: `checkout_attempt_${suffix}_1234567890`,
      checkoutAttemptExpiresAt: NOW_MS + 60 * 60 * 1_000,
      checkoutCommunitySlug: `paid-access-${suffix}`,
      checkoutSuccessUrl: `https://polynet-staging.vercel.app/checkout/success?session_id=${sessionId}`,
      checkoutCancelUrl: `https://polynet-staging.vercel.app/c/paid-access-${suffix}`,
      providerDestinationAccountId: `acct_${suffix}`,
      status: "pending",
      expiresAt: NOW_MS + 14 * 24 * 60 * 60 * 1_000,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    return {
      ownerId,
      userId,
      userSubject,
      communityId,
      pricePointId,
      sessionId,
      providerSubscriptionId: `sub_${suffix}`,
    };
  });
}

async function completeCheckout(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  nowMs = NOW_MS + 1,
) {
  return await t.mutation(
    (internal as any).communityCommerce.syncPendingCommunityCheckoutSubscriptionInternal,
    {
      sessionId: fixture.sessionId,
      providerCheckoutSessionId: `cs_${fixture.sessionId.replace("checkout_", "")}`,
      providerCustomerId: `cus_${fixture.sessionId.replace("checkout_", "")}`,
      providerSubscriptionId: fixture.providerSubscriptionId,
      providerPriceId: `price_${fixture.sessionId.replace("checkout_", "")}`,
      subscriptionStatus: "active",
      currentPeriodStartAt: nowMs,
      currentPeriodEndAt: nowMs + 30 * 24 * 60 * 60 * 1_000,
      cancelAtPeriodEnd: false,
      markComplete: true,
      nowMs,
    },
  );
}

describe("paid community access authority", () => {
  test("verified checkout completion atomically creates membership and one subscription", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "complete");

    await completeCheckout(t, fixture);
    await completeCheckout(t, fixture, NOW_MS + 2);

    const state = await t.run(async (ctx) => ({
      checkout: await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", fixture.sessionId))
        .unique(),
      memberships: await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.userId),
        )
        .collect(),
      subscriptions: await ctx.db.query("communitySubscriptions").collect(),
    }));

    expect(state.checkout).toMatchObject({
      status: "complete",
      communitySubscriptionStatus: "active",
      providerSubscriptionId: fixture.providerSubscriptionId,
    });
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({
      active: true,
      accessSource: "paid_subscription",
      pricePointId: fixture.pricePointId,
    });
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({
      membershipId: state.memberships[0]._id,
      source: "stripe",
      status: "active",
      providerSubscriptionId: fixture.providerSubscriptionId,
    });
    await t.run(async (ctx) => {
      if (!state.checkout) throw new Error("checkout_missing");
      await ctx.db.patch(state.checkout._id, { expiresAt: NOW_MS - 1 });
    });
    await expect(
      t.withIdentity({ subject: fixture.userSubject }).query(
        api.communityCommerce.finalizeCheckoutSession,
        {
        sessionId: fixture.sessionId,
        },
      ),
    ).resolves.toEqual({
      ok: true,
      status: "succeeded",
      community: {
        id: String(fixture.communityId),
        slug: "paid-access-complete",
      },
    });
  });

  test("a duplicate completion cannot reactivate access after a later terminal event", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "terminal");
    await completeCheckout(t, fixture);

    await t.mutation(
      (internal as any).communityCommerce.syncCommunitySubscriptionLifecycleInternal,
      {
        communityId: fixture.communityId,
        userId: fixture.userId,
        providerSubscriptionId: fixture.providerSubscriptionId,
        status: "ended",
        revokedReason: "subscription_refunded",
        nowMs: NOW_MS + 10,
      },
    );
    await completeCheckout(t, fixture, NOW_MS + 20);

    const state = await t.run(async (ctx) => ({
      membership: await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.userId),
        )
        .unique(),
      subscription: await ctx.db
        .query("communitySubscriptions")
        .withIndex("by_providerSubscriptionId", (q) =>
          q.eq("providerSubscriptionId", fixture.providerSubscriptionId),
        )
        .unique(),
    }));
    expect(state.membership).toMatchObject({
      active: false,
      revokedReason: "subscription_refunded",
    });
    expect(state.subscription).toMatchObject({ status: "ended" });
  });

  test("a non-granting completion stays pending until verified granting state arrives", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "not-granting");

    await t.mutation(
      (internal as any).communityCommerce.syncPendingCommunityCheckoutSubscriptionInternal,
      {
        sessionId: fixture.sessionId,
        providerSubscriptionId: fixture.providerSubscriptionId,
        subscriptionStatus: "canceled",
        markComplete: true,
        nowMs: NOW_MS + 1,
      },
    );
    const pendingState = await t.run(async (ctx) => ({
      checkout: await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", fixture.sessionId))
        .unique(),
      memberships: await ctx.db.query("communityMemberships").collect(),
      subscriptions: await ctx.db.query("communitySubscriptions").collect(),
    }));
    expect(pendingState.checkout?.status).toBe("pending");
    expect(pendingState.memberships).toHaveLength(0);
    expect(pendingState.subscriptions).toHaveLength(0);

    await completeCheckout(t, fixture, NOW_MS + 2);
    const completedState = await t.run(async (ctx) => ({
      checkout: await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", fixture.sessionId))
        .unique(),
      memberships: await ctx.db.query("communityMemberships").collect(),
      subscriptions: await ctx.db.query("communitySubscriptions").collect(),
    }));
    expect(completedState.checkout?.status).toBe("complete");
    expect(completedState.memberships).toHaveLength(1);
    expect(completedState.subscriptions).toHaveLength(1);
  });

  test("a block race fails closed and leaves checkout, membership, and subscription unchanged", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "blocked");
    await t.run(async (ctx) => {
      await ctx.db.insert("communityBlocks", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        createdByUserId: fixture.ownerId,
        reason: "paid_access_test",
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      });
    });

    await expect(completeCheckout(t, fixture)).rejects.toThrow("community_user_blocked");
    const state = await t.run(async (ctx) => ({
      checkout: await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", fixture.sessionId))
        .unique(),
      memberships: await ctx.db.query("communityMemberships").collect(),
      subscriptions: await ctx.db.query("communitySubscriptions").collect(),
    }));
    expect(state.checkout?.status).toBe("pending");
    expect(state.memberships).toHaveLength(0);
    expect(state.subscriptions).toHaveLength(0);
  });

  test("duplicate subscription authority fails closed instead of ranking a winner", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "duplicate");
    await completeCheckout(t, fixture);
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.userId),
        )
        .unique();
      if (!membership) throw new Error("membership_missing");
      await ctx.db.insert("communitySubscriptions", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        membershipId: membership._id,
        pricePointId: fixture.pricePointId,
        source: "stripe",
        status: "active",
        providerSubscriptionId: "sub_duplicate_corruption",
        cancelAtPeriodEnd: false,
        createdAt: NOW_MS + 2,
        updatedAt: NOW_MS + 2,
      });
    });

    await expect(
      t.withIdentity({ subject: fixture.userSubject }).query(
        api.communityCommerce.finalizeCheckoutSession,
        { sessionId: fixture.sessionId },
      ),
    ).rejects.toThrow("community_subscription_duplicate_membership");
  });

  test("duplicate provider subscription identity fails closed for webhook lookup", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "provider-duplicate");
    await completeCheckout(t, fixture);
    await t.run(async (ctx) => {
      const secondUserId = await ctx.db.insert("users", {
        authSubject: "paid-access-provider-duplicate-second",
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      });
      const secondMembershipId = await ctx.db.insert("communityMemberships", {
        communityId: fixture.communityId,
        userId: secondUserId,
        role: "member",
        active: true,
        accessSource: "paid_subscription",
        pricePointId: fixture.pricePointId,
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      });
      await ctx.db.insert("communitySubscriptions", {
        communityId: fixture.communityId,
        userId: secondUserId,
        membershipId: secondMembershipId,
        pricePointId: fixture.pricePointId,
        source: "stripe",
        status: "active",
        providerSubscriptionId: fixture.providerSubscriptionId,
        cancelAtPeriodEnd: false,
        createdAt: NOW_MS + 2,
        updatedAt: NOW_MS + 2,
      });
    });

    await expect(
      t.query(
        (internal as any).communityCommerce
          .getCommunitySubscriptionByProviderSubscriptionIdInternal,
        { providerSubscriptionId: fixture.providerSubscriptionId },
      ),
    ).rejects.toThrow("community_subscription_duplicate_provider");
  });

  test("a community owner cannot start checkout for their own community", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "owner");
    await expect(
      t.query(
        (internal as any).communityCommerce.requirePublicCommunityCheckoutNotBlockedInternal,
        {
          communityId: fixture.communityId,
          userId: fixture.ownerId,
        },
      ),
    ).rejects.toThrow("community_owner_checkout_forbidden");
  });
});
