import { expect, test } from "vitest";
import {
  BRIEF_DELAY_MS, BRIEF_EXPIRES_MS, BRIEF_MIN_GAP_MS, BRIEF_WRITE_OPERATION,
  briefMarkdown, nextBriefAtMs, parseBriefWriteCall, renderBriefDocument, visibleBrief,
} from "../shared/communityBriefs";

const shown = new Set(["post:a1", "reply:b2", "post:c3"]);
const write = (input: Record<string, unknown>) => ({ operation: BRIEF_WRITE_OPERATION, input });
const point = (text: string, refs: string[] = ["post:a1"]) => ({ text, refs });

test("a brief is a headline and one to five points, each citing posts the guide was shown", () => {
  expect(parseBriefWriteCall(write({ headline: " Busy week ", points: [point(" Climbs on Saturday ", ["post:a1", "reply:b2", "post:a1"])] }), shown))
    .toEqual({ headline: "Busy week", points: [{ text: "Climbs on Saturday", refs: ["post:a1", "reply:b2"] }] });
});

test("a point that cites nothing, or a post it wasn't shown, is refused", () => {
  expect(parseBriefWriteCall(write({ headline: "h", points: [point("made up", [])] }), shown)).toMatchObject({ error: "refs_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: [point("from elsewhere", ["post:zz9"])] }), shown)).toMatchObject({ error: "refs_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: [point("not a post", ["event:a1"])] }), shown)).toMatchObject({ error: "refs_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: ["a plain string"] }), shown)).toMatchObject({ error: "points_invalid" });
});

test("a brief carries no links", () => {
  for (const text of ["See https://evil.example/win", "go to www.evil.example", "sign up at evil.com today"]) {
    expect(parseBriefWriteCall(write({ headline: "h", points: [point(text)] }), shown)).toMatchObject({ error: "links_not_allowed" });
  }
  expect(parseBriefWriteCall(write({ headline: "evil.io has it", points: [point("fine")] }), shown)).toMatchObject({ error: "links_not_allowed" });
  // Ordinary sentences with full stops are fine.
  expect(parseBriefWriteCall(write({ headline: "h", points: [point("Row 12 is out. Use row 11.")] }), shown)).toMatchObject({ headline: "h" });
});

test("a little over what was asked is kept; far over is refused with the reason", () => {
  expect(parseBriefWriteCall(write({ headline: "x".repeat(100), points: [point("y".repeat(250))] }), shown)).toMatchObject({ headline: "x".repeat(100) });
  expect(parseBriefWriteCall(write({ headline: "x".repeat(121), points: [point("a")] }), shown)).toMatchObject({ error: "headline_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: [point("y".repeat(281))] }), shown)).toMatchObject({ error: "points_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: [] }), shown)).toMatchObject({ error: "points_invalid" });
  expect(parseBriefWriteCall(write({ headline: "h", points: Array.from({ length: 6 }, () => point("a")) }), shown)).toMatchObject({ error: "points_invalid" });
  expect(parseBriefWriteCall({ operation: "memory.apply", input: {} }, shown)).toMatchObject({ error: "operation_not_found" });
});

test("a reader sees only points whose posts are all still there, and nothing once the brief is old", () => {
  const brief = { headline: "Busy week", updatedAt: 1_000, points: [point("kept", ["post:a1"]), point("its reply is gone", ["post:a1", "reply:b2"]), point("gone", ["post:c3"])] };
  const live = (ref: string) => ref === "post:a1";
  // A point went, so the headline that summed it up goes too.
  expect(visibleBrief(brief, 2_000, live)).toEqual({ headline: null, updatedAt: 1_000, points: [point("kept", ["post:a1"])] });
  expect(visibleBrief(brief, 2_000, () => true)).toMatchObject({ headline: "Busy week" });
  expect(visibleBrief(brief, 2_000, () => false)).toBeNull();
  expect(visibleBrief(brief, 1_000 + BRIEF_EXPIRES_MS + 1, live)).toBeNull();
  expect(visibleBrief(null, 2_000, live)).toBeNull();
});

test("a brief is due an hour after new activity, never sooner than three hours after the last", () => {
  const now = 10 * BRIEF_MIN_GAP_MS;
  expect(nextBriefAtMs(now, null)).toBe(now + BRIEF_DELAY_MS);
  expect(nextBriefAtMs(now, now - 10 * 60_000)).toBe(now - 10 * 60_000 + BRIEF_MIN_GAP_MS);
  expect(nextBriefAtMs(now, now - 5 * BRIEF_MIN_GAP_MS)).toBe(now + BRIEF_DELAY_MS);
});

test("a brief reads as a few lines", () => {
  expect(briefMarkdown({ headline: "Busy week", points: [point("Climbs Saturday"), point("New wall")] })).toBe("**Busy week**\n- Climbs Saturday\n- New wall");
});

test("brief.md names where each point came from, and says so when there is no brief", () => {
  const doc = renderBriefDocument({ headline: "Busy week", updated_at: "2026-11-15T15:00:00.000Z",
    points: [{ text: "Climbs Saturday.", refs: ["post:a1"], channels: [{ slug: "general", name: "general" }, { slug: "wins", name: "wins" }] }] }, "the community");
  expect(doc).toContain("# What's happening in the community");
  expect(doc).toContain("- Climbs Saturday. (#general, #wins)");
  expect(renderBriefDocument(null, "this pod")).toBe("# What's happening in this pod\n\n_No brief yet._");
});
