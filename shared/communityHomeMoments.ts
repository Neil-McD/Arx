// Home's centre (docs/specs/community-agent-gateway-v0.md, slice 2): what
// happened since this person's last visit, and a member's one next step.
// Written without a model. Pure: the server gathers the rows it may show this
// viewer; this ranks and words them.

export type HomePost = {
  id: string;
  channel: string;
  channelSlug: string;
  author: string;
  text: string;
  replies: number;
  reactions: number;
  asks: boolean;
  createdAt: number;
};

export type HomeMomentsInput = {
  audience: "host" | "member";
  since: number;
  posts: HomePost[];
  notes: Array<{ slug: string; title: string; createdAt: number }>;
  joins: { count: number; names: string[] };
  nextEvent: { title: string; startsAt: string } | null;
};

export type HomeMoment = {
  kind: "post" | "question" | "learned" | "joined" | "event";
  label: string;
  title: string;
  detail: string;
  target: { kind: "channel"; name: string } | { kind: "knowledge" } | { kind: "members" } | { kind: "events" } | null;
  // An event's start, formatted in the reader's own time zone by the page.
  when?: string;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const clip = (text: string, max = 90) => {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentence = clean.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? clean;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
};

function postMoment(post: HomePost): HomeMoment {
  const said = [post.replies ? plural(post.replies, "reply", "replies") : "", post.reactions ? plural(post.reactions, "reaction", "reactions") : ""].filter(Boolean).join(" · ");
  return {
    kind: "post", label: `#${post.channel}`, title: clip(post.text),
    detail: [post.author, said].filter(Boolean).join(" · "),
    target: { kind: "channel", name: post.channel },
  };
}

// Paid: the moments worth your attention since you were last here, ranked.
export function homeMoments(input: HomeMomentsInput, max = 5): HomeMoment[] {
  const fresh = input.posts.filter((post) => post.createdAt >= input.since);
  const moments: HomeMoment[] = [];
  // Posts people are talking about.
  const talked = fresh.filter((post) => post.replies + post.reactions >= 2)
    .sort((a, b) => (b.replies * 2 + b.reactions) - (a.replies * 2 + a.reactions) || b.createdAt - a.createdAt)
    .slice(0, 2);
  moments.push(...talked.map(postMoment));
  // A question still waiting: someone here may know.
  const question = fresh.filter((post) => post.asks && post.replies === 0 && !talked.includes(post))
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (question) {
    moments.push({
      kind: "question", label: "Asked", title: clip(question.text),
      detail: input.audience === "host" ? `${question.author} in #${question.channel} · no reply yet` : `In #${question.channel} · no reply yet`,
      target: { kind: "channel", name: question.channel },
    });
  }
  const note = input.notes.filter((entry) => entry.createdAt >= input.since).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (note) moments.push({ kind: "learned", label: "Learned", title: note.title, detail: "Saved to Knowledge", target: { kind: "knowledge" } });
  if (input.joins.count > 0) {
    moments.push({
      kind: "joined", label: "Joined",
      title: input.audience === "host" && input.joins.names.length
        ? `${input.joins.names.slice(0, 2).join(" and ")}${input.joins.count > 2 ? ` and ${input.joins.count - 2} more` : ""} joined`
        : `${plural(input.joins.count, "new member", "new members")} joined`,
      detail: input.audience === "host" ? "Say hello, or let your guide welcome them" : "Say hello",
      target: input.audience === "host" ? { kind: "members" } : null,
    });
  }
  if (input.nextEvent) {
    moments.push({ kind: "event", label: "Coming up", title: input.nextEvent.title, detail: "", when: input.nextEvent.startsAt, target: { kind: "events" } });
  }
  return moments.slice(0, max);
}

// Free: plain lists, newest first: the latest posts and the next event.
export function homeRecent(input: HomeMomentsInput, max = 4): HomeMoment[] {
  const latest = [...input.posts].sort((a, b) => b.createdAt - a.createdAt).slice(0, max - (input.nextEvent ? 1 : 0)).map(postMoment);
  const event: HomeMoment[] = input.nextEvent
    ? [{ kind: "event", label: "Coming up", title: input.nextEvent.title, detail: "", when: input.nextEvent.startsAt, target: { kind: "events" } }]
    : [];
  return [...latest, ...event];
}

// The page formats an event's time in the reader's own zone.
export function formatMomentWhen(startsAtIso: string): string {
  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) return "";
  return startsAt.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });
}

// A member's one next step, only when there is a real one.
export type MemberNextStep = {
  kind: "continue_lesson" | "say_hello" | "rsvp";
  title: string;
  detail: string;
  action: string;
  target: { kind: "knowledge" } | { kind: "channel"; name: string } | { kind: "events" };
  when?: string;
};

export function memberNextStep(args: {
  courseInProgress: { course: string; lessonNumber: number; total: number; lessonTitle: string } | null;
  hasPosted: boolean;
  joinedRecently: boolean;
  generalChannel: string | null;
  nextEvent: { title: string; startsAt: string; going: boolean } | null;
}): MemberNextStep | null {
  if (args.joinedRecently && !args.hasPosted && args.generalChannel) {
    return {
      kind: "say_hello", title: `Say hello in #${args.generalChannel}`,
      detail: "Tell people what you're working on. It's the fastest way to meet the right people here.",
      action: "Say hello", target: { kind: "channel", name: args.generalChannel },
    };
  }
  if (args.courseInProgress) {
    const course = args.courseInProgress;
    return {
      kind: "continue_lesson", title: `Continue ${course.course}`,
      detail: `Lesson ${course.lessonNumber} of ${course.total}: ${course.lessonTitle}.`,
      action: "Continue", target: { kind: "knowledge" },
    };
  }
  if (args.nextEvent && !args.nextEvent.going) {
    return {
      kind: "rsvp", title: `${args.nextEvent.title} is coming up`,
      detail: "Let the host know you'll be there.", when: args.nextEvent.startsAt,
      action: "See the event", target: { kind: "events" },
    };
  }
  return null;
}
