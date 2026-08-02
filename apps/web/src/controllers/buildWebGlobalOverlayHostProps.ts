import type { WebGlobalOverlayHostProps } from "../components/WebGlobalOverlayHost";

export function shouldOpenFounderInferencePrompt(params: {
  session: unknown | null;
  founderInference: {
    isLoading: boolean;
    isActivationPromptDismissed: boolean;
    status: { eligible: boolean; status: string | null; communities: unknown[] };
  };
  founderBilling: {
    isLoading: boolean;
    overview: { communities: unknown[] };
    fundingAttentionCommunities: unknown[];
  };
}): boolean {
  return Boolean(params.session) &&
    !params.founderInference.isLoading &&
    !params.founderBilling.isLoading &&
    params.founderBilling.overview.communities.length > 0 &&
    params.founderBilling.fundingAttentionCommunities.length === 0 &&
    !params.founderInference.isActivationPromptDismissed &&
    params.founderInference.status.eligible &&
    params.founderInference.status.status === "approved" &&
    params.founderInference.status.communities.length > 0;
}

export function buildWebGlobalOverlayHostProps(params: {
  session: unknown | null;
  providerConnectionModalHostProps: WebGlobalOverlayHostProps["providerConnectionModalHostProps"];
  communityModalHostProps: WebGlobalOverlayHostProps["communityModalHostProps"];
  founderFundingPromptProps: WebGlobalOverlayHostProps["founderFundingPromptProps"];
  founderInferencePromptProps: WebGlobalOverlayHostProps["founderInferencePromptProps"];
  appToast: string | null;
}): WebGlobalOverlayHostProps {
  return {
    providerConnectionModalHostProps: params.providerConnectionModalHostProps,
    communityModalHostProps: params.communityModalHostProps,
    founderFundingPromptProps: params.founderFundingPromptProps,
    founderInferencePromptProps: params.founderInferencePromptProps,
    appToast: params.appToast,
  };
}
