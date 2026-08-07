import { useCallback, useEffect, useRef, useState } from "react";

import { startCloudPublicBuilderCheckout } from "../../../../shared/cloudFounderBillingGateway";
import { scrubCurrentRouteSearchParams } from "../webAppRuntime";
import type { AuthSession } from "../auth";

export type PublicBuilderCheckoutStatus =
  | "idle"
  | "starting_checkout"
  | "canceled"
  | "error";

function formatCheckoutError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("founder_stripe_price")) {
    return "Builder checkout is not configured correctly yet.";
  }
  return message.trim() || "We could not open secure checkout.";
}

export function useWebPublicBuilderCheckoutController(params: {
  session: AuthSession | null;
  isAuthBootstrapComplete: boolean;
  requireSignIn: (intent?: {
    reason: string;
    payload: Record<string, unknown>;
  }) => void;
  onAuthenticatedReturn: () => Promise<void> | void;
}) {
  const [status, setStatus] = useState<PublicBuilderCheckoutStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

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
      params.requireSignIn({ reason: "try_polynet_free", payload: {} });
      return;
    }
    scrubCurrentRouteSearchParams(["builder_checkout"]);
    void params.onAuthenticatedReturn();
  }, [
    params.isAuthBootstrapComplete,
    params.onAuthenticatedReturn,
    params.requireSignIn,
    params.session,
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

  return { status, error, startPurchase };
}
