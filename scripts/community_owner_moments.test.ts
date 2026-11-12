import { describe, expect, it } from "vitest";
import { milestoneKeysCoveredBy, pickOwnerMoment, type OwnerMomentFacts } from "../shared/communityOwnerMoments";

const DAY = 86_400_000;
const now = 1_800_000_000_000;
const quiet: OwnerMomentFacts = { memberCount: 3, questionsWaiting: [], quietNewcomers: { count: 0, names: [] }, courseStall: null, weekMessages: 12 };

describe("owner moments", () => {
  it("the first member is a congratulations with no upsell", () => {
    const picked = pickOwnerMoment({ facts: { ...quiet, memberCount: 1 }, records: [], nowMs: now });
    expect(picked).toMatchObject({ isNew: true, moment: { key: "members_1", kind: "milestone", guide: null } });
  });

  it("10 members names a real problem when there is one, and only the highest milestone shows", () => {
    const facts = { ...quiet, memberCount: 12, quietNewcomers: { count: 3, names: ["Omar", "Dev", "Mira"] } };
    const picked = pickOwnerMoment({ facts, records: [{ key: "members_1", shownAt: now - 40 * DAY, dismissedAt: now - 40 * DAY }], nowMs: now });
    expect(picked?.moment.key).toBe("members_10");
    expect(picked?.moment.detail).toBe("Omar, Dev and 1 more joined and haven't said hello.");
    expect(picked?.moment.guide).toContain("welcomes each one");
    expect(pickOwnerMoment({ facts: { ...quiet, memberCount: 60 }, records: [], nowMs: now })?.moment.key).toBe("members_50");
    expect(milestoneKeysCoveredBy("members_50")).toEqual(["members_50", "members_10", "members_1"]);
  });

  it("problems show only while true, with the owner's own numbers", () => {
    const facts = { ...quiet, memberCount: 30, questionsWaiting: [{ author: "Rashid", channel: "biz", hoursAgo: 30 }] };
    const records = [{ key: "members_10", shownAt: now - 60 * DAY, dismissedAt: null }, { key: "members_1", shownAt: now - 60 * DAY, dismissedAt: null }];
    expect(pickOwnerMoment({ facts, records, nowMs: now })?.moment).toMatchObject({ key: "questions_waiting", title: "Rashid's question has waited a day" });
    // A question only 5 hours old is not a problem yet.
    expect(pickOwnerMoment({ facts: { ...facts, questionsWaiting: [{ author: "Rashid", channel: "biz", hoursAgo: 5 }] }, records, nowMs: now })).toBeNull();
    expect(pickOwnerMoment({ facts: { ...quiet, memberCount: 30, weekMessages: 212 }, records, nowMs: now })?.moment.title).toBe("212+ messages this week");
    expect(pickOwnerMoment({ facts: { ...quiet, memberCount: 30, courseStall: { course: "Launch your community", lessonNumber: 2, members: 4 } }, records, nowMs: now })?.moment.title)
      .toBe("4 members stopped after lesson 2 of Launch your community");
  });

  it("one card at a time: this week's stays until dismissed, then nothing new until next week", () => {
    const facts = { ...quiet, memberCount: 30, weekMessages: 180, questionsWaiting: [{ author: "Rashid", channel: "biz", hoursAgo: 30 }] };
    const base = [{ key: "members_10", shownAt: now - 60 * DAY, dismissedAt: null }, { key: "members_1", shownAt: now - 60 * DAY, dismissedAt: null }];
    const shown = [...base, { key: "questions_waiting", shownAt: now - DAY, dismissedAt: null }];
    expect(pickOwnerMoment({ facts, records: shown, nowMs: now })).toMatchObject({ isNew: false, moment: { key: "questions_waiting" } });
    const dismissed = [...base, { key: "questions_waiting", shownAt: now - DAY, dismissedAt: now - 1000 }];
    expect(pickOwnerMoment({ facts, records: dismissed, nowMs: now })).toBeNull();
    expect(pickOwnerMoment({ facts, records: dismissed, nowMs: now + 7 * DAY })?.moment.key).toBe("busy_week");
  });

  it("a dismissed problem stays away for a month", () => {
    const facts = { ...quiet, memberCount: 30, weekMessages: 180 };
    const records = [
      { key: "members_10", shownAt: now - 60 * DAY, dismissedAt: null }, { key: "members_1", shownAt: now - 60 * DAY, dismissedAt: null },
      { key: "busy_week", shownAt: now - 10 * DAY, dismissedAt: now - 10 * DAY },
    ];
    expect(pickOwnerMoment({ facts, records, nowMs: now })).toBeNull();
    expect(pickOwnerMoment({ facts, records, nowMs: now + 21 * DAY })?.moment.key).toBe("busy_week");
  });
});
