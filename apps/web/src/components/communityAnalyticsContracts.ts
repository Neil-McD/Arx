import type {
  AnalyticsPoint,
  AnalyticsRange,
  CommunityAnalyticsSummary,
} from "../../../../shared/communityTypes";

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
  communityAnalyticsSeries: AnalyticsPoint[];
};

export type CommunityAnalyticsActions = {
  setCommunityAnalyticsRange: (value: AnalyticsRange) => void;
};
