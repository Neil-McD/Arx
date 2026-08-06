import { describe, expect, test } from "vitest";

import { resolveBuilderFundingProjection } from "../shared/builderFunding";

const nowMs = 100_000;

function resolve(overrides: Partial<Parameters<typeof resolveBuilderFundingProjection>[0]> = {}) {
  return resolveBuilderFundingProjection({
    operatorComplimentaryAccess: false,
    checkoutPending: false,
    subscription: null,
    nowMs,
    ...overrides,
  });
}

describe("Builder funding projection", () => {
  test("the canonical operator receives included Builder without checkout", () => {
    expect(resolve({ operatorComplimentaryAccess: true })).toEqual({
      lane: "builder_included",
      state: "builder_included",
      allowedActions: [],
    });
  });

  test("an attached paid subscription outranks operator-included Builder", () => {
    expect(resolve({
      operatorComplimentaryAccess: true,
      subscription: { status: "active", currentPeriodEndAt: nowMs + 1 },
    })).toEqual({
      lane: "builder",
      state: "builder_active",
      allowedActions: ["manage_builder"],
    });
  });

  test("an ended attached subscription does not silently fall back to operator comp", () => {
    expect(resolve({
      operatorComplimentaryAccess: true,
      subscription: { status: "ended", currentPeriodEndAt: nowMs - 1 },
    })).toEqual({
      lane: "builder",
      state: "builder_ended",
      allowedActions: ["buy_builder"],
    });
  });

  test("every managed community without funding requires Builder", () => {
    expect(resolve()).toEqual({
      lane: "builder",
      state: "builder_required",
      allowedActions: ["buy_builder"],
    });
  });

  test("managed checkout is resumable", () => {
    expect(resolve({ checkoutPending: true })).toEqual({
      lane: "builder",
      state: "checkout_pending",
      allowedActions: ["resume_checkout"],
    });
  });

  test("active and canceling Builder subscriptions remain manageable", () => {
    expect(resolve({
      subscription: { status: "active", currentPeriodEndAt: nowMs + 1 },
    })).toMatchObject({ lane: "builder", state: "builder_active" });
    expect(resolve({
      subscription: { status: "cancel_at_period_end", currentPeriodEndAt: nowMs + 1 },
    })).toMatchObject({ lane: "builder", state: "builder_canceling" });
  });

  test("expired access fails closed and routes an existing subscription to management", () => {
    expect(resolve({
      subscription: { status: "active", currentPeriodEndAt: nowMs },
    })).toEqual({
      lane: "builder",
      state: "builder_inactive",
      allowedActions: ["manage_builder"],
    });
  });

  test("past-due Builder goes to management rather than a duplicate checkout", () => {
    expect(resolve({ subscription: { status: "past_due", currentPeriodEndAt: nowMs + 1 } })).toEqual({
      lane: "builder",
      state: "builder_past_due",
      allowedActions: ["manage_builder"],
    });
  });

  test("ended Builder can begin a replacement checkout", () => {
    expect(resolve({ subscription: { status: "ended", currentPeriodEndAt: nowMs - 1 } })).toEqual({
      lane: "builder",
      state: "builder_ended",
      allowedActions: ["buy_builder"],
    });
  });
});
