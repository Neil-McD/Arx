import { expect, test } from "vitest";
import { KNOWLEDGE_USE_DAY_PAIRS_MAX, KNOWLEDGE_USE_DAY_REFS_MAX, KNOWLEDGE_USE_REFS_MAX, addToKnowledgeUseDay, knowledgeRefFromRead, knowledgeUseDay, knowledgeUseRefs, summarizeKnowledgeUse } from "../shared/communityKnowledgeUse";

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

test("a day adds up its answers: how many read each thing, how many read each pair", () => {
  let day = { uses: [], pairs: [] } as any;
  for (const refs of [["note:a", "note:b", "resource:l"], ["note:a", "note:b"], ["note:a"], ["note:c", "note:a", "post:x"]]) day = addToKnowledgeUseDay(day, refs);
  expect(day.uses).toEqual([{ ref: "note:a", count: 4 }, { ref: "note:b", count: 2 }, { ref: "note:c", count: 1 }, { ref: "resource:l", count: 1 }]);
  expect(day.pairs[0]).toEqual({ a: "note:a", b: "note:b", count: 2 });
  expect(day.pairs).toContainEqual({ a: "note:a", b: "note:c", count: 1 });
  // An answer that read nothing real adds nothing.
  expect(addToKnowledgeUseDay(day, ["post:x", ""])).toEqual(day);
});

test("a busy day keeps its most-read things and pairs", () => {
  let day = { uses: [], pairs: [] } as any;
  day = addToKnowledgeUseDay(day, ["note:keep", "note:pair"]);
  day = addToKnowledgeUseDay(day, ["note:keep", "note:pair"]);
  // Far more things and pairs than a day keeps.
  for (let i = 0; i < KNOWLEDGE_USE_DAY_PAIRS_MAX + 20; i++) day = addToKnowledgeUseDay(day, [`note:x${i}`, `note:y${i}`]);
  expect(day.uses).toHaveLength(KNOWLEDGE_USE_DAY_REFS_MAX);
  expect(day.pairs).toHaveLength(KNOWLEDGE_USE_DAY_PAIRS_MAX);
  expect(day.uses.slice(0, 2)).toEqual([{ ref: "note:keep", count: 2 }, { ref: "note:pair", count: 2 }]);
  expect(day.pairs[0]).toEqual({ a: "note:keep", b: "note:pair", count: 2 });
});

test("a month is its days summed", () => {
  expect(summarizeKnowledgeUse([
    { uses: [{ ref: "note:a", count: 3 }], pairs: [{ a: "note:a", b: "note:b", count: 1 }] },
    { uses: [{ ref: "note:a", count: 1 }, { ref: "note:b", count: 2 }], pairs: [{ a: "note:a", b: "note:b", count: 2 }] },
  ])).toEqual({ use: { "note:a": 4, "note:b": 2 }, together: [{ a: "note:a", b: "note:b", count: 3 }] });
});
