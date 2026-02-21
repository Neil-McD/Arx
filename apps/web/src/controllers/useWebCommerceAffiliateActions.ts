import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  listPendingPurchaseClaimsRpc,
  redeemPendingPurchaseClaimsRpc,
  redeemPurchaseClaimRpc,
  type PendingPurchaseClaim,
} from "../../../../shared/pay_first";
import type { PendingAuthIntentInput } from "../../../../shared/supabaseAuthIntent";
import type { SupabaseSession } from "../supabase";

type BuilderBillingStatus = {
  user_id: string;
  builder_tier: "free" | "builder" | "architect" | "pro";
  max_communities: number;
  platform_fee_bps: number;
  has_payouts: boolean;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type ProductState = {
  user_id: string;
  auth_state: string;
  builder_tier: string;
  builder_plan_code: string;
  builder_plan_price_usd: number;
  is_builder_paid: boolean;
  max_communities: number;
  platform_fee_bps: number;
  has_payouts: boolean;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  ai_history_bytes_used: number | string;
  ai_history_bytes_cap: number | string;
  platform_inference_standard_used: number | string;
  platform_inference_standard_cap: number;
};

type UseWebCommerceAffiliateActionsArgs = {
  getSession: () => SupabaseSession | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SupabaseSession) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  openAuthGate: (intent: PendingAuthIntentInput) => void;
  openCommunityWorkspace: (communityId: string) => void;
  loadCommunities: (session: SupabaseSession) => Promise<void>;
  clearPendingPurchaseClaimToken: () => void;
  storePendingPurchaseClaimToken: (token: string) => void;
  setCheckoutClaimToken: Dispatch<SetStateAction<string | null>>;
  setCheckoutStatus: Dispatch<SetStateAction<"idle" | "loading" | "pending" | "succeeded" | "error">>;
  setIsRedeemingClaim: Dispatch<SetStateAction<boolean>>;
  setRedeemClaimError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingPendingPurchases: Dispatch<SetStateAction<boolean>>;
  setPendingPurchasesError: Dispatch<SetStateAction<string | null>>;
  setPendingPurchaseClaims: Dispatch<SetStateAction<PendingPurchaseClaim[]>>;
  setIsRedeemingPendingPurchases: Dispatch<SetStateAction<boolean>>;
  setPendingPurchasesSuccess: Dispatch<SetStateAction<string | null>>;
  setIsLoadingBuilderBilling: Dispatch<SetStateAction<boolean>>;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setBuilderBillingStatus: Dispatch<SetStateAction<BuilderBillingStatus | null>>;
  redeemPendingPurchasesInFlightRef: { current: boolean };
};

