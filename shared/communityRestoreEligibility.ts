import type {
  BuilderFundingAction,
  BuilderFundingProjection,
} from "./builderFunding";
import type { CommunityLifecycleStatus } from "./communityLifecycle";

export type CommunityRestoreEligibilityState =
  | "not_archived"
  | "archive_in_progress"
  | "ready"
  | "checkout_required"
  | "checkout_pending"
  | "funding_attention";

export type CommunityRestoreAction =
  | "restore_now"
  | BuilderFundingAction
  | null;

export type CommunityRestoreEligibility = {
  state: CommunityRestoreEligibilityState;
  action: CommunityRestoreAction;
  requires_verified_checkout: boolean;
};

function firstAllowedAction(
  funding: BuilderFundingProjection,
  actions: BuilderFundingAction[],
): BuilderFundingAction | null {
  return actions.find((action) => funding.allowedActions.includes(action)) ?? null;
}

export function resolveCommunityRestoreEligibility(args: {
  lifecycleStatus: CommunityLifecycleStatus;
  funding: BuilderFundingProjection;
  managedFundingConflict?: boolean;
}): CommunityRestoreEligibility {
  if (args.lifecycleStatus === "active") {
    return {
      state: "not_archived",
      action: null,
      requires_verified_checkout: false,
    };
  }
  if (args.lifecycleStatus === "archiving") {
    return {
      state: "archive_in_progress",
      action: null,
      requires_verified_checkout: false,
    };
  }

  if (args.managedFundingConflict === true) {
    return {
      state: "funding_attention",
      action: firstAllowedAction(args.funding, ["manage_builder"]),
      requires_verified_checkout: false,
    };
  }

  if (
    args.funding.state === "legacy_api_active" ||
    args.funding.state === "builder_included"
  ) {
    return {
      state: "ready",
      action: "restore_now",
      requires_verified_checkout: false,
    };
  }

  if (
    args.funding.state === "builder_active" ||
    args.funding.state === "builder_canceling" ||
    args.funding.state === "checkout_pending"
  ) {
    return {
      state: "funding_attention",
      action: firstAllowedAction(args.funding, [
        "manage_builder",
      ]),
      requires_verified_checkout: false,
    };
  }

  const checkoutAction = args.funding.lane === "builder"
    ? firstAllowedAction(args.funding, ["buy_builder"])
    : null;
  if (checkoutAction) {
    return {
      state: "checkout_required",
      action: checkoutAction,
      requires_verified_checkout: true,
    };
  }

  return {
    state: "funding_attention",
    action: firstAllowedAction(args.funding, [
      "manage_builder",
      "activate_owner_api",
      "manage_owner_api",
    ]),
    requires_verified_checkout: false,
  };
}
