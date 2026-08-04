import { useEffect } from "react";
import type { PublicPlanSummary } from "../../../../shared/communityTypes";
import { type PublicRoute } from "../../../../shared/webAppRouteState";
import {
  formatCommunityVisibilityLabel,
  toCanonicalCommunityVisibility,
} from "../../../../shared/communityVisibility";
import { deriveCommunityFunnelAction, type CommunityFunnelAction } from "../communityJoinPolicy";

type PublicCommunityLike = {
  slug: string;
  one_liner: string | null;
  about: string | null;
  visibility: string;
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  funnel?: unknown | null;
};

type PublicJoinRequestLike = {
  status: string;
  reapply_at?: string | null;
  denied_until?: string | null;
};

type PublicCommunityAccessLike = {
  can_enter_community?: boolean;
  is_owner: boolean;
};

export function useWebPublicCommunityRouteController<
  TPublicCommunity extends PublicCommunityLike,
  TJoinRequest extends PublicJoinRequestLike,
>(params: {
  publicRoute: PublicRoute;
  publicCommunity: TPublicCommunity | null;
  publicCommunityPlans: PublicPlanSummary[];
  publicCommunityAccess: PublicCommunityAccessLike | null;
  myPublicCommunityJoinRequest: TJoinRequest | null;
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
  const publicVisibility = toCanonicalCommunityVisibility(params.publicCommunity?.visibility, "unlisted");
  const publicVisibilityLabel = formatCommunityVisibilityLabel(publicVisibility);
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
  const canEnterPublicCommunity = isPublicFunnelPreviewRoute
    ? false
    : Boolean(
        params.publicCommunityAccess?.can_enter_community,
      );
  const myJoinRequestStatus = isPublicFunnelPreviewRoute
    ? ""
    : String(params.myPublicCommunityJoinRequest?.status ?? "").trim().toLowerCase();
  const approvalPending = !canEnterPublicCommunity && myJoinRequestStatus === "pending";
  const approvalDenied = !canEnterPublicCommunity && myJoinRequestStatus === "denied";
  const approvalReapplyAtIso = !approvalDenied
    ? null
    : String(
        params.myPublicCommunityJoinRequest?.reapply_at ??
          params.myPublicCommunityJoinRequest?.denied_until ??
          "",
      ).trim() || null;
  const approvalReapplyAtMs =
    approvalReapplyAtIso && Number.isFinite(Date.parse(approvalReapplyAtIso))
      ? Date.parse(approvalReapplyAtIso)
      : null;
  const canRequestAgain = Boolean(approvalDenied && approvalReapplyAtMs !== null && approvalReapplyAtMs <= Date.now());
  const approvalReapplyLabel =
    approvalDenied && approvalReapplyAtMs !== null
      ? new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
        }).format(new Date(approvalReapplyAtMs))
      : null;
  return {
    publicFunnelSlug,
    isPublicFunnelPreviewRoute,
    checkoutSuccessSessionId,
    claimTokenParam,
    isPublicCommunityFunnel,
    showPublicSignIn: !params.isSignedIn,
    selectedPublicCommunityPlan,
    publicVisibilityLabel,
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
