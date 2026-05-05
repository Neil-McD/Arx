import assert from "node:assert/strict";

type Frequency = "none" | "daily" | "weekly" | "monthly";

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonthsClamped(date: Date, monthCount: number, preferredDayOfMonth: number): Date {
  const next = new Date(date);
  const targetMonth = date.getMonth() + monthCount;
  next.setDate(1);
  next.setMonth(targetMonth);
  next.setDate(Math.min(preferredDayOfMonth, daysInMonth(next.getFullYear(), next.getMonth())));
  return next;
}

function addRecurrenceStep(
  date: Date,
  frequency: Exclude<Frequency, "none">,
  interval: number,
  preferredDayOfMonth: number,
): Date {
  const next = new Date(date);
  if (frequency === "daily") next.setDate(next.getDate() + interval);
  if (frequency === "weekly") next.setDate(next.getDate() + interval * 7);
  if (frequency === "monthly") return addMonthsClamped(date, interval, preferredDayOfMonth);
  return next;
}

function findFirstOccurrenceOnOrAfter(params: {
  startsAt: number;
  rangeStart: number;
  frequency: Exclude<Frequency, "none">;
  interval: number;
}): Date {
  const start = new Date(params.startsAt);
  const preferredDayOfMonth = start.getDate();
  if (params.rangeStart <= params.startsAt) return start;
  if (params.frequency === "daily" || params.frequency === "weekly") {
    const intervalMs = params.frequency === "daily"
      ? params.interval * 24 * 60 * 60 * 1000
      : params.interval * 7 * 24 * 60 * 60 * 1000;
    const intervalsElapsed = Math.max(
      0,
      Math.floor((params.rangeStart - params.startsAt) / intervalMs),
    );
    let candidate = new Date(params.startsAt + intervalsElapsed * intervalMs);
    if (candidate.getTime() < params.rangeStart) {
      candidate = addRecurrenceStep(
        candidate,
        params.frequency,
        params.interval,
        preferredDayOfMonth,
      );
    }
    return candidate;
  }
  const rangeStart = new Date(params.rangeStart);
  const monthsElapsed =
    (rangeStart.getFullYear() - start.getFullYear()) * 12 +
    (rangeStart.getMonth() - start.getMonth());
  const intervalsElapsed = Math.max(0, Math.floor(monthsElapsed / params.interval));
  let candidate = addMonthsClamped(
    start,
    intervalsElapsed * params.interval,
    preferredDayOfMonth,
  );
  if (candidate.getTime() < params.rangeStart) {
    candidate = addRecurrenceStep(
      candidate,
      params.frequency,
      params.interval,
      preferredDayOfMonth,
    );
  }
  return candidate;
}

function expand(params: {
  startsAt: string;
  frequency: Exclude<Frequency, "none">;
  rangeStart: string;
  rangeEnd: string;
  until?: string;
}): string[] {
  const startsAt = Date.parse(params.startsAt);
  const rangeStart = Date.parse(params.rangeStart);
  const rangeEnd = Date.parse(params.rangeEnd);
  const until = params.until ? Date.parse(params.until) : null;
  const preferredDayOfMonth = new Date(startsAt).getDate();
  const out: string[] = [];
  let occurrence = findFirstOccurrenceOnOrAfter({
    startsAt,
    rangeStart,
    frequency: params.frequency,
    interval: 1,
  });
  while (out.length < 20) {
    const ms = occurrence.getTime();
    if (ms > rangeEnd) break;
    if (until === null || ms <= until) {
      out.push(occurrence.toISOString().slice(0, 10));
    }
    if (until !== null && ms >= until) break;
    occurrence = addRecurrenceStep(occurrence, params.frequency, 1, preferredDayOfMonth);
  }
  return out;
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

console.log("community_events_recurrence_proof: ok");
