import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { BuilderCheckoutTier, BuilderUpgradeContextValue } from "./builderBilling";
import { resolveCurrentSession } from "./ensureUsableSession";

import { openCloudBuilderBillingPortal, startCloudBuilderCheckout } from "./cloudBuilderBillingGateway";

export type BuilderCheckoutRequestTier = BuilderCheckoutTier;
export type BuilderUpgradeContext = BuilderUpgradeContextValue;

type BillingActionKind = "checkout" | "portal";

type UseBuilderBillingActionsCoreArgs<SessionT> = {
  getSession: () => SessionT | null;
  ensureSession?: () => Promise<SessionT | null>;
  onMissingAuth: (
    kind: BillingActionKind,
    details: { tier?: BuilderCheckoutTier; context?: BuilderUpgradeContext },
  ) => Promise<void> | void;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsStartingBuilderCheckout: Dispatch<SetStateAction<boolean>>;
  setIsOpeningBuilderBillingPortal: Dispatch<SetStateAction<boolean>>;
  buildCheckoutPayload: (input: {
    tier: BuilderCheckoutTier;
    context: BuilderUpgradeContext;
  }) => {
    tier: BuilderCheckoutRequestTier;
    successUrl: string;
    cancelUrl: string;
  };
  buildPortalPayload: (input: {
    context: BuilderUpgradeContext;
  }) => {
    returnUrl: string;
  };
  onCheckoutStarted?: (details: {
    tier: BuilderCheckoutTier;
    context: BuilderUpgradeContext;
  }) => void;
  onPortalOpened?: (details: {
    context: BuilderUpgradeContext;
  }) => void;
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
      const session = await resolveCurrentSession(current.getSession, current.ensureSession);
      if (!session) {
        await current.onMissingAuth("checkout", { tier, context });
        return;
      }

      current.setBuilderBillingError(null);
      current.setIsStartingBuilderCheckout(true);
      try {
        const payload = current.buildCheckoutPayload({ tier, context });
        const data = await startCloudBuilderCheckout({
          session,
          tier: payload.tier,
          successUrl: payload.successUrl,
          cancelUrl: payload.cancelUrl,
        });
        const checkoutUrl = readRequiredStringField(data, "checkout_url", "Missing checkout_url.");
        current.onCheckoutStarted?.({ tier, context });
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

  const openBuilderPlanPortal = useCallback(
    async (opts?: { context?: BuilderUpgradeContext }): Promise<void> => {
      const context: BuilderUpgradeContext = opts?.context ?? "builder";
      const current = argsRef.current;
      const session = await resolveCurrentSession(current.getSession, current.ensureSession);
      if (!session) {
        await current.onMissingAuth("portal", { context });
        return;
      }

      current.setBuilderBillingError(null);
      current.setIsOpeningBuilderBillingPortal(true);
      try {
        const payload = current.buildPortalPayload({ context });
        const data = await openCloudBuilderBillingPortal({
          session,
          returnUrl: payload.returnUrl,
        });
        const portalUrl = readRequiredStringField(data, "url", "Missing billing portal url.");
        current.onPortalOpened?.({ context });
        const opened = await current.openUrl("portal", portalUrl);
        if (!opened) throw new Error("Failed to open billing portal.");
      } catch (error) {
        current.setBuilderBillingError(formatActionError(error, "Failed to open billing portal."));
      } finally {
        current.setIsOpeningBuilderBillingPortal(false);
      }
    },
    [],
  );

  return {
    openBuilderPlanPortal,
    startBuilderPlanCheckout,
  };
}
