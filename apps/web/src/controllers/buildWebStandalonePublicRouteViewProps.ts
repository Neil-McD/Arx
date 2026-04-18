import type { PublicRoute } from "../../../../shared/webAppRouteState";
import type { WebStandalonePublicRouteViewProps } from "../components/WebStandalonePublicRouteView";

type CheckoutStatus = WebStandalonePublicRouteViewProps["checkoutStatus"];

export function buildWebStandalonePublicRouteViewProps(params: {
  publicRouteKind: Extract<PublicRoute["kind"], "checkout_success" | "claim"> | PublicRoute["kind"];
  showSignIn: boolean;
  requireSignIn: () => void;
  handleSignOut: () => void | Promise<void>;
  checkoutStatus: CheckoutStatus;
  retryCheckoutFinalize: () => void;
  handlePublicCheckoutContinue: () => void;
  handlePublicClaimContinue: () => void;
  checkoutError: string | null;
  pendingToken: string;
  manualClaimToken: string;
  setManualClaimToken: (value: string) => void;
  isRedeemingClaim: boolean;
  redeemClaimError: string | null;
  authError: string | null;
}): WebStandalonePublicRouteViewProps | null {
  if (
    params.publicRouteKind !== "checkout_success" &&
    params.publicRouteKind !== "claim"
  ) {
    return null;
  }

  return {
    publicRouteKind: params.publicRouteKind,
    showSignIn: params.showSignIn,
    onRequireSignIn: () => params.requireSignIn(),
    onSignOut: () => {
      void params.handleSignOut();
    },
    checkoutStatus: params.checkoutStatus,
    onRetryCheckoutFinalize: params.retryCheckoutFinalize,
    onContinueCheckout: params.handlePublicCheckoutContinue,
    onContinueClaim: params.handlePublicClaimContinue,
    checkoutError: params.checkoutError,
    pendingToken: params.pendingToken,
    manualClaimToken: params.manualClaimToken,
    onChangeManualClaimToken: params.setManualClaimToken,
    isRedeemingClaim: params.isRedeemingClaim,
    redeemClaimError: params.redeemClaimError,
    authError: params.authError,
  };
}
