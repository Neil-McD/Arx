import { useEffect, useRef } from "react";

type AnalyticsRange = "7d" | "30d" | "90d" | "1y" | "all";

export function useCommunityAdminAnalyticsLifecycle<TSession>(params: {
  activePage: string;
  communityTab: string;
  supabaseSession: TSession | null;
  activeCommunityId: string | null;
  canViewActiveCommunityAnalytics: boolean;
  communityAnalyticsRange: AnalyticsRange;
  getCommunityCreatedAt: () => string | null;
  loadCommunityAnalytics: (
    communityId: string,
    session: TSession,
    range: AnalyticsRange,
    communityCreatedAt: string | null,
  ) => Promise<void> | void;
  resetCommunityAnalytics: () => void;
}) {
  const getCommunityCreatedAtRef = useRef(params.getCommunityCreatedAt);
  const loadCommunityAnalyticsRef = useRef(params.loadCommunityAnalytics);
  const resetCommunityAnalyticsRef = useRef(params.resetCommunityAnalytics);

  useEffect(() => {
    getCommunityCreatedAtRef.current = params.getCommunityCreatedAt;
  }, [params.getCommunityCreatedAt]);

  useEffect(() => {
    loadCommunityAnalyticsRef.current = params.loadCommunityAnalytics;
  }, [params.loadCommunityAnalytics]);

  useEffect(() => {
    resetCommunityAnalyticsRef.current = params.resetCommunityAnalytics;
  }, [params.resetCommunityAnalytics]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "analytics") return;
    if (!params.supabaseSession || !params.activeCommunityId || !params.canViewActiveCommunityAnalytics) {
      resetCommunityAnalyticsRef.current();
      return;
    }
    const createdAt = getCommunityCreatedAtRef.current();
    void loadCommunityAnalyticsRef.current(
      params.activeCommunityId,
      params.supabaseSession,
      params.communityAnalyticsRange,
      createdAt,
    );
  }, [
    params.activePage,
    params.communityTab,
    params.supabaseSession,
    params.activeCommunityId,
    params.canViewActiveCommunityAnalytics,
    params.communityAnalyticsRange,
  ]);

}
