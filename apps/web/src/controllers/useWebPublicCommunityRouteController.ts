import { useEffect } from "react";
import type { PublicPlanSummary } from "../../../../shared/communityTypes";
import { type PublicRoute } from "../../../../shared/webAppRouteState";
import {
  formatCommunityVisibilityLabel,
  toCanonicalCommunityVisibility,
} from "../../../../shared/communityVisibility";
import {
  deriveCommunityFunnelAction,
  derivePublicCommunityAdmissionProjection,
  type CommunityFunnelAction,
  type PublicCommunityAccessResolution,
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
  is_blocked: boolean;
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
  publicCommunityAccessResolution: PublicCommunityAccessResolution;
  authSubject: string | null;
  isSignedIn: boolean;
  sessionDependency: unknown;
  loadPublicCommunity: (
    slug: string,
    opts?: { recordVisit?: boolean; isPreviewMode?: boolean },
  ) => Promise<void> | void;
}) {
  const publicFunnelSlug =
    params.publicRoute.kind === "community_funnel" || params.publicRoute.kind === "community_funnel_preview"
      ? params.publicRoute.slug
      : null;
  const isPublicFunnelPreviewRoute = params.publicRoute.kind === "community_funnel_preview";
  const checkoutSuccessSessionId = params.publicRoute.kind === "checkout_success" ? params.publicRoute.sessionId : null;
  const isPublicCommunityFunnel =
    params.publicRoute.kind === "community_funnel" || params.publicRoute.kind === "community_funnel_preview";

  /* One render path: /c/:slug and its /preview both load the LIVE public
     data. Preview differs only in that the owner is forced into the visitor
     lens (can_enter false → visitor CTA) and Join is disabled downstream. */
  useEffect(() => {
    if (!publicFunnelSlug) return;
    void params.loadPublicCommunity(publicFunnelSlug, {
      recordVisit: !isPublicFunnelPreviewRoute,
      isPreviewMode: isPublicFunnelPreviewRoute,
    });
  }, [params.sessionDependency, publicFunnelSlug, params.loadPublicCommunity, isPublicFunnelPreviewRoute]);

  const resolvedPublicCommunity =
    params.publicCommunity?.slug === publicFunnelSlug ? params.publicCommunity : null;
  const selectedPublicCommunityPlan = resolvedPublicCommunity
    ? params.publicCommunityPlans.find((plan) => plan.billing_period === "monthly") ??
      params.publicCommunityPlans.find((plan) => plan.billing_period === "annual") ??
      params.publicCommunityPlans[0] ??
      null
    : null;
  const publicVisibility = toCanonicalCommunityVisibility(resolvedPublicCommunity?.visibility, "unlisted");
  const publicVisibilityLabel = formatCommunityVisibilityLabel(publicVisibility);
  const publicFunnelAction: CommunityFunnelAction | null = resolvedPublicCommunity
    ? deriveCommunityFunnelAction({
        entry_policy: resolvedPublicCommunity.entry_policy,
      })
    : null;
  /* Preview forces the visitor lens even for the owner: ignore their own
     entitlement so the CTA reads as a visitor's (Join/Request/Checkout),
     never "Enter community". */
  const admission = derivePublicCommunityAdmissionProjection({
    access: params.publicCommunityAccess,
    accessResolution: params.publicCommunityAccessResolution,
    authSubject: params.authSubject,
    communitySlug: publicFunnelSlug,
    isSignedIn: params.isSignedIn,
    isPreviewMode: isPublicFunnelPreviewRoute,
  });
  const admissionIsReady = admission.status === "ready";
  const canJoinForFree = admissionIsReady && publicFunnelAction === "join";
  const canJoinWithApproval = admissionIsReady && publicFunnelAction === "request_access";
  const canJoinWithCheckout = admissionIsReady && publicFunnelAction === "checkout";
  const canEnterPublicCommunity = admission.canEnterCommunity;
  const approvalPending = admission.approvalPending;
  const approvalDenied = admission.approvalDenied;
  const canRequestAgain = admission.canRequestAgain;
  const approvalReapplyLabel =
    approvalDenied && admission.approvalReapplyAtMs !== null
      ? new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
        }).format(new Date(admission.approvalReapplyAtMs))
      : null;
  return {
    publicFunnelSlug,
    isPublicFunnelPreviewRoute,
    checkoutSuccessSessionId,
    isPublicCommunityFunnel,
    showPublicSignIn: !params.isSignedIn,
    selectedPublicCommunityPlan,
    publicVisibilityLabel,
    resolvedPublicCommunity,
    publicCommunityAdmissionStatus: admission.status,
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
