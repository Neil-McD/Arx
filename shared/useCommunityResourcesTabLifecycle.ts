import { useEffect } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

export function useCommunityResourcesTabLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  supabaseSession: SessionT | null;
  activeCommunityId: string | null;
  loadCommunityResources: (communityId: string, session: SessionT) => Promise<void>;
  requireCommunityPage?: boolean;
}) {
  useEffect(() => {
    if (!params.supabaseSession || !params.activeCommunityId) return;
    if ((params.requireCommunityPage ?? false) && params.activePage !== "community") return;
    if (params.communityTab !== "resources" && params.communityTab !== "library") return;
    void params.loadCommunityResources(params.activeCommunityId, params.supabaseSession);
  }, [
    params.supabaseSession,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityResources,
    params.requireCommunityPage,
  ]);
}
