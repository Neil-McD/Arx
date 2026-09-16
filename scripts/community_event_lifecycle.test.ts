import { expect, test } from "vitest";
import { communityEventPhase, communityEventDisplayEnd, nextCommunityEventBoundary } from "../shared/communityEventLifecycle";

const event = { starts_at: "2026-09-04T14:00:00Z", ends_at: "2026-09-04T15:00:00Z" };
test("classification changes exactly at start and end", () => {
  expect(communityEventPhase(event, Date.parse(event.starts_at) - 1)).toBe("upcoming");
  expect(communityEventPhase(event, Date.parse(event.starts_at))).toBe("ongoing");
  expect(communityEventPhase(event, Date.parse(event.ends_at))).toBe("past");
});
test("absent end is an explicit one-hour display policy, not invented event data", () => {
  const unknown = { ...event, ends_at: null };
  expect(communityEventPhase(unknown, Date.parse(event.starts_at))).toBe("started");
  expect(communityEventDisplayEnd(unknown)).toBe(Date.parse(event.ends_at));
  expect(unknown.ends_at).toBeNull();
  expect(communityEventPhase({ ...event, ends_at: "bad" }, Date.now())).toBe("invalid");
});
test("next wake is an event or local month boundary, not a polling interval", () => {
  expect(nextCommunityEventBoundary([event], Date.parse(event.starts_at) - 1)).toBe(Date.parse(event.starts_at));
  expect(nextCommunityEventBoundary([event], Date.parse(event.starts_at))).toBe(Date.parse(event.ends_at));
  const now = new Date(2026, 8, 30, 23, 59).getTime();
  expect(nextCommunityEventBoundary([], now)).toBe(new Date(2026, 9, 1).getTime());
});
