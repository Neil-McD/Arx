import {
  readPendingPurchaseClaimToken,
} from "../../../../shared/pay_first";
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
  checkoutClaimToken: string | null;
  publicRouteClaimToken: string | null;
  manualClaimToken: string;
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
  redeemPurchaseClaim: (token: string) => Promise<unknown>;
  startCheckoutForPlan: (
    communitySlug: string,
    billingPeriod: CommunityBillingPeriod,
    returnPath: string,
    offerKey?: string | null,
  ) => Promise<unknown>;
  joinPublicCommunity: (value: {
    communitySlug: string;
  }) => Promise<unknown>;
  requireSignIn: (intent: {
    reason: "redeem_purchase_claim";
    payload: { token: string };
  }) => void;
  cancelPendingJoinRequest: (communitySlug: string) => Promise<unknown>;
}) {
  const pendingToken =
    (
      params.checkoutClaimToken ??
      params.publicRouteClaimToken ??
      ""
    ).trim() || readPendingPurchaseClaimToken();

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

    // Redeem an existing receipt before considering another checkout.
    const unredeemedClaimToken = readPendingPurchaseClaimToken();
    if (unredeemedClaimToken) {
      void params.redeemPurchaseClaim(unredeemedClaimToken);
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

  // A higher offer from the sales page's offer cards; the base offer uses the primary action.
  const handleOfferCheckout = (offerKey: string, billingPeriod: CommunityBillingPeriod) => {
    if (!params.publicCommunity) return;
    const fallbackPath = `/c/${encodeURIComponent(params.publicCommunity.slug)}`;
    const returnPath = applyShellVariantToPublicPath(
      buildCommunityFunnelPath(params.publicCommunity.slug) ?? fallbackPath,
      params.shellVariant,
    );
    void params.startCheckoutForPlan(params.publicCommunity.slug, billingPeriod, returnPath, offerKey);
  };

  const handleCheckoutContinue = () => {
    if (!pendingToken) return;
    if (params.showPublicSignIn) {
      params.requireSignIn({
        reason: "redeem_purchase_claim",
        payload: { token: pendingToken },
      });
      return;
    }
    void params.redeemPurchaseClaim(pendingToken);
  };

  const handleClaimContinue = () => {
    const token = (pendingToken || params.manualClaimToken).trim();
    if (token) void params.redeemPurchaseClaim(token);
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
    pendingToken,
    handleOfferCheckout,
    handlePrimaryAction,
    handleCheckoutContinue,
    handleClaimContinue,
    handleCancelPendingJoinRequest,
  };
}
