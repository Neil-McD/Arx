import { type Dispatch, type SetStateAction } from "react";
import {
  buildBuilderCheckoutRequestPayload,
  buildBuilderPortalRequestPayload,
} from "../../../../shared/builderBilling";
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
  requireSignIn: (intent: PendingAuthIntentInput) => void;
  onCheckoutStarted?: (details: {
    tier: BuilderCheckoutRequestTier;
    context: BuilderUpgradeContext;
  }) => void;
  onPortalOpened?: (details: {
    context: BuilderUpgradeContext;
  }) => void;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsStartingBuilderCheckout: Dispatch<SetStateAction<boolean>>;
  setIsOpeningBuilderBillingPortal: Dispatch<SetStateAction<boolean>>;
  navigateToUrl: (url: string) => void;
};

function readCanonicalBuilderBillingOrigin(): string {
  const candidates = [
    import.meta.env.VITE_PUBLIC_APP_URL,
    import.meta.env.VITE_APP_URL,
    window.location.origin,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value) continue;
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed browser config values and fall through.
    }
  }
  return window.location.origin;
}

export function useWebBuilderBillingActions(args: UseWebBuilderBillingActionsArgs) {
  return useBuilderBillingActionsCore({
    getSession: args.getSession,
    ensureSession: args.ensureSession,
    setBuilderBillingError: args.setBuilderBillingError,
    setIsStartingBuilderCheckout: args.setIsStartingBuilderCheckout,
    setIsOpeningBuilderBillingPortal: args.setIsOpeningBuilderBillingPortal,
    onMissingAuth: (kind, details) => {
      const tier: BuilderCheckoutRequestTier = details.tier ?? "builder";
      const context: BuilderUpgradeContext = details.context ?? "builder";
      args.requireSignIn({ reason: "start_builder_checkout", payload: { tier, context } });
    },
    buildCheckoutPayload: ({
      tier,
      context,
    }: {
      tier: BuilderCheckoutRequestTier;
      context: BuilderUpgradeContext;
    }) =>
      buildBuilderCheckoutRequestPayload({
        origin: readCanonicalBuilderBillingOrigin(),
        source: "web",
        context,
        tier,
      }),
    buildPortalPayload: ({ context }: { context: BuilderUpgradeContext }) =>
      buildBuilderPortalRequestPayload({
        origin: readCanonicalBuilderBillingOrigin(),
        source: "web",
        context,
      }),
    onCheckoutStarted: args.onCheckoutStarted,
    onPortalOpened: args.onPortalOpened,
    openUrl: (_kind, url) => {
      args.navigateToUrl(url);
      return true;
    },
  });
}
