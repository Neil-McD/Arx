import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { eventPeopleLine, goingKey } = await import("../apps/web/src/v1/KitEventsList");

test("the people line says only what is known", () => {
  expect(eventPeopleLine({ host_name: "Neil McDevitt", count: 14, count_capped: false })).toBe("Neil is hosting · 14 going");
  expect(eventPeopleLine({ host_name: "Neil McDevitt", count: 0, count_capped: false })).toBe("Neil is hosting");
  expect(eventPeopleLine({ host_name: null, count: 1000, count_capped: true })).toBe("1000+ going");
  expect(eventPeopleLine(undefined)).toBe("");
});

test("each date of a repeating event has its own Going", () => {
  const a = goingKey({ parent_event_id: "e1", starts_at: "2026-11-13T18:00:00.000Z" });
  const b = goingKey({ parent_event_id: "e1", starts_at: "2026-11-20T18:00:00.000Z" });
  expect(a).not.toBe(b);
  expect(a).toBe(`e1:${Date.parse("2026-11-13T18:00:00.000Z")}`);
});
