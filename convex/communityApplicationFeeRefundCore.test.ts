import { describe, expect, it } from "vitest";
import { calculateApplicationFeeRefundAllocation } from "./communityApplicationFeeRefundCore";

describe("application fee refund allocation", () => {
  it("returns the full fee for one full refund", () => {
    expect(calculateApplicationFeeRefundAllocation({
      chargeAmountBaseUnits: 10_000,
      applicationFeeAmountBaseUnits: 290,
      targetRefundId: "re_full",
      refunds: [{ id: "re_full", amount: 10_000, created: 1, status: "succeeded" }],
    })).toBe(290);
  });

  it("allocates cumulative rounding deterministically across partial refunds", () => {
    const refunds = [
      { id: "re_one", amount: 3_333, created: 1, status: "succeeded" },
      { id: "re_two", amount: 3_333, created: 2, status: "succeeded" },
      { id: "re_three", amount: 3_334, created: 3, status: "succeeded" },
    ];
    const allocations = refunds.map((refund) =>
      calculateApplicationFeeRefundAllocation({
        chargeAmountBaseUnits: 10_000,
        applicationFeeAmountBaseUnits: 290,
        targetRefundId: refund.id,
        refunds,
      }),
    );
    expect(allocations).toEqual([96, 97, 97]);
    expect(allocations.reduce((sum, amount) => sum + amount, 0)).toBe(290);
  });

  it("ignores pending, failed, and canceled refunds", () => {
    const refunds = [
      { id: "re_pending", amount: 5_000, created: 1, status: "pending" },
      { id: "re_failed", amount: 5_000, created: 2, status: "failed" },
      { id: "re_canceled", amount: 5_000, created: 3, status: "canceled" },
    ];
    for (const refund of refunds) {
      expect(calculateApplicationFeeRefundAllocation({
        chargeAmountBaseUnits: 10_000,
        applicationFeeAmountBaseUnits: 290,
        targetRefundId: refund.id,
        refunds,
      })).toBe(0);
    }
  });

  it("uses created time and refund id as a stable order", () => {
    const refunds = [
      { id: "re_b", amount: 5_000, created: 1, status: "succeeded" },
      { id: "re_a", amount: 5_000, created: 1, status: "succeeded" },
    ];
    expect(calculateApplicationFeeRefundAllocation({
      chargeAmountBaseUnits: 10_000,
      applicationFeeAmountBaseUnits: 3,
      targetRefundId: "re_a",
      refunds,
    })).toBe(1);
    expect(calculateApplicationFeeRefundAllocation({
      chargeAmountBaseUnits: 10_000,
      applicationFeeAmountBaseUnits: 3,
      targetRefundId: "re_b",
      refunds,
    })).toBe(2);
  });
});
