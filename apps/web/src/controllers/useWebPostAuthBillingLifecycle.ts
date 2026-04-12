import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { BuilderBillingReturn } from "../../../../shared/builderBilling";
import {
  readPendingPublicJoinCommunityId,
  readPendingPublicJoinCommunitySlug,
  readPendingPurchaseClaimToken,
  storePendingPurchaseClaimToken,
} from "../../../../shared/pay_first";

type SessionLike = {
  user: {
    id: string;
  };
};

type BuilderBillingStatusLike = {
  builder_tier: string;
  max_communities: number;
};

type CommunityLike = {
  id: string;
};

export function useWebPostAuthBillingLifecycle<
  TSession extends SessionLike,
  TBillingStatus extends BuilderBillingStatusLike,
>(params: {
  session: TSession | null;
  sessionRef: MutableRefObject<TSession | null>;
  claimTokenParam: string | null;
  isRedeemingClaim: boolean;
  isJoiningPublicCommunity: boolean;
  builderBillingReturn: BuilderBillingReturn | null;
  builderBillingStatus: TBillingStatus | null;
  communities: CommunityLike[];
  communityRoleById: Record<string, string>;
  lastAutoRedeemPendingPurchasesUserIdRef: MutableRefObject<string | null>;
  autoRedeemPendingPurchasesAttemptRef: MutableRefObject<number>;
  autoRedeemPendingPurchasesTimeoutRef: MutableRefObject<number | null>;
  setBuilderBillingStatus: Dispatch<SetStateAction<TBillingStatus | null>>;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingBuilderBilling: Dispatch<SetStateAction<boolean>>;
  setIsFinalizingBuilderReturn: Dispatch<SetStateAction<boolean>>;
  clearBuilderBillingReturn: () => void;
  getAuthUid: (session: TSession) => string | null;
  redeemPurchaseClaim: (token: string) => Promise<void>;
  redeemPendingPurchases: (args: { navigate: boolean; silentNoop: boolean }) => Promise<number>;
  loadPendingPurchaseClaims: (session: TSession) => Promise<void>;
  loadBuilderBillingStatus: (session: TSession) => Promise<TBillingStatus | null>;
  joinPublicCommunity: (args: { communitySlug: string | null; communityId?: string }) => Promise<void>;
  resumeCreateCommunityIntent: () => void;
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
      params.setBuilderBillingStatus(null);
      params.setBuilderBillingError(null);
      params.setIsLoadingBuilderBilling(false);
      return;
    }
    void params.loadBuilderBillingStatus(session);
  }, [params.session]);

  useEffect(() => {
    if (!params.builderBillingReturn) return;
    const session = params.session;
    if (!session) return;
    if (params.builderBillingReturn.status === "cancel") return;

    let cancelled = false;
    const run = async () => {
      params.setIsFinalizingBuilderReturn(true);
      try {
        const wantsCreate = params.builderBillingReturn?.context === "create_community";
        const maxAttempts = params.builderBillingReturn?.status === "success" ? 30 : wantsCreate ? 10 : 1;
        const ownedCount = params.communities.reduce(
          (acc, community) => acc + (params.communityRoleById[community.id] === "owner" ? 1 : 0),
          0,
        );
        let lastStatus: BuilderBillingStatusLike | null = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (cancelled) return;
          const status = await params.loadBuilderBillingStatus(session);
          lastStatus = status;
          const tier = (status?.builder_tier ?? "free").toLowerCase();
          const max = status?.max_communities ?? 0;
          const hasCapacity = tier === "architect" && max > 0 && ownedCount < max;
          if (tier !== "free" && (!wantsCreate || tier === "architect" && hasCapacity)) break;
          if (params.builderBillingReturn?.status !== "success" && !wantsCreate) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }

        if (cancelled) return;
        if (!wantsCreate) {
          params.clearBuilderBillingReturn();
          return;
        }
        const tier = (lastStatus?.builder_tier ?? params.builderBillingStatus?.builder_tier ?? "free").toLowerCase();
        const max = lastStatus?.max_communities ?? params.builderBillingStatus?.max_communities ?? 0;
        if (tier !== "architect") {
          params.setBuilderBillingError("Architect is required to create a community.");
          params.clearBuilderBillingReturn();
          return;
        }
        if (max > 0 && ownedCount >= max) {
          params.setBuilderBillingError("You've reached your plan limit. Upgrade your plan to create more communities.");
          params.clearBuilderBillingReturn();
          return;
        }
        params.resumeCreateCommunityIntent();
        params.clearBuilderBillingReturn();
      } finally {
        if (!cancelled) params.setIsFinalizingBuilderReturn(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [params.builderBillingReturn, params.session]);

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
