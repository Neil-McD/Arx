import { useState, type Dispatch, type SetStateAction } from "react";

export type UseWebBillingUiControllerResult<BillingStatusT> = {
  accountCommerceStatus: BillingStatusT | null;
  setAccountCommerceStatus: Dispatch<SetStateAction<BillingStatusT | null>>;
  isLoadingAccountCommerce: boolean;
  setIsLoadingAccountCommerce: Dispatch<SetStateAction<boolean>>;
  accountCommerceError: string | null;
  setAccountCommerceError: Dispatch<SetStateAction<string | null>>;
  isSettingDevAccountTier: boolean;
  setIsSettingDevAccountTier: Dispatch<SetStateAction<boolean>>;
  devAccountTierError: string | null;
  setDevAccountTierError: Dispatch<SetStateAction<string | null>>;
  isStartingStripeConnectOnboarding: boolean;
  setIsStartingStripeConnectOnboarding: Dispatch<SetStateAction<boolean>>;
  checkoutStatus: "idle" | "loading" | "pending" | "succeeded" | "error";
  setCheckoutStatus: Dispatch<SetStateAction<"idle" | "loading" | "pending" | "succeeded" | "error">>;
  checkoutError: string | null;
  setCheckoutError: Dispatch<SetStateAction<string | null>>;
};

export function useWebBillingUiController<BillingStatusT>(): UseWebBillingUiControllerResult<BillingStatusT> {
  const [accountCommerceStatus, setAccountCommerceStatus] = useState<BillingStatusT | null>(null);
  const [isLoadingAccountCommerce, setIsLoadingAccountCommerce] = useState(false);
  const [accountCommerceError, setAccountCommerceError] = useState<string | null>(null);
  const [isSettingDevAccountTier, setIsSettingDevAccountTier] = useState(false);
  const [devAccountTierError, setDevAccountTierError] = useState<string | null>(null);
  const [isStartingStripeConnectOnboarding, setIsStartingStripeConnectOnboarding] = useState(false);

  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "loading" | "pending" | "succeeded" | "error">(
    "idle",
  );
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  return {
    accountCommerceStatus,
    setAccountCommerceStatus,
    isLoadingAccountCommerce,
    setIsLoadingAccountCommerce,
    accountCommerceError,
    setAccountCommerceError,
    isSettingDevAccountTier,
    setIsSettingDevAccountTier,
    devAccountTierError,
    setDevAccountTierError,
    isStartingStripeConnectOnboarding,
    setIsStartingStripeConnectOnboarding,
    checkoutStatus,
    setCheckoutStatus,
    checkoutError,
    setCheckoutError,
  };
}
