import { describe, expect, test, vi } from "vitest";

import {
  resolveCurrentCommunitySubscriptionEvent,
  type CommunitySubscriptionEventType,
} from "./communitySubscriptionEventConvergenceCore";

type SubscriptionSnapshot = {
  id: string;
  status: "active" | "past_due" | "canceled";
};

function eventSnapshot(
  status: SubscriptionSnapshot["status"],
): SubscriptionSnapshot {
  return { id: "sub_community_1", status };
}

describe("community subscription webhook provider convergence", () => {
  test.each<CommunitySubscriptionEventType>([
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ])("uses current provider truth instead of the delivered %s snapshot", async (eventType) => {
    const delivered = eventSnapshot("past_due");
    const current = eventSnapshot("active");

    const result = await resolveCurrentCommunitySubscriptionEvent({
      eventType,
      eventSubscription: delivered,
      retrieveCurrent: async () => current,
    });

    expect(result).toEqual({
      kind: "current",
      providerSubscriptionId: "sub_community_1",
      subscription: current,
    });
  });

  test("reordered and duplicate deliveries converge on the same current provider snapshot", async () => {
    const retrieveCurrent = vi.fn(async (_providerSubscriptionId: string) =>
      eventSnapshot("canceled"),
    );
    const delivered = [eventSnapshot("active"), eventSnapshot("past_due"), eventSnapshot("active")];

    const results = await Promise.all(
      delivered.map((eventSubscription) =>
        resolveCurrentCommunitySubscriptionEvent({
          eventType: "customer.subscription.updated",
          eventSubscription,
          retrieveCurrent,
        }),
      ),
    );

    expect(results.every((result) =>
      result.kind === "current" && result.subscription.status === "canceled"
    )).toBe(true);
    expect(retrieveCurrent).toHaveBeenCalledTimes(3);
    expect(new Set(retrieveCurrent.mock.calls.map(([id]) => id))).toEqual(
      new Set(["sub_community_1"]),
    );
  });

  test("a provider-confirmed missing subscription returns an explicit fail-closed result", async () => {
    await expect(
      resolveCurrentCommunitySubscriptionEvent({
        eventType: "customer.subscription.deleted",
        eventSubscription: eventSnapshot("canceled"),
        retrieveCurrent: async () => null,
      }),
    ).resolves.toEqual({
      kind: "missing",
      providerSubscriptionId: "sub_community_1",
    });
  });

  test("transient provider failures propagate so the webhook can retry", async () => {
    await expect(
      resolveCurrentCommunitySubscriptionEvent({
        eventType: "customer.subscription.updated",
        eventSubscription: eventSnapshot("active"),
        retrieveCurrent: async () => {
          throw new Error("stripe_temporarily_unavailable");
        },
      }),
    ).rejects.toThrow("stripe_temporarily_unavailable");
  });

  test("missing or mismatched provider identity fails closed", async () => {
    await expect(
      resolveCurrentCommunitySubscriptionEvent({
        eventType: "customer.subscription.updated",
        eventSubscription: { id: "", status: "active" },
        retrieveCurrent: async () => eventSnapshot("active"),
      }),
    ).rejects.toThrow("community_subscription_event_identity_missing");

    await expect(
      resolveCurrentCommunitySubscriptionEvent({
        eventType: "customer.subscription.updated",
        eventSubscription: eventSnapshot("active"),
        retrieveCurrent: async () => ({ id: "sub_other", status: "active" }),
      }),
    ).rejects.toThrow("community_subscription_provider_identity_mismatch");
  });
});
