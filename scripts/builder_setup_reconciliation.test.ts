import { expect, test } from "vitest";

import {
  findPendingBuilderSetupSubscription,
  reconcileBuilderSetupSuppressions,
  resolveBuilderSetupModalReconciliation,
} from "../shared/builderSetupReconciliation";

const first = { subscription_id: "subscription-first", grants_setup: true };
const second = { subscription_id: "subscription-second", grants_setup: true };

test("a server-confirmed attachment cannot reopen from a stale Billing snapshot", () => {
  const suppressions = { "subscription-first": "attached" as const };
  expect(findPendingBuilderSetupSubscription([first], suppressions)).toBeNull();
  expect(resolveBuilderSetupModalReconciliation({
    isModalOpen: false,
    requiredSubscriptionId: "subscription-first",
    pendingSubscriptionId: null,
  })).toEqual({ kind: "close_required" });
});

test("another valid unassigned subscription remains eligible", () => {
  const pending = findPendingBuilderSetupSubscription(
    [first, second],
    { "subscription-first": "attached" },
  );
  expect(pending?.subscription_id).toBe("subscription-second");
  expect(resolveBuilderSetupModalReconciliation({
    isModalOpen: false,
    requiredSubscriptionId: null,
    pendingSubscriptionId: pending?.subscription_id ?? null,
  })).toEqual({
    kind: "open_required",
    subscriptionId: "subscription-second",
  });
});

test("fresh Billing truth retires temporary suppression without preserving stale authority", () => {
  expect(reconcileBuilderSetupSuppressions(
    {
      "subscription-first": "attached",
      "subscription-second": "unavailable",
    },
    [first],
  )).toEqual({ "subscription-first": "attached" });
  expect(reconcileBuilderSetupSuppressions(
    { "subscription-second": "unavailable" },
    [second],
  )).toEqual({ "subscription-second": "unavailable" });
  expect(reconcileBuilderSetupSuppressions(
    { "subscription-first": "attached" },
    [],
  )).toEqual({});
});

test("an optional operator modal is never replaced by paid setup", () => {
  expect(resolveBuilderSetupModalReconciliation({
    isModalOpen: true,
    requiredSubscriptionId: null,
    pendingSubscriptionId: "subscription-first",
  })).toEqual({ kind: "none" });
});
