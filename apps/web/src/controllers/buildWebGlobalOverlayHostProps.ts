import type { WebGlobalOverlayHostProps } from "../components/WebGlobalOverlayHost";

export function buildWebGlobalOverlayHostProps(params: {
  communityModalHostProps: WebGlobalOverlayHostProps["communityModalHostProps"];
  builderOfferProps: WebGlobalOverlayHostProps["builderOfferProps"];
  communityLaunchProps: WebGlobalOverlayHostProps["communityLaunchProps"];
  appToast: string | null;
}): WebGlobalOverlayHostProps {
  return {
    communityModalHostProps: params.communityModalHostProps,
    builderOfferProps: params.builderOfferProps,
    communityLaunchProps: params.communityLaunchProps,
    appToast: params.appToast,
  };
}
