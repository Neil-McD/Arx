import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { BuilderCheckoutTier, BuilderUpgradeContextValue } from "./builderBilling";
import { resolveCurrentSession } from "./ensureUsableSession";

import {
  openCloudBuilderBillingPortal,
  startCloudBuilderCheckout,
  startCloudConnectOnboarding,
} from "./cloudBuilderBillingGateway";

export type BuilderCheckoutRequestTier = BuilderCheckoutTier;
export type BuilderUpgradeContext = BuilderUpgradeContextValue;

type BuilderConnectOnboardingContext = "account" | "community";
type BillingActionKind = "checkout" | "portal" | "connect";

type UseBuilderBillingActionsCoreArgs<SessionT> = {
  getSession: () => SessionT | null;
  ensureSession?: () => Promise<SessionT | null>;
  onMissingAuth: (
    kind: BillingActionKind,
    details: {
      tier?: BuilderCheckoutTier;
      context?: BuilderUpgradeContext;
      connectContext?: BuilderConnectOnboardingContext;
      communitySlug?: string | null;
    },
  ) => Promise<void> | void;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsStartingBuilderCheckout: Dispatch<SetStateAction<boolean>>;
  setIsOpeningBuilderBillingPortal: Dispatch<SetStateAction<boolean>>;
  setIsStartingBuilderConnectOnboarding: Dispatch<SetStateAction<boolean>>;
  onCheckoutStarted?: (details: {
    tier: BuilderCheckoutTier;
    context: BuilderUpgradeContext;
  }) => void;
  onPortalOpened?: (details: {
    context: BuilderUpgradeContext;
  }) => void;
  onConnectOnboardingStarted?: (details: {
    context: BuilderConnectOnboardingContext;
    communitySlug: string | null;
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

function readOptionalStringField(data: unknown, key: string): string | null {
  const value =
    data && typeof data === "object" ? (data as Record<string, unknown>)[key] : null;
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function formatBuilderPortalUnavailableMessage(code: string | null): string | null {
  if (code === "builder_billing_customer_missing") {
    return "This Builder access is managed outside self-serve billing, so there is no plan portal for this account.";
  }
  return null;
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
        const data = await startCloudBuilderCheckout({
          session,
          tier,
          context,
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
        const data = await openCloudBuilderBillingPortal({
          session,
          context,
        });
        const unavailableCode = readOptionalStringField(data, "unavailable_code");
        const unavailableMessage = formatBuilderPortalUnavailableMessage(unavailableCode);
        if (unavailableMessage) {
          current.setBuilderBillingError(unavailableMessage);
          return;
        }
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

  const startBuilderConnectOnboarding = useCallback(
    async (opts?: {
      context?: BuilderConnectOnboardingContext;
      communitySlug?: string | null;
    }): Promise<void> => {
      const context: BuilderConnectOnboardingContext = opts?.context ?? "account";
      const communitySlug = opts?.communitySlug?.trim() || null;
      const current = argsRef.current;
      const session = await resolveCurrentSession(current.getSession, current.ensureSession);
      if (!session) {
        await current.onMissingAuth("connect", { connectContext: context, communitySlug });
        return;
      }

      current.setBuilderBillingError(null);
      current.setIsStartingBuilderConnectOnboarding(true);
      try {
        const data = await startCloudConnectOnboarding({
          session,
          context,
          communitySlug,
        });
        const onboardingUrl = readRequiredStringField(data, "url", "Missing onboarding url.");
        current.onConnectOnboardingStarted?.({ context, communitySlug });
        const opened = await current.openUrl("connect", onboardingUrl);
        if (!opened) throw new Error("Failed to open Stripe onboarding.");
      } catch (error) {
        current.setBuilderBillingError(formatActionError(error, "Failed to start Stripe onboarding."));
      } finally {
        current.setIsStartingBuilderConnectOnboarding(false);
      }
    },
    [],
  );

  return {
    openBuilderPlanPortal,
    startBuilderConnectOnboarding,
    startBuilderPlanCheckout,
  };
}
