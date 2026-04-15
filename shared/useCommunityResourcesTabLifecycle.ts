import { useEffect, useRef } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

export function useCommunityResourcesTabLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  loadCommunityResources: (communityId: string, session: SessionT) => Promise<void>;
  requireCommunityPage?: boolean;
  shouldPreload?: boolean;
}) {
  const backgroundPreloadedCommunityIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!params.session || !params.activeCommunityId) return;
    if ((params.requireCommunityPage ?? false) && params.activePage !== "community") return;
    const shouldForceLoad = params.communityTab === "resources";
    if (!shouldForceLoad && !params.shouldPreload) return;
    if (!shouldForceLoad && backgroundPreloadedCommunityIdRef.current === params.activeCommunityId) return;
    if (!shouldForceLoad) {
      backgroundPreloadedCommunityIdRef.current = params.activeCommunityId;
    }
    void params.loadCommunityResources(params.activeCommunityId, params.session);
  }, [
    params.session,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityResources,
    params.requireCommunityPage,
    params.shouldPreload,
  ]);

  useEffect(() => {
    if ((params.requireCommunityPage ?? false) && params.activePage === "community") return;
    backgroundPreloadedCommunityIdRef.current = null;
  }, [params.activePage, params.requireCommunityPage]);
}
