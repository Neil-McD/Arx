// The Members board's calmer cards: the guide's work in a few words, and each
// stage saying what moves someone on.
import { expect, test } from "vitest";
const { cardReason, guideDidShort, stageRuleLine } = await import("../apps/web/src/v1/KitMembersBoard");

test("the guide's last action reads as a few words on the card", () => {
  expect(guideDidShort("Guide drafted a check-in (waiting on Home)")).toBe("Drafted a check-in · on Home");
  expect(guideDidShort("Guide sent newcomer welcome · replied")).toBe("Sent newcomer welcome · replied");
  expect(guideDidShort("Guide checked in (course check-in)")).toBe("Checked in (course check-in)");
  expect(guideDidShort(null)).toBeNull();
});

test("a stage says what moves someone on", () => {
  expect(stageRuleLine({ checkpoints: [{ key: "a", label: "Completed a lesson", kind: "first_lesson" }, { key: "b", label: "Shared a goal", kind: "shared_goal" }] }, false))
    .toBe("To move on: completed a lesson, shared a goal");
  expect(stageRuleLine({ checkpoints: [] }, true)).toBe("The last stage");
  expect(stageRuleLine({ checkpoints: [] }, false)).toBe("No checkpoints yet");
});

test("a marked card says why, from what the board really knows", () => {
  const now = Date.UTC(2026, 10, 25);
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const base = { status_is_manual: false, money_kind: null, last_active_at: ago(1), joined_at: ago(40) } as const;
  expect(cardReason({ ...base, status: "needs_you", money_kind: "on_hold" }, now)).toBe("Payment on hold");
  expect(cardReason({ ...base, status: "needs_you", money_kind: "cancelling" }, now)).toBe("Cancelling");
  expect(cardReason({ ...base, status: "stuck", status_is_manual: true }, now)).toBe("Marked stuck by you");
  expect(cardReason({ ...base, status: "quiet", last_active_at: ago(31) }, now)).toBe("Quiet for 31 days");
  expect(cardReason({ ...base, status: "stuck", last_active_at: ago(12) }, now)).toBe("Quiet for 12 days");
  // Stuck but recently active: the other half of the rule, an unanswered check-in.
  expect(cardReason({ ...base, status: "stuck", last_active_at: ago(2) }, now)).toBe("Hasn't answered a check-in");
  expect(cardReason({ ...base, status: "on_track" }, now)).toBeNull();
});
