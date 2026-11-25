import { expect, test } from "vitest";
import { aiEventList } from "../shared/aiEventList";

const weekly = (week: number) => ({ id: `call:${week}`, parent_event_id: "call", title: "Group Call", recurrence_frequency: "weekly",
  starts_at: `2026-12-${String(4 + week * 7).padStart(2, "0")}T15:00:00.000Z`, starts_at_zoned: `2026-12-${String(4 + week * 7).padStart(2, "0")}T10:00 New York` });
const once = (id: string, day: number) => ({ id, parent_event_id: id, title: id, recurrence_frequency: "none", starts_at: `2026-12-${String(day).padStart(2, "0")}T12:00:00.000Z` });

test("a weekly call is listed once, at its next time, with the next few after it; one-off events stay as they are", () => {
  const listed = aiEventList([weekly(0), once("Race day", 6), weekly(1), weekly(2), weekly(3), weekly(4)], 20);
  expect(listed.events.map((event) => event.title)).toEqual(["Group Call", "Race day"]);
  expect(listed.events[0]).toMatchObject({
    id: "call:0",
    next_times: ["2026-12-11T10:00 New York", "2026-12-18T10:00 New York", "2026-12-25T10:00 New York"],
    next_starts_at: ["2026-12-11T15:00:00.000Z", "2026-12-18T15:00:00.000Z", "2026-12-25T15:00:00.000Z"],
  });
  expect(listed.events[1]).not.toHaveProperty("next_times");
  expect(listed.events[1]).not.toHaveProperty("next_starts_at");
  expect(listed.more).toBe(false);
});

test("the limit counts distinct events, and says when there are more", () => {
  const listed = aiEventList([weekly(0), once("A", 5), once("B", 6), weekly(1), once("C", 13)], 2);
  expect(listed.events.map((event) => event.title)).toEqual(["Group Call", "A"]);
  expect(listed.more).toBe(true);
});
