import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { BuilderCheckoutTier, BuilderUpgradeContextValue } from "./builderBilling";
import { resolveCurrentSessionState, type CurrentSessionResolution } from "./ensureUsableSession";

import {
  openCloudBuilderBillingPortal,
  startCloudBuilderCheckout,
  startCloudConnectOnboarding,
} from "./cloudBuilderBillingGateway";

export type BuilderCheckoutRequestTier = BuilderCheckoutTier;
export type BuilderUpgradeContext = BuilderUpgradeContextValue;

type BuilderConnectOnboardingContext = "account" | "community";
type BillingActionKind = "checkout" | "portal" | "connect";
type BillingActionPhase = "preflight" | "request" | "navigation";
type BillingActionStatus = "start" | "success" | "failure" | "skip";

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
  onActionEvent?: (event: {
    kind: BillingActionKind;
    phase: BillingActionPhase;
    status: BillingActionStatus;
    detail?: Record<string, unknown>;
    error?: string | null;
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

function formatBuilderConnectUnavailableMessage(message: string): string | null {
  if (message === "builder_connect_builder_required") {
    return "Community monetization is not available for this account yet.";
  }
  if (message === "builder_plan_deprecated") {
    return "Builder is included now. Add balance when premium tools need it.";
  }
  if (
    message.includes("responsibilities of managing losses for connected accounts") ||
    message.includes("ongoing compliance")
  ) {
    return "Stripe Connect setup for PolyNet is still incomplete. Finish the Connect platform-profile acknowledgements in Stripe, then retry.";
  }
  return null;
}

function formatActionError(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatUnusableSessionMessage(kind: BillingActionKind): string {
  if (kind === "connect") {
    return "Your session needs to be refreshed before opening Stripe Connect. Reload or sign in again.";
  }
  if (kind === "portal") {
    return "Your session needs to be refreshed before opening billing. Reload or sign in again.";
  }
  return "Your session needs to be refreshed before starting checkout. Reload or sign in again.";
}

async function resolveBillingSession<SessionT>(
  args: UseBuilderBillingActionsCoreArgs<SessionT>,
  kind: BillingActionKind,
  details: {
    tier?: BuilderCheckoutTier;
    context?: BuilderUpgradeContext;
    connectContext?: BuilderConnectOnboardingContext;
    communitySlug?: string | null;
  },
): Promise<CurrentSessionResolution<SessionT>> {
  const result = await resolveCurrentSessionState(args.getSession, args.ensureSession);
  args.onActionEvent?.({
    kind,
    phase: "preflight",
    status: result.state === "ready" ? "success" : "skip",
    detail: {
      session_state: result.state,
      community_slug: details.communitySlug ?? null,
      billing_context: details.context ?? details.connectContext ?? null,
      tier: details.tier ?? null,
    },
  });
  if (result.state === "unusable") {
    args.setBuilderBillingError(formatUnusableSessionMessage(kind));
    return result;
  }
  if (result.state === "missing") {
    await args.onMissingAuth(kind, details);
    return result;
  }
  return result;
}

export function useBuilderBillingActionsCore<SessionT>(args: UseBuilderBillingActionsCoreArgs<SessionT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const startBuilderPlanCheckout = useCallback(
    async (tier: BuilderCheckoutTier, opts?: { context?: BuilderUpgradeContext }): Promise<void> => {
      const context: BuilderUpgradeContext = opts?.context ?? "builder";
      const current = argsRef.current;
      current.onActionEvent?.({
        kind: "checkout",
        phase: "preflight",
        status: "start",
        detail: { billing_context: context, tier },
      });
      const sessionResult = await resolveBillingSession(current, "checkout", { tier, context });
      if (sessionResult.state !== "ready") {
        return;
      }
      const session = sessionResult.session;

      current.setBuilderBillingError(null);
      current.setIsStartingBuilderCheckout(true);
      current.onActionEvent?.({
        kind: "checkout",
        phase: "request",
        status: "start",
        detail: { billing_context: context, tier },
      });
      try {
        const data = await startCloudBuilderCheckout({
          session,
          tier,
          context,
        });
        const checkoutUrl = readRequiredStringField(data, "checkout_url", "Missing checkout_url.");
        current.onActionEvent?.({
          kind: "checkout",
          phase: "request",
          status: "success",
          detail: { billing_context: context, tier },
        });
        current.onCheckoutStarted?.({ tier, context });
        const opened = await current.openUrl("checkout", checkoutUrl);
        if (!opened) throw new Error("Failed to open checkout.");
        current.onActionEvent?.({
          kind: "checkout",
          phase: "navigation",
          status: "success",
          detail: { billing_context: context, tier },
        });
      } catch (error) {
        const message = formatActionError(error, "Failed to start checkout.");
        current.setBuilderBillingError(message);
        current.onActionEvent?.({
          kind: "checkout",
          phase: "request",
          status: "failure",
          detail: { billing_context: context, tier },
          error: message,
        });
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
      current.onActionEvent?.({
        kind: "portal",
        phase: "preflight",
        status: "start",
        detail: { billing_context: context },
      });
      const sessionResult = await resolveBillingSession(current, "portal", { context });
      if (sessionResult.state !== "ready") {
        return;
      }
      const session = sessionResult.session;

      current.setBuilderBillingError(null);
      current.setIsOpeningBuilderBillingPortal(true);
      current.onActionEvent?.({
        kind: "portal",
        phase: "request",
        status: "start",
        detail: { billing_context: context },
      });
      try {
        const data = await openCloudBuilderBillingPortal({
          session,
          context,
        });
        const unavailableCode = readOptionalStringField(data, "unavailable_code");
        const unavailableMessage = formatBuilderPortalUnavailableMessage(unavailableCode);
        if (unavailableMessage) {
          current.setBuilderBillingError(unavailableMessage);
          current.onActionEvent?.({
            kind: "portal",
            phase: "request",
            status: "failure",
            detail: { billing_context: context, unavailable_code: unavailableCode },
            error: unavailableMessage,
          });
          return;
        }
        const portalUrl = readRequiredStringField(data, "url", "Missing billing portal url.");
        current.onActionEvent?.({
          kind: "portal",
          phase: "request",
          status: "success",
          detail: { billing_context: context },
        });
        current.onPortalOpened?.({ context });
        const opened = await current.openUrl("portal", portalUrl);
        if (!opened) throw new Error("Failed to open billing portal.");
        current.onActionEvent?.({
          kind: "portal",
          phase: "navigation",
          status: "success",
          detail: { billing_context: context },
        });
      } catch (error) {
        const message = formatActionError(error, "Failed to open billing portal.");
        current.setBuilderBillingError(message);
        current.onActionEvent?.({
          kind: "portal",
          phase: "request",
          status: "failure",
          detail: { billing_context: context },
          error: message,
        });
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
      current.onActionEvent?.({
        kind: "connect",
        phase: "preflight",
        status: "start",
        detail: { billing_context: context, community_slug: communitySlug },
      });
      const sessionResult = await resolveBillingSession(current, "connect", {
        connectContext: context,
        communitySlug,
      });
      if (sessionResult.state !== "ready") {
        return;
      }
      const session = sessionResult.session;

      current.setBuilderBillingError(null);
      current.setIsStartingBuilderConnectOnboarding(true);
      current.onActionEvent?.({
        kind: "connect",
        phase: "request",
        status: "start",
        detail: { billing_context: context, community_slug: communitySlug },
      });
      try {
        const data = await startCloudConnectOnboarding({
          session,
          context,
          communitySlug,
        });
        const onboardingUrl = readRequiredStringField(data, "url", "Missing Stripe Connect url.");
        current.onActionEvent?.({
          kind: "connect",
          phase: "request",
          status: "success",
          detail: { billing_context: context, community_slug: communitySlug },
        });
        current.onConnectOnboardingStarted?.({ context, communitySlug });
        const opened = await current.openUrl("connect", onboardingUrl);
        if (!opened) throw new Error("Failed to open Stripe Connect.");
        current.onActionEvent?.({
          kind: "connect",
          phase: "navigation",
          status: "success",
          detail: { billing_context: context, community_slug: communitySlug },
        });
      } catch (error) {
        const message = formatActionError(error, "Failed to open Stripe Connect.");
        const displayMessage = formatBuilderConnectUnavailableMessage(message) ?? message;
        current.setBuilderBillingError(displayMessage);
        current.onActionEvent?.({
          kind: "connect",
          phase: "request",
          status: "failure",
          detail: { billing_context: context, community_slug: communitySlug },
          error: displayMessage,
        });
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
