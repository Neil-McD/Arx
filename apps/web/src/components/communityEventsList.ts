// Design system v1 (docs/specs/design-system-v1.md, the Events page): events as
// a list. The soonest one is featured, the rest are "Coming up", and the last
// three weeks are "Past". Pure, so the rules are tested apart from the page.
import { communityEventPhase, type CommunityEventPhase } from "../../../../shared/communityEventLifecycle";

type ListedEvent = {
  id: string;
  // A repeating event's dates share it; a one-off's is its own id.
  parent_event_id?: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
};

export type CommunityEventsListParts<T extends ListedEvent> = {
  featured: T | null;
  comingUp: T[];
  past: T[];
};

const byStart = (a: ListedEvent, b: ListedEvent) =>
  Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id);

export function splitCommunityEvents<T extends ListedEvent>(events: T[], now: number): CommunityEventsListParts<T> {
  const live = events.filter((event) => event.status !== "cancelled");
  const phase = (event: T): CommunityEventPhase => communityEventPhase(event, now);
  // A repeating event shows once, on its next date (the row says "weekly").
  const series = (event: T) => event.parent_event_id ?? event.id;
  const nextOnly = (list: T[]) => {
    const seen = new Set<string>();
    return list.filter((event) => (seen.has(series(event)) ? false : (seen.add(series(event)), true)));
  };
  const notOver = nextOnly(live.filter((event) => phase(event) !== "past" && phase(event) !== "invalid").sort(byStart));
  const past = nextOnly(live.filter((event) => phase(event) === "past").sort((a, b) => byStart(b, a)));
  return { featured: notOver[0] ?? null, comingUp: notOver.slice(1), past };
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// What the featured card says first: now, in a few minutes, or which day.
export function featuredEventLabel(event: ListedEvent, now: number): { text: string; live: boolean } {
  const phase = communityEventPhase(event, now);
  if (phase === "ongoing" || phase === "started") return { text: "Happening now", live: true };
  const minutes = Math.round((Date.parse(event.starts_at) - now) / 60000);
  if (minutes <= 60) return { text: minutes <= 1 ? "Starting now" : `Live in ${minutes} minutes`, live: true };
  return { text: `${eventDayWord(event.starts_at, now)}`, live: false };
}

// "Today", "Tomorrow", or the weekday and date.
export function eventDayWord(startsAtIso: string, now: number): string {
  const days = Math.round((startOfDay(Date.parse(startsAtIso)) - startOfDay(now)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  const date = new Date(startsAtIso);
  return days > 1 && days < 7
    ? date.toLocaleDateString(undefined, { weekday: "long" })
    : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// The date block on a row: the day's number, then the weekday (or the month for past events).
export function eventDateBlock(startsAtIso: string, isPast: boolean): { number: string; word: string } {
  const date = new Date(startsAtIso);
  return {
    number: String(date.getDate()),
    word: date.toLocaleDateString(undefined, isPast ? { month: "short" } : { weekday: "short" }),
  };
}
