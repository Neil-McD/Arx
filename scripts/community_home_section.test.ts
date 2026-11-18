import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { greetingFor, homeClockFor, homeSentenceFor, hostThingsFor, memberThingsFor } = await import("../apps/web/src/components/WebCommunityHomeSection");
const { ownerNoticed } = await import("../shared/communityOwnerMoments");
const { memberNextSteps } = await import("../shared/communityHomeMoments");
const { normalizeCommunityHomeSnapshot } = await import("../shared/cloudCommunityAdminGateway");

const quiet = normalizeCommunityHomeSnapshot({
  memberCount: 12,
  newMembers: { count: 0, names: [] },
  activity: { posts: 0, replies: 0, activePeople: 0 },
  week: { joined: 0, activePeople: 0 },
  unanswered: [],
  quietNewcomers: { count: 0, names: [] },
  joinRequestsPending: 0,
  upcomingEvents: [],
})!;

const busy = normalizeCommunityHomeSnapshot({
  memberCount: 214,
  newMembers: { count: 3, names: ["Tessa", "Dev", "Mira"] },
  activity: { posts: 9, replies: 21, activePeople: 14 },
  week: { joined: 3, activePeople: 132 },
  unanswered: [
    { author: "Rafael", channel: "general", text: "How do I price a founding tier?", hoursAgo: 50 },
    { author: "Sara", channel: "wins", text: "Who has a call script?", hoursAgo: 3 },
  ],
  quietNewcomers: { count: 1, names: ["Ben"] },
  joinRequestsPending: 2,
  upcomingEvents: [{ title: "Friday build call", startsAt: "2026-11-13T15:00:00.000Z" }],
})!;


test("the greeting follows the time of day", () => {
  expect(greetingFor(new Date(2026, 10, 10, 7))).toBe("Good morning");
  expect(greetingFor(new Date(2026, 10, 10, 14))).toBe("Good afternoon");
  expect(greetingFor(new Date(2026, 10, 10, 20))).toBe("Good evening");
});

test("the snapshot is read defensively", () => {
  expect(normalizeCommunityHomeSnapshot(null)).toBeNull();
  expect(normalizeCommunityHomeSnapshot({ joinRequestsPending: -4, newMembers: { count: "x", names: [1, "Ana"] } })).toMatchObject({
    joinRequestsPending: 0,
    newMembers: { count: 0, names: ["Ana"] },
    unanswered: [],
  });
});

test("Home is drawn only in the current design: without it, nothing", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { WebCommunityHomeSection } = await import("../apps/web/src/components/WebCommunityHomeSection");
  const html = renderToStaticMarkup(React.createElement(WebCommunityHomeSection, {
    communityId: "c1", communityName: "Kiln", firstName: "Neil", audience: "host" as const,
    session: null, ensureSession: async () => null,
    onOpenJoinRequests: () => {}, onOpenChannelByName: () => {}, onOpenEvents: () => {},
  }));
  expect(html).toBe("");
});

test("an older backend without the week or Today's facts reads as zero and none, never as missing", () => {
  expect(normalizeCommunityHomeSnapshot({ memberCount: 3 })!.week).toEqual({ joined: 0, activePeople: 0 });
  expect(normalizeCommunityHomeSnapshot({ memberCount: 3 })!.busiest).toBeNull();
  expect(normalizeCommunityHomeSnapshot({ memberCount: 3 })!.highlight).toBeNull();
});

test("the eyebrow's clock reads like the mock's", () => {
  expect(homeClockFor(new Date(2026, 10, 10, 20, 40))).toBe("8:40 pm");
  expect(homeClockFor(new Date(2026, 10, 10, 7, 2))).toBe("7:02 am");
});

test("on the kit, Home has the mock's parts and no old Home classes", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { WebCommunityHomeSection } = await import("../apps/web/src/components/WebCommunityHomeSection");
  const html = renderToStaticMarkup(React.createElement(WebCommunityHomeSection, {
    communityId: "c1", communityName: "Kiln", firstName: "Neil", audience: "host" as const,
    session: null, ensureSession: async () => null,
    onOpenJoinRequests: () => {}, onOpenChannelByName: () => {}, onOpenEvents: () => {},
    now: new Date(2026, 10, 10, 20, 40),
    kit: { talking: false, talk: React.createElement("div", { id: "talk" }), onTalkItOver: () => {} },
  }));
  expect(html).toContain("Kiln, your guide");
  expect(html).toContain("8:40 pm");
  expect(html).toContain("Good evening, Neil.");
  expect(html).toContain('id="talk"');
  expect(html).not.toContain("community-home");
});

