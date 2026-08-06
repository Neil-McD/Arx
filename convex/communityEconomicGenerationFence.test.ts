/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test } from "vitest";

import { internal } from "./_generated/api";
import { redeemClaimRow } from "./billingCore";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityCommerce.ts",
  "./creatorCommerce.ts",
  "./founderBilling.ts",
  "./_generated/**/*.*s",
]);

const nowMs = 1_760_000_000_000;

async function createUser(ctx: any, suffix: string) {
  return await ctx.db.insert("users", {
    authSubject: `economic-fence-${suffix}`,
    displayName: `Economic fence ${suffix}`,
    handle: `economic-fence-${suffix}`,
    normalizedHandle: `economic-fence-${suffix}`,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function createCommunityFixture(
  t: ReturnType<typeof convexTest>,
  suffix: string,
  lifecycle?: { status: "active" | "archived"; generation: number },
) {
  return await t.run(async (ctx) => {
    const ownerId = await createUser(ctx, `${suffix}-owner`);
    const memberId = await createUser(ctx, `${suffix}-member`);
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `economic-fence-${suffix}`,
      name: `Economic fence ${suffix}`,
      visibility: "published",
      entryPolicy: "paid_subscription",
      inferenceFundingPolicy: "managed_required",
      activeMemberCount: 1,
      lifecycleStatus: lifecycle?.status,
      lifecycleGeneration: lifecycle?.generation,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Monthly",
      amountBaseUnits: 7_900,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      providerAccountId: `acct_${suffix}`,
      providerPriceId: `price_${suffix}`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("userStripeConnectAccounts", {
      userId: ownerId,
      stripeAccountId: `acct_${suffix}`,
      accountType: "express",
      transfersEnabled: true,
      status: "ready",
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsCurrentlyDue: [],
      requirementsEventuallyDue: [],
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ownerId, memberId, communityId, pricePointId };
  });
}

async function insertCompletedCheckoutAndClaim(args: {
  t: ReturnType<typeof convexTest>;
  communityId: any;
  memberId: any;
  sessionId: string;
  generation?: number;
}) {
  return await args.t.run(async (ctx) => {
    const claimToken = `claim-${args.sessionId}`;
    await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      mode: "community_join",
      communityId: args.communityId,
      communityLifecycleGeneration: args.generation,
      ownerUserId: args.memberId,
      claimToken,
      status: "complete",
      expiresAt: nowMs + 60_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const claimId = await ctx.db.insert("purchaseClaims", {
      claimToken,
      communityId: args.communityId,
      ownerUserId: args.memberId,
      status: "pending",
      sourceSessionId: args.sessionId,
      expiresAt: nowMs + 60_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return claimId;
  });
}

test("legacy generation-zero checkout remains redeemable on an active legacy community", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createCommunityFixture(t, "legacy");
  const claimId = await insertCompletedCheckoutAndClaim({
    t,
    communityId: fixture.communityId,
    memberId: fixture.memberId,
    sessionId: "legacy-session",
  });

  const result = await t.run(async (ctx) => {
    const claim = await ctx.db.get(claimId);
    if (!claim) throw new Error("claim_missing");
    return await redeemClaimRow({
      ctx,
      claim: claim as any,
      userId: fixture.memberId,
      nowMs: nowMs + 1,
    });
  });

  expect(result).toMatchObject({
    communityId: String(fixture.communityId),
    accessGranted: true,
  });
});

test("archived communities cannot start or persist a member checkout", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createCommunityFixture(t, "archived", {
    status: "archived",
    generation: 1,
  });

  await expect(
    t.query(
      internal.communityCommerce.resolvePublicCommunityCheckoutConfigInternal,
      {
        communitySlug: "economic-fence-archived",
        billingPeriod: "monthly",
        nowMs,
      },
    ),
  ).rejects.toThrow("community_archived");

  await expect(
    t.mutation(
      internal.communityCommerce.createPendingPublicCommunityCheckoutSessionInternal,
      {
        sessionId: "archived-session",
        communityId: fixture.communityId,
        communityLifecycleGeneration: 1,
        billingPeriod: "monthly",
        pricePointId: fixture.pricePointId,
        amountBaseUnits: 7_900,
        currency: "usd",
        currencyDecimals: 2,
        providerAccountId: "acct_archived",
        providerPriceId: "price_archived",
        ownerUserId: fixture.memberId,
        claimToken: "claim-archived-session",
        expiresAt: nowMs + 60_000,
        nowMs,
      },
    ),
  ).rejects.toThrow("community_archived");
});

test("a pre-archive checkout stays dead after archive and restore", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createCommunityFixture(t, "stale", {
    status: "active",
    generation: 0,
  });
  const claimId = await insertCompletedCheckoutAndClaim({
    t,
    communityId: fixture.communityId,
    memberId: fixture.memberId,
    sessionId: "stale-session",
    generation: 0,
  });

  const redeem = async () =>
    await t.run(async (ctx) => {
      const claim = await ctx.db.get(claimId);
      if (!claim) throw new Error("claim_missing");
      return await redeemClaimRow({
        ctx,
        claim: claim as any,
        userId: fixture.memberId,
        nowMs: nowMs + 1,
      });
    });

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      updatedAt: nowMs + 1,
    });
  });
  await expect(redeem()).resolves.toEqual({
    communityId: null,
    accessGranted: false,
    grantMarker: null,
  });

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      updatedAt: nowMs + 2,
    });
  });
  await expect(redeem()).resolves.toEqual({
    communityId: null,
    accessGranted: false,
    grantMarker: null,
  });
  await t.run(async (ctx) => {
    expect(
      await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.memberId),
        )
        .first(),
    ).toBeNull();
    expect((await ctx.db.get(claimId))?.status).toBe("pending");
  });
});

