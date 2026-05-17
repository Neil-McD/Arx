import { type Dispatch, type SetStateAction } from "react";
import type { AuthSession } from "../auth";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";
import { startCloudConnectOnboarding } from "../../../../shared/cloudAccountCommerceGateway";

type UseWebAccountCommerceActionsArgs = {
  getSession: () => AuthSession | null;
  ensureSession?: () => Promise<AuthSession | null>;
  requireSignIn: () => void;
  onConnectOnboardingStarted?: (details: {
    context: "account" | "community";
    communitySlug: string | null;
    country: string | null;
  }) => void;
  setAccountCommerceError: Dispatch<SetStateAction<string | null>>;
  setIsStartingStripeConnectOnboarding: Dispatch<SetStateAction<boolean>>;
  navigateToUrl: (url: string) => void;
};

export function useWebAccountCommerceActions(args: UseWebAccountCommerceActionsArgs) {
  const startStripeConnectOnboarding = async (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  }): Promise<void> => {
    const context = opts?.context ?? "account";
    const communitySlug = opts?.communitySlug ?? null;
    const country = String(opts?.country ?? "").trim().toUpperCase() || null;
    const session = args.getSession() ?? (args.ensureSession ? await args.ensureSession() : null);
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "stripe_connect_preflight",
      status: session ? "success" : "skip",
      detail: { billing_context: context, community_slug: communitySlug, country },
      error: null,
    });
    if (!session) {
      args.requireSignIn();
      return;
    }

    args.setAccountCommerceError(null);
    args.setIsStartingStripeConnectOnboarding(true);
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "stripe_connect_request",
      status: "start",
      detail: { billing_context: context, community_slug: communitySlug, country },
      error: null,
    });
    try {
      const data = await startCloudConnectOnboarding({
        session,
        context,
        communitySlug,
        country,
      });
      const url =
        data && typeof data === "object" && typeof data.url === "string"
          ? data.url.trim()
          : "";
      if (!url) throw new Error("Missing Stripe Connect onboarding URL.");
      args.onConnectOnboardingStarted?.({ context, communitySlug, country });
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "stripe_connect_request",
        status: "success",
        detail: { billing_context: context, community_slug: communitySlug, country },
        error: null,
      });
      args.navigateToUrl(url);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to start Stripe Connect onboarding.";
      const friendly =
        message === "creator_payout_access_required"
          ? "Community monetization is not available for this account yet."
          : message.includes("responsibilities of managing losses for connected accounts") ||
              message.includes("ongoing compliance")
            ? "Stripe Connect setup for PolyNet is still incomplete. Finish the Connect platform-profile acknowledgements in Stripe, then retry."
            : message;
      args.setAccountCommerceError(friendly);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "stripe_connect_request",
        status: "failure",
        detail: { billing_context: context, community_slug: communitySlug, country },
        error: formatWorkspaceInstrumentationError(friendly),
      });
    } finally {
      args.setIsStartingStripeConnectOnboarding(false);
    }
  };

  return { startStripeConnectOnboarding };
}
