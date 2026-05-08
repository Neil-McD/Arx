import { useEffect } from "react";
import type { StripeConnectReturn } from "../../../../shared/accountCommerce";

type SessionLike = {
  user: {
    id: string;
  };
};

export function useWebPostAuthStripeConnectLifecycle<TSession extends SessionLike>(params: {
  session: TSession | null;
  stripeConnectReturn: StripeConnectReturn | null;
  clearStripeConnectReturn: () => void;
  setAccountCommerceError: (value: string | null) => void;
  loadAccountCommerceStatus: (session: TSession) => Promise<unknown>;
  startStripeConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
  }) => Promise<void>;
}) {
  useEffect(() => {
    const session = params.session;
    const connectReturn = params.stripeConnectReturn;
    if (!session || !connectReturn) return;

    let cancelled = false;
    const run = async () => {
      try {
        if (connectReturn.action === "refresh") {
          await params.startStripeConnectOnboarding({
            context: connectReturn.context,
            communitySlug: connectReturn.communitySlug,
          });
          return;
        }
        params.setAccountCommerceError(null);
        await params.loadAccountCommerceStatus(session);
      } finally {
        if (!cancelled) {
          params.clearStripeConnectReturn();
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [params.session, params.stripeConnectReturn]);
}
