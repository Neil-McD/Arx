import { expect, test } from "vitest";
import { normalizeCommunityHomeSnapshot } from "../shared/cloudCommunityAdminGateway";
import { eventsToday, todayCounts, todayLines } from "../shared/communityHomeToday";

const base = {
  memberCount: 12,
  newMembers: { count: 0, names: [] },
  activity: { posts: 0, replies: 0, activePeople: 0 },
  week: { joined: 0, activePeople: 0 },
  unanswered: [],
  quietNewcomers: { count: 0, names: [] },
  joinRequestsPending: 0,
  upcomingEvents: [],
};
const quiet = normalizeCommunityHomeSnapshot(base)!;
const busy = normalizeCommunityHomeSnapshot({
  ...base,
  newMembers: { count: 3, names: ["Tessa", "Dev", "Mira"] },
  activity: { posts: 7, replies: 4, activePeople: 5 },
  busiest: { channel: "wins", channelSlug: "wins", posts: 4, replies: 3, people: 4 },
  highlight: { title: "Jon passed 100 members", channel: "wins", channelSlug: "wins", replies: 3 },
  unanswered: [{ author: "Rafael", channel: "biz", text: "How do I price?", hoursAgo: 5 }],
  joinRequestsPending: 2,
  upcomingEvents: [{ title: "Friday build call", startsAt: "2026-11-13T15:00:00.000Z" }],
})!;

test("a quiet day says so, with no counts", () => {
  expect(todayLines(quiet, "member")).toEqual([{ text: "A quiet day so far.", target: null }]);
  expect(todayCounts(quiet)).toBeNull();
});

test("a busy day leads with the post people are replying to, then where it's busiest", () => {
  const lines = todayLines(busy, "member");
  expect(lines.map((line) => line.text)).toEqual([
    "“Jon passed 100 members” in #wins has 3 replies.",
    "Busiest in #wins: 7 messages from 4 people.",
    "A question in #biz is waiting for an answer.",
  ]);
  expect(lines[0].target).toEqual({ kind: "channel", slug: "wins", name: "wins" });
  expect(todayCounts(busy)).toBe("7 posts · 4 replies · 5 people");
});

test("the host also hears who is waiting and whose question is open; a member never sees names", () => {
  const host = todayLines(busy, "host", 5).map((line) => line.text);
  expect(host).toContain("2 people are waiting to join.");
  expect(host).toContain("Rafael's question in #biz has no answer yet.");
  expect(host).toContain("Tessa and Dev and 1 more joined.");
  const member = todayLines(busy, "member", 5).map((line) => line.text);
  expect(member.join(" ")).not.toMatch(/Rafael|Tessa|waiting to join/);
  expect(member).toContain("3 new members joined.");
});

test("events today are the ones starting on the viewer's day", () => {
  expect(eventsToday(busy, new Date("2026-11-13T09:00:00.000Z")).map((event) => event.title)).toEqual(["Friday build call"]);
  expect(eventsToday(busy, new Date("2026-11-11T09:00:00.000Z"))).toEqual([]);
});
