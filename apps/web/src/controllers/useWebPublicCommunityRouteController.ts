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
}) {
  const publicFunnelSlug =
    params.publicRoute.kind === "community_funnel" || params.publicRoute.kind === "community_funnel_preview"
      ? params.publicRoute.slug
      : null;
  const isPublicFunnelPreviewRoute = params.publicRoute.kind === "community_funnel_preview";
  const checkoutSuccessSessionId = params.publicRoute.kind === "checkout_success" ? params.publicRoute.sessionId : null;
  const claimTokenParam = params.publicRoute.kind === "claim" ? params.publicRoute.token : null;
  const isPublicCommunityFunnel =
    params.publicRoute.kind === "community_funnel" || params.publicRoute.kind === "community_funnel_preview";

  /* One render path: /c/:slug and its /preview both load the LIVE public
     data. Preview differs only in that the owner is forced into the visitor
     lens (can_enter false → visitor CTA) and Join is disabled downstream. */
  useEffect(() => {
    if (!publicFunnelSlug) return;
    void params.loadPublicCommunity(publicFunnelSlug, { recordVisit: !isPublicFunnelPreviewRoute });
  }, [params.sessionDependency, publicFunnelSlug, params.loadPublicCommunity, isPublicFunnelPreviewRoute]);

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
  /* Preview forces the visitor lens even for the owner: ignore their own
     entitlement so the CTA reads as a visitor's (Join/Request/Checkout),
     never "Enter community". */
  const admission = derivePublicCommunityAdmissionProjection({
    access: params.publicCommunityAccess,
    isPreviewMode: isPublicFunnelPreviewRoute,
  });
  const canEnterPublicCommunity = admission.canEnterCommunity;
  const approvalPending = admission.approvalPending;
  const approvalDenied = admission.approvalDenied;
  const canRequestAgain = admission.canRequestAgain;
  return {
    publicFunnelSlug,
    isPublicFunnelPreviewRoute,
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
  };
}
