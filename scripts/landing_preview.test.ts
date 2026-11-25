// The home page's product preview: Polynet as it is today, with a fixed
// script. Every click moves one step, the pages share one state, and the
// words only claim what Polynet does today.
import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
vi.mock("../apps/web/src/posthogAnalytics", () => ({ captureProductAnalyticsEvent: () => undefined }));
const { RealAppPreview, previewReducer, INITIAL_PREVIEW, GUIDE_REPLY, CHIP_ANSWERS, CHECK_IN_TEXT, PREVIEW_COMMUNITY, buildClubBrain } =
  await import("../apps/web/src/components/polynetLanding/RealAppPreview");

const run = (...actions: Parameters<typeof previewReducer>[1][]) => actions.reduce(previewReducer, INITIAL_PREVIEW);

test("join requests are approved or declined one at a time", () => {
  expect(run({ type: "approve", id: "r1" }).waiting).toEqual(["r2"]);
  expect(run({ type: "approve", id: "r1" }, { type: "decline", id: "r2" }).waiting).toEqual([]);
});

test("the guide's drafts leave Home once sent or skipped, and skipping never sends", () => {
  expect(run({ type: "send_check_in" }).checkIn).toBe("sent");
  expect(run({ type: "skip_check_in" }).checkIn).toBe("skipped");
  expect(run({ type: "post_reply" }).replyDraft).toBe("sent");
  expect(run({ type: "skip_reply" }).replyDraft).toBe("skipped");
  // Once decided it stays decided: a skipped draft can't become sent.
  expect(run({ type: "skip_check_in" }, { type: "send_check_in" }).checkIn).toBe("skipped");
  // Leaving Home keeps what was decided.
  expect(previewReducer(run({ type: "send_check_in" }), { type: "open", page: "members" }).checkIn).toBe("sent");
});

test("the guide answers only after the question is sent", () => {
  expect(run({ type: "answer" }).answered).toBe(false);
  expect(run({ type: "open", page: "general" }, { type: "ask" }, { type: "answer" })).toMatchObject({ asked: true, answered: true });
});

test("a source opens its place on the brain map, and leaving clears what was open", () => {
  const known = run({ type: "open", page: "brain", picked: "resource:first10" });
  expect(known).toMatchObject({ page: "brain", picked: "resource:first10" });
  expect(previewReducer(known, { type: "open", page: "home" }).picked).toBeNull();
  expect(previewReducer(run({ type: "talk", chip: "How was this week?" }), { type: "open", page: "inbox" }).talk).toBeNull();
  const member = run({ type: "open", page: "members" }, { type: "member", key: "m6" });
  expect(previewReducer(member, { type: "open", page: "home" }).member).toBeNull();
});

test("the brain map holds The Build Club's own courses and learned things", () => {
  const map = buildClubBrain(Date.now());
  expect(map.center.name).toBe(PREVIEW_COMMUNITY);
  expect(map.counts.courses).toBe(2);
  expect(map.counts.learned).toBeGreaterThan(8);
});

test("it opens on Home with the live app's menu and Home, and claims only what's true", () => {
  const html = renderToStaticMarkup(React.createElement(RealAppPreview)).replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  for (const label of [PREVIEW_COMMUNITY, "Search or ask", "Home", "Inbox", "Channels", "Pods", "Knowledge", "Events", "Members", "Analytics", "Invite people",
    "Needs you", "2 people asked to join", "Your guide suggests", "The community today", "Who is at risk of leaving?"]) {
    expect(html, label).toContain(label);
  }
  const words = `${html} ${GUIDE_REPLY} ${CHECK_IN_TEXT} ${Object.values(CHIP_ANSWERS).join(" ")}`;
  const found = words.match(/.{50}(RSVP|\d+ going|voice note|import|trained on|Coming soon).{30}/i)?.[0] ?? null;
  expect(found).toBeNull();
});
