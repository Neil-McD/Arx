import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveCurrentSession } from "../../../../shared/ensureUsableSession";
import {
  listPendingPurchaseClaimsRpc,
  redeemPendingPurchaseClaimsRpc,
  redeemPurchaseClaimRpc,
  type PendingPurchaseClaim,
} from "../../../../shared/pay_first";
import type { PendingAuthIntentInput } from "../../../../shared/authResumeState";
import {
  loadBuilderBillingStatusCanonical,
  type BuilderBillingStatus,
} from "../../../../shared/builderBillingStatusGateway";
import type { AuthSession } from "../auth";

type UseWebCommerceAffiliateActionsArgs = {
  getSession: () => AuthSession | null;
  ensureSession?: () => Promise<AuthSession | null>;
  requireSignIn: (intent: PendingAuthIntentInput) => void;
  openCommunityWorkspace: (opts: { communityId: string; communitySlug?: string | null }) => void;
  loadCommunities: (session: AuthSession) => Promise<void>;
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
  const builderBillingLoadRequestIdRef = useRef(0);
  const builderBillingLoadPendingCountRef = useRef(0);

  function isTransportBillingStatusError(error: unknown): boolean {
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : String(error ?? "");
    const normalized = message.trim().toLowerCase();
    return (
      normalized === "failed to fetch" ||
      normalized.includes("networkerror") ||
      normalized.includes("network error") ||
      normalized.includes("load failed") ||
      normalized.includes("fetch failed")
    );
  }

  const redeemPurchaseClaim = useCallback(
    async (token: string): Promise<void> => {
      const session = await resolveCurrentSession(args.getSession, args.ensureSession);
      if (!session) {
        args.storePendingPurchaseClaimToken(token);
        args.requireSignIn({ reason: "redeem_purchase_claim", payload: { token } });
        return;
      }

      args.setIsRedeemingClaim(true);
      args.setRedeemClaimError(null);
      try {
        const claim = await redeemPurchaseClaimRpc({
          session,
          token,
        });
        args.clearPendingPurchaseClaimToken();
        args.setCheckoutClaimToken(null);
        args.setCheckoutStatus("idle");

        args.openCommunityWorkspace({
          communityId: claim.community_id,
          communitySlug: claim.community_slug ?? null,
        });
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
    async (session: AuthSession): Promise<void> => {
      args.setIsLoadingPendingPurchases(true);
      args.setPendingPurchasesError(null);
      try {
        const usableSession = await resolveCurrentSession(() => session, args.ensureSession);
        if (!usableSession) {
          args.setPendingPurchaseClaims([]);
          return;
        }
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
    async (session: AuthSession): Promise<BuilderBillingStatus | null> => {
      const requestId = ++builderBillingLoadRequestIdRef.current;
      builderBillingLoadPendingCountRef.current += 1;
      args.setIsLoadingBuilderBilling(true);
      args.setBuilderBillingError((prev) => (prev === "Failed to fetch" ? null : prev));
      try {
        const usableSession = await resolveCurrentSession(() => session, args.ensureSession);
        if (!usableSession) {
          if (requestId === builderBillingLoadRequestIdRef.current) {
            args.setBuilderBillingStatus(null);
          }
          return null;
        }
        const row = await loadBuilderBillingStatusCanonical({
          session: usableSession,
        });
        if (requestId === builderBillingLoadRequestIdRef.current) {
          args.setBuilderBillingStatus(row);
          args.setBuilderBillingError((prev) => (prev === "Failed to fetch" ? null : prev));
        }
        return row;
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load billing status.";

        // Background billing refresh should not nuke working UI state or leak raw transport noise.
        if (!isTransportBillingStatusError(error) && requestId === builderBillingLoadRequestIdRef.current) {
          args.setBuilderBillingError(message);
          args.setBuilderBillingStatus(null);
        } else {
          console.warn("Builder billing status refresh failed:", error);
        }
        return null;
      } finally {
        builderBillingLoadPendingCountRef.current = Math.max(
          0,
          builderBillingLoadPendingCountRef.current - 1,
        );
        args.setIsLoadingBuilderBilling(builderBillingLoadPendingCountRef.current > 0);
      }
    },
    [args],
  );

  const redeemPendingPurchases = useCallback(
    async (opts?: { navigate?: boolean; silentNoop?: boolean }): Promise<number> => {
      const session = await resolveCurrentSession(args.getSession, args.ensureSession);
      if (!session) {
        args.requireSignIn({
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
        const claimedCommunity = rows[0] ?? null;
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

        if (claimedCommunity && opts?.navigate !== false) {
          args.openCommunityWorkspace({
            communityId: claimedCommunity.community_id,
            communitySlug: claimedCommunity.community_slug ?? null,
          });
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
