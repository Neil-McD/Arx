import { useEffect, useRef } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";
import { resolveAuthPresentationIdentity, type AuthSessionLike } from "./authSession";
import type { CommunityEventsRange } from "./useCommunityEventsController";

export function useCommunityEventsTabLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  range: CommunityEventsRange;
  loadCommunityEvents: (communityId: string, session: SessionT, range: CommunityEventsRange) => Promise<void>;
  requireCommunityPage?: boolean;
  shouldLoad?: boolean;
}) {
  const sessionRef = useRef(params.session);
  sessionRef.current = params.session;
  const sessionIdentity = resolveAuthPresentationIdentity(
    params.session as AuthSessionLike,
  );

  useEffect(() => {
    if (!sessionIdentity || !params.activeCommunityId) return;
    if (!params.shouldLoad) {
      if ((params.requireCommunityPage ?? false) && params.activePage !== "community") return;
      if (params.communityTab !== "events") return;
    }
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    void params.loadCommunityEvents(params.activeCommunityId, currentSession, params.range);
  }, [
    sessionIdentity,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityEvents,
    params.range,
    params.requireCommunityPage,
    params.shouldLoad,
  ]);
}
