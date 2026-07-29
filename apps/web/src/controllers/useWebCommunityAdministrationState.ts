import { useEffect, useState } from "react";

import type { AuthSession } from "../auth";
import type {
  AnalyticsRange,
  CommunityAnalyticsSeries,
  CommunityAnalyticsSummary,
} from "../../../../shared/communityTypes";
import { useCommunityDirectoryController } from "../../../../shared/useCommunityDirectoryController";
import { useWebActiveCommunityShellController } from "./useWebActiveCommunityShellController";
import { useWebCommunityAdminUiController } from "./useWebCommunityAdminUiController";
import { useWebCommunityAgentConfigUiController } from "./useWebCommunityAgentConfigUiController";
import { useWebCommunityJoinRequestsController } from "./useWebCommunityJoinRequestsController";
import { useWebCommunitySettingsUiController } from "./useWebCommunitySettingsUiController";

const COMMUNITY_ANALYTICS_RANGE_STORAGE_KEY = "polynet-community-analytics-range";
const LEGACY_COMMUNITY_ANALYTICS_RANGE_STORAGE_KEY = "arx-community-analytics-range";

export type WebCommunityJoinRequest = {
  id: string;
  community_id: string;
  user_id: string;
  status: string;
  message: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  decided_by: string | null;
  denied_until: string | null;
};

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

function readInitialAnalyticsRange(): AnalyticsRange {
  try {
    for (const key of [
      COMMUNITY_ANALYTICS_RANGE_STORAGE_KEY,
      LEGACY_COMMUNITY_ANALYTICS_RANGE_STORAGE_KEY,
    ]) {
      const stored = localStorage.getItem(key);
      if (stored && ["7d", "30d", "90d", "1y", "all"].includes(stored)) {
        return stored as AnalyticsRange;
      }
    }
  } catch {
    // Storage is optional; the canonical default remains deterministic.
  }
  return "30d";
}

export function useWebCommunityAdministrationState(params: {
  activeCommunityId: string | null;
  ensureSession: EnsureAuthSession;
  session: AuthSession | null;
}) {
  const { activeCommunityId, ensureSession, session } = params;

  const joinRequests =
    useWebCommunityJoinRequestsController<WebCommunityJoinRequest>({
      activeCommunityId,
    });

  const [isSettingFreeAccessMode, setIsSettingFreeAccessMode] = useState(false);
  const [freeAccessModeError, setFreeAccessModeError] = useState<string | null>(null);
  useEffect(() => {
    setIsSettingFreeAccessMode(false);
    setFreeAccessModeError(null);
  }, [activeCommunityId]);

  const directory = useCommunityDirectoryController<AuthSession>({
    activeCommunityId,
    ensureSession,
  });

  const access = useWebActiveCommunityShellController<AuthSession>({
    activeCommunityId,
    session,
    ensureSession,
  });

  const [analyticsSummary, setAnalyticsSummary] =
    useState<CommunityAnalyticsSummary>({
      total_members: null,
      page_visits_window: null,
      new_members_window: null,
      conversion_rate_window: null,
      mrr_base_units: null,
      currency: null,
      currency_decimals: null,
      active_members_window: null,
      retention_window: null,
      total_resources: null,
      resources_added_window: null,
    });
  const [analyticsSeries, setAnalyticsSeries] =
    useState<CommunityAnalyticsSeries>({
      visits: [],
      members: [],
      revenue: [],
    });
  const [analyticsRange, setAnalyticsRange] =
    useState<AnalyticsRange>(readInitialAnalyticsRange);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const settingsUi = useWebCommunitySettingsUiController();
  const agentConfigUi = useWebCommunityAgentConfigUiController();
  const adminUi = useWebCommunityAdminUiController();

  return {
    joinRequests,
    freeAccess: {
      isSetting: isSettingFreeAccessMode,
      setIsSetting: setIsSettingFreeAccessMode,
      error: freeAccessModeError,
      setError: setFreeAccessModeError,
    },
    directory,
    access,
    analytics: {
      summary: analyticsSummary,
      setSummary: setAnalyticsSummary,
      series: analyticsSeries,
      setSeries: setAnalyticsSeries,
      range: analyticsRange,
      setRange: setAnalyticsRange,
      isLoading: isLoadingAnalytics,
      setIsLoading: setIsLoadingAnalytics,
      error: analyticsError,
      setError: setAnalyticsError,
    },
    settingsUi,
    agentConfigUi,
    adminUi,
  };
}
