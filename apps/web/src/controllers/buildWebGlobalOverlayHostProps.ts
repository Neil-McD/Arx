import type { WebGlobalOverlayHostProps } from "../components/WebGlobalOverlayHost";

export function buildWebGlobalOverlayHostProps(params: {
  communityModalHostProps: WebGlobalOverlayHostProps["communityModalHostProps"];
  builderOfferProps: WebGlobalOverlayHostProps["builderOfferProps"];
  builderKnowledgeSetupProps: WebGlobalOverlayHostProps["builderKnowledgeSetupProps"];
  appToast: string | null;
}): WebGlobalOverlayHostProps {
  return {
    communityModalHostProps: params.communityModalHostProps,
    builderOfferProps: params.builderOfferProps,
    builderKnowledgeSetupProps: params.builderKnowledgeSetupProps,
    appToast: params.appToast,
  };
}
