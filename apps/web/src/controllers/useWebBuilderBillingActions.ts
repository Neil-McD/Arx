import { type Dispatch, type SetStateAction } from "react";
import {
  buildBuilderBillingRedirectUrls,
  normalizeBuilderCheckoutTier,
} from "../../../../shared/builderBilling";
import type { PendingAuthIntentInput } from "../../../../shared/supabaseAuthIntent";
import type { SupabaseSession } from "../supabase";
import {
  useBuilderBillingActionsCore,
  type BuilderCheckoutTier,
  type BuilderUpgradeContext,
} from "../../../../shared/useBuilderBillingActionsCore";

type UseWebBuilderBillingActionsArgs = {
  getSession: () => SupabaseSession | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SupabaseSession) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  openAuthGate: (intent: PendingAuthIntentInput) => void;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsStartingBuilderCheckout: Dispatch<SetStateAction<boolean>>;
  setIsStartingBuilderPortal: Dispatch<SetStateAction<boolean>>;
  setIsStartingConnectOnboarding: Dispatch<SetStateAction<boolean>>;
  navigateToUrl: (url: string) => void;
};

export function useWebBuilderBillingActions(args: UseWebBuilderBillingActionsArgs) {
  return useBuilderBillingActionsCore({
    getSession: args.getSession,
    getSupabaseUrl: args.getSupabaseUrl,
    fetchWithSupabaseAuth: args.fetchWithSupabaseAuth,
    readSupabaseError: args.readSupabaseError,
    setBuilderBillingError: args.setBuilderBillingError,
    setIsStartingBuilderCheckout: args.setIsStartingBuilderCheckout,
    setIsStartingBuilderPortal: args.setIsStartingBuilderPortal,
    setIsStartingConnectOnboarding: args.setIsStartingConnectOnboarding,
    onMissingAuth: (kind, details) => {
      if (kind === "checkout") {
        const tier: BuilderCheckoutTier = details.tier ?? "builder";
        const context: BuilderUpgradeContext = details.context ?? "builder";
        args.openAuthGate({ reason: "start_builder_checkout", payload: { tier, context } });
        return;
      }
      if (kind === "portal") {
        const context: BuilderUpgradeContext = details.context ?? "builder";
        args.openAuthGate({ reason: "open_builder_billing_portal", payload: { context } });
        return;
      }
      args.openAuthGate({ reason: "start_payouts_onboarding", payload: {} });
    },
    buildCheckoutPayload: ({
      tier,
      context,
    }: {
      tier: BuilderCheckoutTier;
      context: BuilderUpgradeContext;
    }) => {
      const urls = buildBuilderBillingRedirectUrls({
        origin: window.location.origin,
        source: "web",
        context,
      });
      return {
        tier: normalizeBuilderCheckoutTier(tier),
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
      };
    },
    buildPortalPayload: ({ context }: { context: BuilderUpgradeContext }) => {
      const returnUrl = buildBuilderBillingRedirectUrls({
        origin: window.location.origin,
        source: "web",
        context,
      }).returnUrl;
      return { returnUrl };
    },
    buildConnectPayload: () => {
      const origin = window.location.origin.replace(/\/+$/, "");
      return {
        returnUrl: `${origin}/?payouts=done`,
        refreshUrl: `${origin}/?payouts=refresh`,
      };
    },
    openUrl: (_kind, url) => {
      args.navigateToUrl(url);
      return true;
    },
  });
}
