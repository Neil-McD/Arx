import { describe, expect, test, vi } from "vitest";

import { scheduleProviderSubscriptionCancellationAtPeriodEnd } from "./communitySubscriptionCancellationCore";

const isResourceMissing = (error: unknown) =>
  (error as { code?: string } | null)?.code === "resource_missing";

describe("community subscription cancellation provider core", () => {
  test("schedules period-end cancellation and returns re-read provider truth", async () => {
    const retrieve = vi
      .fn()
      .mockResolvedValueOnce({ status: "active", cancel_at_period_end: false })
      .mockResolvedValueOnce({ status: "active", cancel_at_period_end: true });
    const update = vi.fn().mockResolvedValue({});

    await expect(
      scheduleProviderSubscriptionCancellationAtPeriodEnd({
        providerSubscriptionId: "sub_123",
        retrieve,
        update,
        isResourceMissing,
      }),
    ).resolves.toEqual({
      outcome: "current",
      subscription: { status: "active", cancel_at_period_end: true },
      provider_updated: true,
    });
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("sub_123", { cancel_at_period_end: true });
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  test("duplicate cancellation is idempotent", async () => {
    const subscription = { status: "active", cancel_at_period_end: true };
    const retrieve = vi.fn().mockResolvedValue(subscription);
    const update = vi.fn();

    await expect(
      scheduleProviderSubscriptionCancellationAtPeriodEnd({
        providerSubscriptionId: "sub_123",
        retrieve,
        update,
        isResourceMissing,
      }),
    ).resolves.toEqual({
      outcome: "current",
      subscription,
      provider_updated: false,
    });
    expect(update).not.toHaveBeenCalled();
  });

  test("provider failure stops before any local projection can run", async () => {
    const providerError = new Error("stripe_unavailable");
    const retrieve = vi.fn().mockResolvedValue({
      status: "active",
      cancel_at_period_end: false,
    });
    const update = vi.fn().mockRejectedValue(providerError);

    await expect(
      scheduleProviderSubscriptionCancellationAtPeriodEnd({
        providerSubscriptionId: "sub_123",
        retrieve,
        update,
        isResourceMissing,
      }),
    ).rejects.toBe(providerError);
    expect(retrieve).toHaveBeenCalledOnce();
  });

  test("confirmed provider absence is terminal evidence without an update", async () => {
    const retrieve = vi.fn().mockRejectedValue({ code: "resource_missing" });
    const update = vi.fn();

    await expect(
      scheduleProviderSubscriptionCancellationAtPeriodEnd({
        providerSubscriptionId: "sub_missing",
        retrieve,
        update,
        isResourceMissing,
      }),
    ).resolves.toEqual({
      outcome: "missing",
      subscription: null,
      provider_updated: false,
    });
    expect(update).not.toHaveBeenCalled();
  });
});
