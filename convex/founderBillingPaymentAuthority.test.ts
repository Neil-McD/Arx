/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { internal } from "./_generated/api";
import {
  FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION,
  hashFounderCheckoutRecoveryEmail,
} from "./founderCheckoutReceiptCore";
import schema from "./schema";

const modules = import.meta.glob([
  "./founderBilling.ts",
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
  const envKeys = {
    price: "POLYNET_FOUNDER_STRIPE_PRICE_ID",
    input: "POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS",
    output: "POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS",
    reservation: "POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS",
    recovery: "POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET",
  } as const;
  for (const [key, envKey] of Object.entries(envKeys)) {
    const prior = priorEnv[key as keyof typeof priorEnv];
    if (prior === undefined) delete process.env[envKey];
    else process.env[envKey] = prior;
  }
});

async function createPendingCheckout(t: ReturnType<typeof convexTest>, params: {
  sessionId: string;
  nowMs: number;
}) {
  await t.mutation(
    (internal as any).founderBilling.createPendingPublicBuilderCheckoutInternal,
    {
      sessionId: params.sessionId,
      expiresAt: params.nowMs + 86_400_000,
      nowMs: params.nowMs,
    },
  );
}

async function syncPaidCheckout(t: ReturnType<typeof convexTest>, params: {
  sessionId: string;
  email: string;
  suffix: string;
  nowMs: number;
}) {
  const recoveryEmailHash = await hashFounderCheckoutRecoveryEmail(params.email);
  return await t.mutation(
    (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
    {
      localSessionId: params.sessionId,
      providerCheckoutSessionId: `cs_${params.suffix}`,
      providerCustomerId: `cus_${params.suffix}`,
      providerSubscriptionId: `sub_${params.suffix}`,
      providerPriceId: "price_founder_79",
      subscriptionStatus: "active",
      currentPeriodStartAt: params.nowMs,
      currentPeriodEndAt: params.nowMs + 30 * 86_400_000,
      cancelAtPeriodEnd: false,
      verifiedCheckoutPayment: true,
      providerEventCreatedAt: params.nowMs + 1_000,
      recoveryEmail: params.email,
      recoveryEmailHash,
      recoveryEmailHashVersion: FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION,
    },
  );
}

test("payment before authentication reconciles to the later verified account", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const email = "later-builder@example.com";
  await createPendingCheckout(t, { sessionId: "payment-before-auth", nowMs });

  await expect(syncPaidCheckout(t, {
    sessionId: "payment-before-auth",
    email,
    suffix: "payment_before_auth",
    nowMs,
  })).resolves.toMatchObject({
    receiptStatus: "paid_unclaimed",
    founderSubscriptionId: null,
  });

  const ownerUserId = await t.run(async (ctx) => await ctx.db.insert("users", {
    authSubject: "later-builder",
    email,
    normalizedEmail: email,
    emailVerifiedAt: nowMs + 2_000,
    createdAt: nowMs + 2_000,
    updatedAt: nowMs + 2_000,
  }));
  const reconciled = await t.mutation(
    (internal as any).founderBilling.reconcilePaidBuilderPurchasesForOwnerInternal,
    { ownerUserId, verifiedEmail: email, nowMs: nowMs + 3_000 },
  );
  expect(reconciled).toMatchObject({ ok: true, attached_count: 1 });

  const replay = await t.mutation(
    (internal as any).founderBilling.reconcilePaidBuilderPurchasesForOwnerInternal,
    { ownerUserId, verifiedEmail: email, nowMs: nowMs + 4_000 },
  );
  expect(replay).toMatchObject({
    ok: true,
    attached_count: 1,
    founder_subscription_ids: reconciled.founder_subscription_ids,
  });
  await t.run(async (ctx) => {
    const subscriptions = await ctx.db.query("founderSubscriptions").collect();
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      ownerUserId,
      providerSubscriptionId: "sub_payment_before_auth",
    });
  });
});

test("authentication before payment lets the webhook attach immediately", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const email = "existing-builder@example.com";
  const ownerUserId = await t.run(async (ctx) => await ctx.db.insert("users", {
    authSubject: "existing-builder",
    email,
    normalizedEmail: email,
    emailVerifiedAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  }));
  await createPendingCheckout(t, { sessionId: "auth-before-payment", nowMs });

  await expect(syncPaidCheckout(t, {
    sessionId: "auth-before-payment",
    email,
    suffix: "auth_before_payment",
    nowMs,
  })).resolves.toMatchObject({
    ok: true,
    ownerUserId,
    subscriptionStatus: "active",
  });
  await t.run(async (ctx) => {
    const subscriptions = await ctx.db.query("founderSubscriptions").collect();
    expect(subscriptions).toEqual([expect.objectContaining({ ownerUserId })]);
    expect(subscriptions[0]?.communityId).toBeUndefined();
  });
});

test("unverified or different-email accounts cannot receive a paid Builder purchase", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const paidEmail = "paid-builder@example.com";
  await createPendingCheckout(t, { sessionId: "verified-email-boundary", nowMs });
  await syncPaidCheckout(t, {
    sessionId: "verified-email-boundary",
    email: paidEmail,
    suffix: "verified_email_boundary",
    nowMs,
  });
  const unverifiedUserId = await t.run(async (ctx) => await ctx.db.insert("users", {
    authSubject: "unverified-builder",
    email: paidEmail,
    normalizedEmail: paidEmail,
    createdAt: nowMs,
    updatedAt: nowMs,
  }));
  await expect(t.mutation(
    (internal as any).founderBilling.reconcilePaidBuilderPurchasesForOwnerInternal,
    { ownerUserId: unverifiedUserId, verifiedEmail: paidEmail, nowMs: nowMs + 2_000 },
  )).rejects.toThrow("founder_checkout_verified_email_required");

  const otherEmail = "other-builder@example.com";
  const otherUserId = await t.run(async (ctx) => await ctx.db.insert("users", {
    authSubject: "other-builder",
    email: otherEmail,
    normalizedEmail: otherEmail,
    emailVerifiedAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  }));
  await expect(t.mutation(
    (internal as any).founderBilling.reconcilePaidBuilderPurchasesForOwnerInternal,
    { ownerUserId: otherUserId, verifiedEmail: otherEmail, nowMs: nowMs + 3_000 },
  )).resolves.toMatchObject({ attached_count: 0 });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("founderSubscriptions").collect()).toHaveLength(0);
  });
});
