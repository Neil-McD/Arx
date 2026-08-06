import {
  founderSubscriptionStatusGrantsAccess,
  type FounderSubscriptionStatus,
} from "./founderPlan";

export type BuilderFundingLane = "builder_included" | "builder";

export type BuilderFundingState =
  | "builder_required"
  | "checkout_pending"
  | "builder_active"
  | "builder_canceling"
  | "builder_inactive"
  | "builder_past_due"
  | "builder_ended"
  | "builder_included";

export type BuilderFundingAction =
  | "buy_builder"
  | "resume_checkout"
  | "manage_builder";

export type BuilderFundingProjection = {
  lane: BuilderFundingLane;
  state: BuilderFundingState;
  allowedActions: BuilderFundingAction[];
};

export type BuilderFundingProjectionInput = {
  operatorComplimentaryAccess: boolean;
  checkoutPending: boolean;
  subscription: {
    status: FounderSubscriptionStatus;
    currentPeriodEndAt?: number | null;
  } | null;
  nowMs: number;
};

function resolveBuilderSubscriptionProjection(
  subscription: NonNullable<BuilderFundingProjectionInput["subscription"]>,
  nowMs: number,
): BuilderFundingProjection {
  if (founderSubscriptionStatusGrantsAccess({
    status: subscription.status,
    currentPeriodEndAt: subscription.currentPeriodEndAt,
    nowMs,
  })) {
    return {
      lane: "builder",
      state: subscription.status === "cancel_at_period_end"
        ? "builder_canceling"
        : "builder_active",
      allowedActions: ["manage_builder"],
    };
  }
  if (subscription.status === "active" || subscription.status === "cancel_at_period_end") {
    return {
      lane: "builder",
      state: "builder_inactive",
      allowedActions: ["manage_builder"],
    };
  }
  if (subscription.status === "past_due") {
    return {
      lane: "builder",
      state: "builder_past_due",
      allowedActions: ["manage_builder"],
    };
  }
  return {
    lane: "builder",
    state: "builder_ended",
    allowedActions: ["buy_builder"],
  };
}

export function resolveBuilderFundingProjection(
  input: BuilderFundingProjectionInput,
): BuilderFundingProjection {
  if (input.operatorComplimentaryAccess) {
    return {
      lane: "builder_included",
      state: "builder_included",
      allowedActions:
        input.subscription &&
        input.subscription.status !== "canceled" &&
        input.subscription.status !== "ended"
          ? ["manage_builder"]
          : [],
    };
  }

  if (input.subscription) {
    return resolveBuilderSubscriptionProjection(input.subscription, input.nowMs);
  }

  if (input.checkoutPending) {
    return {
      lane: "builder",
      state: "checkout_pending",
      allowedActions: ["resume_checkout"],
    };
  }

  return {
    lane: "builder",
    state: "builder_required",
    allowedActions: ["buy_builder"],
  };
}
