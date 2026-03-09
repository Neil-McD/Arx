import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  listPendingPurchaseClaimsRpc,
  redeemPendingPurchaseClaimsRpc,
  redeemPurchaseClaimRpc,
  type PendingPurchaseClaim,
} from "../../../../shared/pay_first";
import type { PendingAuthIntentInput } from "../../../../shared/cloudAuthIntent";
import { loadBuilderBillingStatusCanonical } from "../../../../shared/builderBillingStatusGateway";
import type { CloudSession } from "../cloudAuth";

type BuilderBillingStatus = {
  user_id: string;
  builder_tier: "free" | "builder" | "architect";
  max_communities: number;
  platform_fee_bps: number;
  has_payouts: boolean;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type UseWebCommerceAffiliateActionsArgs = {
  getSession: () => CloudSession | null;
  ensureSession?: () => Promise<CloudSession | null>;
  openAuthGate: (intent: PendingAuthIntentInput) => void;
  openCommunityWorkspace: (communityId: string) => void;
  loadCommunities: (session: CloudSession) => Promise<void>;
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
      const session = (await args.ensureSession?.()) ?? args.getSession();
      if (!session) {
        args.storePendingPurchaseClaimToken(token);
        args.openAuthGate({ reason: "redeem_purchase_claim", payload: { token } });
        return;
      }

      args.setIsRedeemingClaim(true);
      args.setRedeemClaimError(null);
      try {
        const communityId = await redeemPurchaseClaimRpc({
          session,
          token,
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
    async (session: CloudSession): Promise<void> => {
      args.setIsLoadingPendingPurchases(true);
      args.setPendingPurchasesError(null);
      try {
        const usableSession = (await args.ensureSession?.()) ?? session;
        const rows = await listPendingPurchaseClaimsRpc({
          session: usableSession,
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
    async (session: CloudSession): Promise<BuilderBillingStatus | null> => {
      args.setIsLoadingBuilderBilling(true);
      args.setBuilderBillingError(null);
      try {
        const usableSession = (await args.ensureSession?.()) ?? session;
        const row = await loadBuilderBillingStatusCanonical({
          session: usableSession,
        });
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
      const session = (await args.ensureSession?.()) ?? args.getSession();
      if (!session) {
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
          session,
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
