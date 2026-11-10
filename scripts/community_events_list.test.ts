import { expect, test } from "vitest";
import { eventDateBlock, eventDayWord, featuredEventLabel, splitCommunityEvents } from "../apps/web/src/components/communityEventsList";

const now = new Date(2026, 10, 13, 9, 40).getTime(); // Fri 13 Nov 2026, 9:40
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();
const ev = (id: string, starts: string, extra: Partial<{ ends_at: string | null; status: string }> = {}) =>
  ({ id, starts_at: starts, ends_at: null, status: "live", ...extra });

test("the soonest event that is not over is featured; the rest are coming up; past is newest first", () => {
  const parts = splitCommunityEvents([
    ev("later", at(21, 13)),
    ev("soon", at(13, 10)),
    ev("old", at(6, 10), { ends_at: at(6, 11) }),
    ev("older", at(1, 10), { ends_at: at(1, 11) }),
    ev("cancelled", at(13, 9, 50), { status: "cancelled" }),
    ev("next", at(17, 18)),
  ], now);
  expect(parts.featured?.id).toBe("soon");
  expect(parts.comingUp.map((event) => event.id)).toEqual(["next", "later"]);
  expect(parts.past.map((event) => event.id)).toEqual(["old", "older"]);
});

test("an event that has started is still featured until it ends", () => {
  const parts = splitCommunityEvents([ev("now", at(13, 9), { ends_at: at(13, 10) }), ev("next", at(17, 18))], now);
  expect(parts.featured?.id).toBe("now");
  expect(featuredEventLabel(parts.featured!, now)).toEqual({ text: "Happening now", live: true });
});

test("the featured label counts down in the last hour, then names the day", () => {
  expect(featuredEventLabel(ev("a", at(13, 10)), now)).toEqual({ text: "Live in 20 minutes", live: true });
  expect(featuredEventLabel(ev("b", at(13, 18)), now)).toEqual({ text: "Today", live: false });
  expect(featuredEventLabel(ev("c", at(14, 10)), now)).toEqual({ text: "Tomorrow", live: false });
  expect(eventDayWord(at(16, 10), now)).toBe(new Date(at(16, 10)).toLocaleDateString(undefined, { weekday: "long" }));
});

test("the date block shows the day and the weekday, or the month once it is past", () => {
  expect(eventDateBlock(at(17, 18), false)).toEqual({ number: "17", word: new Date(at(17, 18)).toLocaleDateString(undefined, { weekday: "short" }) });
  expect(eventDateBlock(at(6, 10), true)).toEqual({ number: "6", word: new Date(at(6, 10)).toLocaleDateString(undefined, { month: "short" }) });
});
