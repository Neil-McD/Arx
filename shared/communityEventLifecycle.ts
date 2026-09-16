/** Display policy only; never writes an invented end time to an event. */
export const DEFAULT_COMMUNITY_EVENT_DURATION_MS = 60 * 60 * 1000;

export type TimedCommunityEvent = { starts_at: string; ends_at: string | null };
export type CommunityEventPhase = "upcoming" | "ongoing" | "started" | "past" | "invalid";

export function communityEventDisplayEnd(event: TimedCommunityEvent): number {
  const start = Date.parse(event.starts_at);
  const end = event.ends_at ? Date.parse(event.ends_at) : start + DEFAULT_COMMUNITY_EVENT_DURATION_MS;
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end : NaN;
}

export function communityEventPhase(event: TimedCommunityEvent, now: number): CommunityEventPhase {
  const start = Date.parse(event.starts_at);
  const end = communityEventDisplayEnd(event);
  if (!Number.isFinite(end)) return "invalid";
  if (now < start) return "upcoming";
  if (now >= end) return "past";
  return event.ends_at ? "ongoing" : "started";
}

export function nextCommunityEventBoundary(events: TimedCommunityEvent[], now: number): number {
  // The month boundary matters even when there are no events.
  const date = new Date(now);
  let next = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  for (const event of events) {
    for (const boundary of [Date.parse(event.starts_at), communityEventDisplayEnd(event)]) {
      if (boundary > now && boundary < next) next = boundary;
    }
  }
  return next;
}
