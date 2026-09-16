import { useMemo, useRef } from "react";
import type { AuthSession } from "../auth";
import { bootstrapConvexAuthenticatedClient } from "../../../../shared/convexAuthenticatedClient";
import { INTEGRATION_ATTEMPT_KEY } from "../../../../shared/integrationCallback";

import type { IntegrationView } from "../../../../shared/communityIntegrationStatus";
export type { IntegrationView } from "../../../../shared/communityIntegrationStatus";
export type IntegrationGateway = {
  scopeKey: string;
  load: () => Promise<IntegrationView>;
  enable: (enabled: boolean) => Promise<void>;
  connect: () => Promise<{
    available: boolean;
    authorizationUrl?: string | null;
  }>;
  disconnect: () => Promise<unknown>;
};
export function useWebCommunityIntegrationGateway(params: {
  communityId: string | null;
  session: AuthSession | null;
  ensureSession: (
    session?: AuthSession | null,
    source?: string,
  ) => Promise<AuthSession | null>;
}): IntegrationGateway | undefined {
  const current = useRef(params);
  current.current = params;
  return useMemo(() => {
    const { communityId, session } = params;
    if (!communityId || !session) return undefined;
    const run = async <T>(fn: (client: any) => Promise<T>): Promise<T> => {
      const valid = () =>
        current.current.communityId === communityId &&
        current.current.session?.user.id === session.user.id;
      if (!valid()) throw new Error("integration_scope_changed");
      const ready = await params.ensureSession(
        session,
        "community_integration",
      );
      if (!ready || ready.user.id !== session.user.id || !valid())
        throw new Error("integration_scope_changed");
      const { client } = await bootstrapConvexAuthenticatedClient(ready);
      if (!valid()) throw new Error("integration_scope_changed");
      const result = await fn(client);
      if (!valid()) throw new Error("integration_scope_changed");
      return result;
    };
    return {
      scopeKey: `${communityId}:${session.user.id}`,
      load: () =>
        run(client => client.query("communityIntegrationConnections:connectionStatus", { communityId })),
      enable: async (enabled) => {
        await run(client => client.mutation("communityIntegrationConnections:setPilotEnabled", { communityId, enabled }));
      },
      connect: async () => {
        const result: any = await run(client => client.action("communityIntegrationActions:requestConnection", { communityId }));
        if (result.authorizationUrl) {
          if (!Number.isSafeInteger(result.generation) || result.generation < 1 || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) throw new Error("integration_attempt_invalid");
          window.sessionStorage.setItem(INTEGRATION_ATTEMPT_KEY, JSON.stringify({communityId, userId: session.user.id, generation: result.generation, expiresAt: result.expiresAt}));
        }
        return result;
      },
      disconnect: () =>
        run((client) =>
          client.action("communityIntegrationActions:disconnect", {
            communityId,
          }),
        ),
    };
  }, [params.communityId, params.session, params.ensureSession]);
}
