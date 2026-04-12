import { useEffect } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";

export function useWebDiscoverPreloadLifecycle(params: {
  activePage: AppPage;
  discoverCommunitiesCount: number;
  loadDiscoverCommunities: () => Promise<void>;
}) {
  useEffect(() => {
    if (params.activePage !== "discover") return;
    if (params.discoverCommunitiesCount > 0) return;
    void params.loadDiscoverCommunities();
  }, [params.activePage, params.discoverCommunitiesCount, params.loadDiscoverCommunities]);
}
