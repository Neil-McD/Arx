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

test("Home offers the way back into the conversation whenever there is one, busy or quiet", async () => {
  const { offersConversation } = await import("../apps/web/src/components/WebCommunityHomeSection");
  const base = { agentOn: true, talking: false, hasConversation: true, drawn: true };
  // Nothing about what needs you or what the guide drafted takes part.
  expect(offersConversation(base)).toBe(true);
  expect(offersConversation({ ...base, hasConversation: false })).toBe(false);
  expect(offersConversation({ ...base, talking: true })).toBe(false);
  expect(offersConversation({ ...base, agentOn: false })).toBe(false);
  // It is Home's last line, drawn with the rest so nothing moves under it.
  expect(offersConversation({ ...base, drawn: false })).toBe(false);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { WebCommunityHomeSection } = await import("../apps/web/src/components/WebCommunityHomeSection");
  const html = renderToStaticMarkup(React.createElement(WebCommunityHomeSection, {
    communityId: "c1", communityName: "Kiln", firstName: "Neil", audience: "host" as const,
    session: null, ensureSession: async () => null,
    onOpenJoinRequests: () => {}, onOpenChannelByName: () => {}, onOpenEvents: () => {},
    kit: { talking: false, hasConversation: true, talk: null, onTalkItOver: () => {} },
  }));
  expect(html).not.toContain("Continue your conversation");
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

test("what the guide suggests is its own group: a row per draft, opened by the host", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { GuideSuggests, replyDraftTitle, replyDraftDetail } = await import("../apps/web/src/v1/KitGuideSuggests");
  const draft = { id: "d1", author: "Maya", question: "How do I price a first client?", channel: "General", hours_waiting: 26,
    text: "Maya, price on the hours you save them.", source: "Start Here · Lesson 2: Pricing your offer" };
  expect(replyDraftTitle(draft)).toBe("A reply to Maya's question is ready");
  expect(replyDraftDetail(draft)).toBe("“How do I price a first client?” in #General · no answer for 26 hours.");
  const html = renderToStaticMarkup(React.createElement(GuideSuggests, { drafts: [draft], onPost: async () => null, onSkip: () => {} }));
  expect(html).toContain("Your guide suggests");
  expect(html).toContain("A reply to Maya&#x27;s question is ready");
  // Closed, the words it would post are not shown, and nothing can be posted from the row.
  expect(html).not.toContain("price on the hours");
  expect(html).not.toContain("Post reply");
  // Single suggestion renders no stacked drawer toggle.
  expect(html).not.toContain("View more");
  expect(renderToStaticMarkup(React.createElement(GuideSuggests, { drafts: [], onPost: async () => null, onSkip: () => {} }))).toBe("");

  // Multiple suggestions stack into a tidy drawer showing the top card + "View more (N)".
  const stackedHtml = renderToStaticMarkup(React.createElement(GuideSuggests, {
    drafts: [draft],
    coachDrafts: [{
      id: "c1", member_name: "Josh Universe", member_handle: "josh", reason: "quiet_newcomer",
      reason_label: "Quiet newcomer", signal_summary: "Quiet for 25 days", text: "Hey Josh!", created_at: "2026-11-25T10:00:00.000Z",
    }],
    stageProposals: [{
      membership_id: "m1", user_id: "u1", member_name: "Rashid", member_handle: "rashid",
      from_stage_key: "active", from_stage_name: "Active", to_stage_key: "graduated", to_stage_name: "Graduated",
      to_stage_goal: "Mentor others", completed_labels: ["3+ posts or replies"],
    }],
    onPost: async () => null,
    onSkip: () => {},
  }));
  expect(stackedHtml).toContain("A reply to Maya&#x27;s question is ready");
  expect(stackedHtml).not.toContain("Check in with Josh Universe");
  expect(stackedHtml).not.toContain("Move Rashid to Graduated");
  expect(stackedHtml).toContain("View more (2)");

  // Opening a non-first row from outside (e.g. landing preview) automatically expands the drawer.
  const openedStackedHtml = renderToStaticMarkup(React.createElement(GuideSuggests, {
    drafts: [draft],
    coachDrafts: [{
      id: "c1", member_name: "Josh Universe", member_handle: "josh", reason: "quiet_newcomer",
      reason_label: "Quiet newcomer", signal_summary: "Quiet for 25 days", text: "Hey Josh!", created_at: "2026-11-25T10:00:00.000Z",
    }],
    openRow: "coach:c1",
    onPost: async () => null,
    onSkip: () => {},
  }));
  expect(openedStackedHtml).toContain("Check in with Josh Universe");
  expect(openedStackedHtml).toContain("Show less");
});

test("a question or member signal the guide drafted for shows once, not also as a duplicate legacy reminder", async () => {
  const { noticedWithoutDrafted } = await import("../apps/web/src/components/WebCommunityHomeSection");
  const noticed = ownerNoticed({ facts, records: [], nowMs: NOW });
  expect(noticedWithoutDrafted(noticed, [{ author: "Rafael", channel: "general" }]).map((row) => row.key)).toEqual(["quiet_newcomers", "course_stall"]);
  // Another person's question, or the same person in another channel, is still its own row.
  expect(noticedWithoutDrafted(noticed, [{ author: "Sara", channel: "general" }, { author: "Rafael", channel: "wins" }])).toHaveLength(3);
  expect(noticedWithoutDrafted(noticed, [])).toHaveLength(3);
  // Proactive check-in/welcome drafts deduplicate quiet_newcomers and course_stall too.
  expect(
    noticedWithoutDrafted(
      noticed,
      [{ author: "Rafael", channel: "general" }],
      [{ reason: "quiet_newcomer" }, { reason: "course_stall" }],
    ),
  ).toEqual([]);
  expect(
    noticedWithoutDrafted(noticed, [], [{ reason: "member_onboarding" }]).map((row) => row.key),
  ).toEqual(["questions_waiting", "course_stall"]);
});

test("unified host Needs you in guide style prioritizes tags and join requests ahead of guide drafts in one deck", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { GuideSuggests } = await import("../apps/web/src/v1/KitGuideSuggests");
  const tag = { key: "tag:1", icon: "tag" as const, title: "Maya tagged you in #General", detail: "can you look?", action: "Open", onAction: () => {} };
  const coachDraft = {
    id: "c1", member_name: "Josh Universe", member_handle: "josh", reason: "quiet_member" as const,
    reason_label: "Quiet member", signal_summary: "Quiet for 25 days", text: "Hey Josh!", created_at: "2026-11-25T10:00:00.000Z",
  };
  const unifiedHtml = renderToStaticMarkup(React.createElement(GuideSuggests, {
    label: "Needs you",
    tags: [tag],
    join: null,
    joinCount: 2,
    onShowAllJoinRequests: () => {},
    things: [],
    drafts: [],
    coachDrafts: [coachDraft],
    onPost: async () => null,
    onSkip: () => {},
  }));
  expect(unifiedHtml).toContain("Needs you");
  expect(unifiedHtml).toContain("<i>3</i>");
  expect(unifiedHtml).toContain("Maya tagged you in #General");
  expect(unifiedHtml).toContain("View more (2)");
  // With only coach drafts, the unified list still renders under Needs you with exact count.
  const draftsOnlyHtml = renderToStaticMarkup(React.createElement(GuideSuggests, {
    label: "Needs you",
    drafts: [],
    coachDrafts: [coachDraft],
    onPost: async () => null,
    onSkip: () => {},
  }));
  expect(draftsOnlyHtml).toContain("Needs you");
  expect(draftsOnlyHtml).toContain("<i>1</i>");
  expect(draftsOnlyHtml).toContain("Check in with Josh Universe");
  expect(draftsOnlyHtml).not.toContain("View more");
});

