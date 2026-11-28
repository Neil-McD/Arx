// Pure rolling 30-day (5-week) calendar model for the Events right panel.
// Every day key uses the viewer's local calendar date so it matches the page's
// "Times are in your time zone" wording and event draft pre-fills.
import { communityEventPhase } from "../../../../shared/communityEventLifecycle";

export type CalendarEventLike = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
};

export type RollingCalendarDay<T extends CalendarEventLike> = {
  dayKey: string;
  date: Date;
  dayNumber: number;
  monthShort: string;
  isMonthStart: boolean;
  isToday: boolean;
  isPast: boolean;
  inNext30Days: boolean;
  events: T[];
  liveCount: number;
  cancelledCount: number;
};

export type RollingEventsCalendar<T extends CalendarEventLike> = {
  todayKey: string;
  rangeLabel: string;
  days: RollingCalendarDay<T>[];
  upcomingCount30d: number;
  cancelledCount30d: number;
};

const DAY_MS = 86_400_000;
const NEXT_DAYS_WINDOW = 30;

export function localEventDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalEventDayKey(dayKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

const byStart = (a: CalendarEventLike, b: CalendarEventLike) =>
  Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id);

export function buildRollingEventsCalendar<T extends CalendarEventLike>(
  events: readonly T[],
  now: number,
): RollingEventsCalendar<T> {
  const nowDate = new Date(now);
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const todayMs = today.getTime();
  const todayKey = localEventDayKey(today);
  const next30End = new Date(today.getFullYear(), today.getMonth(), today.getDate() + NEXT_DAYS_WINDOW);
  const next30EndMs = next30End.getTime();

  const leadingDays = today.getDay();
  const gridStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - leadingDays);
  // Cover all 30 upcoming dates (today + next 29 days) in whole Sun–Sat rows:
  // 5 weeks Sunday–Friday, expanding to a 6th week on Saturday.
  const totalGridDays = Math.ceil((leadingDays + NEXT_DAYS_WINDOW) / 7) * 7;

  const byDay = new Map<string, T[]>();
  const seenIds = new Set<string>();
  let upcomingCount30d = 0;
  let cancelledCount30d = 0;

  for (const event of events) {
    if (seenIds.has(event.id)) continue;
    const startMs = Date.parse(event.starts_at);
    if (!Number.isFinite(startMs)) continue;
    seenIds.add(event.id);

    const startDate = new Date(startMs);
    const key = localEventDayKey(startDate);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);

    const phase = communityEventPhase(event, now);
    if (phase !== "past" && phase !== "invalid" && startMs < next30EndMs) {
      if (event.status === "cancelled") cancelledCount30d += 1;
      else upcomingCount30d += 1;
    }
  }

  for (const bucket of byDay.values()) {
    bucket.sort(byStart);
  }

  const days: RollingCalendarDay<T>[] = [];
  for (let index = 0; index < totalGridDays; index += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const dayKey = localEventDayKey(date);
    const dayMs = date.getTime();
    const dayEvents = byDay.get(dayKey) ?? [];
    let liveCount = 0;
    let cancelledCount = 0;
    for (const item of dayEvents) {
      if (item.status === "cancelled") cancelledCount += 1;
      else liveCount += 1;
    }
    days.push({
      dayKey,
      date,
      dayNumber: date.getDate(),
      monthShort: date.toLocaleDateString("en-US", { month: "short" }),
      isMonthStart: date.getDate() === 1 && index > 0,
      isToday: dayKey === todayKey,
      isPast: dayMs < todayMs,
      inNext30Days: dayMs >= todayMs && dayMs < next30EndMs,
      events: dayEvents,
      liveCount,
      cancelledCount,
    });
  }

  const firstMonth = today.toLocaleDateString("en-US", { month: "short" });
  const lastDate = days[days.length - 1]!.date;
  const lastMonth = lastDate.toLocaleDateString("en-US", { month: "short" });
  const rangeLabel = firstMonth === lastMonth ? firstMonth : `${firstMonth} – ${lastMonth}`;

  return {
    todayKey,
    rangeLabel,
    days,
    upcomingCount30d,
    cancelledCount30d,
  };
}

export function formatCalendarDayHeading(dayKey: string, now: number): string {
  const date = parseLocalEventDayKey(dayKey);
  if (!date) return dayKey;
  const nowDate = new Date(now);
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const diffDays = Math.round((date.getTime() - today.getTime()) / DAY_MS);
  const formatted = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (diffDays === 0) return `Today · ${formatted}`;
  if (diffDays === 1) return `Tomorrow · ${formatted}`;
  return formatted;
}

export function formatCalendarDayShort(dayKey: string): string {
  const date = parseLocalEventDayKey(dayKey);
  if (!date) return dayKey;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
