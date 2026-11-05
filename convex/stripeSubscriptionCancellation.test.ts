import { describe, expect, test, vi } from "vitest";

import {
  cancelAndRefundDuplicateSubscription,
  cancelStripeSubscriptionAtPeriodEnd,
  cancelStripeSubscriptionIfActive,
  expireStripeCheckoutSessionIfOpen,
} from "./stripeSubscriptionCancellation";

describe("canonical Stripe subscription cancellation", () => {
  test("retrieves and cancels connected subscriptions in their persisted account scope", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_connected",
      status: "active",
    });
    const cancel = vi.fn().mockResolvedValue({
      id: "sub_connected",
      status: "canceled",
    });
    const stripe = {
      subscriptions: { retrieve, cancel },
      checkout: { sessions: { retrieve: vi.fn(), expire: vi.fn() } },
    } as any;

    await expect(
      cancelStripeSubscriptionIfActive(
        {
          providerSubscriptionId: "sub_connected",
          providerAccountId: "acct_connected",
        },
        stripe,
      ),
    ).resolves.toBe("canceled");
    expect(retrieve).toHaveBeenCalledWith(
      "sub_connected",
      {},
      { stripeAccount: "acct_connected" },
    );
    expect(cancel).toHaveBeenCalledWith(
      "sub_connected",
      {},
      { stripeAccount: "acct_connected" },
    );
  });

  test("treats missing and already canceled subscriptions as successful terminal outcomes", async () => {
    const missingStripe = {
      subscriptions: {
        retrieve: vi.fn().mockRejectedValue({
          statusCode: 404,
          code: "resource_missing",
        }),
        cancel: vi.fn(),
      },
      checkout: { sessions: { retrieve: vi.fn(), expire: vi.fn() } },
    } as any;
    await expect(
      cancelStripeSubscriptionIfActive(
        { providerSubscriptionId: "sub_missing" },
        missingStripe,
      ),
    ).resolves.toBe("missing");
    expect(missingStripe.subscriptions.cancel).not.toHaveBeenCalled();

    const canceledStripe = {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ status: "canceled" }),
        cancel: vi.fn(),
      },
      checkout: { sessions: { retrieve: vi.fn(), expire: vi.fn() } },
    } as any;
    await expect(
      cancelStripeSubscriptionIfActive(
        { providerSubscriptionId: "sub_canceled" },
        canceledStripe,
      ),
    ).resolves.toBe("already_inactive");
    expect(canceledStripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  test("expires open checkout sessions and surfaces a completed session subscription", async () => {
    const retrieve = vi
      .fn()
      .mockResolvedValueOnce({ status: "open", subscription: null })
      .mockResolvedValueOnce({ status: "complete", subscription: "sub_completed" });
    const expire = vi.fn().mockResolvedValue({ status: "expired" });
    const stripe = {
      subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
      checkout: { sessions: { retrieve, expire } },
    } as any;

    await expect(
      expireStripeCheckoutSessionIfOpen(
        {
          providerCheckoutSessionId: "cs_open",
          providerAccountId: "acct_connected",
        },
        stripe,
      ),
    ).resolves.toEqual({ outcome: "expired", providerSubscriptionId: null });
    expect(expire).toHaveBeenCalledWith(
      "cs_open",
      {},
      { stripeAccount: "acct_connected" },
    );

    await expect(
      expireStripeCheckoutSessionIfOpen(
        { providerCheckoutSessionId: "cs_complete" },
        stripe,
      ),
    ).resolves.toEqual({
      outcome: "already_closed",
      providerSubscriptionId: "sub_completed",
    });
  });
});

test("a duplicate subscription is cancelled and its payment refunded in full, once", async () => {
  const calls: unknown[][] = [];
  const stripe = {
    subscriptions: {
      retrieve: async () => ({ status: "active" }),
      cancel: async (...args: unknown[]) => { calls.push(["cancel", ...args]); return {}; },
    },
    refunds: { create: async (...args: unknown[]) => { calls.push(["refund", ...args]); return {}; } },
  } as any;
  expect(await cancelAndRefundDuplicateSubscription({ providerSubscriptionId: "sub_dup", providerAccountId: "acct_1", paymentIntentId: "pi_dup" }, stripe))
    .toEqual({ cancelled: "canceled", refunded: true });
  expect(calls).toEqual([
    ["cancel", "sub_dup", {}, { stripeAccount: "acct_1" }],
    ["refund", { payment_intent: "pi_dup", reason: "duplicate", refund_application_fee: true },
      { stripeAccount: "acct_1", idempotencyKey: "duplicate-subscription-refund:sub_dup" }],
  ]);
  const refunded = { ...stripe, refunds: { create: async () => { throw Object.assign(new Error("x"), { code: "charge_already_refunded" }); } } };
  expect(await cancelAndRefundDuplicateSubscription({ providerSubscriptionId: "sub_dup", providerAccountId: "acct_1", chargeId: "ch_1" }, refunded))
    .toEqual({ cancelled: "canceled", refunded: true });
});

test("leaving schedules Stripe to stop renewing at period end, on the founder's connected account", async () => {
  const calls: unknown[] = [];
  const stripe = { subscriptions: { update: async (...args: unknown[]) => { calls.push(args); return { status: "active" }; } } } as any;
  expect(await cancelStripeSubscriptionAtPeriodEnd({ providerSubscriptionId: "sub_1", providerAccountId: "acct_1" }, stripe)).toBe("scheduled");
  expect(calls).toEqual([["sub_1", { cancel_at_period_end: true }, { stripeAccount: "acct_1" }]]);
  const missing = { subscriptions: { update: async () => { throw Object.assign(new Error("gone"), { statusCode: 404 }); } } } as any;
  expect(await cancelStripeSubscriptionAtPeriodEnd({ providerSubscriptionId: "sub_2" }, missing)).toBe("missing");
  expect(await cancelStripeSubscriptionAtPeriodEnd({ providerSubscriptionId: "" }, stripe)).toBe("missing");
});
