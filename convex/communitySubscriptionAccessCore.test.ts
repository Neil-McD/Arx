import { describe, expect, test } from "vitest";

import {
  communitySubscriptionStatusGrantsAccess,
  currentChargeRequiresRefundAccessBlock,
  currentDisputeAccessBlock,
  deriveCommunitySubscriptionMembershipProjection,
} from "./communitySubscriptionAccessCore";

const NOW_MS = 1_753_000_000_000;

describe("community subscription access policy", () => {
  test("owns the complete granting-status policy", () => {
    expect(communitySubscriptionStatusGrantsAccess("active")).toBe(true);
    expect(communitySubscriptionStatusGrantsAccess("past_due")).toBe(true);
    expect(communitySubscriptionStatusGrantsAccess("cancel_at_period_end")).toBe(true);
    expect(communitySubscriptionStatusGrantsAccess("canceled")).toBe(false);
    expect(communitySubscriptionStatusGrantsAccess("ended")).toBe(false);
    expect(communitySubscriptionStatusGrantsAccess(null)).toBe(false);
  });

  test("uses cumulative current charge truth for full and partial refunds", () => {
    expect(currentChargeRequiresRefundAccessBlock({
      amountBaseUnits: 1_000,
      amountRefundedBaseUnits: 999,
      refunded: false,
    })).toBe(false);
    expect(currentChargeRequiresRefundAccessBlock({
      amountBaseUnits: 1_000,
      amountRefundedBaseUnits: 1_000,
      refunded: false,
    })).toBe(true);
    expect(currentChargeRequiresRefundAccessBlock({
      amountBaseUnits: 1_000,
      amountRefundedBaseUnits: 0,
      refunded: true,
    })).toBe(true);
  });

  test("fails closed when current charge evidence is malformed", () => {
    expect(() => currentChargeRequiresRefundAccessBlock({
      amountBaseUnits: 0,
      amountRefundedBaseUnits: 0,
      refunded: false,
    })).toThrow("stripe_charge_amount_invalid");
    expect(() => currentChargeRequiresRefundAccessBlock({
      amountBaseUnits: 1_000,
      amountRefundedBaseUnits: -1,
      refunded: false,
    })).toThrow("stripe_charge_refund_amount_invalid");
  });

  test("maps only known current dispute states", () => {
    expect(currentDisputeAccessBlock({ status: "needs_response" })).toEqual({
      action: "set",
      reason: "subscription_dispute_opened",
    });
    expect(currentDisputeAccessBlock({ status: "lost" })).toEqual({
      action: "set",
      reason: "subscription_dispute_lost",
    });
    expect(currentDisputeAccessBlock({ status: "won" })).toEqual({ action: "clear" });
    expect(() => currentDisputeAccessBlock({ status: "mystery" })).toThrow(
      "stripe_dispute_status_unknown",
    );
  });

  test("a financial block overrides a granting subscription", () => {
    expect(deriveCommunitySubscriptionMembershipProjection({
      membershipActive: true,
      subscriptionStatus: "active",
      activeBlockReasons: ["subscription_refunded"],
      nowMs: NOW_MS,
    })).toEqual({
      active: false,
      revokedAt: NOW_MS,
      revokedReason: "subscription_refunded",
      preservedNonFinancialRevocation: false,
    });
  });

  test("clearing the final financial block follows current subscription truth", () => {
    expect(deriveCommunitySubscriptionMembershipProjection({
      membershipActive: false,
      membershipRevokedAt: NOW_MS - 10,
      membershipRevokedReason: "subscription_dispute_opened",
      subscriptionStatus: "active",
      activeBlockReasons: [],
      nowMs: NOW_MS,
    })).toEqual({
      active: true,
      revokedAt: undefined,
      revokedReason: undefined,
      preservedNonFinancialRevocation: false,
    });
  });

  test("a payment event never revives a manager-removed membership", () => {
    expect(deriveCommunitySubscriptionMembershipProjection({
      membershipActive: false,
      membershipRevokedAt: NOW_MS - 10,
      membershipRevokedReason: "removed_by_manager",
      subscriptionStatus: "active",
      activeBlockReasons: [],
      nowMs: NOW_MS,
    })).toEqual({
      active: false,
      revokedAt: NOW_MS - 10,
      revokedReason: "removed_by_manager",
      preservedNonFinancialRevocation: true,
    });
  });
});
