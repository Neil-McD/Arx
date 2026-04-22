import { type Dispatch, type SetStateAction } from "react";
import type { PendingAuthIntentInput } from "../../../../shared/authResumeState";
import type { AuthSession } from "../auth";
import {
  useBuilderBillingActionsCore,
  type BuilderCheckoutRequestTier,
  type BuilderUpgradeContext,
} from "../../../../shared/useBuilderBillingActionsCore";

type UseWebBuilderBillingActionsArgs = {
  getSession: () => AuthSession | null;
  ensureSession?: () => Promise<AuthSession | null>;
  requireSignIn: (intent?: PendingAuthIntentInput) => void;
  onCheckoutStarted?: (details: {
    tier: BuilderCheckoutRequestTier;
    context: BuilderUpgradeContext;
  }) => void;
  onPortalOpened?: (details: {
    context: BuilderUpgradeContext;
  }) => void;
  onConnectOnboardingStarted?: (details: {
    context: "account" | "community";
    communitySlug: string | null;
  }) => void;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsStartingBuilderCheckout: Dispatch<SetStateAction<boolean>>;
  setIsOpeningBuilderBillingPortal: Dispatch<SetStateAction<boolean>>;
  setIsStartingBuilderConnectOnboarding: Dispatch<SetStateAction<boolean>>;
  navigateToUrl: (url: string) => void;
};

export function useWebBuilderBillingActions(args: UseWebBuilderBillingActionsArgs) {
  return useBuilderBillingActionsCore({
    getSession: args.getSession,
    ensureSession: args.ensureSession,
    setBuilderBillingError: args.setBuilderBillingError,
    setIsStartingBuilderCheckout: args.setIsStartingBuilderCheckout,
    setIsOpeningBuilderBillingPortal: args.setIsOpeningBuilderBillingPortal,
    setIsStartingBuilderConnectOnboarding: args.setIsStartingBuilderConnectOnboarding,
    onMissingAuth: (kind, details) => {
      if (kind === "connect") {
        args.requireSignIn();
        return;
      }
      const tier: BuilderCheckoutRequestTier = details.tier ?? "builder";
      const context: BuilderUpgradeContext = details.context ?? "builder";
      args.requireSignIn({ reason: "start_builder_checkout", payload: { tier, context } });
    },
    onCheckoutStarted: args.onCheckoutStarted,
    onPortalOpened: args.onPortalOpened,
    onConnectOnboardingStarted: args.onConnectOnboardingStarted,
    openUrl: (_kind, url) => {
      args.navigateToUrl(url);
      return true;
    },
  });
}
