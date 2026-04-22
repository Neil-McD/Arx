import type { BuilderBillingStatus } from "../../../../shared/builderBillingStatusGateway";

export type StripeConnectPresentation = {
  status: BuilderBillingStatus["stripe_connect"]["status"];
  isReady: boolean;
  requirementsPreview: string[];
  connectCtaLabel: string;
  statusTitle: string;
  statusMessage: string;
};

type StripeConnectPresentationSurface = "account" | "community";

export function buildStripeConnectPresentation(args: {
  builderBillingStatus: BuilderBillingStatus | null;
  surface: StripeConnectPresentationSurface;
}): StripeConnectPresentation {
  const stripeConnect = args.builderBillingStatus?.stripe_connect ?? null;
  const status = stripeConnect?.status ?? "not_connected";
  const isReady = stripeConnect?.can_accept_charges === true;
  const requirementsPreview = stripeConnect?.requirements_currently_due?.slice(0, 3) ?? [];
  const hasRequirementsPreview = requirementsPreview.length > 0;
  const platformFeePercent = Number(args.builderBillingStatus?.platform_fee_bps ?? 0) / 100;
  const connectCtaLabel = isReady
    ? "Open Stripe dashboard"
    : status === "pending_requirements" || status === "restricted"
      ? "Continue Stripe setup"
      : "Connect Stripe";
  const statusTitle = isReady
    ? "Ready for paid community subscriptions"
    : status === "restricted"
      ? "Action required before payouts can start"
      : status === "pending_requirements" && !hasRequirementsPreview
        ? "Stripe is reviewing your payout setup"
        : status === "pending_requirements"
          ? "Finish Stripe setup before payouts can start"
          : "Not connected";

  const statusMessage = (() => {
    if (isReady) {
      return `PolyNet owns pricing, access, and community revenue reporting. Stripe Connect Express handles regulated payouts and verification. PolyNet keeps ${platformFeePercent.toFixed(0)}% plus Stripe fees.`;
    }
    if (status === "restricted") {
      return args.surface === "community"
        ? "Stripe needs more information or action before this community can charge for access."
        : "Stripe needs more information or action before paid community subscriptions can start.";
    }
    if (status === "pending_requirements" && !hasRequirementsPreview) {
      return args.surface === "community"
        ? "Stripe is still reviewing or activating your account before this community can charge for access."
        : "Stripe is still reviewing or activating your account before payouts can start.";
    }
    if (status === "pending_requirements") {
      return args.surface === "community"
        ? "Finish Stripe setup before enabling paid access for this community."
        : "Finish Stripe onboarding before you enable paid access on your community.";
    }
    return args.surface === "community"
      ? "Connect Stripe before enabling paid access for this community."
      : "Connect Stripe to accept paid community subscriptions.";
  })();

  return {
    status,
    isReady,
    requirementsPreview,
    connectCtaLabel,
    statusTitle,
    statusMessage,
  };
}
