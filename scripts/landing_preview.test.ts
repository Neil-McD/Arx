// The home page's product preview: the real app's kit with a fixed script.
// Every click moves one step, the pages share one state, and the words only
// claim what Polynet does today.
import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
vi.mock("../apps/web/src/posthogAnalytics", () => ({ captureProductAnalyticsEvent: () => undefined }));
const { RealAppPreview, previewReducer, INITIAL_PREVIEW, GUIDE_REPLY, CHIP_ANSWERS, PREVIEW_COMMUNITY, buildClubBrain } =
  await import("../apps/web/src/components/polynetLanding/RealAppPreview");

const run = (...actions: Parameters<typeof previewReducer>[1][]) => actions.reduce(previewReducer, INITIAL_PREVIEW);

test("a check-in is drafted, waits for the yes, and is sent once", () => {
  expect(run({ type: "send" }).joshCheckedIn).toBe(false);
  expect(run({ type: "review" }).draftOpen).toBe(true);
  expect(run({ type: "review" }, { type: "skip" })).toMatchObject({ draftOpen: false, joshCheckedIn: false });
  const sent = run({ type: "review" }, { type: "send" });
  expect(sent).toMatchObject({ draftOpen: false, joshCheckedIn: true });
  // Sent on Home, it shows on Members, and can't be drafted again.
  const onMembers = previewReducer(sent, { type: "open", page: "members" });
  expect(onMembers.joshCheckedIn).toBe(true);
  expect(previewReducer(onMembers, { type: "review" }).draftOpen).toBe(false);
});

test("the guide answers only after the question is sent", () => {
  expect(run({ type: "answer" }).answered).toBe(false);
  expect(run({ type: "open", page: "general" }, { type: "ask" }, { type: "answer" })).toMatchObject({ asked: true, answered: true });
});

test("a guide's source opens its place on the brain map, and leaving clears what was open", () => {
  const known = run({ type: "open", page: "know", picked: "resource:first10" });
  expect(known).toMatchObject({ page: "know", picked: "resource:first10" });
  expect(previewReducer(known, { type: "open", page: "home" }).picked).toBeNull();
  const talking = run({ type: "talk", chip: "Who might leave?" });
  expect(previewReducer(talking, { type: "open", page: "inbox" }).talk).toBeNull();
  const member = run({ type: "open", page: "members" }, { type: "member", key: "m6" });
  expect(previewReducer(member, { type: "open", page: "home" }).member).toBeNull();
});

test("the brain map holds The Build Club's own courses and learned things", () => {
  const map = buildClubBrain(Date.now());
  expect(map.center.name).toBe(PREVIEW_COMMUNITY);
  expect(map.counts.courses).toBe(2);
  expect(map.courses.flatMap((course) => course.lessons.map((lesson) => lesson.id))).toContain("resource:first10");
  expect(map.counts.learned).toBeGreaterThan(8);
});

test("it opens on Home with the real app's menu, and claims only what's true", () => {
  const html = renderToStaticMarkup(React.createElement(RealAppPreview)).replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  expect(html).toContain(PREVIEW_COMMUNITY);
  expect(html).toContain("Good morning.");
  expect(html).toContain("Review the draft");
  for (const label of ["Home", "Inbox", "general", "wins", "Knowledge", "Events", "Members"]) expect(html).toContain(label);
  const words = `${html} ${GUIDE_REPLY} ${Object.values(CHIP_ANSWERS).join(" ")}`;
  const found = words.match(/.{50}(RSVP|\d+ going|voice note|import|trained on|Coming soon).{30}/i)?.[0] ?? null;
  expect(found).toBeNull();
});
