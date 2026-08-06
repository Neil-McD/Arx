/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import {
  FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION,
  hashFounderCheckoutAttemptId,
  hashFounderCheckoutClaimToken,
  hashFounderCheckoutRecoveryEmail,
} from "./founderCheckoutReceiptCore";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob([
  "./founderBilling.ts",
  "./communityLifecycle.ts",
  "./_generated/**/*.*s",
]);

const priorEnv = {
  price: process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID,
  input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
  output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
  reservation: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
  recovery: process.env.POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET,
};

beforeEach(() => {
  process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = "price_founder_79";
  process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
  process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "2000000";
  process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
  process.env.POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET =
    "test-only-founder-checkout-recovery-secret-123456";
});

afterEach(() => {
  for (const [key, value] of Object.entries(priorEnv)) {
    const envKey = key === "price"
      ? "POLYNET_FOUNDER_STRIPE_PRICE_ID"
      : key === "input"
        ? "POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS"
        : key === "output"
          ? "POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS"
          : key === "reservation"
            ? "POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS"
            : "POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET";
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
});

test("verified public checkout remains unassigned until its authenticated claim", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const claimToken = "claim_public_builder_receipt_1234567890";
  const sessionId = "founder-public-payment-authority";
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authSubject: "public-builder-owner",
      displayName: "Public builder",
      handle: "public-builder",
      normalizedHandle: "public-builder",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });
  await t.mutation(
    (internal as any).founderBilling.createPendingPublicBuilderCheckoutInternal,
    {
      sessionId,
      claimTokenHash: await hashFounderCheckoutClaimToken(claimToken),
      checkoutAttemptKeyHash: await hashFounderCheckoutAttemptId(
        "attempt_public_builder_receipt_1234567890",
      ),
      expiresAt: nowMs + 86_400_000,
      nowMs,
    },
  );
  const verified = await t.mutation(
    (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
    {
      localSessionId: sessionId,
      providerCheckoutSessionId: "cs_public_builder",
      providerCustomerId: "cus_public_builder",
      providerSubscriptionId: "sub_public_builder",
      providerPriceId: "price_founder_79",
      subscriptionStatus: "active",
      currentPeriodStartAt: nowMs,
      currentPeriodEndAt: nowMs + 30 * 86_400_000,
      cancelAtPeriodEnd: false,
      verifiedCheckoutPayment: true,
      providerEventCreatedAt: nowMs + 1_000,
    },
  );
  expect(verified).toMatchObject({
    ok: true,
    receiptStatus: "paid_unclaimed",
    founderSubscriptionId: null,
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("founderSubscriptions").collect()).toHaveLength(0);
  });

  const asOwner = t.withIdentity({ subject: "public-builder-owner" });
  const claimed = await asOwner.mutation(api.founderBilling.claimFounderCheckoutReceipt, {
    sessionId,
    claimToken,
  });
  expect(claimed).toMatchObject({ ok: true, already_claimed: false });
  const replay = await asOwner.mutation(api.founderBilling.claimFounderCheckoutReceipt, {
    sessionId,
    claimToken,
  });
  expect(replay).toMatchObject({
    ok: true,
    already_claimed: true,
    founder_subscription_id: claimed.founder_subscription_id,
  });
  await t.run(async (ctx) => {
    const subscriptions = await ctx.db.query("founderSubscriptions").collect();
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      ownerUserId: expect.anything(),
      providerSubscriptionId: "sub_public_builder",
    });
    expect(subscriptions[0]?.communityId).toBeUndefined();
  });
});

