import { describe, expect, it } from "vitest";
import {
  earlierCancelledForEvent,
  earlierCancelledOccurrencesForEvent,
  splitCommunityEvents,
} from "../apps/web/src/components/communityEventsList";

describe("communityEventsList cancellation handling", () => {
  const now = Date.parse("2026-11-26T15:00:00Z");

  it("returns all consecutive earlier cancelled occurrences for the featured recurring series in chronological order", () => {
    const events = [
      {
        id: "ev1:occ2",
        parent_event_id: "ev1",
        starts_at: "2026-12-04T18:00:00Z",
        ends_at: "2026-12-04T19:00:00Z",
        status: "cancelled",
        cancellation_scope: "occurrence" as const,
      },
      {
        id: "ev1:occ1",
        parent_event_id: "ev1",
        starts_at: "2026-11-27T18:00:00Z",
        ends_at: "2026-11-27T19:00:00Z",
        status: "cancelled",
        cancellation_scope: "occurrence" as const,
      },
      {
        id: "ev1:occ3",
        parent_event_id: "ev1",
        starts_at: "2026-12-11T18:00:00Z",
        ends_at: "2026-12-11T19:00:00Z",
        status: "live",
        cancellation_scope: null,
      },
      {
        id: "ev2:occ1",
        parent_event_id: "ev2",
        starts_at: "2026-11-28T18:00:00Z",
        ends_at: "2026-11-28T19:00:00Z",
        status: "cancelled",
        cancellation_scope: "occurrence" as const,
      },
    ];

    const parts = splitCommunityEvents(events, now);
    expect(parts.featured?.id).toBe("ev1:occ3");
    const earlier = earlierCancelledOccurrencesForEvent(parts.featured!, parts.cancelled);
    expect(earlier.map((e) => e.id)).toEqual(["ev1:occ1", "ev1:occ2"]);
    expect(earlierCancelledForEvent(parts.featured!, parts.cancelled)?.id).toBe("ev1:occ1");
  });

  it("ignores cancelled occurrences after the featured live occurrence or from series-level cancellations", () => {
    const events = [
      {
        id: "ev1:occ1",
        parent_event_id: "ev1",
        starts_at: "2026-11-27T18:00:00Z",
        ends_at: "2026-11-27T19:00:00Z",
        status: "live",
        cancellation_scope: null,
      },
      {
        id: "ev1:occ2",
        parent_event_id: "ev1",
        starts_at: "2026-12-04T18:00:00Z",
        ends_at: "2026-12-04T19:00:00Z",
        status: "cancelled",
        cancellation_scope: "occurrence" as const,
      },
      {
        id: "ev3:occ1",
        parent_event_id: "ev3",
        starts_at: "2026-11-26T20:00:00Z",
        ends_at: "2026-11-26T21:00:00Z",
        status: "cancelled",
        cancellation_scope: "series" as const,
      },
    ];

    const parts = splitCommunityEvents(events, now);
    expect(parts.featured?.id).toBe("ev1:occ1");
    expect(earlierCancelledOccurrencesForEvent(parts.featured!, parts.cancelled)).toEqual([]);
    expect(parts.cancelled.map((e) => e.id)).toEqual(["ev3:occ1", "ev1:occ2"]);
  });
});
