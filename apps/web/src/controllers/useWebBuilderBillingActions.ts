import { type Dispatch, type SetStateAction } from "react";
import { buildBuilderCheckoutRequestPayload } from "../../../../shared/builderBilling";
import type { PendingAuthIntentInput } from "../../../../shared/cloudAuthIntent";
import type { CloudSession } from "../cloudAuth";
import {
  useBuilderBillingActionsCore,
  type BuilderCheckoutTier,
  type BuilderUpgradeContext,
} from "../../../../shared/useBuilderBillingActionsCore";

type UseWebBuilderBillingActionsArgs = {
  getSession: () => CloudSession | null;
  ensureSession?: () => Promise<CloudSession | null>;
  openAuthGate: (intent: PendingAuthIntentInput) => void;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsStartingBuilderCheckout: Dispatch<SetStateAction<boolean>>;
  navigateToUrl: (url: string) => void;
};

export function useWebBuilderBillingActions(args: UseWebBuilderBillingActionsArgs) {
  return useBuilderBillingActionsCore({
    getSession: args.getSession,
    ensureSession: args.ensureSession,
    setBuilderBillingError: args.setBuilderBillingError,
    setIsStartingBuilderCheckout: args.setIsStartingBuilderCheckout,
    onMissingAuth: (kind, details) => {
      const tier: BuilderCheckoutTier = details.tier ?? "builder";
      const context: BuilderUpgradeContext = details.context ?? "builder";
      args.openAuthGate({ reason: "start_builder_checkout", payload: { tier, context } });
    },
    buildCheckoutPayload: ({
      tier,
      context,
    }: {
      tier: BuilderCheckoutTier;
      context: BuilderUpgradeContext;
    }) =>
      buildBuilderCheckoutRequestPayload({
        origin: window.location.origin,
        source: "web",
        context,
        tier,
      }),
    openUrl: (_kind, url) => {
      args.navigateToUrl(url);
      return true;
    },
  });
}
