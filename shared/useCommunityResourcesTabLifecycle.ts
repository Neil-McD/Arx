import { useEffect, useRef } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";
import { resolveAuthPresentationIdentity, type AuthSessionLike } from "./authSession";

export function useCommunityResourcesTabLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  loadCommunityResources: (communityId: string, session: SessionT) => Promise<void>;
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
      if (params.communityTab !== "resources") return;
    }
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    void params.loadCommunityResources(params.activeCommunityId, currentSession);
  }, [
    sessionIdentity,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityResources,
    params.requireCommunityPage,
    params.shouldLoad,
  ]);
}
