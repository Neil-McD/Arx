import { useEffect } from "react";
import type { PublicPlanSummary } from "../../../../shared/communityTypes";
import { type PublicRoute } from "../../../../shared/webAppRouteState";
import {
  deriveCommunityFunnelAction,
  derivePublicCommunityAdmissionProjection,
  type CommunityFunnelAction,
} from "../communityJoinPolicy";

type PublicCommunityLike = {
  slug: string;
  one_liner: string | null;
  about: string | null;
  visibility: string;
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  funnel?: unknown | null;
};

type PublicCommunityAccessLike = {
  can_enter_community?: boolean;
  is_owner: boolean;
  join_request_status?: "pending" | "denied" | null;
  join_request_reapply_at?: string | null;
};

export function useWebPublicCommunityRouteController<
  TPublicCommunity extends PublicCommunityLike,
>(params: {
  publicRoute: PublicRoute;
  publicCommunity: TPublicCommunity | null;
  publicCommunityPlans: PublicPlanSummary[];
  publicCommunityAccess: PublicCommunityAccessLike | null;
  isSignedIn: boolean;
  sessionDependency: unknown;
  loadPublicCommunity: (slug: string, opts?: { recordVisit?: boolean }) => Promise<void> | void;
  refreshPendingPublicCommunityAccess: (slug: string) => Promise<void>;
}) {
  const publicFunnelSlug = params.publicRoute.kind === "community_funnel" ? params.publicRoute.slug : null;
  const checkoutSuccessSessionId = params.publicRoute.kind === "checkout_success" ? params.publicRoute.sessionId : null;
  const claimTokenParam = params.publicRoute.kind === "claim" ? params.publicRoute.token : null;
  const isPublicCommunityFunnel = params.publicRoute.kind === "community_funnel";

  useEffect(() => {
    if (!publicFunnelSlug) return;
    void params.loadPublicCommunity(publicFunnelSlug, { recordVisit: true });
  }, [params.sessionDependency, publicFunnelSlug, params.loadPublicCommunity]);

  const resolvedPublicCommunity = params.publicCommunity;
  const selectedPublicCommunityPlan =
    params.publicCommunityPlans.find((plan) => plan.billing_period === "monthly") ??
    params.publicCommunityPlans.find((plan) => plan.billing_period === "annual") ??
    params.publicCommunityPlans[0] ??
    null;
  const publicFunnelAction: CommunityFunnelAction | null = params.publicCommunity
    ? deriveCommunityFunnelAction({
        entry_policy: params.publicCommunity.entry_policy,
      })
    : null;
  const canJoinForFree = publicFunnelAction === "join";
  const canJoinWithApproval = publicFunnelAction === "request_access";
  const canJoinWithCheckout = publicFunnelAction === "checkout";
  const admission = derivePublicCommunityAdmissionProjection({
    access: params.publicCommunityAccess,
  });
  useEffect(() => {
    if (!publicFunnelSlug || !params.isSignedIn || !admission.approvalPending) return;
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (!active || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        await params.refreshPendingPublicCommunityAccess(publicFunnelSlug);
      } finally {
        inFlight = false;
      }
    };
    const onResume = () => { void refresh(); };
    const timer = window.setInterval(onResume, 30_000);
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [publicFunnelSlug, params.isSignedIn,
    admission.approvalPending, params.refreshPendingPublicCommunityAccess]);
  const canEnterPublicCommunity = admission.canEnterCommunity;
  const approvalPending = admission.approvalPending;
  const approvalDenied = admission.approvalDenied;
  const canRequestAgain = admission.canRequestAgain;
  const approvalReapplyLabel = admission.approvalReapplyAtMs === null
    ? null
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
      }).format(admission.approvalReapplyAtMs);
  return {
    publicFunnelSlug,
    checkoutSuccessSessionId,
    claimTokenParam,
    isPublicCommunityFunnel,
    showPublicSignIn: !params.isSignedIn,
    selectedPublicCommunityPlan,
    resolvedPublicCommunity,
    canEnterPublicCommunity,
    canJoinForFree,
    canJoinWithApproval,
    canJoinWithCheckout,
    approvalPending,
    approvalDenied,
    canRequestAgain,
    approvalReapplyLabel,
  };
}
