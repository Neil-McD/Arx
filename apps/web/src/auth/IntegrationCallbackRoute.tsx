import { useEffect, useRef, useState } from "react";
import { bootstrapSession } from "../auth";
import { bootstrapConvexAuthenticatedClient } from "../../../../shared/convexAuthenticatedClient";
import { completeStoredIntegrationCallback, INTEGRATION_CALLBACK_PATH } from "../../../../shared/integrationCallback";
import { buildLoginTrampolinePath } from "./loginTrampoline";

export function IntegrationCallbackRoute() {
  const [status, setStatus] = useState("verifying");
  const pending = useRef<Promise<string> | null>(null);
  useEffect(() => {
    let alive = true;
    if (!pending.current) pending.current = (async () => {
      let session: Awaited<ReturnType<typeof bootstrapSession>> = null;
      return completeStoredIntegrationCallback(window.sessionStorage,
        async () => { session = await bootstrapSession(); return session; },
        async attempt => {
          if (!session || session.user.id !== attempt.userId) return false;
          const { client } = await bootstrapConvexAuthenticatedClient(session);
          return await client.action("communityIntegrationActions:verifyConnection" as any, {
            communityId: attempt.communityId, generation: attempt.generation, sessionUri: attempt.sessionUri,
          }) as boolean;
        });
    })();
    void pending.current.then(value => { if (alive) setStatus(value); }).catch(() => {if (alive) setStatus("failed");});
    return () => { alive = false; };
  }, []);
  return <main className="modal-overlay"><section className="modal" aria-labelledby="integration-callback-title">
    <div className="modal-header"><h1 className="modal-title" id="integration-callback-title">HubSpot connection</h1></div>
    <div className="modal-body"><p role="status">{status === "verifying" ? "Verifying your connection…" : status === "connected" ? "Connection verified." : status === "signin" ? "Sign in with the same Polynet account to finish connecting." : "This connection could not be verified. Return to Agent and start again."}</p></div>
    <div className="modal-footer resource-modal-actions">{status === "signin" ? <a className="platform-save-button" href={buildLoginTrampolinePath(INTEGRATION_CALLBACK_PATH)}>Sign in</a> : status !== "verifying" && <a className="platform-save-button" href="/">Back to Polynet</a>}</div>
  </section></main>;
}
