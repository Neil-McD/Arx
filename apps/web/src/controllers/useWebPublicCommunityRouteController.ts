import { useEffect, useMemo } from "react";
import type { PublicPlanSummary } from "../../../../shared/communityTypes";
import {
  buildCommunityTabPath,
  readCommunityFunnelPreviewHistoryState,
  type CommunityFunnelPreviewRouteState,
  type PublicRoute,
} from "../../../../shared/webAppRouteState";
import {
  formatCommunityVisibilityLabel,
  toCanonicalCommunityVisibility,
} from "../../../../shared/communityVisibility";
import { deriveCommunityJoinMode, type CommunityJoinMode } from "../communityJoinPolicy";

type NavigateFn = (path: string, opts?: { replace?: boolean; state?: unknown }) => void;

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
};

export function useWebPublicCommunityRouteController<
  TPublicCommunity extends PublicCommunityLike,
  TJoinRequest extends PublicJoinRequestLike,
>(params: {
  publicRoute: PublicRoute;
  publicCommunity: TPublicCommunity | null;
  publicCommunityPlans: PublicPlanSummary[];
  myPublicCommunityJoinRequest: TJoinRequest | null;
  isSignedIn: boolean;
  isAuthBootstrapComplete: boolean;
  sessionDependency: unknown;
  loadPublicCommunity: (slug: string) => Promise<void> | void;
  navigateTo: NavigateFn;
}) {
  const publicFunnelSlug =
    params.publicRoute.kind === "community_funnel" || params.publicRoute.kind === "community_funnel_preview"
      ? params.publicRoute.slug
      : null;
  const isPublicFunnelPreviewRoute = params.publicRoute.kind === "community_funnel_preview";
  const publicFunnelPreviewDraft: CommunityFunnelPreviewRouteState | null = isPublicFunnelPreviewRoute
    ? readCommunityFunnelPreviewHistoryState(publicFunnelSlug)
    : null;
  const checkoutSuccessSessionId = params.publicRoute.kind === "checkout_success" ? params.publicRoute.sessionId : null;
  const claimTokenParam = params.publicRoute.kind === "claim" ? params.publicRoute.token : null;
  const isPublicCommunityFunnel =
    params.publicRoute.kind === "community_funnel" || params.publicRoute.kind === "community_funnel_preview";

  useEffect(() => {
    if (!isPublicFunnelPreviewRoute) return;
    if (!publicFunnelSlug) return;
    if (publicFunnelPreviewDraft) return;
    const fallbackPath =
      buildCommunityTabPath(publicFunnelSlug, "funnel") || `/c/${encodeURIComponent(publicFunnelSlug)}`;
    params.navigateTo(fallbackPath, { replace: true });
  }, [
    isPublicFunnelPreviewRoute,
    params.navigateTo,
    publicFunnelPreviewDraft,
    publicFunnelSlug,
  ]);

  useEffect(() => {
    if (!publicFunnelSlug) return;
    if (isPublicFunnelPreviewRoute) return;
    if (!params.isAuthBootstrapComplete) return;
    void params.loadPublicCommunity(publicFunnelSlug);
  }, [
    params.sessionDependency,
    params.isAuthBootstrapComplete,
    isPublicFunnelPreviewRoute,
    publicFunnelSlug,
    params.loadPublicCommunity,
  ]);

  const previewCommunityFallback = isPublicFunnelPreviewRoute ? publicFunnelPreviewDraft?.community ?? null : null;
  const publicCommunityForSurface = isPublicFunnelPreviewRoute
    ? previewCommunityFallback ?? params.publicCommunity
    : params.publicCommunity;
  const selectedPublicCommunityPlan =
    params.publicCommunityPlans.find((plan) => plan.billing_period === "monthly") ??
    params.publicCommunityPlans.find((plan) => plan.billing_period === "annual") ??
    params.publicCommunityPlans[0] ??
    null;
  const publicVisibility = toCanonicalCommunityVisibility(publicCommunityForSurface?.visibility, "unlisted");
  const publicVisibilityLabel = isPublicFunnelPreviewRoute
    ? publicFunnelPreviewDraft?.visibilityLabel ?? formatCommunityVisibilityLabel(publicVisibility)
    : formatCommunityVisibilityLabel(publicVisibility);
  const resolvedPublicCommunity = useMemo(() => {
    if (!publicCommunityForSurface) return null;
    if (!publicFunnelPreviewDraft) return publicCommunityForSurface;
    return {
      ...publicCommunityForSurface,
      one_liner:
        publicFunnelPreviewDraft.one_liner ??
        publicCommunityForSurface.one_liner ??
        null,
      about:
        publicFunnelPreviewDraft.community.about ??
        publicCommunityForSurface.about ??
        null,
      funnel: publicFunnelPreviewDraft.funnel,
    } as TPublicCommunity;
  }, [publicCommunityForSurface, publicFunnelPreviewDraft]);
  const publicJoinMode: CommunityJoinMode | null = isPublicFunnelPreviewRoute
    ? publicFunnelPreviewDraft?.joinMode ?? null
    : params.publicCommunity
      ? deriveCommunityJoinMode({
          entry_policy: params.publicCommunity.entry_policy,
        })
      : null;
  const canJoinForFree = publicJoinMode === "join_free";
  const canJoinWithApproval = publicJoinMode === "join_approval";
  const canJoinWithCheckout = publicJoinMode === "checkout";
  const myJoinRequestStatus = isPublicFunnelPreviewRoute
    ? ""
    : String(params.myPublicCommunityJoinRequest?.status ?? "").trim().toLowerCase();
  const approvalPending = myJoinRequestStatus === "pending";
  const approvalDenied = myJoinRequestStatus === "denied";

  return {
    publicFunnelSlug,
    isPublicFunnelPreviewRoute,
    publicFunnelPreviewDraft,
    checkoutSuccessSessionId,
    claimTokenParam,
    isPublicCommunityFunnel,
    showPublicSignIn: !params.isSignedIn,
    selectedPublicCommunityPlan,
    publicVisibilityLabel,
    resolvedPublicCommunity,
    publicJoinMode,
    canJoinForFree,
    canJoinWithApproval,
    canJoinWithCheckout,
    approvalPending,
    approvalDenied,
    memberCountOverride: isPublicFunnelPreviewRoute ? publicFunnelPreviewDraft?.memberCount ?? null : null,
  };
}