test("tags come first in either list, open their message, have no Not now, and count like any row", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { tagThingsFor, homeTagsTotal } = await import("../apps/web/src/components/WebCommunityHomeSection");
  const { NeedsYou, homeThingsCount } = await import("../apps/web/src/v1/KitNeedsYou");
  const tags = {
    lines: [
      { key: "tag:1", title: "Maya tagged you in #General", detail: "can you look?", channelSlug: "general", rootId: "r1" },
      { key: "tag:2", title: "Dev tagged everybody in Founders", detail: "call moved", channelSlug: "founders", rootId: "r2" },
    ],
    more: { count: 4, title: "And 4 more tags", detail: "The next is Sam's, in #wins.", action: "Open #wins", channelSlug: "wins" },
  };
  const onOpenTag = vi.fn();
  const rows = tagThingsFor(tags, onOpenTag);
  expect(rows.map((row) => [row.title, row.action])).toEqual([
    ["Maya tagged you in #General", "Open"],
    ["Dev tagged everybody in Founders", "Open"],
    ["And 4 more tags", "Open #wins"],
  ]);
  expect(rows.every((row) => row.icon === "tag" && row.onNotNow === undefined)).toBe(true);
  rows[0].onAction(); rows[2].onAction();
  expect(onOpenTag).toHaveBeenNthCalledWith(1, "general", "r1");
  expect(onOpenTag).toHaveBeenNthCalledWith(2, "wins", null);
  expect(tagThingsFor(null)).toEqual([]);
  expect(tagThingsFor({ lines: [], more: null })).toEqual([]);
  expect(homeTagsTotal(tags)).toBe(6);
  // Each line counts as one row, as the join row and the waiting-questions row do.
  expect(homeThingsCount({ joinRequests: 2, things: 1 + rows.length })).toBe(5);

  // Above the people waiting to join, in the host's list; in a member's list too.
  const thing = { key: "q", icon: "question" as const, title: "Thing q", detail: "d", action: "Do", onAction: () => {}, onNotNow: () => {} };
  const host = renderToStaticMarkup(React.createElement(NeedsYou, {
    label: "Needs you", join: null, joinCount: 2, onShowAllJoinRequests: () => {}, things: [thing], tags: rows.slice(0, 1),
  }));
  expect(host.indexOf("Maya tagged you in #General")).toBeLessThan(host.indexOf("2 people asked to join"));
  expect(host).toContain("<i>3</i>");
  const member = renderToStaticMarkup(React.createElement(NeedsYou, {
    label: "For you", join: null, joinCount: 0, onShowAllJoinRequests: () => {}, things: [], tags: rows,
  }));
  expect(member).toContain("For you");
  expect(member).toContain("Maya tagged you in #General");
  expect(member).toContain("<i>3</i>");
  expect(member).not.toContain("Not now");
});

