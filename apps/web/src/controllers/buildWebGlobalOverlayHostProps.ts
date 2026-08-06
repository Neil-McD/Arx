import type { WebGlobalOverlayHostProps } from "../components/WebGlobalOverlayHost";

export function buildWebGlobalOverlayHostProps(params: {
  providerConnectionModalHostProps: WebGlobalOverlayHostProps["providerConnectionModalHostProps"];
  communityModalHostProps: WebGlobalOverlayHostProps["communityModalHostProps"];
  builderOfferProps: WebGlobalOverlayHostProps["builderOfferProps"];
  appToast: string | null;
}): WebGlobalOverlayHostProps {
  return {
    providerConnectionModalHostProps: params.providerConnectionModalHostProps,
    communityModalHostProps: params.communityModalHostProps,
    builderOfferProps: params.builderOfferProps,
    appToast: params.appToast,
  };
}
