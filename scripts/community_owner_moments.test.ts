import { describe, expect, it } from "vitest";
import { pickOwnerMoment, type OwnerMomentFacts } from "../shared/communityOwnerMoments";

const DAY = 86_400_000;
const now = 1_800_000_000_000;
const quiet: OwnerMomentFacts = { questionsWaiting: [], quietNewcomers: { count: 0, names: [] }, courseStall: null, weekMessages: 12 };

describe("owner moments", () => {
  it("no milestones: a quiet community has no card, and old milestone records block nothing", () => {
    expect(pickOwnerMoment({ facts: quiet, records: [], nowMs: now })).toBeNull();
    // A milestone shown this week (before they were removed) neither shows nor holds back a problem.
    const facts = { ...quiet, quietNewcomers: { count: 3, names: ["Omar", "Dev", "Mira"] } };
    const picked = pickOwnerMoment({ facts, records: [{ key: "members_10", shownAt: now - DAY, dismissedAt: null }], nowMs: now });
    expect(picked).toMatchObject({ isNew: true, moment: { key: "quiet_newcomers", kind: "problem", title: "Omar, Dev and 1 more joined and haven't said hello" } });
  });

  it("problems show only while true, with the owner's own numbers", () => {
    const facts = { ...quiet, questionsWaiting: [{ author: "Rashid", channel: "biz", hoursAgo: 30 }] };
    const records: Array<{ key: string; shownAt: number; dismissedAt: number | null }> = [];
    expect(pickOwnerMoment({ facts, records, nowMs: now })?.moment).toMatchObject({ key: "questions_waiting", title: "Rashid's question has waited a day" });
    // A question only 5 hours old is not a problem yet.
    expect(pickOwnerMoment({ facts: { ...facts, questionsWaiting: [{ author: "Rashid", channel: "biz", hoursAgo: 5 }] }, records, nowMs: now })).toBeNull();
    expect(pickOwnerMoment({ facts: { ...quiet, weekMessages: 212 }, records, nowMs: now })?.moment.title).toBe("212+ messages this week");
    expect(pickOwnerMoment({ facts: { ...quiet, courseStall: { course: "Launch your community", lessonNumber: 2, members: 4 } }, records, nowMs: now })?.moment.title)
      .toBe("4 members stopped after lesson 2 of Launch your community");
  });

  it("one card at a time: this week's stays until dismissed, then nothing new until next week", () => {
    const facts = { ...quiet, weekMessages: 180, questionsWaiting: [{ author: "Rashid", channel: "biz", hoursAgo: 30 }] };
    const base: Array<{ key: string; shownAt: number; dismissedAt: number | null }> = [];
    const shown = [...base, { key: "questions_waiting", shownAt: now - DAY, dismissedAt: null }];
    expect(pickOwnerMoment({ facts, records: shown, nowMs: now })).toMatchObject({ isNew: false, moment: { key: "questions_waiting" } });
    const dismissed = [...base, { key: "questions_waiting", shownAt: now - DAY, dismissedAt: now - 1000 }];
    expect(pickOwnerMoment({ facts, records: dismissed, nowMs: now })).toBeNull();
    expect(pickOwnerMoment({ facts, records: dismissed, nowMs: now + 7 * DAY })?.moment.key).toBe("busy_week");
  });

  it("a dismissed problem stays away for a month", () => {
    const facts = { ...quiet, weekMessages: 180 };
    const records = [
      { key: "busy_week", shownAt: now - 10 * DAY, dismissedAt: now - 10 * DAY },
    ];
    expect(pickOwnerMoment({ facts, records, nowMs: now })).toBeNull();
    expect(pickOwnerMoment({ facts, records, nowMs: now + 21 * DAY })?.moment.key).toBe("busy_week");
  });
});
