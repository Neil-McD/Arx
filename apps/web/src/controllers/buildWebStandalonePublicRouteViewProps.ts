import type { PublicRoute } from "../../../../shared/webAppRouteState";
import type { WebStandalonePublicRouteViewProps } from "../components/WebStandalonePublicRouteView";

type CheckoutStatus = WebStandalonePublicRouteViewProps["checkoutStatus"];
type MagicLinkStatus = WebStandalonePublicRouteViewProps["magicLinkStatus"];

export function buildWebStandalonePublicRouteViewProps(params: {
  publicRouteKind: Extract<PublicRoute["kind"], "checkout_success" | "claim"> | PublicRoute["kind"];
  showSignIn: boolean;
  requireSignIn: () => void;
  handleSignOut: () => void | Promise<void>;
  checkoutStatus: CheckoutStatus;
  retryCheckoutFinalize: () => void;
  handlePublicCheckoutContinue: () => void;
  handlePublicClaimContinue: () => void;
  handleSendMagicLink: (email: string) => void | Promise<void>;
  checkoutError: string | null;
  magicLinkEmail: string;
  setMagicLinkEmail: (value: string) => void;
  magicLinkStatus: MagicLinkStatus;
  magicLinkError: string | null;
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
    onSendMagicLink: () => {
      void params.handleSendMagicLink(params.magicLinkEmail);
    },
    checkoutError: params.checkoutError,
    magicLinkEmail: params.magicLinkEmail,
    onChangeMagicLinkEmail: params.setMagicLinkEmail,
    magicLinkStatus: params.magicLinkStatus,
    magicLinkError: params.magicLinkError,
    pendingToken: params.pendingToken,
    manualClaimToken: params.manualClaimToken,
    onChangeManualClaimToken: params.setManualClaimToken,
    isRedeemingClaim: params.isRedeemingClaim,
    redeemClaimError: params.redeemClaimError,
    authError: params.authError,
  };
}
