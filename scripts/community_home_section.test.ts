import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { greetingFor, homeCardFor, homeEventTimeFor, homeFiguresFor, homeRowsFor, homeSentenceFor } = await import("../apps/web/src/components/WebCommunityHomeSection");
const { normalizeCommunityHomeSnapshot } = await import("../shared/cloudCommunityAdminGateway");

const quiet = normalizeCommunityHomeSnapshot({
  memberCount: 12,
  newMembers: { count: 0, names: [] },
  activity: { posts: 0, replies: 0, activePeople: 0 },
  unanswered: [],
  quietNewcomers: { count: 0, names: [] },
  joinRequestsPending: 0,
  upcomingEvents: [],
})!;

const busy = normalizeCommunityHomeSnapshot({
  memberCount: 214,
  newMembers: { count: 3, names: ["Tessa", "Dev", "Mira"] },
  activity: { posts: 9, replies: 21, activePeople: 14 },
  unanswered: [
    { author: "Rafael", channel: "general", text: "How do I price a founding tier?", hoursAgo: 50 },
    { author: "Sara", channel: "wins", text: "Who has a call script?", hoursAgo: 3 },
  ],
  quietNewcomers: { count: 1, names: ["Ben"] },
  joinRequestsPending: 2,
  upcomingEvents: [{ title: "Friday build call", startsAt: "2026-11-13T15:00:00.000Z" }],
})!;

const actions = { onOpenJoinRequests: vi.fn(), onOpenChannelByName: vi.fn(), onOpenEvents: vi.fn() };

test("the greeting follows the time of day", () => {
  expect(greetingFor(new Date(2026, 10, 10, 7))).toBe("Good morning");
  expect(greetingFor(new Date(2026, 10, 10, 14))).toBe("Good afternoon");
  expect(greetingFor(new Date(2026, 10, 10, 20))).toBe("Good evening");
});

test("join requests come first, in numerals, and open the requests", () => {
  const card = homeCardFor(busy, actions)!;
  expect(card.title).toBe("2 people are waiting to join");
  expect(card.action).toBe("Review the requests");
  card.onAction();
  expect(actions.onOpenJoinRequests).toHaveBeenCalledOnce();
  expect(homeSentenceFor(busy, card)).toBe("3 people joined since yesterday, and 1 thing needs you.");
});

test("without join requests, the oldest unanswered question is the card", () => {
  const card = homeCardFor({ ...busy, joinRequestsPending: 0 }, actions)!;
  expect(card.title).toBe("Rafael's question has had no answer for 2 days");
  expect(card.action).toBe("Open #general");
  card.onAction();
  expect(actions.onOpenChannelByName).toHaveBeenCalledWith("general");
});

test("a quiet day has no card and says so", () => {
  expect(homeCardFor(quiet, actions)).toBeNull();
  expect(homeSentenceFor(quiet, null)).toBe("Nothing needs you today.");
  expect(homeRowsFor(quiet, actions)).toEqual([
    { kind: "Activity", title: "No new posts or replies in the last day", detail: "12 members in all" },
  ]);
});

test("the rows say what happened, and the card's question is not repeated", () => {
  const rows = homeRowsFor(busy, actions);
  expect(rows.map((row) => [row.kind, row.title])).toEqual([
    ["Joined", "3 new members"],
    ["Waiting", "Rafael asked in #general"],
    ["Waiting", "Sara asked in #wins"],
    ["Quiet", "1 newcomer hasn't said hello yet"],
    ["Coming up", "Friday build call"],
    ["Activity", "9 posts and 21 replies from 14 people"],
  ]);
  expect(rows[0].detail).toBe("Tessa, Dev and 1 more");
});

test("when join requests take the card, the oldest question stays in the rows", () => {
  const rows = homeRowsFor(busy, actions).filter((row) => row.kind === "Waiting");
  expect(rows.map((row) => row.title)).toEqual(["Rafael asked in #general", "Sara asked in #wins"]);
  const withoutRequests = homeRowsFor({ ...busy, joinRequestsPending: 0 }, actions).filter((row) => row.kind === "Waiting");
  expect(withoutRequests.map((row) => row.title)).toEqual(["Sara asked in #wins"]);
});

test("the snapshot is read defensively", () => {
  expect(normalizeCommunityHomeSnapshot(null)).toBeNull();
  expect(normalizeCommunityHomeSnapshot({ joinRequestsPending: -4, newMembers: { count: "x", names: [1, "Ana"] } })).toMatchObject({
    joinRequestsPending: 0,
    newMembers: { count: 0, names: ["Ana"] },
    unanswered: [],
  });
});

test("a member's Home has no card, no join requests, and asks for help rather than action", () => {
  expect(homeCardFor(busy, actions, "member")).toBeNull();
  expect(homeSentenceFor(busy, null, "member")).toBe("3 people joined since yesterday, and there are 30 new messages.");
  expect(homeSentenceFor(quiet, null, "member")).toBe("It's quiet today.");
  const rows = homeRowsFor(busy, actions, "member");
  expect(rows.filter((row) => row.kind === "Can you help?").map((row) => row.title)).toEqual([
    "Rafael asked in #general",
    "Sara asked in #wins",
  ]);
  expect(rows.some((row) => row.kind === "Waiting")).toBe(false);
  expect(homeFiguresFor(busy, "member").map((figure) => figure.label)).toEqual(["Members", "Active today"]);
});

test("the host's panel counts what the page already knows", () => {
  expect(homeFiguresFor(busy, "host")).toEqual([
    { label: "Members", value: "214", note: "3 joined since yesterday" },
    { label: "Active today", value: "14", note: "9 posts, 21 replies" },
    { label: "Waiting to join", value: "2", note: "requests" },
    { label: "Unanswered", value: "2", note: "questions" },
  ]);
});

test("an event soon is told in minutes or hours", () => {
  const now = new Date("2026-11-13T14:40:00.000Z");
  expect(homeEventTimeFor("2026-11-13T15:00:00.000Z", now)).toBe("In 20 minutes");
  expect(homeEventTimeFor("2026-11-13T17:40:00.000Z", now)).toBe("In 3 hours");
  expect(homeEventTimeFor("not a date", now)).toBe("");
});
