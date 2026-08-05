import {
  COMMUNITY_FUNDING_POLICY_LEGACY_BYOK,
  type CommunityInferenceFundingPolicy,
  type FounderInferenceGrantStatus,
} from "./founderInference";
import {
  founderSubscriptionStatusGrantsAccess,
  type FounderSubscriptionStatus,
} from "./founderPlan";

export type BuilderFundingLane =
  | "legacy_choice"
  | "builder_included"
  | "builder";

export type BuilderFundingState =
  | "legacy_api_available"
  | "legacy_api_active"
  | "legacy_api_suspended"
  | "builder_required"
  | "checkout_pending"
  | "builder_active"
  | "builder_canceling"
  | "builder_inactive"
  | "builder_past_due"
  | "builder_ended"
  | "builder_included";

export type BuilderFundingAction =
  | "activate_owner_api"
  | "manage_owner_api"
  | "buy_builder"
  | "resume_checkout"
  | "manage_builder";

export type BuilderFundingProjection = {
  lane: BuilderFundingLane;
  state: BuilderFundingState;
  allowedActions: BuilderFundingAction[];
};

export type BuilderFundingProjectionInput = {
  fundingPolicy: CommunityInferenceFundingPolicy;
  operatorComplimentaryAccess: boolean;
  checkoutPending: boolean;
  subscription: {
    status: FounderSubscriptionStatus;
    currentPeriodEndAt?: number | null;
  } | null;
  legacyGrantStatus: FounderInferenceGrantStatus | null;
  legacyApiKeyConnected: boolean;
  nowMs: number;
};

export function builderFundingProjectionGrantsAccess(
  projection: BuilderFundingProjection,
): boolean {
  return (
    projection.state === "legacy_api_active" ||
    projection.state === "builder_active" ||
    projection.state === "builder_canceling" ||
    projection.state === "builder_included"
  );
}

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

  const legacyChoice = input.fundingPolicy === COMMUNITY_FUNDING_POLICY_LEGACY_BYOK;
  if (input.checkoutPending) {
    return {
      lane: legacyChoice ? "legacy_choice" : "builder",
      state: "checkout_pending",
      allowedActions: legacyChoice
        ? ["activate_owner_api", "resume_checkout"]
        : ["resume_checkout"],
    };
  }

  if (!legacyChoice) {
    return {
      lane: "builder",
      state: "builder_required",
      allowedActions: ["buy_builder"],
    };
  }

  if (input.legacyGrantStatus === "active" && input.legacyApiKeyConnected) {
    return {
      lane: "legacy_choice",
      state: "legacy_api_active",
      allowedActions: ["manage_owner_api", "buy_builder"],
    };
  }
  if (input.legacyGrantStatus === "suspended") {
    return {
      lane: "legacy_choice",
      state: "legacy_api_suspended",
      allowedActions: ["activate_owner_api", "buy_builder"],
    };
  }
  return {
    lane: "legacy_choice",
    state: "legacy_api_available",
    allowedActions: ["activate_owner_api", "buy_builder"],
  };
}