test("a checkout cannot redeem a claim for a different community", async () => {
  const t = convexTest(schema, modules);
  const checkoutCommunity = await createCommunityFixture(t, "bound-checkout");
  const claimCommunity = await createCommunityFixture(t, "bound-claim");
  const claimId = await t.run(async (ctx) => {
    await ctx.db.insert("checkoutSessions", {
      sessionId: "community-bound-session",
      mode: "community_join",
      communityId: checkoutCommunity.communityId,
      ownerUserId: checkoutCommunity.memberId,
      claimToken: "community-bound-claim",
      status: "complete",
      expiresAt: nowMs + 60_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return await ctx.db.insert("purchaseClaims", {
      claimToken: "community-bound-claim",
      communityId: claimCommunity.communityId,
      ownerUserId: checkoutCommunity.memberId,
      status: "pending",
      sourceSessionId: "community-bound-session",
      expiresAt: nowMs + 60_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });

  await expect(
    t.run(async (ctx) => {
      const claim = await ctx.db.get(claimId);
      if (!claim) throw new Error("claim_missing");
      return await redeemClaimRow({
        ctx,
        claim: claim as any,
        userId: checkoutCommunity.memberId,
        nowMs: nowMs + 1,
      });
    }),
  ).resolves.toEqual({
    communityId: null,
    accessGranted: false,
    grantMarker: null,
  });
});

test("a stale member webhook records provider truth but cannot complete the checkout", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createCommunityFixture(t, "webhook", {
    status: "active",
    generation: 0,
  });
  await t.mutation(
    internal.communityCommerce.createPendingPublicCommunityCheckoutSessionInternal,
    {
      sessionId: "webhook-session",
      communityId: fixture.communityId,
      communityLifecycleGeneration: 0,
      billingPeriod: "monthly",
      pricePointId: fixture.pricePointId,
      amountBaseUnits: 7_900,
      currency: "usd",
      currencyDecimals: 2,
      providerAccountId: "acct_webhook",
      providerPriceId: "price_webhook",
      ownerUserId: fixture.memberId,
      claimToken: "claim-webhook-session",
      expiresAt: nowMs + 60_000,
      nowMs,
    },
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      updatedAt: nowMs + 1,
    });
  });

  await t.mutation(
    internal.communityCommerce.syncPendingCommunityCheckoutSubscriptionInternal,
    {
      sessionId: "webhook-session",
      providerAccountId: "acct_webhook",
      providerCheckoutSessionId: "cs_webhook",
      providerCustomerId: "cus_webhook",
      providerSubscriptionId: "sub_webhook",
      providerPriceId: "price_webhook",
      subscriptionStatus: "active",
      currentPeriodStartAt: nowMs,
      currentPeriodEndAt: nowMs + 30 * 24 * 60 * 60 * 1_000,
      cancelAtPeriodEnd: false,
      markComplete: true,
      nowMs: nowMs + 2,
    },
  );

  await t.run(async (ctx) => {
    const checkout = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", "webhook-session"))
      .first();
    expect(checkout).toMatchObject({
      status: "expired",
      providerSubscriptionId: "sub_webhook",
      communitySubscriptionStatus: "active",
    });
    expect(await ctx.db.query("communityMemberships").collect()).toHaveLength(0);
  });
});

const founderEnv = {
  price: process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID,
  input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
  output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
  reservation: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
};

afterEach(() => {
  for (const [key, value] of [
    ["POLYNET_FOUNDER_STRIPE_PRICE_ID", founderEnv.price],
    ["POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", founderEnv.input],
    ["POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", founderEnv.output],
    ["POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", founderEnv.reservation],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("a stale founder checkout cannot instantiate a subscription after restore", async () => {
  process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = "price_founder_generation";
  process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
  process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "2000000";
  process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";

  const t = convexTest(schema, modules);
  const fixture = await createCommunityFixture(t, "founder", {
    status: "active",
    generation: 0,
  });
  await t.mutation(
    (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
    {
      sessionId: "founder-generation-session",
      ownerUserId: fixture.ownerId,
      communityId: fixture.communityId,
      expiresAt: nowMs + 60_000,
      nowMs,
    },
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      updatedAt: nowMs + 2,
    });
  });

  await expect(
    t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      {
        localSessionId: "founder-generation-session",
        providerCheckoutSessionId: "cs_founder_generation",
        providerCustomerId: "cus_founder_generation",
        providerSubscriptionId: "sub_founder_generation",
        providerPriceId: "price_founder_generation",
        subscriptionStatus: "active",
        currentPeriodStartAt: nowMs,
        currentPeriodEndAt: nowMs + 30 * 24 * 60 * 60 * 1_000,
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: nowMs + 3,
      },
    ),
  ).resolves.toMatchObject({
    ok: true,
    ignored: true,
    reason: "founder_subscription_not_local",
  });

  await t.run(async (ctx) => {
    expect(await ctx.db.query("founderSubscriptions").collect()).toHaveLength(0);
    expect(await ctx.db.query("founderUsageCycles").collect()).toHaveLength(0);
  });
});
