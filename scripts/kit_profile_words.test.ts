import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { renderToStaticMarkup } = await import("react-dom/server");
const { KitProfile, profileSubLine } = await import("../apps/web/src/v1/KitProfile");
const { lastHereDay } = await import("../apps/web/src/v1/KitProfileHost");
const { sampleJourneyBoard } = await import("../apps/web/src/components/polynetLanding/boardSample");
const { memberTimeFor } = await import("../apps/web/src/v1/memberTime");

const NOW = new Date("2026-11-24T15:00:00").getTime();

test("the line under a name says only what there is", () => {
  expect(profileSubLine({ handle: "@maya", here_now: true, you: false })).toBe("@maya · Here now");
  expect(profileSubLine({ handle: "maya", here_now: false, you: false })).toBe("@maya");
  expect(profileSubLine({ handle: null, here_now: false, you: false })).toBe("");
  // Your own profile says what it is, never that you are here.
  expect(profileSubLine({ handle: "maya", here_now: true, you: true })).toBe("@maya · This is what other members see");
});

test("a host's summary says when someone was last here in plain words", () => {
  expect(lastHereDay("2026-11-24T01:00:00", NOW)).toBe("today");
  expect(lastHereDay("2026-11-23T23:00:00", NOW)).toBe("yesterday");
  expect(lastHereDay("2026-11-20T12:00:00", NOW)).toBe("Friday");
  expect(lastHereDay("2026-11-10T12:00:00", NOW)).toBe("Nov 10");
  expect(lastHereDay(null, NOW)).toBeNull();
});

// One person, one window: members see the profile; hosts see the same
// profile with their part (summary line, ⋯ menu, "Only hosts see this").
function josh() {
  const board = sampleJourneyBoard(NOW);
  const card = board.cards.find((entry) => entry.name === "Josh Reed")!;
  const profile = {
    membership_id: card.membership_id, user_id: card.user_id, name: "Josh Reed", handle: "josh-reed", avatar_url: null,
    bio: "Course creator.", links: {}, role: "member", here_now: false, you: false,
    facts: [{ kind: "goal", label: "Working on", body: "Pricing his first course" }],
    in_common: [], hosts: [], shared: [], can_message: true, message_community_id: "c1", viewer_can_manage: false,
  } as any;
  const record = {
    membership_id: card.membership_id, user_id: card.user_id, name: "Josh Reed", handle: "josh-reed", avatar_url: null, role: "member",
    joined_at: card.joined_at, last_active_at: card.last_active_at, out: null, plan: { kind: "paid", label: "$49 a month", price_point_id: "p" },
    money: null, facts: [], events: [], notes: [{ id: "n1", body: "Keen on pricing.", author: "you", at: new Date(NOW).toISOString(), can_delete: true }],
  } as any;
  return { profile, host: { record, card, stages: board.stages, timeFor: memberTimeFor, onUpdateJourney: async () => {}, onAddNote: async () => {}, onOpenDraft: () => {} } };
}
const avatars = { getAvatarColor: () => "#333", getInitials: (name: string) => name.slice(0, 1) };

test("a member sees the profile only: no host summary, menu or notes", () => {
  const { profile } = josh();
  const html = renderToStaticMarkup(React.createElement(KitProfile, { profile, now: NOW, ...avatars })).replace(/&#x27;/g, "'");
  expect(html).toContain("Josh Reed");
  expect(html).toContain("Pricing his first course");
  expect(html).not.toContain("Only hosts see this");
  expect(html).not.toContain("Options for Josh");
  expect(html).not.toContain("Keen on pricing.");
  expect(html).not.toContain("$49 a month");
});

test("a host sees the same profile, a summary line, the ⋯ menu, and the guide's waiting check-in as a way in", () => {
  const { profile, host } = josh();
  const html = renderToStaticMarkup(React.createElement(KitProfile, { profile: { ...profile, viewer_can_manage: true }, host, now: NOW, ...avatars })).replace(/&#x27;/g, "'");
  expect(html).toContain("Pricing his first course");
  expect(html).toContain("Getting started");
  expect(html).toContain("$49 a month");
  expect(html).toContain('aria-label="Options for Josh"');
  expect(html).toContain("Only hosts see this");
  expect(html).toContain("Drafted a check-in, waiting for you");
  expect(html).toContain("Keen on pricing.");
  // Controls live in the menu: nothing to fill in until one is picked.
  expect(html).not.toContain("<select");
  expect(html).not.toContain("<textarea");
});
