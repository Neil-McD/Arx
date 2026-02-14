import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { BuilderUpgradeContextValue } from "./builderBilling";

export type BuilderCheckoutTier = "builder" | "architect" | "pro";
export type BuilderCheckoutRequestTier = "builder" | "pro";
export type BuilderUpgradeContext = BuilderUpgradeContextValue;

type BillingActionKind = "checkout" | "portal" | "connect";

type UseBuilderBillingActionsCoreArgs<SessionT> = {
  getSession: () => SessionT | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  onMissingAuth: (
    kind: BillingActionKind,
    details: { tier?: BuilderCheckoutTier; context?: BuilderUpgradeContext },
  ) => Promise<void> | void;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsStartingBuilderCheckout: Dispatch<SetStateAction<boolean>>;
  setIsStartingBuilderPortal: Dispatch<SetStateAction<boolean>>;
  setIsStartingConnectOnboarding: Dispatch<SetStateAction<boolean>>;
  buildCheckoutPayload: (input: {
    tier: BuilderCheckoutTier;
    context: BuilderUpgradeContext;
  }) => {
    tier: BuilderCheckoutRequestTier;
    successUrl: string;
    cancelUrl: string;
  };
  buildPortalPayload: (input: { context: BuilderUpgradeContext }) => { returnUrl: string };
  buildConnectPayload: () => { returnUrl: string; refreshUrl: string };
  openUrl: (kind: BillingActionKind, url: string) => Promise<boolean> | boolean;
};

function readRequiredStringField(data: unknown, key: string, missingMessage: string): string {
  const value =
    data && typeof data === "object" ? (data as Record<string, unknown>)[key] : null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(missingMessage);
  return text;
}

function formatActionError(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function useBuilderBillingActionsCore<SessionT>(args: UseBuilderBillingActionsCoreArgs<SessionT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const startBuilderPlanCheckout = useCallback(
    async (tier: BuilderCheckoutTier, opts?: { context?: BuilderUpgradeContext }): Promise<void> => {
      const context: BuilderUpgradeContext = opts?.context ?? "builder";
      const current = argsRef.current;
      const session = current.getSession();
      const url = session ? current.getSupabaseUrl() : null;
      if (!session || !url) {
        await current.onMissingAuth("checkout", { tier, context });
        return;
      }

      current.setBuilderBillingError(null);
      current.setIsStartingBuilderCheckout(true);
      try {
        const payload = current.buildCheckoutPayload({ tier, context });
        const response = await current.fetchWithSupabaseAuth(
          `${url}/functions/v1/builder_checkout_start`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tier: payload.tier,
              success_url: payload.successUrl,
              cancel_url: payload.cancelUrl,
            }),
          },
          session,
        );
        if (!response.ok) throw new Error(await current.readSupabaseError(response));
        const data = (await response.json()) as unknown;
        const checkoutUrl = readRequiredStringField(data, "checkout_url", "Missing checkout_url.");
        const opened = await current.openUrl("checkout", checkoutUrl);
        if (!opened) throw new Error("Failed to open checkout.");
      } catch (error) {
        current.setBuilderBillingError(formatActionError(error, "Failed to start checkout."));
      } finally {
        current.setIsStartingBuilderCheckout(false);
      }
    },
    [],
  );

  const openBuilderBillingPortal = useCallback(
    async (context: BuilderUpgradeContext = "builder"): Promise<void> => {
      const current = argsRef.current;
      const session = current.getSession();
      const url = session ? current.getSupabaseUrl() : null;
      if (!session || !url) {
        await current.onMissingAuth("portal", { context });
        return;
      }

      current.setBuilderBillingError(null);
      current.setIsStartingBuilderPortal(true);
      try {
        const payload = current.buildPortalPayload({ context });
        const response = await current.fetchWithSupabaseAuth(
          `${url}/functions/v1/builder_billing_portal`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ return_url: payload.returnUrl }),
          },
          session,
        );
        if (!response.ok) throw new Error(await current.readSupabaseError(response));
        const data = (await response.json()) as unknown;
        const portalUrl = readRequiredStringField(data, "url", "Missing portal URL.");
        const opened = await current.openUrl("portal", portalUrl);
        if (!opened) throw new Error("Failed to open billing portal.");
      } catch (error) {
        current.setBuilderBillingError(formatActionError(error, "Failed to open billing portal."));
      } finally {
        current.setIsStartingBuilderPortal(false);
      }
    },
    [],
  );

  const startConnectOnboarding = useCallback(async (): Promise<void> => {
    const current = argsRef.current;
    const session = current.getSession();
    const url = session ? current.getSupabaseUrl() : null;
    if (!session || !url) {
      await current.onMissingAuth("connect", {});
      return;
    }

    current.setBuilderBillingError(null);
    current.setIsStartingConnectOnboarding(true);
    try {
      const payload = current.buildConnectPayload();
      const response = await current.fetchWithSupabaseAuth(
        `${url}/functions/v1/connect_onboard_start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ return_url: payload.returnUrl, refresh_url: payload.refreshUrl }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      const data = (await response.json()) as unknown;
      const linkUrl = readRequiredStringField(data, "url", "Missing onboarding URL.");
      const opened = await current.openUrl("connect", linkUrl);
      if (!opened) throw new Error("Failed to open onboarding.");
    } catch (error) {
      current.setBuilderBillingError(formatActionError(error, "Failed to start payout setup."));
    } finally {
      current.setIsStartingConnectOnboarding(false);
    }
  }, []);

  return {
    startBuilderPlanCheckout,
    openBuilderBillingPortal,
    startConnectOnboarding,
  };
}
