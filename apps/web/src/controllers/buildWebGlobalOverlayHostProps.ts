import type { WebGlobalOverlayHostProps } from "../components/WebGlobalOverlayHost";

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
    appToast: params.appToast,
  };
}
