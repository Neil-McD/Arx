import { useEffect } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";

const DISCOVER_STALE_WINDOW_MS = 60_000;

export function useWebDiscoverPreloadLifecycle(params: {
  activePage: AppPage;
  isLoadingDiscover: boolean;
  lastDiscoverLoadAttemptedAt: number;
  loadDiscoverCommunities: () => Promise<void>;
}) {
  useEffect(() => {
    if (params.activePage !== "discover") return;
    if (params.isLoadingDiscover) return;
    const isStale =
      params.lastDiscoverLoadAttemptedAt <= 0 ||
      Date.now() - params.lastDiscoverLoadAttemptedAt > DISCOVER_STALE_WINDOW_MS;
    if (!isStale) return;
    void params.loadDiscoverCommunities();
  }, [
    params.activePage,
    params.isLoadingDiscover,
    params.lastDiscoverLoadAttemptedAt,
    params.loadDiscoverCommunities,
  ]);
}
