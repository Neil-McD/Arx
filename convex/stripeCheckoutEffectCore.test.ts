import { describe, expect, it, vi } from "vitest";

import {
  applyStripeCheckoutSessionExpiration,
  compensateStaleStripeCheckout,
  normalizeStripeCheckoutSessionIdentity,
  stripeCheckoutCompensationIsTerminal,
  type StripeCheckoutCompensationClient,
} from "./stripeCheckoutEffectCore";

function client(args: {
  retrieveCheckout?: (...input: any[]) => Promise<any>;
  expireCheckout?: (...input: any[]) => Promise<any>;
  retrieveSubscription?: (...input: any[]) => Promise<any>;
  cancelSubscription?: (...input: any[]) => Promise<any>;
} = {}) {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn(args.retrieveCheckout ?? (async () => ({ id: "cs_1", status: "open" }))),
        expire: vi.fn(args.expireCheckout ?? (async () => ({ id: "cs_1", status: "expired" }))),
      },
    },
    subscriptions: {
      retrieve: vi.fn(args.retrieveSubscription ?? (async () => ({ id: "sub_1", status: "active" }))),
      cancel: vi.fn(args.cancelSubscription ?? (async () => ({ id: "sub_1", status: "canceled" }))),
      update: vi.fn(),
    },
  } as unknown as StripeCheckoutCompensationClient & {
    checkout: { sessions: { retrieve: ReturnType<typeof vi.fn>; expire: ReturnType<typeof vi.fn> } };
    subscriptions: { retrieve: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
  };
}

describe("Stripe checkout compensation", () => {
  it("expires a connected checkout in the exact account scope", async () => {
    const stripe = client();
    const result = await compensateStaleStripeCheckout({
      stripe,
      identity: normalizeStripeCheckoutSessionIdentity({
        accountScope: "connected",
        providerAccountId: "acct_builder",
        providerCheckoutSessionId: "cs_member",
      }),
    });

    expect(result.state).toBe("expired");
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
      "cs_member",
      {},
      { stripeAccount: "acct_builder" },
    );
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith(
      "cs_member",
      {},
      { stripeAccount: "acct_builder" },
    );
  });

  it("keeps founder checkout compensation platform scoped", async () => {
    const stripe = client();
    await compensateStaleStripeCheckout({
      stripe,
      identity: normalizeStripeCheckoutSessionIdentity({
        accountScope: "platform",
        providerCheckoutSessionId: "cs_founder",
      }),
    });

    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_founder", {}, undefined);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_founder", {}, undefined);
  });

  it("immediately cancels the subscription produced by a completed stale checkout", async () => {
    const stripe = client({
      retrieveCheckout: async () => ({ id: "cs_done", status: "complete", subscription: "sub_stale" }),
    });
    const result = await compensateStaleStripeCheckout({
      stripe,
      identity: normalizeStripeCheckoutSessionIdentity({
        accountScope: "connected",
        providerAccountId: "acct_builder",
        providerCheckoutSessionId: "cs_done",
      }),
    });

    expect(result.state).toBe("completed_subscription_canceled");
    expect(result.subscription?.providerSubscriptionId).toBe("sub_stale");
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith(
      "sub_stale",
      {},
      { stripeAccount: "acct_builder" },
    );
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(
      "sub_stale",
      {},
      { stripeAccount: "acct_builder" },
    );
  });

  it("fails closed when a completed checkout does not expose its subscription", async () => {
    const stripe = client({
      retrieveCheckout: async () => ({ id: "cs_done", status: "complete" }),
    });
    const result = await compensateStaleStripeCheckout({
      stripe,
      identity: normalizeStripeCheckoutSessionIdentity({
        accountScope: "platform",
        providerCheckoutSessionId: "cs_done",
      }),
    });

    expect(result).toMatchObject({
      state: "indeterminate",
      errorCode: "stripe_checkout_completed_subscription_missing",
    });
    expect(stripeCheckoutCompensationIsTerminal(result)).toBe(false);
  });

  it("does not claim success after a mutation-time transport failure", async () => {
    const stripe = client({
      expireCheckout: async () => {
        throw Object.assign(new Error("connection closed"), { code: "ECONNRESET" });
      },
    });
    const result = await compensateStaleStripeCheckout({
      stripe,
      identity: normalizeStripeCheckoutSessionIdentity({
        accountScope: "platform",
        providerCheckoutSessionId: "cs_uncertain",
      }),
    });

    expect(result.state).toBe("indeterminate");
    expect(stripeCheckoutCompensationIsTerminal(result)).toBe(false);
  });

  it("treats exact-scope absence as terminal and idempotent", async () => {
    const stripe = client({
      retrieveCheckout: async () => {
        throw Object.assign(new Error("missing"), { code: "resource_missing", statusCode: 404 });
      },
    });
    const result = await compensateStaleStripeCheckout({
      stripe,
      identity: normalizeStripeCheckoutSessionIdentity({
        accountScope: "connected",
        providerAccountId: "acct_exact",
        providerCheckoutSessionId: "cs_missing",
      }),
    });

    expect(result.state).toBe("verified_absent");
    expect(stripeCheckoutCompensationIsTerminal(result)).toBe(true);
  });

  it("rejects unbound connected checkout identities", () => {
    expect(() => normalizeStripeCheckoutSessionIdentity({
      accountScope: "connected",
      providerCheckoutSessionId: "cs_unbound",
    })).toThrow("stripe_checkout_effect_connected_account_required");
  });

  it("classifies an unknown checkout state as blocked", async () => {
    const stripe = client({
      retrieveCheckout: async () => ({ id: "cs_unknown", status: "abandoned" }),
    });
    const effect = await applyStripeCheckoutSessionExpiration({
      stripe,
      identity: normalizeStripeCheckoutSessionIdentity({
        accountScope: "platform",
        providerCheckoutSessionId: "cs_unknown",
      }),
    });
    expect(effect).toMatchObject({
      state: "blocked",
      errorCode: "stripe_checkout_status_invalid",
    });
  });
});