test("one paid receipt survives account setup and is atomically consumed by one community", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const claimToken = "claim_builder_lifecycle_1234567890";
  const sessionId = "founder-builder-lifecycle";
  const ownerSubject = "builder-lifecycle-owner";
  const ownerUserId = await t.run(async (ctx) => await ctx.db.insert("users", {
    authSubject: ownerSubject,
    email: "builder@example.com",
    emailVerifiedAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  }));

  await t.mutation(
    (internal as any).founderBilling.createPendingPublicBuilderCheckoutInternal,
    {
      sessionId,
      claimTokenHash: await hashFounderCheckoutClaimToken(claimToken),
      checkoutAttemptKeyHash: await hashFounderCheckoutAttemptId(
        "attempt_builder_lifecycle_1234567890",
      ),
      expiresAt: nowMs + 86_400_000,
      nowMs,
    },
  );
  await t.mutation(
    (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
    {
      localSessionId: sessionId,
      providerCheckoutSessionId: "cs_builder_lifecycle",
      providerCustomerId: "cus_builder_lifecycle",
      providerSubscriptionId: "sub_builder_lifecycle",
      providerPriceId: "price_founder_79",
      subscriptionStatus: "active",
      currentPeriodStartAt: nowMs,
      currentPeriodEndAt: nowMs + 30 * 86_400_000,
      cancelAtPeriodEnd: false,
      verifiedCheckoutPayment: true,
      providerEventCreatedAt: nowMs + 1_000,
    },
  );

  const asOwner = t.withIdentity({ subject: ownerSubject });
  await expect(asOwner.mutation(api.founderBilling.claimFounderCheckoutReceipt, {
    sessionId,
    claimToken: "wrong_claim_token_1234567890",
  })).rejects.toThrow("founder_checkout_receipt_not_found");
  const claimed = await asOwner.mutation(api.founderBilling.claimFounderCheckoutReceipt, {
    sessionId,
    claimToken,
  });
  await expect(asOwner.mutation(api.communityLifecycle.createCommunity, {
    name: "Builder lifecycle",
    slug: "builder-lifecycle-incomplete",
    founderSubscriptionId: claimed.founder_subscription_id as any,
  })).rejects.toThrow("account_setup_required");
  await t.run(async (ctx) => {
    expect(await ctx.db.query("communities").collect()).toHaveLength(0);
    await ctx.db.patch(ownerUserId, {
      displayName: "Builder Owner",
      handle: "builder-owner",
      normalizedHandle: "builder-owner",
      updatedAt: nowMs + 2_000,
    });
    await ctx.db.insert("userProfileDetails", {
      userId: ownerUserId,
      displayName: "Builder Owner",
      avatarUrl: "https://example.com/builder-owner.png",
      createdAt: nowMs + 2_000,
      updatedAt: nowMs + 2_000,
    });
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", {
        userId: ownerUserId,
        documentKey: document.key,
        documentVersion: document.version,
        acceptedAt: nowMs + 2_000,
        source: "test",
        createdAt: nowMs + 2_000,
      });
    }
  });

  const competingCreates = await Promise.allSettled([
    asOwner.mutation(api.communityLifecycle.createCommunity, {
      name: "Builder lifecycle A",
      slug: "builder-lifecycle-a",
      founderSubscriptionId: claimed.founder_subscription_id as any,
    }),
    asOwner.mutation(api.communityLifecycle.createCommunity, {
      name: "Builder lifecycle B",
      slug: "builder-lifecycle-b",
      founderSubscriptionId: claimed.founder_subscription_id as any,
    }),
  ]);
  expect(competingCreates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejectedCreate = competingCreates.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  expect(String(rejectedCreate?.reason ?? "")).toContain(
    "founder_subscription_already_attached",
  );

  const replay = await asOwner.mutation(api.founderBilling.claimFounderCheckoutReceipt, {
    sessionId,
    claimToken,
  });
  expect(replay).toMatchObject({
    already_claimed: true,
    founder_subscription_id: claimed.founder_subscription_id,
  });

  await t.run(async (ctx) => {
    const communities = await ctx.db.query("communities").collect();
    expect(communities).toHaveLength(1);
    const community = communities[0]!;
    const subscription = await ctx.db.get(claimed.founder_subscription_id as any);
    expect(subscription).toMatchObject({
      communityId: community._id,
      providerSubscriptionId: "sub_builder_lifecycle",
    });
    expect(await ctx.db.query("founderSubscriptions").collect()).toHaveLength(1);
    expect(await ctx.db.query("founderUsageCycles").collect()).toHaveLength(1);
    expect(await ctx.db.query("communityChannels").collect()).toEqual([
      expect.objectContaining({
        communityId: community._id,
        systemRole: "general",
        status: "active",
      }),
    ]);
    expect(await ctx.db.query("communityPresence").collect()).toEqual([
      expect.objectContaining({ communityId: community._id, userId: ownerUserId }),
    ]);
  });
});

