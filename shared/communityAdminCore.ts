export type SessionLike = {
  user: {
    id: string;
  };
};

export type CommunityMemberLike = {
  user_id: string;
};

export type UserProfileLike = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type UserProfileDetailLike = UserProfileLike & {
  bio: string | null;
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

export type AnalyticsRange = "7d" | "30d" | "90d" | "1y" | "all";
export type AnalyticsBucket = "day" | "week" | "month";

export function resolveAnalyticsWindowStart(params: {
  range: AnalyticsRange;
  nowMs: number;
  communityCreatedAt: string | null;
}): Date | null {
  switch (params.range) {
    case "7d":
      return new Date(params.nowMs - 7 * 86400000);
    case "30d":
      return new Date(params.nowMs - 30 * 86400000);
    case "90d":
      return new Date(params.nowMs - 90 * 86400000);
    case "1y":
      return new Date(params.nowMs - 365 * 86400000);
    case "all": {
      if (!params.communityCreatedAt) return null;
      const created = new Date(params.communityCreatedAt);
      return Number.isNaN(created.getTime()) ? null : created;
    }
    default:
      return new Date(params.nowMs - 30 * 86400000);
  }
}

export function resolveAnalyticsBucket(range: AnalyticsRange): AnalyticsBucket {
  return range === "7d" || range === "30d" ? "day" : range === "90d" ? "week" : "month";
}

function startOfAnalyticsBucket(date: Date, bucket: AnalyticsBucket): Date {
  if (bucket === "month") return new Date(date.getFullYear(), date.getMonth(), 1);
  if (bucket === "week") {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    return d;
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addAnalyticsBucket(date: Date, bucket: AnalyticsBucket): Date {
  if (bucket === "month") return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  if (bucket === "week") return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function analyticsBucketKey(
  date: Date,
  bucket: AnalyticsBucket,
  dateKeyLocal: (date: Date) => string,
): string {
  if (bucket === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return dateKeyLocal(date);
}

export function analyticsBucketLabel(date: Date, bucket: AnalyticsBucket): string {
  if (bucket === "month") return date.toLocaleDateString([], { month: "short", year: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function buildAnalyticsSeries(params: {
  rows: Array<{ created_at: string }>;
  start: Date;
  bucket: AnalyticsBucket;
  dateKeyLocal: (date: Date) => string;
}): AnalyticsPointLike[] {
  const end = new Date();
  const startBucket = startOfAnalyticsBucket(params.start, params.bucket);
  const endBucket = startOfAnalyticsBucket(end, params.bucket);

  const counts = new Map<string, number>();
  for (const row of params.rows) {
    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime())) continue;
    if (created < startBucket) continue;
    const key = analyticsBucketKey(
      startOfAnalyticsBucket(created, params.bucket),
      params.bucket,
      params.dateKeyLocal,
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: AnalyticsPointLike[] = [];
  for (
    let cursor = startBucket;
    cursor <= endBucket;
    cursor = addAnalyticsBucket(cursor, params.bucket)
  ) {
    const key = analyticsBucketKey(cursor, params.bucket, params.dateKeyLocal);
    points.push({ label: analyticsBucketLabel(cursor, params.bucket), value: counts.get(key) ?? 0 });
  }
  return points;
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

export function trimProfileFields(profileName: string, profileBio: string): {
  trimmedName: string;
  trimmedBio: string;
} {
  return {
    trimmedName: profileName.trim(),
    trimmedBio: profileBio.trim(),
  };
}
