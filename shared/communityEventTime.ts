export type CommunityEventRecurrenceFrequency = "none" | "daily" | "weekly" | "monthly";

export type CommunityEventTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const DEFAULT_TIME_ZONE = "UTC";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIntegerPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isValidCommunityEventTimeZone(raw: unknown): boolean {
  const value = String(raw ?? "").trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function normalizeCommunityEventTimeZone(raw: unknown): string {
  const value = String(raw ?? "").trim();
  return isValidCommunityEventTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

export function getCommunityEventViewerTimeZone(): string {
  return normalizeCommunityEventTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function normalizeCommunityEventRecurrenceInterval(raw: unknown): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 1;
  return Math.max(1, Math.min(12, value));
}

export function normalizeCommunityEventRecurrenceFrequency(raw: unknown): CommunityEventRecurrenceFrequency {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "daily" || value === "weekly" || value === "monthly") return value;
  return "none";
}

export function getZonedCommunityEventTimeParts(
  value: Date | number | string,
  rawTimeZone: unknown,
): CommunityEventTimeParts {
  const date = value instanceof Date ? value : new Date(value);
  const timeZone = normalizeCommunityEventTimeZone(rawTimeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parseIntegerPart(parts, "year"),
    month: parseIntegerPart(parts, "month"),
    day: parseIntegerPart(parts, "day"),
    hour: parseIntegerPart(parts, "hour"),
    minute: parseIntegerPart(parts, "minute"),
    second: parseIntegerPart(parts, "second"),
    millisecond: date.getUTCMilliseconds(),
  };
}

function getTimeZoneOffsetMs(utcMs: number, rawTimeZone: unknown): number {
  const parts = getZonedCommunityEventTimeParts(utcMs, rawTimeZone);
  const zonedAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  return zonedAsUtcMs - utcMs;
}

export function communityEventWallTimePartsToUtcMs(
  parts: CommunityEventTimeParts,
  rawTimeZone: unknown,
): number {
  const timeZone = normalizeCommunityEventTimeZone(rawTimeZone);
  const wallAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  let utcMs = wallAsUtcMs - getTimeZoneOffsetMs(wallAsUtcMs, timeZone);
  for (let index = 0; index < 3; index += 1) {
    const nextUtcMs = wallAsUtcMs - getTimeZoneOffsetMs(utcMs, timeZone);
    if (nextUtcMs === utcMs) break;
    utcMs = nextUtcMs;
  }
  return utcMs;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeWallTimeParts(parts: CommunityEventTimeParts): CommunityEventTimeParts {
  const normalized = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  ));
  return {
    year: normalized.getUTCFullYear(),
    month: normalized.getUTCMonth() + 1,
    day: normalized.getUTCDate(),
    hour: normalized.getUTCHours(),
    minute: normalized.getUTCMinutes(),
    second: normalized.getUTCSeconds(),
    millisecond: normalized.getUTCMilliseconds(),
  };
}

function addWallClockDays(parts: CommunityEventTimeParts, count: number): CommunityEventTimeParts {
  return normalizeWallTimeParts({ ...parts, day: parts.day + count });
}

function addWallClockMonthsClamped(
  parts: CommunityEventTimeParts,
  count: number,
  preferredDayOfMonth: number,
): CommunityEventTimeParts {
  const totalMonthIndex = parts.year * 12 + (parts.month - 1) + count;
  const year = Math.floor(totalMonthIndex / 12);
  const month = totalMonthIndex - year * 12 + 1;
  return {
    ...parts,
    year,
    month,
    day: Math.min(preferredDayOfMonth, daysInMonth(year, month)),
  };
}

function addCommunityEventRecurrenceStepParts(
  parts: CommunityEventTimeParts,
  frequency: Exclude<CommunityEventRecurrenceFrequency, "none">,
  interval: number,
  preferredDayOfMonth: number,
): CommunityEventTimeParts {
  if (frequency === "daily") return addWallClockDays(parts, interval);
  if (frequency === "weekly") return addWallClockDays(parts, interval * 7);
  return addWallClockMonthsClamped(parts, interval, preferredDayOfMonth);
}

function getWallDayOrdinal(parts: CommunityEventTimeParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY);
}

