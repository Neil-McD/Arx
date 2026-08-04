import { describe, expect, it, vi } from "vitest";

import {
  applyStripeSubscriptionEffect,
  normalizeStripeSubscriptionIdentity,
  planConnectedStripeSubscriptionCancellations,
  stripeSubscriptionEffectIsTerminal,
  type StripeSubscriptionEffectClient,
} from "./stripeSubscriptionEffectCore";

function client(args: {
  retrieve?: (...input: any[]) => Promise<any>;
  cancel?: (...input: any[]) => Promise<any>;
  update?: (...input: any[]) => Promise<any>;
} = {}) {
  return {
    subscriptions: {
      retrieve: vi.fn(args.retrieve ?? (async () => ({ id: "sub_1", status: "active" }))),
      cancel: vi.fn(args.cancel ?? (async () => ({ id: "sub_1", status: "canceled" }))),
      update: vi.fn(args.update ?? (async () => ({
        id: "sub_1",
        status: "active",
        cancel_at_period_end: true,
      }))),
    },
  } as unknown as StripeSubscriptionEffectClient & {
    subscriptions: {
      retrieve: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

describe("Stripe subscription effects", () => {
  it("deduplicates exact connected subscription identities", () => {
    const plan = planConnectedStripeSubscriptionCancellations([
      {
        source: "stripe",
        status: "active",
        providerAccountId: "acct_builder",
        providerSubscriptionId: "sub_member",
      },
      {
        source: "stripe",
        status: "canceled",
        providerAccountId: "acct_builder",
        providerSubscriptionId: "sub_member",
      },
    ]);

    expect(plan.blockers).toEqual([]);
    expect(plan.identities).toHaveLength(1);
    expect(plan.identities[0]).toEqual({
      accountScope: { kind: "connected", providerAccountId: "acct_builder" },
      providerSubscriptionId: "sub_member",
    });
  });

  it("blocks active external subscriptions instead of claiming Stripe authority", () => {
    const plan = planConnectedStripeSubscriptionCancellations([
      { source: "external_sync", status: "active" },
    ]);

    expect(plan.identities).toEqual([]);
    expect(plan.blockers).toEqual([{
      source: "external_sync",
      status: "active",
      reason: "external_subscription_cancellation_unsupported",
    }]);
  });

  it("blocks active Stripe rows whose exact connected identity is incomplete", () => {
    const plan = planConnectedStripeSubscriptionCancellations([
      {
        source: "stripe",
        status: "past_due",
        providerSubscriptionId: "sub_unbound",
      },
    ]);

    expect(plan.identities).toEqual([]);
    expect(plan.blockers[0]?.reason).toBe("stripe_subscription_identity_incomplete");
  });

  it("scopes connected-account retrieval and immediate cancellation identically", async () => {
    const stripe = client();
    const identity = normalizeStripeSubscriptionIdentity({
      accountScope: "connected",
      providerAccountId: "acct_builder",
      providerSubscriptionId: "sub_member",
    });
    const effect = await applyStripeSubscriptionEffect({
      stripe,
      identity,
      intent: "cancel_now",
    });

    expect(effect).toMatchObject({
      state: "canceled",
      providerAccountId: "acct_builder",
      providerSubscriptionId: "sub_member",
      providerStatus: "canceled",
    });
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith(
      "sub_member",
      {},
      { stripeAccount: "acct_builder" },
    );
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(
      "sub_member",
      {},
      { stripeAccount: "acct_builder" },
    );
  });

  it("keeps platform subscription operations unscoped", async () => {
    const stripe = client();
    const identity = normalizeStripeSubscriptionIdentity({
      accountScope: "platform",
      providerSubscriptionId: "sub_founder",
    });
    await applyStripeSubscriptionEffect({ stripe, identity, intent: "cancel_now" });

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_founder", {}, undefined);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_founder", {}, undefined);
  });

  it("is idempotent for already terminal subscriptions", async () => {
    const stripe = client({
      retrieve: async () => ({ id: "sub_done", status: "canceled" }),
    });
    const effect = await applyStripeSubscriptionEffect({
      stripe,
      identity: normalizeStripeSubscriptionIdentity({
        accountScope: "connected",
        providerAccountId: "acct_builder",
        providerSubscriptionId: "sub_done",
      }),
      intent: "cancel_now",
    });

    expect(effect.state).toBe("already_terminal");
    expect(stripeSubscriptionEffectIsTerminal(effect)).toBe(true);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("treats 404 as absence only inside the explicitly bound account scope", async () => {
    const stripe = client({
      retrieve: async () => {
        throw Object.assign(new Error("missing"), { statusCode: 404, code: "resource_missing" });
      },
    });
    const effect = await applyStripeSubscriptionEffect({
      stripe,
      identity: normalizeStripeSubscriptionIdentity({
        accountScope: "connected",
        providerAccountId: "acct_exact",
        providerSubscriptionId: "sub_missing",
      }),
      intent: "cancel_now",
    });

    expect(effect).toMatchObject({
      state: "verified_absent",
      providerAccountId: "acct_exact",
      errorCode: "stripe_subscription_not_found_in_bound_scope",
    });
    expect(stripeSubscriptionEffectIsTerminal(effect)).toBe(true);
  });

  it("does not claim success when retrieval is transiently unavailable", async () => {
    const stripe = client({
      retrieve: async () => {
        throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
      },
    });
    const effect = await applyStripeSubscriptionEffect({
      stripe,
      identity: normalizeStripeSubscriptionIdentity({
        accountScope: "connected",
        providerAccountId: "acct_builder",
        providerSubscriptionId: "sub_retry",
      }),
      intent: "cancel_now",
    });

    expect(effect.state).toBe("retryable");
    expect(stripeSubscriptionEffectIsTerminal(effect)).toBe(false);
  });

  it("marks mutation-time transport failures indeterminate", async () => {
    const stripe = client({
      cancel: async () => {
        throw Object.assign(new Error("connection closed"), { code: "ECONNRESET" });
      },
    });
    const effect = await applyStripeSubscriptionEffect({
      stripe,
      identity: normalizeStripeSubscriptionIdentity({
        accountScope: "connected",
        providerAccountId: "acct_builder",
        providerSubscriptionId: "sub_indeterminate",
      }),
      intent: "cancel_now",
    });

    expect(effect.state).toBe("indeterminate");
    expect(stripeSubscriptionEffectIsTerminal(effect)).toBe(false);
  });

  it("schedules paid-through cancellation without an immediate cancel", async () => {
    const stripe = client();
    const effect = await applyStripeSubscriptionEffect({
      stripe,
      identity: normalizeStripeSubscriptionIdentity({
        accountScope: "connected",
        providerAccountId: "acct_builder",
        providerSubscriptionId: "sub_paid_through",
      }),
      intent: "cancel_at_period_end",
    });

    expect(effect.state).toBe("scheduled");
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_paid_through",
      { cancel_at_period_end: true },
      { stripeAccount: "acct_builder" },
    );
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("fails closed when a connected identity omits its account", () => {
    expect(() => normalizeStripeSubscriptionIdentity({
      accountScope: "connected",
      providerSubscriptionId: "sub_unbound",
    })).toThrow("stripe_subscription_effect_connected_account_required");
  });
});
