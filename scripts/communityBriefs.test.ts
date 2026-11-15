import { expect, test } from "vitest";
import { BRIEF_WRITE_OPERATION, briefMarkdown, parseBriefWriteCall } from "../shared/communityBriefs";

const write = (input: Record<string, unknown>) => ({ operation: BRIEF_WRITE_OPERATION, input });

test("a brief is a headline, one to five points and at most one next step", () => {
  expect(parseBriefWriteCall(write({ headline: " Busy week ", points: ["Climbs on Saturday", " "], next_step: "Say hi to Maya" })))
    .toEqual({ headline: "Busy week", points: ["Climbs on Saturday"], nextStep: "Say hi to Maya" });
  expect(parseBriefWriteCall(write({ headline: "Quiet", points: ["Nothing new"] }))).toMatchObject({ nextStep: null });
});

test("anything over its limit is refused with the reason, not cut", () => {
  expect(parseBriefWriteCall(write({ headline: "x".repeat(91), points: ["a"] }))).toMatchObject({ error: "headline_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: [] }))).toMatchObject({ error: "points_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: ["a", "b", "c", "d", "e", "f"] }))).toMatchObject({ error: "points_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: ["x".repeat(221)] }))).toMatchObject({ error: "points_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: ["a"], next_step: "x".repeat(161) }))).toMatchObject({ error: "next_step_invalid" });
  expect(parseBriefWriteCall({ operation: "memory.apply", input: {} })).toMatchObject({ error: "operation_not_found" });
});

test("a brief reads as a few lines", () => {
  expect(briefMarkdown({ headline: "Busy week", points: ["Climbs Saturday", "New wall"], nextStep: "Come along" }))
    .toBe("**Busy week**\n- Climbs Saturday\n- New wall\nNext: Come along");
});
