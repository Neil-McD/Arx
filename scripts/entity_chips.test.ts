import { describe, expect, it } from "vitest";
import { buildEntityNameIndex, cardAction, cardLines, chipFact, clipAbout, entityNameKey, entityPath, matchEntityName, type EntityNameRow } from "../shared/entityChips";
import { HOVER_CLOSE_MS, HOVER_OPEN_MS, hoverCardShift } from "../shared/useHoverIntent";

const rows: EntityNameRow[] = [
  { kind: "course", name: "Start here", id: "m1" },
  { kind: "lesson", name: "A tour", id: "l1", parentId: "m1" },
  { kind: "lesson", name: "Pods", id: "l2", parentId: "m2" },
  { kind: "channel", name: "General", id: "c1", slug: "general" },
  { kind: "channel", name: "wins", id: "c2", slug: "wins" },
  { kind: "pod", name: "Founders", id: "p1", slug: "founders" },
  { kind: "event", name: "Group Call", id: "e1:1795600000000", startsAt: "2026-11-27T15:00:00.000Z" },
];

describe("chips: names in the guide's words", () => {
  const index = buildEntityNameIndex("polynet", rows);

  it("matches a whole bold name, ignoring case, a leading # and end punctuation", () => {
    expect(entityNameKey("  #General. ")).toBe("general");
    expect(matchEntityName(index, "Start here")?.path).toBe("/c/polynet/knowledge/m1");
    expect(matchEntityName(index, "start HERE")?.kind).toBe("course");
    expect(matchEntityName(index, "#General")?.path).toBe("/c/polynet/chat");
    expect(matchEntityName(index, "wins")?.path).toBe("/c/polynet/chat/wins");
  });

  it("builds each kind's own address", () => {
    expect(matchEntityName(index, "A tour")?.path).toBe("/c/polynet/knowledge/m1/l1");
    expect(matchEntityName(index, "Founders")?.path).toBe("/c/polynet/pods/founders");
    expect(matchEntityName(index, "Group Call")?.path).toBe("/c/polynet/events/e1_1795600000000");
    expect(matchEntityName(index, "Home")?.path).toBe("/c/polynet/home");
    expect(matchEntityName(index, "Events")?.kind).toBe("page");
  });

  it("gives no chip for a name two things share, or for words that name nothing", () => {
    // The lesson "Pods" and the Pods page.
    expect(matchEntityName(index, "Pods")).toBeNull();
    expect(matchEntityName(index, "Start")).toBeNull();
    expect(matchEntityName(index, "Start here course")).toBeNull();
    expect(matchEntityName(index, "")).toBeNull();
  });

  it("knows nothing without a community, and skips rows it can't address", () => {
    expect(buildEntityNameIndex(null, rows).size).toBe(0);
    expect(entityPath("polynet", { kind: "lesson", name: "Orphan", id: "l9" })).toBeNull();
    expect(entityPath("polynet", { kind: "channel", name: "No slug", id: "c9" })).toBeNull();
  });
});

describe("chips: the card and the fact on the chip (slice 3)", () => {
  const rows: EntityNameRow[] = [
    { kind: "course", name: "Start here", id: "m1", facts: { about: "Your first ten minutes.", lessons: 5, done: 2, nextLessonId: "l3", nextLessonTitle: "Meet the guide" } },
    { kind: "course", name: "Build", id: "m2", facts: { lessons: 3, done: 0, nextLessonId: "l9", nextLessonTitle: "Start your community" } },
    { kind: "course", name: "Finished one", id: "m3", facts: { lessons: 2, done: 2, nextLessonId: null, nextLessonTitle: null } },
    { kind: "lesson", name: "A tour", id: "l2", parentId: "m1", facts: { courseName: "Start here", finished: true, hasVideo: true } },
    { kind: "channel", name: "wins", id: "c2", slug: "wins", facts: { about: "What worked." } },
    { kind: "pod", name: "Founders", id: "p1", slug: "founders", facts: { about: "Founders only.", seats: 12 } },
    { kind: "event", name: "Group Call", id: "e1", startsAt: "2026-11-27T15:00:00.000Z", facts: { where: "online", repeats: "weekly" } },
  ];
  const index = buildEntityNameIndex("polynet", rows);
  const get = (name: string) => matchEntityName(index, name)!;

  it("shows progress on a course chip and the next time on an event chip, in the reader's zone", () => {
    expect(chipFact(get("Start here"))).toBe("2 of 5");
    expect(chipFact(get("Group Call"), "UTC")).toBe("Fri 3:00 PM");
    expect(chipFact(get("Group Call"), "America/New_York")).toBe("Fri 10:00 AM");
    expect(chipFact(get("wins"))).toBeNull();
  });

  it("each card says what the thing is and where you are with it", () => {
    expect(cardLines(get("Start here"))).toEqual(["Your first ten minutes."]);
    expect(cardLines(get("A tour"))).toEqual(["In Start here", "Finished · Video"]);
    expect(cardLines(get("wins"))).toEqual(["What worked."]);
    expect(cardLines(get("Founders"))).toEqual(["Founders only.", "12 seats"]);
    expect(cardLines(get("Group Call"), "America/New_York")).toEqual(["Friday, Nov 27, 10:00 AM", "Online · Every week"]);
  });

  it("a course card continues, starts or reviews; others open the thing", () => {
    expect(cardAction(get("Start here"))).toEqual({ label: "Continue: Meet the guide", path: "/c/polynet/knowledge/m1/l3" });
    expect(cardAction(get("Build"))).toEqual({ label: "Start: Start your community", path: "/c/polynet/knowledge/m2/l9" });
    expect(cardAction(get("Finished one"))).toEqual({ label: "Review the course", path: "/c/polynet/knowledge/m3" });
    expect(cardAction(get("Group Call")).label).toBe("Open event");
  });

  it("descriptions are short, and the card keeps the profile card's timing", () => {
    expect(clipAbout("x".repeat(300))?.length).toBe(140);
    expect(clipAbout("   ")).toBeNull();
    expect([HOVER_OPEN_MS, HOVER_CLOSE_MS]).toEqual([450, 140]);
  });
});

