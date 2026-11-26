// The Members board's calmer cards: the guide's work in a few words, and each
// stage saying what moves someone on.
import { expect, test } from "vitest";
const { guideDidShort, stageRuleLine } = await import("../apps/web/src/v1/KitMembersBoard");

test("the guide's last action reads as a few words on the card", () => {
  expect(guideDidShort("Guide drafted a check-in (waiting on Home)")).toBe("Drafted a check-in");
  expect(guideDidShort("Guide sent newcomer welcome · replied")).toBe("Sent newcomer welcome");
  expect(guideDidShort(null)).toBeNull();
});

test("a stage says what moves someone on", () => {
  expect(stageRuleLine({ checkpoints: [{ key: "a", label: "Completed a lesson", kind: "first_lesson" }, { key: "b", label: "Shared a goal", kind: "shared_goal" }] }, false))
    .toBe("To move on: completed a lesson, shared a goal");
  expect(stageRuleLine({ checkpoints: [] }, true)).toBe("The last stage");
  expect(stageRuleLine({ checkpoints: [] }, false)).toBe("No checkpoints yet");
});
