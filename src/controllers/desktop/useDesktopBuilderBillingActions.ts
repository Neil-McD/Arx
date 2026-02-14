import type { Dispatch, SetStateAction } from "react";
import {
  buildBuilderBillingRedirectUrls,
  normalizeBuilderCheckoutTier,
} from "../../../shared/builderBilling";
import type { SupabaseSession } from "../../../shared/supabaseAuthCore";
import {
  useBuilderBillingActionsCore,
  type BuilderCheckoutTier,
  type BuilderUpgradeContext,
} from "../../../shared/useBuilderBillingActionsCore";

type UseDesktopBuilderBillingActionsArgs = {
  getSession: () => SupabaseSession | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SupabaseSession) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  getPublicAppBaseUrl: () => string | null;
  openExternalUrl: (url: string) => Promise<boolean>;
  requireSignIn: (message: string) => Promise<void>;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsStartingBuilderCheckout: Dispatch<SetStateAction<boolean>>;
  setIsStartingBuilderPortal: Dispatch<SetStateAction<boolean>>;
  setIsStartingConnectOnboarding: Dispatch<SetStateAction<boolean>>;
};

export function useDesktopBuilderBillingActions(args: UseDesktopBuilderBillingActionsArgs) {
  return useBuilderBillingActionsCore({
    getSession: args.getSession,
    getSupabaseUrl: args.getSupabaseUrl,
    fetchWithSupabaseAuth: args.fetchWithSupabaseAuth,
    readSupabaseError: args.readSupabaseError,
    setBuilderBillingError: args.setBuilderBillingError,
    setIsStartingBuilderCheckout: args.setIsStartingBuilderCheckout,
    setIsStartingBuilderPortal: args.setIsStartingBuilderPortal,
    setIsStartingConnectOnboarding: args.setIsStartingConnectOnboarding,
    onMissingAuth: async (kind) => {
      if (kind === "checkout") {
        await args.requireSignIn("Sign in to upgrade.");
        return;
      }
      if (kind === "portal") {
        await args.requireSignIn("Sign in to manage billing.");
        return;
      }
      await args.requireSignIn("Sign in to set up payouts.");
    },
    buildCheckoutPayload: ({
      tier,
      context,
    }: {
      tier: BuilderCheckoutTier;
      context: BuilderUpgradeContext;
    }) => {
      const origin = args.getPublicAppBaseUrl();
      if (!origin) {
        throw new Error("Missing public app URL. Set VITE_PUBLIC_APP_URL to enable billing links.");
      }
      const urls = buildBuilderBillingRedirectUrls({
        origin,
        source: "desktop",
        context,
      });
      return {
        tier: normalizeBuilderCheckoutTier(tier),
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
      };
    },
    buildPortalPayload: ({ context }: { context: BuilderUpgradeContext }) => {
      const origin = args.getPublicAppBaseUrl();
      const returnUrl = origin
        ? buildBuilderBillingRedirectUrls({
            origin,
            source: "desktop",
            context,
          }).returnUrl
        : window.location.href;
      return { returnUrl };
    },
    buildConnectPayload: () => {
      const origin = args.getPublicAppBaseUrl();
      return {
        returnUrl: origin ? `${origin}/?payouts=return` : window.location.href,
        refreshUrl: origin ? `${origin}/?payouts=refresh` : window.location.href,
      };
    },
    openUrl: (_kind, url) => args.openExternalUrl(url),
  });
}
