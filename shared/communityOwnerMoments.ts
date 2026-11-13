// Owner moments (docs/specs/community-agent-gateway-v0.md, "Owner moments"):
// detected problems, one card at a time in the owner's next-step spot on Home.
// (Member-count milestones were removed Nov 13: simpler, nothing to celebrate
// on a timer.) Pure: the server gathers the facts and the records
// of what was shown; this decides which card, if any, and what it says.

export type OwnerMomentKey =
  | "questions_waiting"
  | "quiet_newcomers"
  | "course_stall"
  | "busy_week";

export type OwnerMomentFacts = {
  questionsWaiting: Array<{ author: string; channel: string; hoursAgo: number }>;
  quietNewcomers: { count: number; names: string[] };
  courseStall: { course: string; lessonNumber: number; members: number } | null;
  weekMessages: number;
};

export type OwnerMomentRecord = { key: string; shownAt: number; dismissedAt: number | null };

export type OwnerMoment = {
  key: OwnerMomentKey;
  kind: "problem";
  title: string;
  detail: string;
  // What the guide does about it, as a phrase ("welcomes each new person ...");
  // null for a plain congratulations. Free communities read "Your guide
  // would ..." and get the way to turn it on; paid ones talk it over.
  guide: string | null;
};

export const OWNER_MOMENT_KEYS: OwnerMomentKey[] = ["questions_waiting", "quiet_newcomers", "course_stall", "busy_week"];
const KNOWN_KEYS = new Set<string>(OWNER_MOMENT_KEYS);

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
// A problem dismissed (or shown) comes back no sooner than this.
const PROBLEM_QUIET_MS = 30 * DAY_MS;

export const QUESTION_WAIT_HOURS = 24;
export const QUIET_NEWCOMERS_MIN = 2;
export const COURSE_STALL_MIN = 3;
export const BUSY_WEEK_MESSAGES = 150;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const names = (list: string[], total: number) => {
  const shown = list.slice(0, 2);
  if (!shown.length) return plural(total, "newcomer", "newcomers");
  const rest = total - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(" and ");
};

function problems(facts: OwnerMomentFacts): OwnerMoment[] {
  const list: OwnerMoment[] = [];
  const waiting = facts.questionsWaiting.filter((question) => question.hoursAgo >= QUESTION_WAIT_HOURS);
  if (waiting.length) {
    const first = waiting[0];
    list.push({
      key: "questions_waiting", kind: "problem",
      title: waiting.length === 1 ? `${first.author}'s question has waited a day` : `${waiting.length} questions have waited a day`,
      detail: waiting.length === 1 ? `In #${first.channel}, with no reply yet.` : `The oldest is ${first.author}'s, in #${first.channel}.`,
      guide: "answers from your Knowledge, or points them to the member who knows",
    });
  }
  if (facts.quietNewcomers.count >= QUIET_NEWCOMERS_MIN) {
    list.push({
      key: "quiet_newcomers", kind: "problem",
      title: `${names(facts.quietNewcomers.names, facts.quietNewcomers.count)} joined and haven't said hello`,
      detail: "They joined in the last two weeks. The first two weeks decide whether people stay.",
      guide: "welcomes each one and introduces them to someone",
    });
  }
  if (facts.courseStall && facts.courseStall.members >= COURSE_STALL_MIN) {
    const stall = facts.courseStall;
    list.push({
      key: "course_stall", kind: "problem",
      title: `${stall.members} members stopped after lesson ${stall.lessonNumber} of ${stall.course}`,
      detail: "None of them has moved on in a week.",
      guide: "follows up where each person stopped, and answers their questions on that lesson",
    });
  }
  if (facts.weekMessages >= BUSY_WEEK_MESSAGES) {
    list.push({
      key: "busy_week", kind: "problem",
      title: `${facts.weekMessages}${facts.weekMessages >= 200 ? "+" : ""} messages this week`,
      detail: "More than one person can follow.",
      guide: "writes you a daily brief and keeps every page's summary current",
    });
  }
  return list;
}

// Which card the owner sees now, and whether it is new (to be marked shown).
export function pickOwnerMoment(args: {
  facts: OwnerMomentFacts;
  records: OwnerMomentRecord[];
  nowMs: number;
}): { moment: OwnerMoment; isNew: boolean } | null {
  // Records of cards that no longer exist (the old member milestones) count for nothing.
  const known = args.records.filter((record) => KNOWN_KEYS.has(record.key));
  const records = new Map(known.map((record) => [record.key, record]));
  const all = problems(args.facts);
  const thisWeek = known.filter((record) => args.nowMs - record.shownAt < WEEK_MS);
  // This week's card stays until dismissed, while it is still true.
  const current = thisWeek.find((record) => record.dismissedAt === null);
  if (current) {
    const live = all.find((moment) => moment.key === current.key);
    return live ? { moment: live, isNew: false } : null;
  }
  // At most one new card a week.
  if (thisWeek.length) return null;
  const next = all.find((moment) => {
    const record = records.get(moment.key);
    return !record || args.nowMs - Math.max(record.shownAt, record.dismissedAt ?? 0) >= PROBLEM_QUIET_MS;
  });
  return next ? { moment: next, isNew: true } : null;
}
