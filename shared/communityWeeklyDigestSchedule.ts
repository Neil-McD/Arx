export const COMMUNITY_WEEKLY_DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const COMMUNITY_WEEKLY_DIGEST_LEASE_MS = 10 * 60 * 1000;
export const COMMUNITY_WEEKLY_DIGEST_CONTINUATION_DELAY_MS = 15 * 60 * 1000;
export const COMMUNITY_WEEKLY_DIGEST_MAX_FAILURES = 3;

// Cost ceilings. The worker may do less work, but never more, in one run.
export const COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN = 5;
export const COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH = 50;
export const COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN = 100;
export const COMMUNITY_WEEKLY_DIGEST_MAX_ITEMS = 8;
export const COMMUNITY_WEEKLY_DIGEST_MAX_INTERACTIONS_SCANNED = 40;
export const COMMUNITY_WEEKLY_DIGEST_MAX_RESOURCES_SCANNED = 40;
export const COMMUNITY_WEEKLY_DIGEST_MAX_RESOURCE_MODULES_SCANNED = 100;
export const COMMUNITY_WEEKLY_DIGEST_MAX_NEW_MEMBERS_SCANNED = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CommunityWeeklyDigestActivityCounts = {
  interactionCount: number;
  resourceCount: number;
  newMemberCount: number;
};

export type CommunityWeeklyDigestPeriod = {
  periodStartDay: string;
  periodEndDay: string;
  periodStartMs: number;
  periodEndExclusiveMs: number;
};

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function buildCommunityWeeklyDigestPeriod(nowMs: number): CommunityWeeklyDigestPeriod {
  const safeNowMs = Number.isFinite(nowMs) ? Math.floor(nowMs) : Date.now();
  const currentDayStartMs = Date.parse(`${utcDayKey(safeNowMs)}T00:00:00.000Z`);
  const periodStartMs = currentDayStartMs - 7 * DAY_MS;
  const periodEndExclusiveMs = currentDayStartMs;
  return {
    periodStartDay: utcDayKey(periodStartMs),
    periodEndDay: utcDayKey(periodEndExclusiveMs - 1),
    periodStartMs,
    periodEndExclusiveMs,
  };
}

export function readCommunityWeeklyDigestPeriod(params: {
  periodStartDay: string;
  periodEndDay: string;
}): CommunityWeeklyDigestPeriod {
  const periodStartDay = String(params.periodStartDay ?? "").trim();
  const periodEndDay = String(params.periodEndDay ?? "").trim();
  const periodStartMs = Date.parse(`${periodStartDay}T00:00:00.000Z`);
  const periodEndStartMs = Date.parse(`${periodEndDay}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(periodStartDay) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(periodEndDay) ||
    !Number.isFinite(periodStartMs) ||
    !Number.isFinite(periodEndStartMs) ||
    periodEndStartMs < periodStartMs
  ) {
    throw new Error("weekly_digest_period_invalid");
  }
  return {
    periodStartDay,
    periodEndDay,
    periodStartMs,
    periodEndExclusiveMs: periodEndStartMs + DAY_MS,
  };
}

export function formatCommunityWeeklyDigestDateLabel(period: {
  periodStartDay: string;
  periodEndDay: string;
}): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(`${period.periodStartDay}T00:00:00.000Z`))} - ${formatter.format(new Date(`${period.periodEndDay}T00:00:00.000Z`))}`;
}

export function formatCommunityWeeklyDigestStats(
  activity: CommunityWeeklyDigestActivityCounts,
): string {
  const parts: string[] = [];
  if (activity.interactionCount > 0) {
    parts.push(`${activity.interactionCount} conversation${activity.interactionCount === 1 ? "" : "s"}`);
  }
  if (activity.resourceCount > 0) {
    parts.push(`${activity.resourceCount} resource${activity.resourceCount === 1 ? "" : "s"}`);
  }
  if (activity.newMemberCount > 0) {
    parts.push(`${activity.newMemberCount} new member${activity.newMemberCount === 1 ? "" : "s"}`);
  }
  return parts.join(" • ");
}

export function buildCommunityWeeklyDigestDedupeKey(params: {
  communityId: unknown;
  userId: unknown;
  periodStartDay: string;
  periodEndDay: string;
}): string {
  return [
    "weekly_member_digest",
    String(params.communityId ?? "").trim(),
    String(params.userId ?? "").trim(),
    params.periodStartDay,
    params.periodEndDay,
  ].join(":");
}

export function truncateCommunityWeeklyDigestText(raw: unknown, maxLength: number): string {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function hashCommunityWeeklyDigestKey(value: unknown): number {
  const input = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Assigns every community a stable instant within the week. This prevents a
 * weekly thundering herd without requiring a second scheduling authority.
 */
export function nextCommunityWeeklyDigestAt(
  communityId: unknown,
  afterMs: number,
): number {
  const safeAfterMs = Number.isFinite(afterMs) ? Math.floor(afterMs) : Date.now();
  const weeklyOffsetMs =
    hashCommunityWeeklyDigestKey(communityId) % COMMUNITY_WEEKLY_DIGEST_INTERVAL_MS;
  const completedIntervals = Math.floor(
    (safeAfterMs - weeklyOffsetMs) / COMMUNITY_WEEKLY_DIGEST_INTERVAL_MS,
  );
  return (
    (completedIntervals + 1) * COMMUNITY_WEEKLY_DIGEST_INTERVAL_MS +
    weeklyOffsetMs
  );
}

export function communityWeeklyDigestRetryDelayMs(failureCount: number): number {
  const normalizedFailureCount = Math.max(1, Math.floor(failureCount));
  if (normalizedFailureCount === 1) return 15 * 60 * 1000;
  if (normalizedFailureCount === 2) return 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}