test("a quiet Home on the kit still offers the way back into the conversation", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { WebCommunityHomeSection } = await import("../apps/web/src/components/WebCommunityHomeSection");
  const render = (hasConversation: boolean, talking: boolean) => renderToStaticMarkup(React.createElement(WebCommunityHomeSection, {
    communityId: "c1", communityName: "Kiln", firstName: "Neil", audience: "host" as const,
    session: null, ensureSession: async () => null,
    onOpenJoinRequests: () => {}, onOpenChannelByName: () => {}, onOpenEvents: () => {},
    kit: { talking, hasConversation, talk: null, onTalkItOver: () => {} },
  }));
  expect(render(true, false)).toContain("Continue your conversation");
  expect(render(false, false)).not.toContain("Continue your conversation");
  expect(render(true, true)).not.toContain("Continue your conversation");
});

// ---- Home: the guide briefs you, then the few things that need you.

const NOW = Date.UTC(2026, 10, 18, 12);
const facts = {
  questionsWaiting: [
    { author: "Rafael", channel: "general", hoursAgo: 50, text: "How do I price a founding tier?" },
    { author: "Sara", channel: "wins", hoursAgo: 30, text: "Who has a call script?" },
    { author: "Too new", channel: "wins", hoursAgo: 3 },
  ],
  quietNewcomers: { count: 3, names: ["Dario", "Lena", "Sam"] },
  courseStall: { course: "Start Here", lessonNumber: 2, members: 4 },
  weekMessages: 900,
};

test("what was noticed is a row each, all at once, in plain words; a busy week is not one", () => {
  const rows = ownerNoticed({ facts, records: [], nowMs: NOW });
  expect(rows.map((row) => [row.key, row.title, row.action])).toEqual([
    ["questions_waiting", "Rafael's question has had no answer for 2 days", "Open #general"],
    ["quiet_newcomers", "Dario, Lena and 1 more joined and haven't said hello", "See them"],
    ["course_stall", "4 members stopped after lesson 2 of Start Here", "Open Knowledge"],
  ]);
  expect(rows[0].detail).toBe("“How do I price a founding tier?” in #general. 1 other question is waiting too.");
  expect(rows[0].target).toEqual({ kind: "channel", name: "general" });
  // A question under a day old is nobody's problem yet.
  expect(ownerNoticed({ facts: { ...facts, questionsWaiting: [facts.questionsWaiting[2]], quietNewcomers: { count: 1, names: ["A"] }, courseStall: null }, records: [], nowMs: NOW })).toEqual([]);
});

test("Not now hides a row for 30 days, and only that row", () => {
  const day = 86_400_000;
  const waved = [{ key: "quiet_newcomers", shownAt: NOW - 40 * day, dismissedAt: NOW - 2 * day }];
  expect(ownerNoticed({ facts, records: waved, nowMs: NOW }).map((row) => row.key)).toEqual(["questions_waiting", "course_stall"]);
  expect(ownerNoticed({ facts, records: waved, nowMs: NOW + 29 * day }).map((row) => row.key)).toContain("quiet_newcomers");
  // Shown but never waved off: still there (rows are not one-a-week cards).
  expect(ownerNoticed({ facts, records: [{ key: "course_stall", shownAt: NOW - day, dismissedAt: null }], nowMs: NOW })).toHaveLength(3);
});

test("a host's rows open the right place; without a guide each says what a guide would do", () => {
  const actions = { onOpenJoinRequests: vi.fn(), onOpenChannelByName: vi.fn(), onOpenEvents: vi.fn(), onOpenKnowledge: vi.fn() };
  const onNotNow = vi.fn();
  const noticed = ownerNoticed({ facts, records: [], nowMs: NOW });
  const rows = hostThingsFor(noticed, { agentOn: true, actions, onNotNow });
  expect(rows.map((row) => row.icon)).toEqual(["question", "people", "lesson"]);
  rows[0].onAction(); rows[1].onAction(); rows[2].onAction();
  expect(actions.onOpenChannelByName).toHaveBeenCalledWith("general");
  // Without a way to the Members page, the row falls back to the requests.
  expect(actions.onOpenJoinRequests).toHaveBeenCalledOnce();
  expect(actions.onOpenKnowledge).toHaveBeenCalledOnce();
  // "See them" opens the people who joined, not the join requests.
  const withMembers = { ...actions, onOpenMembers: vi.fn(), onOpenJoinRequests: vi.fn() };
  hostThingsFor(noticed, { agentOn: true, actions: withMembers, onNotNow })[1].onAction();
  expect(withMembers.onOpenMembers).toHaveBeenCalledOnce();
  expect(withMembers.onOpenJoinRequests).not.toHaveBeenCalled();
  rows[1].onNotNow!();
  expect(onNotNow).toHaveBeenCalledWith("quiet_newcomers");
  expect(rows[1].detail).toBe("They joined in the last two weeks.");
  expect(hostThingsFor(noticed, { agentOn: false, actions, onNotNow })[1].detail)
    .toBe("They joined in the last two weeks. With a guide, it welcomes each one and introduces them to someone.");
});

