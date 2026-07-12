import type {
  AnalyticsRange,
  CommunityAnalyticsSeries,
  CommunityAnalyticsSummary,
} from "../../../../shared/communityTypes";

export type CommunityAnalyticsCapabilities = {
  hasActiveCommunity: boolean;
  hasSession: boolean;
  canViewActiveCommunityAnalytics: boolean;
  canViewPlatformAnalytics: boolean;
};

export type CommunityAnalyticsState = {
  communityAnalyticsRange: AnalyticsRange;
  isLoadingCommunityAnalytics: boolean;
  communityAnalyticsError: string | null;
  communityAnalyticsSummary: CommunityAnalyticsSummary;
  communityAnalyticsSeries: CommunityAnalyticsSeries;
};

export type CommunityAnalyticsActions = {
  setCommunityAnalyticsRange: (value: AnalyticsRange) => void;
  openPlatformAnalytics: () => void;
};
