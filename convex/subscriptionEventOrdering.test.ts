import { describe, expect, test } from "vitest";

import { providerSubscriptionEventShouldApply } from "../shared/subscriptionEventOrdering";

describe("provider subscription event ordering", () => {
  test("orders different provider timestamps normally", () => {
    expect(providerSubscriptionEventShouldApply({
      incomingCreatedAt: 201,
      currentCreatedAt: 200,
      incomingStatus: "active",
      currentStatus: "ended",
    })).toBe(true);
    expect(providerSubscriptionEventShouldApply({
      incomingCreatedAt: 199,
      currentCreatedAt: 200,
      incomingStatus: "ended",
      currentStatus: "active",
    })).toBe(false);
  });

  test("fails closed when conflicting events share a timestamp", () => {
    expect(providerSubscriptionEventShouldApply({
      incomingCreatedAt: 200,
      currentCreatedAt: 200,
      incomingStatus: "ended",
      currentStatus: "active",
    })).toBe(true);
    expect(providerSubscriptionEventShouldApply({
      incomingCreatedAt: 200,
      currentCreatedAt: 200,
      incomingStatus: "active",
      currentStatus: "ended",
    })).toBe(false);
    expect(providerSubscriptionEventShouldApply({
      incomingCreatedAt: 200,
      currentCreatedAt: 200,
      incomingStatus: "active",
      currentStatus: "active",
    })).toBe(true);
  });
});
