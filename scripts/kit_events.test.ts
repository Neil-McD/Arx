import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { eventPlaceWord, eventSoonWord, KitEventsList } = await import("../apps/web/src/v1/KitEventsList");
const { renderToStaticMarkup } = await import("react-dom/server");
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

test("KitEventsList shows an inline cancelled notice in the Next card when an earlier date of that series is cancelled", () => {
  const now = Date.parse("2026-11-25T23:00:00.000Z");
  const baseEvent = {
    community_id: "comm_1",
    parent_event_id: "ev_series",
    title: "Group Call",
    description_md: null,
    starts_at: "2026-12-04T15:00:00.000Z",
    ends_at: "2026-12-04T16:00:00.000Z",
    timezone: "America/New_York",
    location_type: "online" as const,
    location_label: "Zoom",
    url: "https://zoom.us/j/123",
    recurrence_frequency: "weekly" as const,
    visibility: "members" as const,
    status: "scheduled" as const,
    pod_channel_id: null,
    pod_name: null,
    cancellation_scope: null,
    cancellation_note: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
  const html = renderToStaticMarkup(React.createElement(KitEventsList, {
    featured: { ...baseEvent, id: "ev_series:dec4" },
    comingUp: [],
    cancelled: [{
      ...baseEvent,
      id: "ev_series:nov27",
      starts_at: "2026-11-27T15:00:00.000Z",
      ends_at: "2026-11-27T16:00:00.000Z",
      status: "cancelled",
      cancellation_scope: "occurrence",
      cancellation_note: "Canceled for Thanksgiving.",
    }],
    past: [],
    now,
    canManage: true,
    communityName: "Test",
    timeLabel: () => ({ primary: "10:00 AM EST", secondary: null }),
    calendarUrl: () => "https://example.com/cal",
    form: null,
    editingId: null,
    onNew: () => {},
    onEdit: () => {},
    onCancel: () => {},
    onSetPublic: () => {},
    renderRail: () => null,
  }));
  expect(html).toContain("Canceled for Thanksgiving.");
  expect(html).toContain("Cancelled");
  expect(html).toContain("Friday");
  expect(html).toContain("Group Call");
});
