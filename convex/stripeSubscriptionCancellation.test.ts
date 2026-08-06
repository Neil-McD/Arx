import { describe, expect, test, vi } from "vitest";

import {
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