function findFirstCommunityEventOccurrenceOnOrAfter(params: {
  startsAt: number;
  rangeStart: number;
  frequency: Exclude<CommunityEventRecurrenceFrequency, "none">;
  interval: number;
  timeZone: string;
}): number {
  if (params.rangeStart <= params.startsAt) return params.startsAt;
  const startParts = getZonedCommunityEventTimeParts(params.startsAt, params.timeZone);
  const rangeStartParts = getZonedCommunityEventTimeParts(params.rangeStart, params.timeZone);
  const preferredDayOfMonth = startParts.day;

  let candidateParts: CommunityEventTimeParts;
  if (params.frequency === "daily" || params.frequency === "weekly") {
    const stepDays = params.frequency === "daily" ? params.interval : params.interval * 7;
    const dayDistance = getWallDayOrdinal(rangeStartParts) - getWallDayOrdinal(startParts);
    const stepsElapsed = Math.max(0, Math.floor(dayDistance / stepDays));
    candidateParts = addWallClockDays(startParts, stepsElapsed * stepDays);
  } else {
    const monthDistance =
      (rangeStartParts.year - startParts.year) * 12 +
      (rangeStartParts.month - startParts.month);
    const stepsElapsed = Math.max(0, Math.floor(monthDistance / params.interval));
    candidateParts = addWallClockMonthsClamped(
      startParts,
      stepsElapsed * params.interval,
      preferredDayOfMonth,
    );
  }

  let candidateMs = communityEventWallTimePartsToUtcMs(candidateParts, params.timeZone);
  while (candidateMs < params.rangeStart) {
    candidateParts = addCommunityEventRecurrenceStepParts(
      candidateParts,
      params.frequency,
      params.interval,
      preferredDayOfMonth,
    );
    candidateMs = communityEventWallTimePartsToUtcMs(candidateParts, params.timeZone);
  }
  return candidateMs;
}

export function getCommunityEventOccurrenceStartsInRange(params: {
  startsAt: number;
  rangeStart: number;
  rangeEnd: number;
  frequency: CommunityEventRecurrenceFrequency;
  interval?: number;
  recurrenceUntil?: number | null;
  timeZone?: string | null;
  limit: number;
}): number[] {
  const frequency = normalizeCommunityEventRecurrenceFrequency(params.frequency);
  if (frequency === "none") {
    return params.startsAt >= params.rangeStart && params.startsAt <= params.rangeEnd
      ? [params.startsAt]
      : [];
  }
  if (params.startsAt > params.rangeEnd) return [];
  const recurrenceUntil = typeof params.recurrenceUntil === "number" ? params.recurrenceUntil : null;
  if (recurrenceUntil !== null && recurrenceUntil < params.rangeStart) return [];

  const timeZone = normalizeCommunityEventTimeZone(params.timeZone);
  const interval = normalizeCommunityEventRecurrenceInterval(params.interval);
  const preferredDayOfMonth = getZonedCommunityEventTimeParts(params.startsAt, timeZone).day;
  const out: number[] = [];
  let occurrenceMs = findFirstCommunityEventOccurrenceOnOrAfter({
    startsAt: params.startsAt,
    rangeStart: params.rangeStart,
    frequency,
    interval,
    timeZone,
  });

  while (out.length < Math.max(1, params.limit)) {
    if (occurrenceMs > params.rangeEnd) break;
    if (recurrenceUntil === null || occurrenceMs <= recurrenceUntil) {
      out.push(occurrenceMs);
    }
    if (recurrenceUntil !== null && occurrenceMs >= recurrenceUntil) break;
    const occurrenceParts = getZonedCommunityEventTimeParts(occurrenceMs, timeZone);
    const nextParts = addCommunityEventRecurrenceStepParts(
      occurrenceParts,
      frequency,
      interval,
      preferredDayOfMonth,
    );
    occurrenceMs = communityEventWallTimePartsToUtcMs(nextParts, timeZone);
  }
  return out;
}

export function parseCommunityEventDateTimeInputValue(value: string): CommunityEventTimeParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? "0"),
    millisecond: 0,
  };
  if (
    !Number.isInteger(parts.year) ||
    !Number.isInteger(parts.month) ||
    !Number.isInteger(parts.day) ||
    !Number.isInteger(parts.hour) ||
    !Number.isInteger(parts.minute) ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > daysInMonth(parts.year, parts.month) ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59
  ) {
    return null;
  }
  return parts;
}

export function communityEventDateTimeInputToIso(value: string, rawTimeZone: unknown): string | null {
  const parts = parseCommunityEventDateTimeInputValue(value);
  if (!parts) return null;
  const utcMs = communityEventWallTimePartsToUtcMs(parts, rawTimeZone);
  return Number.isFinite(utcMs) ? new Date(utcMs).toISOString() : null;
}

export function toCommunityEventDateTimeInputValue(
  value: Date | number | string,
  rawTimeZone: unknown,
): string {
  const parts = getZonedCommunityEventTimeParts(value, rawTimeZone);
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}
