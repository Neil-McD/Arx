/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test } from "vitest";

import { internal } from "./_generated/api";
import { grantCommunityCheckout } from "./billingCore";
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

async function insertCompletedCheckout(args: {
  t: ReturnType<typeof convexTest>;
  communityId: any;
  memberId: any;
  sessionId: string;
  generation?: number;
}) {
  return await args.t.run(async (ctx) => await ctx.db.insert("checkoutSessions", {
    sessionId: args.sessionId,
    mode: "community_join",
    communityId: args.communityId,
    communityLifecycleGeneration: args.generation,
    ownerUserId: args.memberId,
    status: "complete",
    expiresAt: nowMs + 60_000,
    createdAt: nowMs,
    updatedAt: nowMs,
  }));
}

function grant(t: ReturnType<typeof convexTest>, checkoutId: any, at = nowMs + 1) {
  return t.run(async (ctx) => await grantCommunityCheckout({ ctx, checkoutSession: await ctx.db.get(checkoutId), nowMs: at }));
}

test("legacy generation-zero checkout still grants on an active legacy community, once", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createCommunityFixture(t, "legacy");
  const checkoutId = await insertCompletedCheckout({
    t,
    communityId: fixture.communityId,
    memberId: fixture.memberId,
    sessionId: "legacy-session",
  });

  expect(await grant(t, checkoutId)).toMatchObject({
    communityId: String(fixture.communityId),
    accessGranted: true,
  });
  // The checkout keeps when; granting it again changes nothing.
  expect((await t.run(async (ctx) => await ctx.db.get(checkoutId)))?.membershipGrantedAt).toBe(nowMs + 1);
  expect(await grant(t, checkoutId, nowMs + 2)).toEqual({
    communityId: String(fixture.communityId),
    accessGranted: false,
    grantMarker: null,
  });
  const arrivalEvents = await t.run(async (ctx) =>
    await ctx.db
      .query("communityActivityEvents")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.communityId),
      )
      .collect(),
  );
  expect(arrivalEvents).toEqual([
    expect.objectContaining({
      type: "member_joined",
      actorUserId: fixture.memberId,
      targetType: "membership",
      dedupeKey: expect.stringMatching(/^member_joined:.+:1$/),
    }),
  ]);
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
  const checkoutId = await insertCompletedCheckout({
    t,
    communityId: fixture.communityId,
    memberId: fixture.memberId,
    sessionId: "stale-session",
    generation: 0,
  });
  const none = { communityId: null, accessGranted: false, grantMarker: null };

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      updatedAt: nowMs + 1,
    });
  });
  await expect(grant(t, checkoutId)).resolves.toEqual(none);

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      updatedAt: nowMs + 2,
    });
  });
  await expect(grant(t, checkoutId)).resolves.toEqual(none);
  await t.run(async (ctx) => {
    expect(
      await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.memberId),
        )
        .first(),
    ).toBeNull();
    expect((await ctx.db.get(checkoutId))?.membershipGrantedAt).toBeUndefined();
  });
});

test("a checkout grants only to the buyer who started it, and only once paid", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createCommunityFixture(t, "bound");
  const none = { communityId: null, accessGranted: false, grantMarker: null };
  const unowned = await t.run(async (ctx) => await ctx.db.insert("checkoutSessions", {
    sessionId: "unowned-session", mode: "community_join", communityId: fixture.communityId,
    status: "complete", expiresAt: nowMs + 60_000, createdAt: nowMs, updatedAt: nowMs,
  }));
  await expect(grant(t, unowned)).resolves.toEqual(none);
  const unpaid = await insertCompletedCheckout({ t, communityId: fixture.communityId, memberId: fixture.memberId, sessionId: "unpaid-session" });
  await t.run(async (ctx) => { await ctx.db.patch(unpaid, { status: "pending" }); });
  await expect(grant(t, unpaid)).resolves.toEqual(none);
  expect(await t.run(async (ctx) => await ctx.db.query("communityMemberships").collect())).toHaveLength(0);
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
