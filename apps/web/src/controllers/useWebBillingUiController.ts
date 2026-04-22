import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

export type UseWebBillingUiControllerResult<
  BillingStatusT,
  WorkspaceCreditBalanceT,
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
  builderBillingStatus: BillingStatusT | null;
  setBuilderBillingStatus: Dispatch<SetStateAction<BillingStatusT | null>>;
  isLoadingBuilderBilling: boolean;
  setIsLoadingBuilderBilling: Dispatch<SetStateAction<boolean>>;
  builderBillingError: string | null;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  workspaceCreditBalance: WorkspaceCreditBalanceT | null;
  setWorkspaceCreditBalance: Dispatch<SetStateAction<WorkspaceCreditBalanceT | null>>;
  isLoadingWorkspaceCreditBalance: boolean;
  setIsLoadingWorkspaceCreditBalance: Dispatch<SetStateAction<boolean>>;
  workspaceCreditBalanceError: string | null;
  setWorkspaceCreditBalanceError: Dispatch<SetStateAction<string | null>>;
  isStartingWorkspaceCreditTopupCheckout: boolean;
  setIsStartingWorkspaceCreditTopupCheckout: Dispatch<SetStateAction<boolean>>;
  workspaceCreditTopupError: string | null;
  setWorkspaceCreditTopupError: Dispatch<SetStateAction<string | null>>;
  isSettingDevBuilderTier: boolean;
  setIsSettingDevBuilderTier: Dispatch<SetStateAction<boolean>>;
  devBuilderTierError: string | null;
  setDevBuilderTierError: Dispatch<SetStateAction<string | null>>;
  isStartingBuilderCheckout: boolean;
  setIsStartingBuilderCheckout: Dispatch<SetStateAction<boolean>>;
  isOpeningBuilderBillingPortal: boolean;
  setIsOpeningBuilderBillingPortal: Dispatch<SetStateAction<boolean>>;
  isStartingBuilderConnectOnboarding: boolean;
  setIsStartingBuilderConnectOnboarding: Dispatch<SetStateAction<boolean>>;
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
  WorkspaceCreditBalanceT,
  PendingPurchaseClaimT,
>(): UseWebBillingUiControllerResult<BillingStatusT, WorkspaceCreditBalanceT, PendingPurchaseClaimT> {
  const [pendingPurchaseClaims, setPendingPurchaseClaims] = useState<PendingPurchaseClaimT[]>([]);
  const [isLoadingPendingPurchases, setIsLoadingPendingPurchases] = useState(false);
  const [pendingPurchasesError, setPendingPurchasesError] = useState<string | null>(null);
  const [isRedeemingPendingPurchases, setIsRedeemingPendingPurchases] = useState(false);
  const [pendingPurchasesSuccess, setPendingPurchasesSuccess] = useState<string | null>(null);

  const [builderBillingStatus, setBuilderBillingStatus] = useState<BillingStatusT | null>(null);
  const [isLoadingBuilderBilling, setIsLoadingBuilderBilling] = useState(false);
  const [builderBillingError, setBuilderBillingError] = useState<string | null>(null);
  const [workspaceCreditBalance, setWorkspaceCreditBalance] = useState<WorkspaceCreditBalanceT | null>(null);
  const [isLoadingWorkspaceCreditBalance, setIsLoadingWorkspaceCreditBalance] = useState(false);
  const [workspaceCreditBalanceError, setWorkspaceCreditBalanceError] = useState<string | null>(null);
  const [isStartingWorkspaceCreditTopupCheckout, setIsStartingWorkspaceCreditTopupCheckout] = useState(false);
  const [workspaceCreditTopupError, setWorkspaceCreditTopupError] = useState<string | null>(null);
  const [isSettingDevBuilderTier, setIsSettingDevBuilderTier] = useState(false);
  const [devBuilderTierError, setDevBuilderTierError] = useState<string | null>(null);
  const [isStartingBuilderCheckout, setIsStartingBuilderCheckout] = useState(false);
  const [isOpeningBuilderBillingPortal, setIsOpeningBuilderBillingPortal] = useState(false);
  const [isStartingBuilderConnectOnboarding, setIsStartingBuilderConnectOnboarding] = useState(false);

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
    builderBillingStatus,
    setBuilderBillingStatus,
    isLoadingBuilderBilling,
    setIsLoadingBuilderBilling,
    builderBillingError,
    setBuilderBillingError,
    workspaceCreditBalance,
    setWorkspaceCreditBalance,
    isLoadingWorkspaceCreditBalance,
    setIsLoadingWorkspaceCreditBalance,
    workspaceCreditBalanceError,
    setWorkspaceCreditBalanceError,
    isStartingWorkspaceCreditTopupCheckout,
    setIsStartingWorkspaceCreditTopupCheckout,
    workspaceCreditTopupError,
    setWorkspaceCreditTopupError,
    isSettingDevBuilderTier,
    setIsSettingDevBuilderTier,
    devBuilderTierError,
    setDevBuilderTierError,
    isStartingBuilderCheckout,
    setIsStartingBuilderCheckout,
    isOpeningBuilderBillingPortal,
    setIsOpeningBuilderBillingPortal,
    isStartingBuilderConnectOnboarding,
    setIsStartingBuilderConnectOnboarding,
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
