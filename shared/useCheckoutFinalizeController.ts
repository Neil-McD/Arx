import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AuthSession } from "./authCore";
import { resolveAuthSubject } from "./authSession";
import { createConvexClient } from "./convexAuthenticatedClient";

export type CheckoutFinalizeStatus = "idle" | "loading" | "pending" | "succeeded" | "error";

export type PaidCommunity = { communityId: string; communitySlug: string | null };

type UseCheckoutFinalizeControllerArgs = {
  checkoutSuccessSessionId: string | null;
  getSession: () => AuthSession | null;
  // Paid and in (Stripe's verified notice made them a member): go there.
  enterCommunity: (community: PaidCommunity) => void;
  setCheckoutStatus: Dispatch<SetStateAction<CheckoutFinalizeStatus>>;
  setCheckoutError: Dispatch<SetStateAction<string | null>>;
  maxPendingAttempts?: number;
};

// Back from Stripe: reads what Stripe's notice recorded until the payment is in
// (the return itself grants nothing), then enters the community.
export function useCheckoutFinalizeController(args: UseCheckoutFinalizeControllerArgs): {
  retryCheckoutFinalize: () => void;
  continueToCommunity: (() => void) | null;
} {
  const [paidCommunity, setPaidCommunity] = useState<PaidCommunity | null>(null);
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
      try {
        const schedulePendingRetry = () => {
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
        };
        const authSubject = resolveAuthSubject(currentArgs.getSession());
        if (!authSubject) {
          schedulePendingRetry();
          return;
        }
        const payload = (await client.query("communityCommerce:finalizeCheckoutSession" as any, {
          authSubject,
          sessionId,
        })) as {
          ok?: boolean;
          status?: string;
          message?: string;
          community_id?: string | null;
          community_slug?: string | null;
        };
        if (cancelled) return;
        if (payload?.status === "pending") {
          schedulePendingRetry();
          return;
        }
        if (payload?.ok === false) {
          throw new Error(typeof payload.message === "string" && payload.message.trim()
            ? payload.message.trim()
            : "Failed to finalize checkout.");
        }

        const communityId = typeof payload?.community_id === "string" ? payload.community_id.trim() : "";
        if (!communityId) throw new Error("Failed to finalize checkout.");
        const community = { communityId, communitySlug: payload?.community_slug ?? null };
        currentArgs.setCheckoutStatus("succeeded");
        setPaidCommunity(community);
        if (pollTimeoutRef.current) {
          window.clearTimeout(pollTimeoutRef.current);
          pollTimeoutRef.current = null;
        }
        currentArgs.enterCommunity(community);
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

  const continueToCommunity = paidCommunity ? () => argsRef.current.enterCommunity(paidCommunity) : null;
  return { retryCheckoutFinalize, continueToCommunity };
}
