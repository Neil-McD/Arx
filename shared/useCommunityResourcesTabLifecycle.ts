import { useEffect } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

export function useCommunityResourcesTabLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  loadCommunityResources: (communityId: string, session: SessionT) => Promise<void>;
  requireCommunityPage?: boolean;
  shouldLoad?: boolean;
}) {
  useEffect(() => {
    if (!params.session || !params.activeCommunityId) return;
    if (!params.shouldLoad) {
      if ((params.requireCommunityPage ?? false) && params.activePage !== "community") return;
      if (params.communityTab !== "resources") return;
    }
    void params.loadCommunityResources(params.activeCommunityId, params.session);
  }, [
    params.session,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityResources,
    params.requireCommunityPage,
    params.shouldLoad,
  ]);
}
