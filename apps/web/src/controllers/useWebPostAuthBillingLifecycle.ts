import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  readPendingPublicJoinCommunityId,
  readPendingPublicJoinCommunitySlug,
  readPendingPurchaseClaimToken,
  storePendingPurchaseClaimToken,
} from "../../../../shared/pay_first";
import { scrubCurrentRouteSearchParams } from "../webAppRuntime";

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
  checkoutSuccessSessionId: string | null;
  isRedeemingClaim: boolean;
  isJoiningPublicCommunity: boolean;
  setAccountCommerceStatus: Dispatch<SetStateAction<TBillingStatus | null>>;
  setAccountCommerceError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingAccountCommerce: Dispatch<SetStateAction<boolean>>;
  getAuthUid: (session: TSession) => string | null;
  redeemPurchaseClaim: (token: string) => Promise<void>;
  redeemPendingPurchases: (args: { navigate: boolean; silentNoop: boolean }) => Promise<number>;
  loadPendingPurchaseClaims: (session: TSession) => Promise<void>;
  loadAccountCommerceStatus: (session: TSession) => Promise<TBillingStatus | null>;
  joinPublicCommunity: (args: { communitySlug: string | null; communityId?: string }) => Promise<void>;
}) {
  const lastAutoRedeemPendingPurchasesUserIdRef = useRef<string | null>(null);
  const autoRedeemPendingPurchasesAttemptRef = useRef(0);
  const autoRedeemPendingPurchasesTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (params.claimTokenParam) {
      scrubCurrentRouteSearchParams(["token"]);
    }
    if (params.checkoutSuccessSessionId) {
      scrubCurrentRouteSearchParams(["session_id"]);
    }
  }, [
    params.checkoutSuccessSessionId,
    params.claimTokenParam,
  ]);

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
      lastAutoRedeemPendingPurchasesUserIdRef.current = null;
      autoRedeemPendingPurchasesAttemptRef.current = 0;
      if (autoRedeemPendingPurchasesTimeoutRef.current) {
        window.clearTimeout(autoRedeemPendingPurchasesTimeoutRef.current);
        autoRedeemPendingPurchasesTimeoutRef.current = null;
      }
      return;
    }

    const userId = params.getAuthUid(session);
    if (!userId) return;
    if (lastAutoRedeemPendingPurchasesUserIdRef.current === userId) return;
    lastAutoRedeemPendingPurchasesUserIdRef.current = userId;

    autoRedeemPendingPurchasesAttemptRef.current = 0;
    if (autoRedeemPendingPurchasesTimeoutRef.current) {
      window.clearTimeout(autoRedeemPendingPurchasesTimeoutRef.current);
      autoRedeemPendingPurchasesTimeoutRef.current = null;
    }

    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      autoRedeemPendingPurchasesAttemptRef.current += 1;
      const attempt = autoRedeemPendingPurchasesAttemptRef.current;
      const count = await params.redeemPendingPurchases({ navigate: false, silentNoop: true });
      if (cancelled) return;
      if (count > 0) return;
      if (attempt >= 6) return;
      const delayMs = Math.min(12000, 1200 + attempt * 1800);
      autoRedeemPendingPurchasesTimeoutRef.current = window.setTimeout(() => {
        void run();
      }, delayMs);
    };
    void run();
    return () => {
      cancelled = true;
      if (autoRedeemPendingPurchasesTimeoutRef.current) {
        window.clearTimeout(autoRedeemPendingPurchasesTimeoutRef.current);
        autoRedeemPendingPurchasesTimeoutRef.current = null;
      }
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

  useEffect(() => {
    const session = params.session;
    if (!session) return;
    if (params.isRedeemingClaim || params.isJoiningPublicCommunity) return;
    if (typeof window !== "undefined") {
      const pathname = String(window.location.pathname ?? "").trim();
      if (pathname.startsWith("/c/")) return;
    }
    const claimToken = readPendingPurchaseClaimToken();
    if (claimToken) return;
    const communitySlug = readPendingPublicJoinCommunitySlug();
    const communityId = readPendingPublicJoinCommunityId();
    if (!communitySlug && !communityId) return;
    void params.joinPublicCommunity({ communitySlug: communitySlug || null, communityId: communityId || undefined });
  }, [params.session, params.isRedeemingClaim, params.isJoiningPublicCommunity]);
}
