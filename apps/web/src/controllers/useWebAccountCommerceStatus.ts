import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveCurrentSession } from "../../../../shared/ensureUsableSession";
import {
  loadAccountCommerceStatusCanonical,
  type AccountCommerceStatus,
} from "../../../../shared/accountCommerceStatusGateway";
import type { AuthSession } from "../auth";

type UseWebAccountCommerceStatusArgs = {
  ensureSession?: () => Promise<AuthSession | null>;
  setIsLoadingAccountCommerce: Dispatch<SetStateAction<boolean>>;
  setAccountCommerceError: Dispatch<SetStateAction<string | null>>;
  setAccountCommerceStatus: Dispatch<SetStateAction<AccountCommerceStatus | null>>;
};

// The signed-in account's billing status (tier, connected payouts), loaded on
// sign-in and after billing changes.
export function useWebAccountCommerceStatus(args: UseWebAccountCommerceStatusArgs) {
  const accountCommerceLoadRequestIdRef = useRef(0);
  const accountCommerceLoadPendingCountRef = useRef(0);

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

  const loadAccountCommerceStatus = useCallback(
    async (session: AuthSession): Promise<AccountCommerceStatus | null> => {
      const requestId = ++accountCommerceLoadRequestIdRef.current;
      accountCommerceLoadPendingCountRef.current += 1;
      args.setIsLoadingAccountCommerce(true);
      args.setAccountCommerceError((prev) => (prev === "Failed to fetch" ? null : prev));
      try {
        const usableSession = await resolveCurrentSession(() => session, args.ensureSession);
        if (!usableSession) {
          if (requestId === accountCommerceLoadRequestIdRef.current) {
            args.setAccountCommerceStatus(null);
          }
          return null;
        }
        const row = await loadAccountCommerceStatusCanonical({
          session: usableSession,
        });
        if (requestId === accountCommerceLoadRequestIdRef.current) {
          args.setAccountCommerceStatus(row);
          args.setAccountCommerceError((prev) => (prev === "Failed to fetch" ? null : prev));
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
        if (!isTransportBillingStatusError(error) && requestId === accountCommerceLoadRequestIdRef.current) {
          args.setAccountCommerceError(message);
          args.setAccountCommerceStatus(null);
        } else {
          console.warn("Account commerce status refresh failed:", error);
        }
        return null;
      } finally {
        accountCommerceLoadPendingCountRef.current = Math.max(
          0,
          accountCommerceLoadPendingCountRef.current - 1,
        );
        args.setIsLoadingAccountCommerce(accountCommerceLoadPendingCountRef.current > 0);
      }
    },
    [args],
  );

  return { loadAccountCommerceStatus };
}
