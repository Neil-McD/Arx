import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";

export type StripeConnectPresentation = {
  status: AccountCommerceStatus["stripe_connect"]["status"];
  isReady: boolean;
  requirementsPreview: string[];
  connectCtaLabel: string;
  statusTitle: string;
  statusMessage: string;
};

type StripeConnectPresentationSurface = "account" | "community";

export function buildStripeConnectPresentation(args: {
  accountCommerceStatus: AccountCommerceStatus | null;
  surface: StripeConnectPresentationSurface;
  platformFeeBpsOverride?: number | null;
}): StripeConnectPresentation {
  const stripeConnect = args.accountCommerceStatus?.stripe_connect ?? null;
  const status = stripeConnect?.status ?? "not_connected";
  const isReady = stripeConnect?.can_receive_community_revenue === true;
  const requirementsPreview = stripeConnect?.requirements_currently_due?.slice(0, 3) ?? [];
  const hasRequirementsPreview = requirementsPreview.length > 0;
  const platformFeePercent = Number(
    args.platformFeeBpsOverride ?? args.accountCommerceStatus?.platform_fee_bps ?? 0,
  ) / 100;
  const connectCtaLabel = isReady || status === "ready"
    ? "Open Stripe dashboard"
    : status === "pending_requirements" || status === "restricted"
      ? "Continue Stripe setup"
      : "Connect Stripe";
  const statusTitle = isReady
    ? "Ready for paid community subscriptions"
    : status === "ready"
      ? "Direct card charges are not enabled"
    : status === "restricted"
      ? "Action required before payouts can start"
      : status === "pending_requirements" && !hasRequirementsPreview
        ? "Stripe is reviewing your payout setup"
        : status === "pending_requirements"
          ? "Finish Stripe setup before payouts can start"
          : "Not connected";

  const statusMessage = (() => {
    if (isReady) {
      return `Polynet owns pricing, access, and community revenue reporting. Stripe Connect Express handles payment processing, verification, and payouts. Polynet keeps ${platformFeePercent.toFixed(1)}%; Stripe processing fees are charged separately to your connected account.`;
    }
    if (status === "ready") {
      return "This connected account can receive transfers, but it cannot create the direct card charges required for paid community subscriptions.";
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
