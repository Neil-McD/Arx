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

type CreateCommunityDraftLike = {
  user_id?: string | null;
};

export function useWebPostAuthBillingLifecycle<TSession extends SessionLike>(params: {
  supabaseSession: TSession | null;
  sessionRef: MutableRefObject<TSession | null>;
  claimTokenParam: string | null;
  isRedeemingClaim: boolean;
  isJoiningPublicCommunity: boolean;
  builderBillingReturn: BuilderBillingReturn | null;
  builderBillingStatus: BuilderBillingStatusLike | null;
  isFinalizingCreateCommunityFromBilling: boolean;
  communities: CommunityLike[];
  communityRoleById: Record<string, string>;
  lastAutoRedeemPendingPurchasesUserIdRef: MutableRefObject<string | null>;
  autoRedeemPendingPurchasesAttemptRef: MutableRefObject<number>;
  autoRedeemPendingPurchasesTimeoutRef: MutableRefObject<number | null>;
  setBuilderBillingStatus: Dispatch<SetStateAction<BuilderBillingStatusLike | null>>;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingBuilderBilling: Dispatch<SetStateAction<boolean>>;
  setFinalizeCreateCommunityError: Dispatch<SetStateAction<string | null>>;
  setIsFinalizingBuilderReturn: Dispatch<SetStateAction<boolean>>;
  getSupabaseAuthUid: (session: TSession) => string | null;
  redeemPurchaseClaim: (token: string) => Promise<void>;
  redeemPendingPurchases: (args: { navigate: boolean; silentNoop: boolean }) => Promise<number>;
  loadPendingPurchaseClaims: (session: TSession) => Promise<void>;
  loadBuilderBillingStatus: (session: TSession) => Promise<BuilderBillingStatusLike | null>;
  joinPublicCommunity: (args: { communitySlug: string | null; communityId?: string }) => Promise<void>;
  loadCreateCommunityDraft: () => CreateCommunityDraftLike | null;
  createCommunityFromDraft: (draft: CreateCommunityDraftLike, session: TSession) => Promise<void>;
}) {
  useEffect(() => {
    const token = (params.claimTokenParam ?? "").trim();
    if (!token) return;
    storePendingPurchaseClaimToken(token);
    if (!params.sessionRef.current) return;
    void params.redeemPurchaseClaim(token);
  }, [params.claimTokenParam]);

  useEffect(() => {
    if (!params.supabaseSession) return;
    const token = readPendingPurchaseClaimToken();
    if (!token) return;
    if (params.isRedeemingClaim) return;
    void params.redeemPurchaseClaim(token);
  }, [params.supabaseSession]);

  useEffect(() => {
    if (!params.supabaseSession) return;
    void params.loadPendingPurchaseClaims(params.supabaseSession);
  }, [params.supabaseSession]);

  useEffect(() => {
    if (!params.supabaseSession) {
      params.lastAutoRedeemPendingPurchasesUserIdRef.current = null;
      params.autoRedeemPendingPurchasesAttemptRef.current = 0;
      if (params.autoRedeemPendingPurchasesTimeoutRef.current) {
        window.clearTimeout(params.autoRedeemPendingPurchasesTimeoutRef.current);
        params.autoRedeemPendingPurchasesTimeoutRef.current = null;
      }
      return;
    }

    const userId = params.getSupabaseAuthUid(params.supabaseSession);
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
  }, [params.supabaseSession]);

  useEffect(() => {
    if (!params.supabaseSession) {
      params.setBuilderBillingStatus(null);
      params.setBuilderBillingError(null);
      params.setIsLoadingBuilderBilling(false);
      return;
    }
    void params.loadBuilderBillingStatus(params.supabaseSession);
  }, [params.supabaseSession]);

  useEffect(() => {
    if (!params.builderBillingReturn) return;
    if (!params.supabaseSession) return;
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
          const status = await params.loadBuilderBillingStatus(params.supabaseSession);
          lastStatus = status;
          const tier = (status?.builder_tier ?? "free").toLowerCase();
          const max = status?.max_communities ?? 0;
          const hasCapacity = tier !== "free" && max > 0 && ownedCount < max;
          if (tier !== "free" && (!wantsCreate || hasCapacity)) break;
          if (params.builderBillingReturn?.status !== "success" && !wantsCreate) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }

        if (cancelled) return;
        if (!wantsCreate) return;
        if (params.builderBillingReturn?.source === "desktop") return;
        if (params.isFinalizingCreateCommunityFromBilling) return;

        const draft = params.loadCreateCommunityDraft();
        if (!draft) {
          params.setFinalizeCreateCommunityError("Draft not found. Re-open Create community to continue.");
          return;
        }
        if (draft.user_id && draft.user_id !== params.supabaseSession.user.id) {
          params.setFinalizeCreateCommunityError("Draft belongs to a different account. Re-open Create community to continue.");
          return;
        }
        const tier = (lastStatus?.builder_tier ?? params.builderBillingStatus?.builder_tier ?? "free").toLowerCase();
        const max = lastStatus?.max_communities ?? params.builderBillingStatus?.max_communities ?? 0;
        if (tier === "free") {
          params.setFinalizeCreateCommunityError("Still finalizing your plan. Wait a moment and try again.");
          return;
        }
        if (max > 0 && ownedCount >= max) {
          params.setFinalizeCreateCommunityError("You've reached your plan limit. Upgrade your plan to create more communities.");
          return;
        }
        await params.createCommunityFromDraft(draft, params.supabaseSession);
      } finally {
        if (!cancelled) params.setIsFinalizingBuilderReturn(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [params.builderBillingReturn, params.supabaseSession]);

  useEffect(() => {
    if (!params.supabaseSession) return;
    if (params.isRedeemingClaim || params.isJoiningPublicCommunity) return;
    const claimToken = readPendingPurchaseClaimToken();
    if (claimToken) return;
    const communitySlug = readPendingPublicJoinCommunitySlug();
    const communityId = readPendingPublicJoinCommunityId();
    if (!communitySlug && !communityId) return;
    void params.joinPublicCommunity({ communitySlug: communitySlug || null, communityId: communityId || undefined });
  }, [params.supabaseSession, params.isRedeemingClaim, params.isJoiningPublicCommunity]);
}
