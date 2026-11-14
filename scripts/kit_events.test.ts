import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { eventPlaceWord } = await import("../apps/web/src/v1/KitEventsList");
const { eventDraftWords } = await import("../apps/web/src/v1/KitEventForm");
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

test("the add box says back what its fields hold", () => {
  expect(eventDraftWords({ starts_at: "2026-12-01T15:00", ends_at: "2026-12-01T16:00", recurrence_frequency: "weekly", location_type: "online", location_label: "" }))
    .toEqual({ day: "Tue, Dec 1", time: "3:00 to 4:00 pm", repeats: "Every Tuesday", where: "Online" });
  expect(eventDraftWords({ starts_at: "2026-12-12T11:00", ends_at: "2026-12-12T13:30", recurrence_frequency: "none", location_type: "physical", location_label: "The Foundry" }))
    .toEqual({ day: "Sat, Dec 12", time: "11:00 am to 1:30 pm", repeats: null, where: "The Foundry" });
});

// Neil, Nov 14: no "I'll be there" for now. The page, Home and a pod's call
// must not bring it back by the side door.
test("nothing in the app asks who is going", () => {
  for (const file of ["apps/web/src/v1/KitEventsList.tsx", "apps/web/src/v1/KitNextEvent.tsx", "apps/web/src/v1/KitPodCall.tsx", "shared/cloudCommunityEventsGateway.ts"]) {
    expect(readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).not.toMatch(/EventGoing|I'll be there/);
  }
});

// The event form opens in the page; cancelling asks in the row.
test("the v1 page has no pop-up and no browser confirm", () => {
  const section = readFileSync(new URL("../apps/web/src/components/WebCommunityEventsSection.tsx", import.meta.url), "utf8");
  expect(section).toMatch(/draft && !isDesignV1Active\(\) \? \(\s*<EventModal/);
  expect(readFileSync(new URL("../apps/web/src/v1/KitEventsList.tsx", import.meta.url), "utf8")).not.toMatch(/window\.confirm|modal/);
});
