import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

export type UseWebBillingUiControllerResult<
  BillingStatusT,
  PendingPurchaseClaimT,
> = {
  pendingPurchaseClaims: PendingPurchaseClaimT[];
  setPendingPurchaseClaims: Dispatch<SetStateAction<PendingPurchaseClaimT[]>>;
  isLoadingPendingPurchases: boolean;
  setIsLoadingPendingPurchases: Dispatch<SetStateAction<boolean>>;
  pendingPurchasesError: string | null;
  setPendingPurchasesError: Dispatch<SetStateAction<string | null>>;
  isRedeemingPendingPurchases: boolean;
  setIsRedeemingPendingPurchases: Dispatch<SetStateAction<boolean>>;
  pendingPurchasesSuccess: string | null;
  setPendingPurchasesSuccess: Dispatch<SetStateAction<string | null>>;
  accountCommerceStatus: BillingStatusT | null;
  setAccountCommerceStatus: Dispatch<SetStateAction<BillingStatusT | null>>;
  isLoadingAccountCommerce: boolean;
  setIsLoadingAccountCommerce: Dispatch<SetStateAction<boolean>>;
  accountCommerceError: string | null;
  setAccountCommerceError: Dispatch<SetStateAction<string | null>>;
  isStartingStripeConnectOnboarding: boolean;
  setIsStartingStripeConnectOnboarding: Dispatch<SetStateAction<boolean>>;
  checkoutStatus: "idle" | "loading" | "pending" | "succeeded" | "error";
  setCheckoutStatus: Dispatch<SetStateAction<"idle" | "loading" | "pending" | "succeeded" | "error">>;
  checkoutError: string | null;
  setCheckoutError: Dispatch<SetStateAction<string | null>>;
  checkoutClaimToken: string | null;
  setCheckoutClaimToken: Dispatch<SetStateAction<string | null>>;
  isRedeemingClaim: boolean;
  setIsRedeemingClaim: Dispatch<SetStateAction<boolean>>;
  redeemClaimError: string | null;
  setRedeemClaimError: Dispatch<SetStateAction<string | null>>;
  manualClaimToken: string;
  setManualClaimToken: Dispatch<SetStateAction<string>>;
  redeemPendingPurchasesInFlightRef: MutableRefObject<boolean>;
};

export function useWebBillingUiController<
  BillingStatusT,
  PendingPurchaseClaimT,
>(): UseWebBillingUiControllerResult<BillingStatusT, PendingPurchaseClaimT> {
  const [pendingPurchaseClaims, setPendingPurchaseClaims] = useState<PendingPurchaseClaimT[]>([]);
  const [isLoadingPendingPurchases, setIsLoadingPendingPurchases] = useState(false);
  const [pendingPurchasesError, setPendingPurchasesError] = useState<string | null>(null);
  const [isRedeemingPendingPurchases, setIsRedeemingPendingPurchases] = useState(false);
  const [pendingPurchasesSuccess, setPendingPurchasesSuccess] = useState<string | null>(null);
  const [accountCommerceStatus, setAccountCommerceStatus] = useState<BillingStatusT | null>(null);
  const [isLoadingAccountCommerce, setIsLoadingAccountCommerce] = useState(false);
  const [accountCommerceError, setAccountCommerceError] = useState<string | null>(null);
  const [isStartingStripeConnectOnboarding, setIsStartingStripeConnectOnboarding] = useState(false);

  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "loading" | "pending" | "succeeded" | "error">(
    "idle",
  );
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutClaimToken, setCheckoutClaimToken] = useState<string | null>(null);
  const [isRedeemingClaim, setIsRedeemingClaim] = useState(false);
  const [redeemClaimError, setRedeemClaimError] = useState<string | null>(null);
  const [manualClaimToken, setManualClaimToken] = useState("");

  const redeemPendingPurchasesInFlightRef = useRef(false);

  return {
    pendingPurchaseClaims,
    setPendingPurchaseClaims,
    isLoadingPendingPurchases,
    setIsLoadingPendingPurchases,
    pendingPurchasesError,
    setPendingPurchasesError,
    isRedeemingPendingPurchases,
    setIsRedeemingPendingPurchases,
    pendingPurchasesSuccess,
    setPendingPurchasesSuccess,
    accountCommerceStatus,
    setAccountCommerceStatus,
    isLoadingAccountCommerce,
    setIsLoadingAccountCommerce,
    accountCommerceError,
    setAccountCommerceError,
    isStartingStripeConnectOnboarding,
    setIsStartingStripeConnectOnboarding,
    checkoutStatus,
    setCheckoutStatus,
    checkoutError,
    setCheckoutError,
    checkoutClaimToken,
    setCheckoutClaimToken,
    isRedeemingClaim,
    setIsRedeemingClaim,
    redeemClaimError,
    setRedeemClaimError,
    manualClaimToken,
    setManualClaimToken,
    redeemPendingPurchasesInFlightRef,
  };
}
