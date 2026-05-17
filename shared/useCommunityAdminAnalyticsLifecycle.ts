import { useEffect, useRef } from "react";

type AnalyticsRange = "7d" | "30d" | "90d" | "1y" | "all";

export function useCommunityAdminAnalyticsLifecycle<TSession>(params: {
  activePage: string;
  communityTab: string;
  session: TSession | null;
  activeCommunityId: string | null;
  canViewActiveCommunityAnalytics: boolean;
  shouldLoad?: boolean;
  communityAnalyticsRange: AnalyticsRange;
  loadCommunityAnalytics: (
    communityId: string,
    session: TSession,
    range: AnalyticsRange,
  ) => Promise<void> | void;
  resetCommunityAnalytics: () => void;
}) {
  const loadCommunityAnalyticsRef = useRef(params.loadCommunityAnalytics);
  const resetCommunityAnalyticsRef = useRef(params.resetCommunityAnalytics);

  useEffect(() => {
    loadCommunityAnalyticsRef.current = params.loadCommunityAnalytics;
  }, [params.loadCommunityAnalytics]);

  useEffect(() => {
    resetCommunityAnalyticsRef.current = params.resetCommunityAnalytics;
  }, [params.resetCommunityAnalytics]);

  useEffect(() => {
    resetCommunityAnalyticsRef.current();
  }, [params.activeCommunityId]);

  useEffect(() => {
    const shouldLoadForSurface =
      (params.activePage === "community" && params.communityTab === "analytics") ||
      params.shouldLoad === true;
    if (!shouldLoadForSurface) return;
    if (!params.session || !params.activeCommunityId || !params.canViewActiveCommunityAnalytics) {
      resetCommunityAnalyticsRef.current();
      return;
    }
    void loadCommunityAnalyticsRef.current(
      params.activeCommunityId,
      params.session,
      params.communityAnalyticsRange,
    );
  }, [
    params.activePage,
    params.communityTab,
    params.session,
    params.activeCommunityId,
    params.canViewActiveCommunityAnalytics,
    params.shouldLoad,
    params.communityAnalyticsRange,
  ]);

}
