import type { WebGlobalOverlayHostProps } from "../components/WebGlobalOverlayHost";

export function buildWebGlobalOverlayHostProps(params: {
  communityModalHostProps: WebGlobalOverlayHostProps["communityModalHostProps"];
  communityLaunchProps: WebGlobalOverlayHostProps["communityLaunchProps"];
  appToast: string | null;
}): WebGlobalOverlayHostProps {
  return {
    communityModalHostProps: params.communityModalHostProps,
    communityLaunchProps: params.communityLaunchProps,
    appToast: params.appToast,
  };
}
