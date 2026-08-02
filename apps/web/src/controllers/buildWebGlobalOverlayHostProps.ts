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
  accountCommerceStatus: { account_tier?: string | null } | null;
  setAccountCommerceError: (value: string | null) => void;
  setIsFreeAccountInfoOpen: (value: boolean) => void;
  providerConnectionModalHostProps: WebGlobalOverlayHostProps["providerConnectionModalHostProps"];
  onOpenPremiumBilling: () => void;
  isFreeAccountInfoOpen: boolean;
  accountCommerceError: string | null;
  communityModalHostProps: WebGlobalOverlayHostProps["communityModalHostProps"];
  founderFundingPromptProps: WebGlobalOverlayHostProps["founderFundingPromptProps"];
  founderInferencePromptProps: WebGlobalOverlayHostProps["founderInferencePromptProps"];
  appToast: string | null;
}): WebGlobalOverlayHostProps {
  return {
    providerConnectionModalHostProps: params.providerConnectionModalHostProps,
    freeAccountIncludedModalProps: {
      isOpen: params.isFreeAccountInfoOpen,
      accountAccessError: params.accountCommerceError,
      onClose: () => params.setIsFreeAccountInfoOpen(false),
      onOpenBilling: params.onOpenPremiumBilling,
    },
    communityModalHostProps: params.communityModalHostProps,
    founderFundingPromptProps: params.founderFundingPromptProps,
    founderInferencePromptProps: params.founderInferencePromptProps,
    appToast: params.appToast,
  };
}
