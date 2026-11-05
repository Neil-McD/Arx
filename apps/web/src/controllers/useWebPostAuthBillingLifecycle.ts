import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  readPendingPublicJoinCommunityId,
  readPendingPublicJoinCommunitySlug,
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
  checkoutSuccessSessionId: string | null;
  isJoiningPublicCommunity: boolean;
  setAccountCommerceStatus: Dispatch<SetStateAction<TBillingStatus | null>>;
  setAccountCommerceError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingAccountCommerce: Dispatch<SetStateAction<boolean>>;
  loadAccountCommerceStatus: (session: TSession) => Promise<TBillingStatus | null>;
  joinPublicCommunity: (args: { communitySlug: string | null; communityId?: string }) => Promise<unknown>;
}) {
  useEffect(() => {
    if (params.checkoutSuccessSessionId) {
      scrubCurrentRouteSearchParams(["session_id"]);
    }
  }, [params.checkoutSuccessSessionId]);

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
    if (params.isJoiningPublicCommunity) return;
    if (typeof window !== "undefined") {
      const pathname = String(window.location.pathname ?? "").trim();
      if (pathname.startsWith("/c/")) return;
    }
    const communitySlug = readPendingPublicJoinCommunitySlug();
    const communityId = readPendingPublicJoinCommunityId();
    if (!communitySlug && !communityId) return;
    void params.joinPublicCommunity({ communitySlug: communitySlug || null, communityId: communityId || undefined });
  }, [params.session, params.isJoiningPublicCommunity]);
}
