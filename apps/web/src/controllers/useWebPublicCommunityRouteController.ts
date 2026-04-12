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
    void params.loadPublicCommunity(publicFunnelSlug);
  }, [
    params.sessionDependency,
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
  const canEnterPublicCommunity = Boolean(
    params.publicCommunityAccess && (params.publicCommunityAccess.can_enter_community || params.publicCommunityAccess.is_owner),
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
    publicFunnelPreviewDraft,
    checkoutSuccessSessionId,
    claimTokenParam,
    isPublicCommunityFunnel,
    showPublicSignIn: !params.isSignedIn,
    selectedPublicCommunityPlan,
    publicVisibilityLabel,
    resolvedPublicCommunity,
    publicJoinMode,
    canEnterPublicCommunity,
    canJoinForFree,
    canJoinWithApproval,
    canJoinWithCheckout,
    approvalPending,
    approvalDenied,
    canRequestAgain,
    approvalReapplyLabel,
    memberCountOverride: isPublicFunnelPreviewRoute ? publicFunnelPreviewDraft?.memberCount ?? null : null,
  };
}
