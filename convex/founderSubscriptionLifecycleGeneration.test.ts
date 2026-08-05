/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import { getFounderSubscriptionByCommunity } from "./founderPlanCore";
import schema from "./schema";

const modules = import.meta.glob([
  "./founderBilling.ts",
  "./providerConnections.ts",
  "./_generated/**/*.*s",
]);

afterEach(() => {
  vi.unstubAllEnvs();
});

test("founder subscriptions cannot reactivate across lifecycle generations", async () => {
  vi.stubEnv("POLYNET_FOUNDER_STRIPE_PRICE_ID", "price_generation");
  vi.stubEnv("POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", "1000000");
  vi.stubEnv("POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "1000000");
  vi.stubEnv("POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", "1000000");

  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "founder-generation-owner",
      displayName: "Founder generation owner",
      handle: "founder-generation-owner",
      normalizedHandle: "founder-generation-owner",
      createdAt: 100,
      updatedAt: 100,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "founder-generation",
      name: "Founder generation",
      visibility: "unlisted",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: 100,
      updatedAt: 100,
    });
    return { ownerId, communityId };
  });

  await t.mutation(
    internal.founderBilling.createPendingFounderSubscriptionCheckoutInternal,
    {
      sessionId: "founder-generation-old-checkout",
      ownerUserId: fixture.ownerId,
      communityId: fixture.communityId,
      expiresAt: 10_000,
      nowMs: 100,
    },
  );
  const oldResult: any = await t.mutation(
    internal.founderBilling.syncFounderSubscriptionFromStripeInternal,
    {
      localSessionId: "founder-generation-old-checkout",
      providerCheckoutSessionId: "cs_generation_old",
      providerCustomerId: "cus_generation",
      providerSubscriptionId: "sub_generation_old",
      providerPriceId: "price_generation",
      subscriptionStatus: "active",
      currentPeriodStartAt: 100,
      currentPeriodEndAt: 10_000,
      cancelAtPeriodEnd: false,
      providerEventCreatedAt: 200,
    },
  );

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      updatedAt: 250,
    });
    await ctx.db.patch(oldResult.founderSubscriptionId, {
      status: "ended",
      cancelAtPeriodEnd: false,
      endedAt: 250,
      revokedReason: "community_archived",
      lastProviderEventCreatedAt: 250,
      updatedAt: 250,
    });
  });

  await expect(
    t.mutation(
      internal.founderBilling.syncFounderSubscriptionFromStripeInternal,
      {
        localSessionId: null,
        providerCustomerId: "cus_generation",
        providerSubscriptionId: "sub_generation_old",
        providerPriceId: "price_generation",
        subscriptionStatus: "active",
        currentPeriodStartAt: 100,
        currentPeriodEndAt: 10_000,
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: 300,
      },
    ),
  ).resolves.toMatchObject({
    ignored: true,
    quarantined: true,
    reason: "founder_subscription_lifecycle_stale",
  });

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      updatedAt: 400,
    });
  });
  await t.mutation(
    internal.founderBilling.createPendingFounderSubscriptionCheckoutInternal,
    {
      sessionId: "founder-generation-current-checkout",
      ownerUserId: fixture.ownerId,
      communityId: fixture.communityId,
      expiresAt: 20_000,
      nowMs: 400,
    },
  );
  const currentResult: any = await t.mutation(
    internal.founderBilling.syncFounderSubscriptionFromStripeInternal,
    {
      localSessionId: "founder-generation-current-checkout",
      providerCheckoutSessionId: "cs_generation_current",
      providerCustomerId: "cus_generation",
      providerSubscriptionId: "sub_generation_current",
      providerPriceId: "price_generation",
      subscriptionStatus: "active",
      currentPeriodStartAt: 400,
      currentPeriodEndAt: 20_000,
      cancelAtPeriodEnd: false,
      providerEventCreatedAt: 500,
    },
  );

  await t.mutation(
    internal.founderBilling.syncFounderSubscriptionFromStripeInternal,
    {
      localSessionId: null,
      providerCustomerId: "cus_generation",
      providerSubscriptionId: "sub_generation_old",
      providerPriceId: "price_generation",
      subscriptionStatus: "ended",
      currentPeriodStartAt: 100,
      currentPeriodEndAt: 10_000,
      cancelAtPeriodEnd: false,
      providerEventCreatedAt: 600,
    },
  );

  await t.run(async (ctx) => {
    await expect(
      getFounderSubscriptionByCommunity(ctx, fixture.communityId, 700),
    ).resolves.toMatchObject({
      _id: currentResult.founderSubscriptionId,
      communityLifecycleGeneration: 2,
      status: "active",
    });
    await expect(ctx.db.get(oldResult.founderSubscriptionId)).resolves.toMatchObject({
      communityLifecycleGeneration: 0,
      status: "ended",
    });
  });
});
