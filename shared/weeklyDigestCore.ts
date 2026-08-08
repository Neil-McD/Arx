export type WeeklyDigestActivityCounts = {
  chatMessageCount: number;
  resourceCount: number;
  newMemberCount: number;
};

export type WeeklyDigestPeriod = {
  periodStartMs: number;
  periodEndMs: number;
  periodStartDay: string;
  periodEndDay: string;
};

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function hashStringToUint32(value: unknown): number {
  const input = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableWeeklyDigestDay(value: unknown): number {
  return hashStringToUint32(value) % 7;
}

export function utcDayKey(ms: number): string {
  const date = new Date(Math.floor(ms));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildWeeklyDigestPeriod(nowMs: number, windowDays = 7): WeeklyDigestPeriod {
  const safeNowMs = Number.isFinite(nowMs) ? Math.floor(nowMs) : Date.now();
  const safeWindowDays = normalizePositiveInteger(windowDays, 7);
  const periodEndMs = safeNowMs;
  const periodStartMs = periodEndMs - safeWindowDays * 24 * 60 * 60 * 1000;
  return {
    periodStartMs,
    periodEndMs,
    periodStartDay: utcDayKey(periodStartMs),
    periodEndDay: utcDayKey(periodEndMs),
  };
}

export function shouldSendWeeklyDigest(activity: WeeklyDigestActivityCounts): boolean {
  return (
    activity.resourceCount >= 1 ||
    activity.newMemberCount >= 2 ||
    activity.chatMessageCount >= 3
  );
}

export function buildWeeklyDigestDedupeKey(params: {
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

export function formatWeeklyDigestStats(activity: WeeklyDigestActivityCounts): string {
  const parts: string[] = [];
  if (activity.chatMessageCount > 0) {
    parts.push(`${activity.chatMessageCount} message${activity.chatMessageCount === 1 ? "" : "s"}`);
  }
  if (activity.resourceCount > 0) {
    parts.push(`${activity.resourceCount} resource${activity.resourceCount === 1 ? "" : "s"}`);
  }
  if (activity.newMemberCount > 0) {
    parts.push(`${activity.newMemberCount} new member${activity.newMemberCount === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" • ") : "No major activity this week";
}

export function capWeeklyDigestItems<T>(items: T[], maxItems = 8): T[] {
  const safeMaxItems = Math.max(1, Math.min(20, normalizePositiveInteger(maxItems, 8)));
  return items.slice(0, safeMaxItems);
}
