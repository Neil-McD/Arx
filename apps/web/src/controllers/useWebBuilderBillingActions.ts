import { type Dispatch, type SetStateAction } from "react";
import type { AuthSession } from "../auth";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";
import { startCloudConnectOnboarding } from "../../../../shared/cloudBuilderBillingGateway";

type UseWebBuilderBillingActionsArgs = {
  getSession: () => AuthSession | null;
  ensureSession?: () => Promise<AuthSession | null>;
  requireSignIn: () => void;
  onConnectOnboardingStarted?: (details: {
    context: "account" | "community";
    communitySlug: string | null;
  }) => void;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsStartingBuilderConnectOnboarding: Dispatch<SetStateAction<boolean>>;
  navigateToUrl: (url: string) => void;
};

export function useWebBuilderBillingActions(args: UseWebBuilderBillingActionsArgs) {
  const startBuilderConnectOnboarding = async (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
  }): Promise<void> => {
    const context = opts?.context ?? "account";
    const communitySlug = opts?.communitySlug ?? null;
    const session = args.getSession() ?? (args.ensureSession ? await args.ensureSession() : null);
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "builder_connect_preflight",
      status: session ? "success" : "skip",
      detail: { billing_context: context, community_slug: communitySlug },
      error: null,
    });
    if (!session) {
      args.requireSignIn();
      return;
    }

    args.setBuilderBillingError(null);
    args.setIsStartingBuilderConnectOnboarding(true);
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "builder_connect_request",
      status: "start",
      detail: { billing_context: context, community_slug: communitySlug },
      error: null,
    });
    try {
      const data = await startCloudConnectOnboarding({
        session,
        context,
        communitySlug,
      });
      const url =
        data && typeof data === "object" && typeof data.url === "string"
          ? data.url.trim()
          : "";
      if (!url) throw new Error("Missing Stripe Connect onboarding URL.");
      args.onConnectOnboardingStarted?.({ context, communitySlug });
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "builder_connect_request",
        status: "success",
        detail: { billing_context: context, community_slug: communitySlug },
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
        message === "builder_connect_builder_required"
          ? "Community monetization is not available for this account yet."
          : message.includes("responsibilities of managing losses for connected accounts") ||
              message.includes("ongoing compliance")
            ? "Stripe Connect setup for PolyNet is still incomplete. Finish the Connect platform-profile acknowledgements in Stripe, then retry."
            : message;
      args.setBuilderBillingError(friendly);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "builder_connect_request",
        status: "failure",
        detail: { billing_context: context, community_slug: communitySlug },
        error: formatWorkspaceInstrumentationError(friendly),
      });
    } finally {
      args.setIsStartingBuilderConnectOnboarding(false);
    }
  };

  return { startBuilderConnectOnboarding };
}
