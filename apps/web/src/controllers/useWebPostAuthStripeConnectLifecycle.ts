import { useEffect } from "react";
import type { BuilderConnectReturn } from "../../../../shared/builderBilling";

type SessionLike = {
  user: {
    id: string;
  };
};

export function useWebPostAuthStripeConnectLifecycle<TSession extends SessionLike>(params: {
  session: TSession | null;
  builderConnectReturn: BuilderConnectReturn | null;
  clearBuilderConnectReturn: () => void;
  setBuilderBillingError: (value: string | null) => void;
  loadBuilderBillingStatus: (session: TSession) => Promise<unknown>;
  startBuilderConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
  }) => Promise<void>;
}) {
  useEffect(() => {
    const session = params.session;
    const connectReturn = params.builderConnectReturn;
    if (!session || !connectReturn) return;

    let cancelled = false;
    const run = async () => {
      try {
        if (connectReturn.action === "refresh") {
          await params.startBuilderConnectOnboarding({
            context: connectReturn.context,
            communitySlug: connectReturn.communitySlug,
          });
          return;
        }
        params.setBuilderBillingError(null);
        await params.loadBuilderBillingStatus(session);
      } finally {
        if (!cancelled) {
          params.clearBuilderConnectReturn();
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [params.session, params.builderConnectReturn]);
}
