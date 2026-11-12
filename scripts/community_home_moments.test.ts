import { describe, expect, it } from "vitest";
import { homeMoments, homeRecent, memberNextStep, type HomeMomentsInput } from "../shared/communityHomeMoments";

const since = 1_000_000;
const post = (id: string, over: Partial<HomeMomentsInput["posts"][number]> = {}) => ({
  id, channel: "wins", channelSlug: "wins", author: "Jon Park", text: `Post ${id}.`, replies: 0, reactions: 0, asks: false, createdAt: since + 10, ...over,
});
const base: HomeMomentsInput = { audience: "member", since, posts: [], notes: [], joins: { count: 0, names: [] }, nextEvent: null };

describe("Home moments", () => {
  it("ranks what people talked about, then a waiting question, then what was learned, joins and the next event", () => {
    const input: HomeMomentsInput = {
      ...base,
      posts: [
        post("old", { replies: 9, createdAt: since - 10 }),
        post("busy", { text: "We passed 100 members last night. The invitation worked.", replies: 4, reactions: 12 }),
        post("q", { channel: "biz", text: "How did you price your founding tier?", asks: true }),
      ],
      notes: [{ slug: "invitations", title: "Invitations that work", createdAt: since + 5 }],
      joins: { count: 3, names: ["Omar", "Dev", "Mira"] },
      nextEvent: { title: "Friday build call", startsAt: "2026-11-13T18:00:00.000Z" },
    };
    const moments = homeMoments(input);
    expect(moments.map((moment) => moment.kind)).toEqual(["post", "question", "learned", "joined", "event"]);
    expect(moments[0]).toMatchObject({ label: "#wins", title: "We passed 100 members last night.", detail: "Jon Park · 4 replies · 12 reactions" });
    // Before the last visit doesn't count.
    expect(moments.some((moment) => moment.title.startsWith("Post old"))).toBe(false);
    // A member never sees who joined, or who asked.
    expect(moments.find((moment) => moment.kind === "joined")?.title).toBe("3 new members joined");
    expect(moments.find((moment) => moment.kind === "question")?.detail).toBe("In #biz · no reply yet");
  });

  it("the owner sees names", () => {
    const moments = homeMoments({ ...base, audience: "host", joins: { count: 3, names: ["Omar", "Dev"] }, posts: [post("q", { asks: true, author: "Rashid" })] });
    expect(moments.find((moment) => moment.kind === "joined")?.title).toBe("Omar and Dev and 1 more joined");
    expect(moments.find((moment) => moment.kind === "question")?.detail).toBe("Rashid in #wins · no reply yet");
  });

  it("free is a plain list: newest posts, then the next event", () => {
    const recent = homeRecent({ ...base, posts: [post("a", { createdAt: since + 1 }), post("b", { createdAt: since + 2 })], nextEvent: { title: "Friday build call", startsAt: "2026-11-13T18:00:00.000Z" } });
    expect(recent.map((moment) => moment.title)).toEqual(["Post b.", "Post a.", "Friday build call"]);
  });
});

describe("a member's next step", () => {
  const none = { courseInProgress: null, hasPosted: true, joinedRecently: false, generalChannel: "general", nextEvent: null };
  it("says hello first, then continues a course, then the next call; nothing when there's nothing real", () => {
    expect(memberNextStep({ ...none, hasPosted: false, joinedRecently: true })?.kind).toBe("say_hello");
    expect(memberNextStep({ ...none, courseInProgress: { course: "Launch your community", lessonNumber: 3, total: 9, lessonTitle: "Choose your first ten" } }))
      .toMatchObject({ kind: "continue_lesson", detail: "Lesson 3 of 9: Choose your first ten." });
    expect(memberNextStep({ ...none, nextEvent: { title: "Friday build call", startsAt: "2026-11-13T18:00:00.000Z", going: false } })?.kind).toBe("rsvp");
    expect(memberNextStep({ ...none, nextEvent: { title: "Friday build call", startsAt: "2026-11-13T18:00:00.000Z", going: true } })).toBeNull();
    expect(memberNextStep(none)).toBeNull();
  });
});
