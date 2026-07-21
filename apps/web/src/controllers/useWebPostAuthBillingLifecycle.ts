import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  readPendingPurchaseClaimToken,
  storePendingPurchaseClaimToken,
} from "../../../../shared/pay_first";

type SessionLike = {
  user: {
    id: string;
  };
};

export function useWebPostAuthBillingLifecycle<
  TSession extends SessionLike,
  TBillingStatus,
>(params: {
  session: TSession | null;
  sessionRef: MutableRefObject<TSession | null>;
  claimTokenParam: string | null;
  isRedeemingClaim: boolean;
  lastAutoRedeemPendingPurchasesUserIdRef: MutableRefObject<string | null>;
  autoRedeemPendingPurchasesAttemptRef: MutableRefObject<number>;
  autoRedeemPendingPurchasesTimeoutRef: MutableRefObject<number | null>;
  setAccountCommerceStatus: Dispatch<SetStateAction<TBillingStatus | null>>;
  setAccountCommerceError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingAccountCommerce: Dispatch<SetStateAction<boolean>>;
  getAuthUid: (session: TSession) => string | null;
  redeemPurchaseClaim: (token: string) => Promise<void>;
  redeemPendingPurchases: (args: { navigate: boolean; silentNoop: boolean }) => Promise<number>;
  loadPendingPurchaseClaims: (session: TSession) => Promise<void>;
  loadAccountCommerceStatus: (session: TSession) => Promise<TBillingStatus | null>;
}) {
  useEffect(() => {
    const token = (params.claimTokenParam ?? "").trim();
    if (!token) return;
    storePendingPurchaseClaimToken(token);
    if (!params.sessionRef.current) return;
    void params.redeemPurchaseClaim(token);
  }, [params.claimTokenParam]);

  useEffect(() => {
    const session = params.session;
    if (!session) return;
    const token = readPendingPurchaseClaimToken();
    if (!token) return;
    if (params.isRedeemingClaim) return;
    void params.redeemPurchaseClaim(token);
  }, [params.session]);

  useEffect(() => {
    const session = params.session;
    if (!session) return;
    void params.loadPendingPurchaseClaims(session);
  }, [params.session]);

  useEffect(() => {
    const session = params.session;
    if (!session) {
      params.lastAutoRedeemPendingPurchasesUserIdRef.current = null;
      params.autoRedeemPendingPurchasesAttemptRef.current = 0;
      if (params.autoRedeemPendingPurchasesTimeoutRef.current) {
        window.clearTimeout(params.autoRedeemPendingPurchasesTimeoutRef.current);
        params.autoRedeemPendingPurchasesTimeoutRef.current = null;
      }
      return;
    }

    const userId = params.getAuthUid(session);
    if (!userId) return;
    if (params.lastAutoRedeemPendingPurchasesUserIdRef.current === userId) return;
    params.lastAutoRedeemPendingPurchasesUserIdRef.current = userId;

    params.autoRedeemPendingPurchasesAttemptRef.current = 0;
    if (params.autoRedeemPendingPurchasesTimeoutRef.current) {
      window.clearTimeout(params.autoRedeemPendingPurchasesTimeoutRef.current);
      params.autoRedeemPendingPurchasesTimeoutRef.current = null;
    }

    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      params.autoRedeemPendingPurchasesAttemptRef.current += 1;
      const attempt = params.autoRedeemPendingPurchasesAttemptRef.current;
      const count = await params.redeemPendingPurchases({ navigate: false, silentNoop: true });
      if (cancelled) return;
      if (count > 0) return;
      if (attempt >= 6) return;
      const delayMs = Math.min(12000, 1200 + attempt * 1800);
      params.autoRedeemPendingPurchasesTimeoutRef.current = window.setTimeout(() => {
        void run();
      }, delayMs);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [params.session]);

  useEffect(() => {
    const session = params.session;
    if (!session) {
      params.setAccountCommerceStatus(null);
      params.setAccountCommerceError(null);
      params.setIsLoadingAccountCommerce(false);
      return;
    }
    void params.loadAccountCommerceStatus(session);
  }, [params.session]);

}
