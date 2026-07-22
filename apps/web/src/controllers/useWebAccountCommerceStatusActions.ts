import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveCurrentSession } from "../../../../shared/ensureUsableSession";
import {
  loadAccountCommerceStatusCanonical,
  type AccountCommerceStatus,
} from "../../../../shared/accountCommerceStatusGateway";
import type { AuthSession } from "../auth";

type UseWebAccountCommerceStatusActionsArgs = {
  ensureSession?: () => Promise<AuthSession | null>;
  setIsLoadingAccountCommerce: Dispatch<SetStateAction<boolean>>;
  setAccountCommerceError: Dispatch<SetStateAction<string | null>>;
  setAccountCommerceStatus: Dispatch<SetStateAction<AccountCommerceStatus | null>>;
};

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

export function useWebAccountCommerceStatusActions(
  args: UseWebAccountCommerceStatusActionsArgs,
) {
  const requestIdRef = useRef(0);
  const pendingCountRef = useRef(0);

  const loadAccountCommerceStatus = useCallback(
    async (session: AuthSession): Promise<AccountCommerceStatus | null> => {
      const requestId = ++requestIdRef.current;
      pendingCountRef.current += 1;
      args.setIsLoadingAccountCommerce(true);
      args.setAccountCommerceError((current) =>
        current === "Failed to fetch" ? null : current,
      );
      try {
        const usableSession = await resolveCurrentSession(
          () => session,
          args.ensureSession,
        );
        if (!usableSession) {
          if (requestId === requestIdRef.current) {
            args.setAccountCommerceStatus(null);
          }
          return null;
        }
        const row = await loadAccountCommerceStatusCanonical({
          session: usableSession,
        });
        if (requestId === requestIdRef.current) {
          args.setAccountCommerceStatus(row);
          args.setAccountCommerceError((current) =>
            current === "Failed to fetch" ? null : current,
          );
        }
        return row;
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load billing status.";
        if (!isTransportBillingStatusError(error) && requestId === requestIdRef.current) {
          args.setAccountCommerceError(message);
          args.setAccountCommerceStatus(null);
        } else {
          console.warn("Account commerce status refresh failed:", error);
        }
        return null;
      } finally {
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
        args.setIsLoadingAccountCommerce(pendingCountRef.current > 0);
      }
    },
    [args],
  );

  return { loadAccountCommerceStatus };
}