export function useWebCommerceAffiliateActions(args: UseWebCommerceAffiliateActionsArgs) {
  const redeemPurchaseClaim = useCallback(
    async (token: string): Promise<void> => {
      const session = args.getSession();
      const url = session ? args.getSupabaseUrl() : null;
      if (!session || !url) {
        args.storePendingPurchaseClaimToken(token);
        args.openAuthGate({ reason: "redeem_purchase_claim", payload: { token } });
        return;
      }

      args.setIsRedeemingClaim(true);
      args.setRedeemClaimError(null);
      try {
        const communityId = await redeemPurchaseClaimRpc({
          url,
          session,
          token,
          fetchWithSupabaseAuth: args.fetchWithSupabaseAuth,
          readSupabaseError: args.readSupabaseError,
        });
        args.clearPendingPurchaseClaimToken();
        args.setCheckoutClaimToken(null);
        args.setCheckoutStatus("idle");

        args.openCommunityWorkspace(communityId);
        await args.loadCommunities(session);
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to redeem.";
        args.setRedeemClaimError(message);
      } finally {
        args.setIsRedeemingClaim(false);
      }
    },
    [args],
  );

  const loadPendingPurchaseClaims = useCallback(
    async (session: SupabaseSession): Promise<void> => {
      const url = args.getSupabaseUrl();
      if (!url) return;
      args.setIsLoadingPendingPurchases(true);
      args.setPendingPurchasesError(null);
      try {
        const rows = await listPendingPurchaseClaimsRpc({
          url,
          session,
          fetchWithSupabaseAuth: args.fetchWithSupabaseAuth,
          readSupabaseError: args.readSupabaseError,
        });
        args.setPendingPurchaseClaims(rows);
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load pending purchases.";
        args.setPendingPurchasesError(message);
        args.setPendingPurchaseClaims([]);
      } finally {
        args.setIsLoadingPendingPurchases(false);
      }
    },
    [args],
  );

  const loadBuilderBillingStatus = useCallback(
    async (session: SupabaseSession): Promise<BuilderBillingStatus | null> => {
      const url = args.getSupabaseUrl();
      if (!url) return null;
      args.setIsLoadingBuilderBilling(true);
      args.setBuilderBillingError(null);
      try {
        const response = await args.fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/get_my_product_state`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
          session,
        );
        if (!response.ok) throw new Error(await args.readSupabaseError(response));
        const rows = (await response.json()) as ProductState[];
        const product = rows[0] ?? null;
        const row: BuilderBillingStatus | null = product
          ? {
              user_id: product.user_id,
              builder_tier:
                product.builder_tier === "builder" || product.builder_tier === "pro" || product.builder_tier === "architect"
                  ? product.builder_tier
                  : "free",
              max_communities: Number(product.max_communities ?? 0),
              platform_fee_bps: Number(product.platform_fee_bps ?? 0),
              has_payouts: Boolean(product.has_payouts),
              subscription_status: product.subscription_status ?? null,
              current_period_end: product.current_period_end ?? null,
              cancel_at_period_end:
                product.cancel_at_period_end === null || product.cancel_at_period_end === undefined
                  ? null
                  : Boolean(product.cancel_at_period_end),
            }
          : null;
        args.setBuilderBillingStatus(row);
        return row;
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load billing status.";
        args.setBuilderBillingError(message);
        args.setBuilderBillingStatus(null);
        return null;
      } finally {
        args.setIsLoadingBuilderBilling(false);
      }
    },
    [args],
  );

  const redeemPendingPurchases = useCallback(
    async (opts?: { navigate?: boolean; silentNoop?: boolean }): Promise<number> => {
      const session = args.getSession();
      const url = session ? args.getSupabaseUrl() : null;
      if (!session || !url) {
        args.openAuthGate({
          reason: "redeem_pending_purchases",
          payload: { navigate: opts?.navigate !== false, silent_noop: Boolean(opts?.silentNoop) },
        });
        return 0;
      }

      if (args.redeemPendingPurchasesInFlightRef.current) return 0;
      args.redeemPendingPurchasesInFlightRef.current = true;
      args.setIsRedeemingPendingPurchases(true);
      args.setPendingPurchasesError(null);
      args.setPendingPurchasesSuccess(null);
      try {
        const rows = await redeemPendingPurchaseClaimsRpc({
          url,
          session,
          fetchWithSupabaseAuth: args.fetchWithSupabaseAuth,
          readSupabaseError: args.readSupabaseError,
        });
        const claimedCommunityId = rows[0]?.community_id;
        if (rows.length === 0) {
          if (!opts?.silentNoop) {
            args.setPendingPurchasesSuccess("No pending purchases found.");
          }
          args.setPendingPurchaseClaims([]);
          return 0;
        }

        args.setPendingPurchasesSuccess(rows.length === 1 ? "Claimed access." : `Claimed ${rows.length} communities.`);
        await args.loadCommunities(session);
        args.setPendingPurchaseClaims([]);

        if (claimedCommunityId && opts?.navigate !== false) {
          args.openCommunityWorkspace(claimedCommunityId);
        }
        return rows.length;
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to claim access.";
        args.setPendingPurchasesError(message);
        return 0;
      } finally {
        args.setIsRedeemingPendingPurchases(false);
        args.redeemPendingPurchasesInFlightRef.current = false;
      }
    },
    [args],
  );

  return {
    redeemPurchaseClaim,
    loadPendingPurchaseClaims,
    loadBuilderBillingStatus,
    redeemPendingPurchases,
  };
}
