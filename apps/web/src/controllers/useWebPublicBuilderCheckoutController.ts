import { useCallback, useEffect, useRef, useState } from "react";

import {
  startCloudPublicBuilderCheckout,
  type CloudFounderBillingOverview,
} from "../../../../shared/cloudFounderBillingGateway";
import { scrubCurrentRouteSearchParams } from "../webAppRuntime";
import type { AuthSession } from "../auth";
import type { AccountSetupResolution } from "../../../../shared/accountSetup";
import { storeAuthResumeState } from "../../../../shared/authResumeState";

export type PublicBuilderCheckoutStatus =
  | "idle"
  | "starting_checkout"
  | "canceled"
  | "error";

type PublicBuilderCheckoutControllerParams = {
  session: AuthSession | null;
  getSession: () => AuthSession | null;
  isAuthBootstrapComplete: boolean;
  resumeEpoch: number;
  requireSignIn: (intent?: {
    reason: string;
    payload: Record<string, unknown>;
  }) => void;
  refreshAccountSetupStatus: (
    session: AuthSession,
  ) => Promise<AccountSetupResolution>;
  refreshBilling: (
    session: AuthSession,
  ) => Promise<CloudFounderBillingOverview | null>;
  setAvailableBuilderSubscriptionId: (subscriptionId: string) => void;
  openFundedCreateCommunity: () => void;
  navigateTo: (path: string) => void;
  showToast: (message: string) => void;
};

function formatCheckoutError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("founder_stripe_price")) {
    return "Builder checkout is not configured correctly yet.";
  }
  return message.trim() || "We could not open secure checkout.";
}

export function useWebPublicBuilderCheckoutController(
  params: PublicBuilderCheckoutControllerParams,
) {
  const [status, setStatus] = useState<PublicBuilderCheckoutStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPurchasePromptOpen, setIsPurchasePromptOpen] = useState(false);
  const inFlightRef = useRef(false);
  const returnInFlightRef = useRef(false);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const prepareCommunityCreation = useCallback(async (): Promise<boolean> => {
    if (returnInFlightRef.current) return false;
    returnInFlightRef.current = true;
    try {
      const current = paramsRef.current;
      const activeSession = current.getSession() ?? current.session;
      if (!activeSession) return false;

      const accountSetupResolution =
        await current.refreshAccountSetupStatus(activeSession);
      if (accountSetupResolution.status === "unavailable") {
        current.showToast(accountSetupResolution.error);
        return false;
      }
      if (accountSetupResolution.status === "unauthenticated") {
        current.requireSignIn({
          reason: "resume_builder_checkout",
          payload: {},
        });
        return false;
      }
      scrubCurrentRouteSearchParams(["builder_checkout"]);
      if (!accountSetupResolution.accountSetup.completed) {
        storeAuthResumeState({
          intent: {
            reason: "resume_builder_checkout",
            payload: {},
          },
        });
        current.navigateTo("/onboarding");
        return true;
      }

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const overview = await current.refreshBilling(activeSession);
        const subscription = overview?.unassigned_subscriptions.find(
          (candidate) => candidate.grants_setup,
        );
        if (subscription) {
          current.setAvailableBuilderSubscriptionId(
            subscription.subscription_id,
          );
          current.openFundedCreateCommunity();
          return true;
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 750));
      }

      current.navigateTo("/settings/billing");
      current.showToast(
        "Payment is still being verified. Your Builder access will appear here automatically.",
      );
      return true;
    } finally {
      returnInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const checkoutReturn = search.get("builder_checkout");
    if (checkoutReturn === "canceled") {
      setStatus("canceled");
      scrubCurrentRouteSearchParams(["builder_checkout"]);
      return;
    }
    if (checkoutReturn !== "success" || !params.isAuthBootstrapComplete) return;
    if (!params.session) {
      scrubCurrentRouteSearchParams(["builder_checkout"]);
      paramsRef.current.requireSignIn({
        reason: "resume_builder_checkout",
        payload: {},
      });
      return;
    }
    void prepareCommunityCreation();
  }, [
    params.isAuthBootstrapComplete,
    params.resumeEpoch,
    params.session?.user.id,
    prepareCommunityCreation,
  ]);

  const startPurchase = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus("starting_checkout");
    setError(null);
    try {
      const checkout = await startCloudPublicBuilderCheckout();
      window.location.assign(checkout.checkout_url);
    } catch (checkoutError) {
      setStatus("error");
      setError(formatCheckoutError(checkoutError));
      inFlightRef.current = false;
    }
  }, []);

  const openPurchasePrompt = useCallback((): void => {
    setStatus("idle");
    setError(null);
    setIsPurchasePromptOpen(true);
  }, []);

  const closePurchasePrompt = useCallback((): void => {
    if (inFlightRef.current) return;
    setIsPurchasePromptOpen(false);
    setError(null);
  }, []);

  return {
    status,
    error,
    isPurchasePromptOpen,
    openPurchasePrompt,
    closePurchasePrompt,
    startPurchase,
    prepareCommunityCreation,
  };
}
