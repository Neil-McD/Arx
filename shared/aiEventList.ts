// What's coming up, as an AI lists it (events/): a repeating event once, at
// its next time, with the few times after it, as the app's own Events page
// shows it (apps/web/src/components/communityEventsList.ts). A weekly call
// listed twenty times made "what's coming up" cost an AI twenty reads.

export const AI_EVENT_NEXT_TIMES = 3;

type EventRow = Record<string, unknown>;

// `events` are occurrences, soonest first. Kept: the first `limit` distinct
// events (a series counts once); each repeating one carries next_times, its
// next few starts in the community's zone.
export function aiEventList(events: EventRow[], limit: number): { events: EventRow[]; more: boolean } {
  const kept: EventRow[] = [];
  const bySeries = new Map<string, EventRow>();
  let more = false;
  for (const event of events) {
    const series = typeof event.parent_event_id === "string" && event.recurrence_frequency && event.recurrence_frequency !== "none"
      ? event.parent_event_id : null;
    const seen = series ? bySeries.get(series) : undefined;
    if (seen) {
      const times = seen.next_times as unknown[];
      const isoTimes = seen.next_starts_at as unknown[];
      if (times.length < AI_EVENT_NEXT_TIMES) {
        times.push(event.starts_at_zoned ?? event.starts_at);
        if (typeof event.starts_at === "string") isoTimes.push(event.starts_at);
      }
      continue;
    }
    if (kept.length >= limit) { more = true; continue; }
    const shown: EventRow = series ? { ...event, next_times: [], next_starts_at: [] } : event;
    kept.push(shown);
    if (series) bySeries.set(series, shown);
  }
  return { events: kept, more };
}
