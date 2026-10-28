import type { AccountSetupStatus } from "./accountSetup";
import type { SocialProfileLinks } from "./socialProfileLinks";

export type SessionLike = {
  user: {
    id: string;
  };
};

export type UserProfileLike = {
  user_id: string;
  display_name: string | null;
  handle?: string | null;
  normalized_handle?: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export type UserProfileDetailLike = UserProfileLike & {
  bio: string | null;
  social_links?: SocialProfileLinks | null;
  account_setup?: AccountSetupStatus | null;
};

export type AnalyticsSummaryLike = {
  total_members: number | null;
  page_visits_window: number | null;
  new_members_window: number | null;
  conversion_rate_window: number | null;
  mrr_base_units: number | null;
  currency: string | null;
  currency_decimals: number | null;
  active_members_window: number | null;
  retention_window: number | null;
  total_resources: number | null;
  resources_added_window: number | null;
};

export type AnalyticsPointLike = {
  label: string;
  value: number;
};

export type AnalyticsMetricSeriesLike = {
  visits: AnalyticsPointLike[];
  members: AnalyticsPointLike[];
  revenue: AnalyticsPointLike[];
};

export type AnalyticsRange = "7d" | "30d" | "90d" | "1y" | "all";

export function emptyAnalyticsMetricSeries(): AnalyticsMetricSeriesLike {
  return {
    visits: [],
    members: [],
    revenue: [],
  };
}

export function emptyAnalyticsSummary(): AnalyticsSummaryLike {
  return {
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
  };
}

export function trimProfileFields(profileName: string, profileHandle: string, profileBio: string): {
  trimmedName: string;
  trimmedHandle: string;
  trimmedBio: string;
} {
  return {
    trimmedName: profileName.trim(),
    trimmedHandle: profileHandle.trim(),
    trimmedBio: profileBio.trim(),
  };
}