describe("page chips", () => {
  const pageRows: EntityNameRow[] = [
    { kind: "course", name: "Start here", id: "m1", facts: { lessons: 5, done: 2 } },
    { kind: "course", name: "Build your community", id: "m2", facts: { lessons: 9, done: 0 } },
    { kind: "pod", name: "Founders", id: "p1", slug: "founders" },
    { kind: "event", name: "Office hours", id: "e2:1", startsAt: "2026-12-04T15:00:00.000Z" },
    { kind: "event", name: "Group Call", id: "e1:1", startsAt: "2026-11-27T15:00:00.000Z" },
    { kind: "event", name: "Demo day", id: "e3:1", startsAt: "2026-12-11T15:00:00.000Z" },
    { kind: "event", name: "Year end", id: "e4:1", startsAt: "2026-12-18T15:00:00.000Z" },
  ];
  const index = buildEntityNameIndex("polynet", pageRows);

  it("Events lists the next events, soonest first, and opens the page", () => {
    const events = matchEntityName(index, "Events");
    expect(events?.page).toBe("events");
    expect(cardLines(events!)).toEqual(["4 events in the next five weeks"]);
    expect(events?.items?.map((item) => item.name)).toEqual(["Group Call", "Office hours", "Demo day"]);
    expect(events?.items?.[0]?.path).toBe("/c/polynet/events/e1_1");
    expect(cardAction(events!)).toEqual({ label: "Open Events", path: "/c/polynet/events" });
  });

  it("Knowledge lists courses and Pods lists the reader's pods", () => {
    const knowledge = matchEntityName(index, "Knowledge");
    expect(cardLines(knowledge!)).toEqual(["2 courses"]);
    expect(knowledge?.items?.map((item) => chipFact(item))).toEqual(["2 of 5", "0 of 9"]);
    const pods = matchEntityName(index, "Pods");
    expect(cardLines(pods!)).toEqual(["1 pod open to you"]);
    expect(pods?.items?.map((item) => item.name)).toEqual(["Founders"]);
  });

  it("a page with nothing to list still says what it is", () => {
    const empty = buildEntityNameIndex("polynet", []);
    expect(cardLines(matchEntityName(empty, "Events")!)).toEqual(["Nothing on the calendar in the next five weeks"]);
    expect(matchEntityName(empty, "Events")?.items).toEqual([]);
    expect(cardLines(matchEntityName(empty, "Home")!)).toEqual(["Talk with the guide and see what's new"]);
    expect(cardLines(matchEntityName(empty, "Inbox")!)).toEqual(["Your direct messages"]);
    expect(cardLines(matchEntityName(empty, "Members")!)).toEqual(["Everyone in the community"]);
  });
});

describe("a card stays inside its area", () => {
  it("does not move when it fits", () => {
    expect(hoverCardShift({ start: 400, width: 280, areaLeft: 0, areaRight: 1000 })).toBe(0);
  });
  it("slides left when it would run past the right edge", () => {
    expect(hoverCardShift({ start: 1294, width: 280, areaLeft: 1032, areaRight: 1476 })).toBe(1476 - 8 - 280 - 1294);
  });
  it("slides right when it starts before the left edge", () => {
    expect(hoverCardShift({ start: 2, width: 280, areaLeft: 0, areaRight: 1000 })).toBe(6);
  });
  it("keeps to the left edge when the area is narrower than the card", () => {
    expect(hoverCardShift({ start: 20, width: 280, areaLeft: 0, areaRight: 200 })).toBe(-12);
  });
});
