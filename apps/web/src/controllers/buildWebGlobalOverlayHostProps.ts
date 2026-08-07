import type { WebGlobalOverlayHostProps } from "../components/WebGlobalOverlayHost";

export function buildWebGlobalOverlayHostProps(params: {
  communityModalHostProps: WebGlobalOverlayHostProps["communityModalHostProps"];
  builderOfferProps: WebGlobalOverlayHostProps["builderOfferProps"];
  builderPurchaseProps: WebGlobalOverlayHostProps["builderPurchaseProps"];
  appToast: string | null;
}): WebGlobalOverlayHostProps {
  return {
    communityModalHostProps: params.communityModalHostProps,
    builderOfferProps: params.builderOfferProps,
    builderPurchaseProps: params.builderPurchaseProps,
    appToast: params.appToast,
  };
}
