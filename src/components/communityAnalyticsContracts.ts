import type {
  AnalyticsChartMode,
  AnalyticsPoint,
  AnalyticsRange,
  CommunityAnalyticsSummary,
} from "../../shared/communityTypes";

export type CommunityAnalyticsCapabilities = {
  hasActiveCommunity: boolean;
  hasSession: boolean;
  canViewActiveCommunityAnalytics: boolean;
};

export type CommunityAnalyticsState = {
  communityAnalyticsRange: AnalyticsRange;
  isLoadingCommunityAnalytics: boolean;
  communityAnalyticsError: string | null;
  communityAnalyticsSummary: CommunityAnalyticsSummary;
  communityAnalyticsChartMode: AnalyticsChartMode;
  communityAnalyticsSeries: AnalyticsPoint[];
  communityRevenueMeta: { currency: string; currency_decimals: number } | null;
  communityRevenueSeries: AnalyticsPoint[];
  communityRevenueError: string | null;
};

export type CommunityAnalyticsActions = {
  setCommunityAnalyticsRange: (value: AnalyticsRange) => void;
  setCommunityAnalyticsChartMode: (value: AnalyticsChartMode) => void;
};
