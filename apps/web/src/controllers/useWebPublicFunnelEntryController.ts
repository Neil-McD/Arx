import type {
  CommunityBillingPeriod,
} from "../../../../shared/communityTypes";
import {
  applyShellVariantToPublicPath,
  buildCommunityFunnelPath,
  type AppShellVariant,
} from "../../../../shared/webAppRouteState";

type PublicCommunity = {
  slug: string;
};

type PublicCommunityAccess = {
  community_id: string;
};

export function useWebPublicFunnelEntryController(params: {
  publicCommunity: PublicCommunity | null;
  publicCommunityAccess: PublicCommunityAccess | null;
  canEnterCommunity: boolean;
  canJoinWithCheckout: boolean;
  canJoinForFree: boolean;
  canJoinWithApproval: boolean;
  selectedPlan: { billing_period: CommunityBillingPeriod } | null;
  shellVariant: AppShellVariant;
  showPublicSignIn: boolean;
  approvalPending: boolean;
  fallbackCommunitySlug: string | null;
  enterCommunity: (value: {
    communityId: string;
    communitySlug: string | null;
  }) => void;
  startCheckoutForPlan: (
    communitySlug: string,
    billingPeriod: CommunityBillingPeriod,
    returnPath: string,
  ) => Promise<unknown>;
  joinPublicCommunity: (value: {
    communitySlug: string;
  }) => Promise<unknown>;
  cancelPendingJoinRequest: (communitySlug: string) => Promise<unknown>;
}) {
  const handlePrimaryAction = () => {
    if (!params.publicCommunity) return;
    if (
      params.canEnterCommunity &&
      params.publicCommunityAccess?.community_id
    ) {
      params.enterCommunity({
        communityId: params.publicCommunityAccess.community_id,
        communitySlug: params.publicCommunity.slug,
      });
      return;
    }

    if (params.canJoinWithCheckout && params.selectedPlan) {
      const fallbackPath =
        `/c/${encodeURIComponent(params.publicCommunity.slug)}`;
      const returnPath = applyShellVariantToPublicPath(
        buildCommunityFunnelPath(params.publicCommunity.slug) ??
          fallbackPath,
        params.shellVariant,
      );
      void params.startCheckoutForPlan(
        params.publicCommunity.slug,
        params.selectedPlan.billing_period,
        returnPath,
      );
      return;
    }
    if (!params.canJoinForFree && !params.canJoinWithApproval) return;
    void params.joinPublicCommunity({
      communitySlug: params.publicCommunity.slug,
    });
  };

  const handleCancelPendingJoinRequest = () => {
    const slug =
      params.publicCommunity?.slug ??
      params.fallbackCommunitySlug ??
      "";
    if (!slug || !params.approvalPending) return;
    void params.cancelPendingJoinRequest(slug);
  };

  return {
    handlePrimaryAction,
    handleCancelPendingJoinRequest,
  };
}