test("a member's list is everything that is for them, the first one first", () => {
  const all = memberNextSteps({
    courseInProgress: { course: "Start Here", lessonNumber: 3, total: 5, lessonTitle: "Your first workflow" },
    hasPosted: false, joinedRecently: true, generalChannel: "General",
    nextEvent: { title: "Office hours", startsAt: "2026-11-19T22:00:00.000Z" },
  });
  expect(all.map((step) => [step.kind, step.title, step.action])).toEqual([
    ["say_hello", "Say hello in #General", "Say hello"],
    ["continue_lesson", "Continue Start Here", "Continue"],
    ["next_event", "Office hours is coming up", "See the event"],
  ]);
  const actions = { onOpenJoinRequests: vi.fn(), onOpenChannelByName: vi.fn(), onOpenEvents: vi.fn(), onOpenKnowledge: vi.fn() };
  const rows = memberThingsFor(all, actions);
  expect(rows.map((row) => Boolean(row.strong))).toEqual([true, false, false]);
  expect(rows.every((row) => row.onNotNow === undefined)).toBe(true);
  rows[2].onAction();
  expect(actions.onOpenEvents).toHaveBeenCalledOnce();
  // Someone settled in with nothing on: nothing is for them, and no list is drawn.
  expect(memberNextSteps({ courseInProgress: null, hasPosted: true, joinedRecently: false, generalChannel: "General", nextEvent: null })).toEqual([]);
});

test("without a brief, the sentence under the greeting carries the plain facts", () => {
  expect(homeSentenceFor(busy, "host", 2)).toBe("3 people joined since yesterday, and 2 things need you.");
  expect(homeSentenceFor(quiet, "host", 1)).toBe("1 thing needs you today.");
  expect(homeSentenceFor(quiet, "host", 0)).toBe("Nothing needs you today.");
  expect(homeSentenceFor(busy, "member")).toBe("3 people joined since yesterday, and there are 30 new messages.");
  expect(homeSentenceFor(quiet, "member")).toBe("It's quiet today.");
});

test("the list shows three and stacks the rest; people waiting are one row and come first", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { NeedsYou, homeThingsCount, joinRowTitle, joinRowNames, HOME_THINGS_SHOWN } = await import("../apps/web/src/v1/KitNeedsYou");
  expect(HOME_THINGS_SHOWN).toBe(3);
  expect(homeThingsCount({ joinRequests: 6, things: 3 })).toBe(4);
  expect(homeThingsCount({ joinRequests: 0, things: 0 })).toBe(0);
  const thing = (key: string) => ({ key, icon: "question" as const, title: `Thing ${key}`, detail: "d", action: `Do ${key}`, onAction: () => {}, onNotNow: () => {} });
  const html = renderToStaticMarkup(React.createElement(NeedsYou, {
    label: "Needs you", join: null, joinCount: 4, onShowAllJoinRequests: () => {}, things: ["a", "b", "c", "d"].map(thing),
  }));
  expect(html).toContain("4 people asked to join");
  expect(html.indexOf("4 people asked to join")).toBeLessThan(html.indexOf("Thing a"));
  expect(html).toContain("Thing b");
  expect(html).not.toContain("Thing c");
  expect(html).toContain("2 more");
  expect(html).toContain("Not now");
  // Nothing to show: nothing drawn.
  expect(renderToStaticMarkup(React.createElement(NeedsYou, { label: "For you", join: null, joinCount: 0, onShowAllJoinRequests: () => {}, things: [] }))).toBe("");
  expect(joinRowTitle(1)).toBe("1 person asked to join");
  expect(joinRowNames(["Lena", "Marcus", "Priya", "Sam"], 6)).toBe("Lena, Marcus, Priya and 3 more.");
  expect(joinRowNames(["Lena", null], 2)).toBe("Lena and Someone.");
  expect(joinRowNames([], 2)).toBe("Nobody joins until you say yes.");
});

test("the Members page says who can join and what changing it does, in plain words", async () => {
  const { whoCanJoinLine, whoCanJoinAsk } = await import("../apps/web/src/v1/KitMembersTable");
  expect(whoCanJoinLine("approval")).toBe("People ask to join, and you say yes or no.");
  expect(whoCanJoinLine("open")).toBe("Anyone can join.");
  expect(whoCanJoinAsk("open", 0)).toBe("Let anyone join? If you switch back later, people who joined stay members.");
  expect(whoCanJoinAsk("open", 1)).toBe("Let anyone join? The 1 person waiting is let in now. If you switch back later, people who joined stay members.");
  expect(whoCanJoinAsk("open", 4)).toContain("The 4 people waiting are let in now.");
  expect(whoCanJoinAsk("approval", 3)).toBe("Ask people to join first? New people then wait for your yes.");
});
