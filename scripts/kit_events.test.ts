import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { eventPlaceWord, eventSoonWord } = await import("../apps/web/src/v1/KitEventsList");
const { eventRepeatWord } = await import("../apps/web/src/components/communityEventsList");
const { readFileSync } = await import("node:fs");

test("a place says only what the host said", () => {
  expect(eventPlaceWord({ location_type: "online", location_label: null })).toBe("Online");
  expect(eventPlaceWord({ location_type: "online", location_label: "Zoom" })).toBe("Online · Zoom");
  expect(eventPlaceWord({ location_type: "physical", location_label: "The Foundry" })).toBe("The Foundry");
  expect(eventPlaceWord({ location_type: "tbd", location_label: null })).toBe("");
});

test("a repeating event says how often in words", () => {
  expect(eventRepeatWord({ starts_at: "2026-11-19T12:00:00.000Z", recurrence_frequency: "weekly" })).toMatch(/^every \S+day$/);
  expect(eventRepeatWord({ starts_at: "2026-11-19T12:00:00.000Z", recurrence_frequency: "daily" })).toBe("every day");
  expect(eventRepeatWord({ starts_at: "2026-11-19T12:00:00.000Z", recurrence_frequency: "none" })).toBeNull();
});

test("how soon an event is, in words", () => {
  const now = Date.parse("2026-11-16T12:00:00.000Z");
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  expect(eventSoonWord(at(30), now)).toMatch(/· in 30 minutes$/);
  expect(eventSoonWord(at(21 * 60), now)).toMatch(/· in 21 hours$/);
  expect(eventSoonWord(at(3 * 24 * 60), now)).toMatch(/· in 3 days$/);
  // Far off, or already started: just the day.
  expect(eventSoonWord(at(40 * 24 * 60), now)).not.toContain("·");
  expect(eventSoonWord(at(-10), now)).not.toContain("·");
});

// Neil, Nov 15: adding is by a button and a plain form, not a sentence.
test("an event is added with a form, not by typing a sentence", () => {
  const form = readFileSync(new URL("../apps/web/src/v1/KitEventForm.tsx", import.meta.url), "utf8");
  expect(form).not.toMatch(/readEventLine|Office hours every Tuesday/);
  expect(readFileSync(new URL("../apps/web/src/v1/KitEventsList.tsx", import.meta.url), "utf8")).toContain("Add an event");
});

// Neil, Nov 14: no "I'll be there" for now. The page, Home and a pod's call
// must not bring it back by the side door.
test("nothing in the app asks who is going", () => {
  for (const file of ["apps/web/src/v1/KitEventsList.tsx", "apps/web/src/v1/KitNextEvent.tsx", "apps/web/src/v1/KitPodCall.tsx", "shared/cloudCommunityEventsGateway.ts"]) {
    expect(readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).not.toMatch(/EventGoing|I'll be there/);
  }
});

// The event form opens in the page; cancelling asks in the row.
test("the Events page has no pop-up and no browser confirm", () => {
  const section = readFileSync(new URL("../apps/web/src/components/WebCommunityEventsSection.tsx", import.meta.url), "utf8");
  expect(section).not.toMatch(/EventModal|window\.confirm/);
  expect(readFileSync(new URL("../apps/web/src/v1/KitEventsList.tsx", import.meta.url), "utf8")).not.toMatch(/window\.confirm|modal/);
});