test("a member's quiet day with a tag says so; the host's sentence counts tags as things that need you", () => {
  expect(homeSentenceFor(quiet, "member", 0, 1)).toBe("Someone tagged you.");
  expect(homeSentenceFor(quiet, "member", 0, 4)).toBe("You were tagged 4 times.");
  expect(homeSentenceFor(busy, "member", 0, 4)).toBe("3 people joined since yesterday, and there are 30 new messages.");
  expect(homeSentenceFor(quiet, "host", 2, 2)).toBe("2 things need you today.");
});

test("Home shows its Today glanceables inline on narrow screens when at rest, and hides them on desktop or during guide talk", async () => {
  const { showsInlineHomeRail } = await import("../apps/web/src/components/WebCommunityHomeSection");
  expect(showsInlineHomeRail({ wide: false, ready: true, talking: false, hasSnapshot: true })).toBe(true);
  expect(showsInlineHomeRail({ wide: true, ready: true, talking: false, hasSnapshot: true })).toBe(false);
  expect(showsInlineHomeRail({ wide: false, ready: true, talking: true, hasSnapshot: true })).toBe(false);
  expect(showsInlineHomeRail({ wide: false, ready: false, talking: false, hasSnapshot: true })).toBe(false);
  expect(showsInlineHomeRail({ wide: false, ready: true, talking: false, hasSnapshot: false })).toBe(false);
});

test("a tag's message has one address: its thread in its room", async () => {
  const { buildCommunityThreadPath } = await import("../shared/webAppRouteState");
  expect(buildCommunityThreadPath("kiln", "general", "r1")).toBe("/c/kiln/chat/general/r1");
  expect(buildCommunityThreadPath("kiln", "founders", "r2")).toBe("/c/kiln/chat/founders/r2");
  expect(buildCommunityThreadPath("kiln", "founders", null)).toBe("/c/kiln/chat/founders");
  expect(buildCommunityThreadPath(null, "founders", "r2")).toBeNull();
});
