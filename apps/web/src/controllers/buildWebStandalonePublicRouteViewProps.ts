import type { PublicRoute } from "../../../../shared/webAppRouteState";
import type { WebStandalonePublicRouteViewProps } from "../components/WebStandalonePublicRouteView";

type CheckoutStatus = WebStandalonePublicRouteViewProps["checkoutStatus"];

export function buildWebStandalonePublicRouteViewProps(params: {
  publicRouteKind: PublicRoute["kind"];
  showSignIn: boolean;
  requireSignIn: () => void;
  checkoutStatus: CheckoutStatus;
  retryCheckoutFinalize: () => void;
  continueToCommunity: (() => void) | null;
  checkoutError: string | null;
  authError: string | null;
}): WebStandalonePublicRouteViewProps | null {
  if (params.publicRouteKind !== "checkout_success") return null;

  return {
    publicRouteKind: params.publicRouteKind,
    showSignIn: params.showSignIn,
    onRequireSignIn: () => params.requireSignIn(),
    checkoutStatus: params.checkoutStatus,
    onRetryCheckoutFinalize: params.retryCheckoutFinalize,
    onContinueCheckout: params.continueToCommunity,
    checkoutError: params.checkoutError,
    authError: params.authError,
  };
}
