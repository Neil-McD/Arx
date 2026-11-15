import { expect, test } from "vitest";
import {
  BRIEF_DELAY_MS, BRIEF_EXPIRES_MS, BRIEF_MIN_GAP_MS, BRIEF_WRITE_OPERATION,
  nextBriefAtMs, parseBriefWriteCall, renderBriefDocument, visibleBrief,
} from "../shared/communityBriefs";

const shown = new Set(["post:a1", "reply:b2", "post:c3"]);
const write = (input: Record<string, unknown>) => ({ operation: BRIEF_WRITE_OPERATION, input });

test("a brief is a summary of one to three sentences and the posts it drew on", () => {
  expect(parseBriefWriteCall(write({ summary: " People are planning  Saturday's climb. ", refs: ["post:a1", "reply:b2", "post:a1"] }), shown))
    .toEqual({ summary: "People are planning Saturday's climb.", refs: ["post:a1", "reply:b2"] });
  expect(parseBriefWriteCall(write({ summary: "One. Two! Three?", refs: ["post:a1"] }), shown)).toMatchObject({ summary: "One. Two! Three?" });
  expect(parseBriefWriteCall(write({ summary: "One. Two. Three. Four.", refs: ["post:a1"] }), shown)).toMatchObject({ error: "summary_invalid" });
  expect(parseBriefWriteCall(write({ summary: "", refs: ["post:a1"] }), shown)).toMatchObject({ error: "summary_invalid" });
});

test("the guide can say there is nothing worth a brief", () => {
  expect(parseBriefWriteCall(write({ nothing: true }), shown)).toEqual({ nothing: true });
});

test("a brief that names no post, or a post it wasn't shown, is refused", () => {
  expect(parseBriefWriteCall(write({ summary: "Made up.", refs: [] }), shown)).toMatchObject({ error: "refs_invalid" });
  expect(parseBriefWriteCall(write({ summary: "From elsewhere.", refs: ["post:zz9"] }), shown)).toMatchObject({ error: "refs_invalid" });
  expect(parseBriefWriteCall(write({ summary: "Not a post.", refs: ["event:a1"] }), shown)).toMatchObject({ error: "refs_invalid" });
});

test("a brief carries no links", () => {
  for (const summary of ["See https://evil.example/win", "go to www.evil.example", "sign up at evil.com today"]) {
    expect(parseBriefWriteCall(write({ summary, refs: ["post:a1"] }), shown)).toMatchObject({ error: "links_not_allowed" });
  }
  // Ordinary sentences with full stops are fine.
  expect(parseBriefWriteCall(write({ summary: "Row 12 is out. Use row 11.", refs: ["post:a1"] }), shown)).toMatchObject({ summary: "Row 12 is out. Use row 11." });
});

test("a little over what was asked is kept; far over is refused with the reason", () => {
  expect(parseBriefWriteCall(write({ summary: "y".repeat(400), refs: ["post:a1"] }), shown)).toMatchObject({ summary: "y".repeat(400) });
  expect(parseBriefWriteCall(write({ summary: "y".repeat(481), refs: ["post:a1"] }), shown)).toMatchObject({ error: "summary_invalid" });
  expect(parseBriefWriteCall({ operation: "memory.apply", input: {} }, shown)).toMatchObject({ error: "operation_not_found" });
});

test("a reader sees nothing once any post the brief drew on is gone, or once the brief is old", () => {
  const brief = { summary: "Busy week.", updatedAt: 1_000, refs: ["post:a1", "reply:b2"] };
  expect(visibleBrief(brief, 2_000, () => true)).toEqual(brief);
  expect(visibleBrief(brief, 2_000, (ref) => ref === "post:a1")).toBeNull();
  expect(visibleBrief(brief, 1_000 + BRIEF_EXPIRES_MS + 1, () => true)).toBeNull();
  expect(visibleBrief(null, 2_000, () => true)).toBeNull();
});

test("a brief is due an hour after new activity, never sooner than three hours after the last", () => {
  const now = 10 * BRIEF_MIN_GAP_MS;
  expect(nextBriefAtMs(now, null)).toBe(now + BRIEF_DELAY_MS);
  expect(nextBriefAtMs(now, now - 10 * 60_000)).toBe(now - 10 * 60_000 + BRIEF_MIN_GAP_MS);
  expect(nextBriefAtMs(now, now - 5 * BRIEF_MIN_GAP_MS)).toBe(now + BRIEF_DELAY_MS);
});

test("brief.md is the summary and where it came from, and says so when there is no brief", () => {
  const doc = renderBriefDocument({ summary: "People are planning Saturday's climb.", updated_at: "2026-11-15T15:00:00.000Z",
    channels: [{ slug: "general", name: "general" }, { slug: "wins", name: "wins" }] }, "the community");
  expect(doc).toContain("# What's happening in the community");
  expect(doc).toContain("People are planning Saturday's climb.");
  expect(doc).toContain("recent posts in #general, #wins");
  expect(renderBriefDocument(null, "this pod")).toBe("# What's happening in this pod\n\n_No brief yet._");
});
