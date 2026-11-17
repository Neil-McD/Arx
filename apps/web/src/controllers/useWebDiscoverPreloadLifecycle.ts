import { useEffect } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";
import { isDesignV1Active } from "../../../../shared/designSystem";

const DISCOVER_STALE_WINDOW_MS = 60_000;

export function useWebDiscoverPreloadLifecycle(params: {
  activePage: AppPage;
  isLoadingDiscover: boolean;
  lastDiscoverLoadAttemptedAt: number;
  loadDiscoverCommunities: () => Promise<void>;
}) {
  useEffect(() => {
    if (params.activePage !== "discover") return;
    // Design v1's Discover page loads its own list (KitDiscover); this
    // preload feeds the classic panel only.
    if (isDesignV1Active()) return;
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
