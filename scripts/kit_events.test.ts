import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { eventPlaceWord, eventSoonWord, EventsCalendarPanel, KitEventsList } = await import("../apps/web/src/v1/KitEventsList");
const { renderToStaticMarkup } = await import("react-dom/server");
const { eventRepeatWord } = await import("../apps/web/src/components/communityEventsList");
const {
  buildRollingEventsCalendar,
  formatCalendarDayHeading,
  localEventDayKey,
} = await import("../apps/web/src/components/communityEventsCalendar");
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

test("buildRollingEventsCalendar builds a 5-week grid across a month boundary with repeating and cancelled dates", () => {
  const nowDate = new Date(2026, 10, 27, 15, 0, 0); // Fri, Nov 27, 2026 local
  const now = nowDate.getTime();
  const makeOcc = (id: string, monthIndex: number, day: number, hour: number, status = "scheduled") => ({
    id,
    starts_at: new Date(2026, monthIndex, day, hour, 0, 0).toISOString(),
    ends_at: new Date(2026, monthIndex, day, hour + 1, 0, 0).toISOString(),
    status,
  });

  const cal = buildRollingEventsCalendar([
    makeOcc("ev:nov24", 10, 24, 10, "scheduled"), // past earlier this week
    makeOcc("ev:dec4", 11, 4, 10, "scheduled"),
    makeOcc("ev:dec4", 11, 4, 10, "scheduled"), // duplicate id ignored
    makeOcc("ev:dec11", 11, 11, 10, "scheduled"),
    makeOcc("ev:dec15", 11, 15, 10, "cancelled"),
    makeOcc("ev:dec18", 11, 18, 10, "scheduled"),
    makeOcc("ev:dec18b", 11, 18, 14, "cancelled"),
  ], now);

  expect(cal.days).toHaveLength(35);
  expect(cal.days[0]!.date.getDay()).toBe(0); // Sunday of current week (Nov 22)
  expect(cal.todayKey).toBe(localEventDayKey(nowDate));
  expect(cal.rangeLabel).toBe("Nov – Dec");
  expect(cal.upcomingCount30d).toBe(3); // Dec 4, Dec 11, Dec 18
  expect(cal.cancelledCount30d).toBe(2); // Dec 15, Dec 18b

  const nov24 = cal.days.find((d) => d.dayKey === "2026-11-24")!;
  expect(nov24.isPast).toBe(true);
  expect(nov24.liveCount).toBe(1);

  const nov27 = cal.days.find((d) => d.dayKey === "2026-11-27")!;
  expect(nov27.isToday).toBe(true);
  expect(nov27.isPast).toBe(false);

  const dec1 = cal.days.find((d) => d.dayKey === "2026-12-01")!;
  expect(dec1.isMonthStart).toBe(true);
  expect(dec1.monthShort).toBe("Dec");

  const dec11 = cal.days.find((d) => d.dayKey === "2026-12-11")!;
  expect(dec11.liveCount).toBe(1);
  expect(dec11.cancelledCount).toBe(0);

  const dec15 = cal.days.find((d) => d.dayKey === "2026-12-15")!;
  expect(dec15.liveCount).toBe(0);
  expect(dec15.cancelledCount).toBe(1);

  const dec18 = cal.days.find((d) => d.dayKey === "2026-12-18")!;
  expect(dec18.liveCount).toBe(1);
  expect(dec18.cancelledCount).toBe(1);
  expect(dec18.events.map((e) => e.id)).toEqual(["ev:dec18", "ev:dec18b"]);

  expect(formatCalendarDayHeading("2026-11-27", now)).toMatch(/^Today · /);
  expect(formatCalendarDayHeading("2026-11-28", now)).toMatch(/^Tomorrow · /);
  expect(formatCalendarDayHeading("2026-12-04", now)).toBe("Fri, Dec 4");
});

test("EventsCalendarPanel renders the rolling 30-day grid, selected-day events, and host add-event shortcut", () => {
  const now = new Date(2026, 10, 27, 15, 0, 0).getTime();
  const baseEvent = {
    community_id: "comm_1",
    parent_event_id: "ev_series",
    title: "Group Call",
    description_md: null,
    starts_at: new Date(2026, 11, 4, 10, 0, 0).toISOString(),
    ends_at: new Date(2026, 11, 4, 11, 0, 0).toISOString(),
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
  const occurrences = [
    { ...baseEvent, id: "ev_series:dec4" },
    {
      ...baseEvent,
      id: "ev_series:dec11",
      starts_at: new Date(2026, 11, 11, 10, 0, 0).toISOString(),
      ends_at: new Date(2026, 11, 11, 11, 0, 0).toISOString(),
    },
  ];

  // Resting view: summary + every future repeating date marked in the grid.
  const restingHtml = renderToStaticMarkup(React.createElement(EventsCalendarPanel, {
    events: occurrences,
    now,
    canManage: true,
    selectedDayKey: null,
    onSelectDay: () => {},
    onPickEvent: () => {},
    onNewForDay: () => {},
  }));
  expect(restingHtml).toContain("Next 30 days");
  expect(restingHtml).toContain("Nov – Dec");
  expect(restingHtml).toContain("2 events in the next 30 days");
  expect(restingHtml).toContain("Fri, Dec 11 · 1 event");

  // Selected day with an event: shows that date's event row + host shortcut.
  const pickedDayHtml = renderToStaticMarkup(React.createElement(EventsCalendarPanel, {
    events: occurrences,
    now,
    canManage: true,
    selectedDayKey: "2026-12-11",
    onSelectDay: () => {},
    onPickEvent: () => {},
    onNewForDay: () => {},
  }));
  expect(pickedDayHtml).toContain("Fri, Dec 11");
  expect(pickedDayHtml).toContain("Group Call");
  expect(pickedDayHtml).toContain("Add an event for Dec 11");

  // Selected empty future day for a member: no host add button.
  const memberEmptyDayHtml = renderToStaticMarkup(React.createElement(EventsCalendarPanel, {
    events: occurrences,
    now,
    canManage: false,
    selectedDayKey: "2026-12-09",
    onSelectDay: () => {},
    onPickEvent: () => {},
    onNewForDay: () => {},
  }));
  expect(memberEmptyDayHtml).toContain("Nothing scheduled.");
  expect(memberEmptyDayHtml).not.toContain("Add an event for");
});
