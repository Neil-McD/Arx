import assert from "node:assert/strict";
import {
  communityEventDateTimeInputToIso,
  getCommunityEventOccurrenceStartsInRange,
} from "../shared/communityEventTime.ts";

type Frequency = "daily" | "weekly" | "monthly";

function expand(params: {
  startsAt: string;
  frequency: Frequency;
  rangeStart: string;
  rangeEnd: string;
  until?: string;
  timeZone?: string;
}): string[] {
  return getCommunityEventOccurrenceStartsInRange({
    startsAt: Date.parse(params.startsAt),
    rangeStart: Date.parse(params.rangeStart),
    rangeEnd: Date.parse(params.rangeEnd),
    frequency: params.frequency,
    interval: 1,
    recurrenceUntil: params.until ? Date.parse(params.until) : null,
    timeZone: params.timeZone ?? "UTC",
    limit: 20,
  }).map((ms) => new Date(ms).toISOString().slice(0, 10));
}

function expandIso(params: {
  startsAt: string;
  frequency: Frequency;
  rangeStart: string;
  rangeEnd: string;
  until?: string;
  timeZone?: string;
}): string[] {
  return getCommunityEventOccurrenceStartsInRange({
    startsAt: Date.parse(params.startsAt),
    rangeStart: Date.parse(params.rangeStart),
    rangeEnd: Date.parse(params.rangeEnd),
    frequency: params.frequency,
    interval: 1,
    recurrenceUntil: params.until ? Date.parse(params.until) : null,
    timeZone: params.timeZone ?? "UTC",
    limit: 20,
  }).map((ms) => new Date(ms).toISOString());
}

assert.deepEqual(
  expand({
    startsAt: "2020-01-01T17:00:00.000Z",
    frequency: "daily",
    rangeStart: "2026-05-01T00:00:00.000Z",
    rangeEnd: "2026-05-03T23:59:59.999Z",
  }),
  ["2026-05-01", "2026-05-02", "2026-05-03"],
);

assert.deepEqual(
  expand({
    startsAt: "2020-01-06T17:00:00.000Z",
    frequency: "weekly",
    rangeStart: "2026-05-01T00:00:00.000Z",
    rangeEnd: "2026-05-15T23:59:59.999Z",
  }),
  ["2026-05-04", "2026-05-11"],
);

assert.deepEqual(
  expand({
    startsAt: "2024-01-31T17:00:00.000Z",
    frequency: "monthly",
    rangeStart: "2024-02-01T00:00:00.000Z",
    rangeEnd: "2024-04-30T23:59:59.999Z",
  }),
  ["2024-02-29", "2024-03-31", "2024-04-30"],
);

assert.deepEqual(
  expand({
    startsAt: "2026-05-01T17:00:00.000Z",
    frequency: "daily",
    rangeStart: "2026-05-01T00:00:00.000Z",
    rangeEnd: "2026-05-05T23:59:59.999Z",
    until: "2026-05-03T17:00:00.000Z",
  }),
  ["2026-05-01", "2026-05-02", "2026-05-03"],
);

assert.equal(
  communityEventDateTimeInputToIso("2026-03-02T09:00", "America/New_York"),
  "2026-03-02T14:00:00.000Z",
);

assert.deepEqual(
  expandIso({
    startsAt: "2026-03-02T14:00:00.000Z",
    frequency: "weekly",
    rangeStart: "2026-03-02T00:00:00.000Z",
    rangeEnd: "2026-03-17T00:00:00.000Z",
    timeZone: "America/New_York",
  }),
  [
    "2026-03-02T14:00:00.000Z",
    "2026-03-09T13:00:00.000Z",
    "2026-03-16T13:00:00.000Z",
  ],
);

console.log("community_events_recurrence_proof: ok");