test("lost-browser recovery is bound to the verified Stripe checkout email", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const sessionId = "founder-email-recovery";
  const recoveryEmail = "recovery-builder@example.com";
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authSubject: "email-recovery-owner",
      email: recoveryEmail,
      emailVerifiedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("users", {
      authSubject: "email-recovery-attacker",
      email: "attacker@example.com",
      emailVerifiedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });
  await t.mutation(
    (internal as any).founderBilling.createPendingPublicBuilderCheckoutInternal,
    {
      sessionId,
      claimTokenHash: await hashFounderCheckoutClaimToken(
        "claim_email_recovery_1234567890",
      ),
      checkoutAttemptKeyHash: await hashFounderCheckoutAttemptId(
        "attempt_email_recovery_1234567890",
      ),
      expiresAt: nowMs + 86_400_000,
      nowMs,
    },
  );
  await t.mutation(
    (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
    {
      localSessionId: sessionId,
      providerCheckoutSessionId: "cs_email_recovery",
      providerCustomerId: "cus_email_recovery",
      providerSubscriptionId: "sub_email_recovery",
      providerPriceId: "price_founder_79",
      subscriptionStatus: "active",
      currentPeriodStartAt: nowMs,
      currentPeriodEndAt: nowMs + 30 * 86_400_000,
      cancelAtPeriodEnd: false,
      verifiedCheckoutPayment: true,
      providerEventCreatedAt: nowMs + 1_000,
      recoveryEmailHash: await hashFounderCheckoutRecoveryEmail(recoveryEmail),
      recoveryEmailHashVersion: FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION,
    },
  );

  const attacker = t.withIdentity({ subject: "email-recovery-attacker" });
  await expect(attacker.mutation(
    api.founderBilling.claimFounderCheckoutReceiptByVerifiedEmail,
    { sessionId },
  )).rejects.toThrow("founder_checkout_recovery_email_mismatch");

  const owner = t.withIdentity({ subject: "email-recovery-owner" });
  const claimed = await owner.mutation(
    api.founderBilling.claimFounderCheckoutReceiptByVerifiedEmail,
    { sessionId },
  );
  expect(claimed).toMatchObject({ ok: true, already_claimed: false });
  await expect(owner.mutation(
    api.founderBilling.claimFounderCheckoutReceiptByVerifiedEmail,
    { sessionId },
  )).resolves.toMatchObject({
    ok: true,
    already_claimed: true,
    founder_subscription_id: claimed.founder_subscription_id,
  });
});

test("an expired unpaid receipt cannot be claimed", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const claimToken = "claim_expired_builder_receipt_1234567890";
  const sessionId = "founder-expired-payment-authority";
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authSubject: "expired-builder-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });
  await t.mutation(
    (internal as any).founderBilling.createPendingPublicBuilderCheckoutInternal,
    {
      sessionId,
      claimTokenHash: await hashFounderCheckoutClaimToken(claimToken),
      checkoutAttemptKeyHash: await hashFounderCheckoutAttemptId(
        "attempt_expired_builder_receipt_1234567890",
      ),
      expiresAt: nowMs - 1,
      nowMs: nowMs - 2,
    },
  );
  const owner = t.withIdentity({ subject: "expired-builder-owner" });
  await expect(owner.mutation(api.founderBilling.claimFounderCheckoutReceipt, {
    sessionId,
    claimToken,
  })).rejects.toThrow("founder_checkout_receipt_expired");
  await t.run(async (ctx) => {
    expect(await ctx.db.query("founderSubscriptions").collect()).toHaveLength(0);
    expect(await ctx.db.query("communities").collect()).toHaveLength(0);
  });
});

test("a refund risk hold revokes an unclaimed receipt before account creation", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const claimToken = "claim_refunded_builder_receipt_1234567890";
  const sessionId = "founder-refunded-payment-authority";
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authSubject: "refunded-builder-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });
  await t.mutation(
    (internal as any).founderBilling.createPendingPublicBuilderCheckoutInternal,
    {
      sessionId,
      claimTokenHash: await hashFounderCheckoutClaimToken(claimToken),
      checkoutAttemptKeyHash: await hashFounderCheckoutAttemptId(
        "attempt_refunded_builder_receipt_1234567890",
      ),
      expiresAt: nowMs + 86_400_000,
      nowMs,
    },
  );
  await t.mutation(
    (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
    {
      localSessionId: sessionId,
      providerCustomerId: "cus_refunded_builder",
      providerSubscriptionId: "sub_refunded_builder",
      providerPriceId: "price_founder_79",
      subscriptionStatus: "active",
      currentPeriodStartAt: nowMs,
      currentPeriodEndAt: nowMs + 30 * 86_400_000,
      providerEventCreatedAt: nowMs + 1_000,
    },
  );
  await t.mutation(
    (internal as any).founderBilling.syncFounderSubscriptionRiskStatusInternal,
    {
      providerSubscriptionId: "sub_refunded_builder",
      status: "ended",
      revokedReason: "subscription_refunded",
      providerEventCreatedAt: nowMs + 2_000,
    },
  );
  const asOwner = t.withIdentity({ subject: "refunded-builder-owner" });
  await expect(asOwner.mutation(api.founderBilling.claimFounderCheckoutReceipt, {
    sessionId,
    claimToken,
  })).rejects.toThrow("founder_checkout_payment_not_verified");
});
