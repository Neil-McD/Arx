import { expect, test } from "vitest";
import { KNOWLEDGE_USE_REFS_MAX, knowledgeRefFromRead, knowledgeUseDay, knowledgeUseRefs, summarizeKnowledgeUse } from "../shared/communityKnowledgeUse";

test("a read names the one note or lesson it returned; a listing or anything else names none", () => {
  expect(knowledgeRefFromRead(JSON.stringify({ ref: "note:abc_1", path: "/x", body: "words" }))).toBe("note:abc_1");
  expect(knowledgeRefFromRead(JSON.stringify({ path: "/y", ref: "resource:r-2", body: "lesson" }, null, 2))).toBe("resource:r-2");
  expect(knowledgeRefFromRead(JSON.stringify({ entries: [{ ref: "resource:r1" }] }))).toBeNull();
  // Words inside a document can't pass as its name.
  expect(knowledgeRefFromRead(JSON.stringify({ path: "/z", body: "it said \"ref\": \"note:fake\"" }))).toBeNull();
  expect(knowledgeRefFromRead(JSON.stringify({ ref: "post:abc", body: "a post" }))).toBeNull();
  expect(knowledgeRefFromRead("")).toBeNull();
});

test("an answer's record keeps real refs, each once, a dozen at most", () => {
  expect(knowledgeUseRefs(["note:b", "note:a", "note:b", "post:x", "", "resource:r"])).toEqual(["note:a", "note:b", "resource:r"]);
  expect(knowledgeUseRefs(Array.from({ length: 30 }, (_, i) => `note:n${i}`))).toHaveLength(KNOWLEDGE_USE_REFS_MAX);
  expect(knowledgeUseDay(Date.UTC(2026, 10, 15, 23, 59))).toBe(knowledgeUseDay(Date.UTC(2026, 10, 15, 0, 1)));
});

test("use is how many answers read a thing; together is how many read both", () => {
  const summary = summarizeKnowledgeUse([
    { refs: ["note:a", "note:b", "resource:l"] }, { refs: ["note:a", "note:b"] }, { refs: ["note:a"] }, { refs: ["note:c", "note:a"] },
  ]);
  expect(summary.answers).toBe(4);
  expect(summary.use).toEqual({ "note:a": 4, "note:b": 2, "resource:l": 1, "note:c": 1 });
  expect(summary.together[0]).toEqual({ a: "note:a", b: "note:b", count: 2 });
  expect(summary.together).toContainEqual({ a: "note:a", b: "note:c", count: 1 });
  expect(summary.together).toContainEqual({ a: "note:b", b: "resource:l", count: 1 });
});
