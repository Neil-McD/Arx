import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AuthSession } from "./authCore";
import { createConvexClient } from "./convexAuthenticatedClient";

export type CheckoutFinalizeStatus = "idle" | "loading" | "pending" | "succeeded" | "error";

type UseCheckoutFinalizeControllerArgs = {
  checkoutSuccessSessionId: string | null;
  getSession: () => AuthSession | null;
  redeemPurchaseClaim: (token: string) => Promise<void>;
  persistClaimToken: (token: string) => void;
  setCheckoutStatus: Dispatch<SetStateAction<CheckoutFinalizeStatus>>;
  setCheckoutError: Dispatch<SetStateAction<string | null>>;
  setCheckoutClaimToken: Dispatch<SetStateAction<string | null>>;
  setRedeemClaimError: Dispatch<SetStateAction<string | null>>;
  maxPendingAttempts?: number;
};

export function useCheckoutFinalizeController(args: UseCheckoutFinalizeControllerArgs): {
  retryCheckoutFinalize: () => void;
} {
  const [retryNonce, setRetryNonce] = useState(0);
  const inFlightRef = useRef(false);
  const pollCountRef = useRef(0);
  const pollTimeoutRef = useRef<number | null>(null);
  const lastSessionIdRef = useRef<string | null>(null);
  const argsRef = useRef(args);
  argsRef.current = args;

  const retryCheckoutFinalize = useCallback(() => {
    setRetryNonce((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (args.checkoutSuccessSessionId) return;
    if (pollTimeoutRef.current) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollCountRef.current = 0;
    inFlightRef.current = false;
  }, [args.checkoutSuccessSessionId]);

  useEffect(() => {
    const sessionId = (args.checkoutSuccessSessionId ?? "").trim();
    if (!sessionId) {
      if (args.checkoutSuccessSessionId !== null) {
        args.setCheckoutStatus("error");
        args.setCheckoutError("Missing session_id.");
      }
      return;
    }

    let client: ReturnType<typeof createConvexClient>;
    try {
      client = createConvexClient();
    } catch {
      args.setCheckoutStatus("error");
      args.setCheckoutError("Missing Convex URL.");
      return;
    }

    if (lastSessionIdRef.current !== sessionId) {
      lastSessionIdRef.current = sessionId;
      pollCountRef.current = 0;
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    }

    let cancelled = false;
    const maxAttempts = Math.max(0, args.maxPendingAttempts ?? 20);

    const runAttempt = async () => {
      const currentArgs = argsRef.current;
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      currentArgs.setCheckoutStatus((prev) => (prev === "pending" ? "pending" : "loading"));
      currentArgs.setCheckoutError(null);
      currentArgs.setCheckoutClaimToken(null);
      currentArgs.setRedeemClaimError(null);
      try {
        const payload = (await client.query("billing:finalizeCheckoutSession" as any, {
          sessionId,
        })) as {
          ok?: boolean;
          status?: string;
          claim?: { token?: string };
        };
        if (cancelled) return;
        if (payload?.status === "pending") {
          currentArgs.setCheckoutStatus("pending");
          pollCountRef.current += 1;
          const attempt = pollCountRef.current;
          if (attempt <= maxAttempts) {
            const delayMs = Math.min(8000, 900 + attempt * 450);
            if (pollTimeoutRef.current) {
              window.clearTimeout(pollTimeoutRef.current);
            }
            pollTimeoutRef.current = window.setTimeout(() => {
              if (cancelled) return;
              void runAttempt();
            }, delayMs);
          }
          return;
        }

        const token = typeof payload?.claim?.token === "string" ? payload.claim.token.trim() : "";
        if (!token) throw new Error("Missing claim token.");

        currentArgs.setCheckoutStatus("succeeded");
        currentArgs.setCheckoutClaimToken(token);
        if (pollTimeoutRef.current) {
          window.clearTimeout(pollTimeoutRef.current);
          pollTimeoutRef.current = null;
        }
        currentArgs.persistClaimToken(token);
        if (currentArgs.getSession()) {
          await currentArgs.redeemPurchaseClaim(token);
        }
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to finalize checkout.";
        currentArgs.setCheckoutStatus("error");
        currentArgs.setCheckoutError(message);
      } finally {
        inFlightRef.current = false;
      }
    };

    void runAttempt();
    return () => {
      cancelled = true;
    };
  }, [args.checkoutSuccessSessionId, args.maxPendingAttempts, retryNonce]);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  return { retryCheckoutFinalize };
}
