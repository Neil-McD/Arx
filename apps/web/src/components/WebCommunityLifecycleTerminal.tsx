import { useEffect, useRef, useState } from "react";

import {
  getCloudMyCommunityLifecycleManagementBySlug,
} from "../../../../shared/cloudCommunityLifecycleGateway";
import type {
  CommunityArchiveOperationState,
  CommunityLifecycleManagementRow,
} from "../../../../shared/communityLifecycleManagement";
import type { AuthSession } from "../auth";
import type { InactiveCommunityRoute } from "../controllers/useWebCommunityRouteResolution";

export type WebCommunityLifecycleTerminalProps = {
  route: InactiveCommunityRoute;
  session: AuthSession | null;
  ensureSession: (
    session?: AuthSession | null,
  ) => Promise<AuthSession | null>;
  onOpenAccountSettings: () => void;
};

function terminalCopy(
  status: "archiving" | "archived",
  operationState?: CommunityArchiveOperationState,
) {
  if (status === "archived") {
    return {
      title: "Community archived",
      body: "This community is dormant. Its content is preserved, but access, usage, and billing activity are stopped.",
    };
  }
  if (operationState === "failed") {
    return {
      title: "Community archive needs attention",
      body: "The community remains closed while the archive operation is reviewed.",
    };
  }
  return {
    title: "Community is being archived",
    body: "Content and member activity are unavailable while the archive operation finishes.",
  };
}

export function WebCommunityLifecycleTerminal(
  props: WebCommunityLifecycleTerminalProps,
) {
  const [management, setManagement] =
    useState<CommunityLifecycleManagementRow | null>(null);
  const [isLoading, setIsLoading] = useState(props.route.isOwner);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    setManagement(null);
    setLoadError(null);
    if (!props.route.isOwner) {
      setIsLoading(false);
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setIsLoading(true);
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        if (!session) throw new Error("community_lifecycle_session_required");
        const row = await getCloudMyCommunityLifecycleManagementBySlug({
          session,
          communitySlug: props.route.slug,
        });
        if (requestRef.current !== request) return;
        setManagement(row);
        setLoadError(row ? null : "Lifecycle status is unavailable right now.");
      } catch {
        if (requestRef.current !== request) return;
        setLoadError("Lifecycle status is unavailable right now.");
      } finally {
        if (requestRef.current === request) setIsLoading(false);
      }
    })();
    return () => {
      if (requestRef.current === request) requestRef.current += 1;
    };
  }, [
    props.ensureSession,
    props.route.isOwner,
    props.route.lifecycleStatus,
    props.route.slug,
    props.session,
  ]);

  const visibleManagement =
    management?.slug === props.route.slug ? management : null;
  const status =
    props.route.lifecycleStatus === "archived" ||
    visibleManagement?.lifecycle_status === "archived"
      ? "archived"
      : "archiving";
  const copy = terminalCopy(status, visibleManagement?.operation?.state);

  return (
    <div className="community-body community-lifecycle-terminal-body">
      <section className="community-lifecycle-terminal" aria-live="polite">
        <div className="community-lifecycle-terminal-eyebrow">
          {visibleManagement?.name ?? "Community"}
        </div>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>

        {props.route.isOwner ? (
          <div className="community-lifecycle-terminal-owner-status">
            {isLoading ? (
              <span>Checking archive status…</span>
            ) : loadError ? (
              <span>{loadError}</span>
            ) : visibleManagement?.operation?.state === "failed" ? (
              <span>
                Archive processing is paused. Reference {visibleManagement.operation.operation_id}.
              </span>
            ) : visibleManagement?.operation?.state === "processing" ? (
              <span>Archive processing is in progress.</span>
            ) : visibleManagement?.operation?.state === "requested" ? (
              <span>The archive operation is queued.</span>
            ) : status === "archived" ? (
              <span>The archive operation is complete.</span>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className="secondary community-lifecycle-terminal-action"
          onClick={props.onOpenAccountSettings}
        >
          Account settings
        </button>
      </section>
    </div>
  );
}
