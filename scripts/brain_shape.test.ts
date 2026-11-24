import { expect, test } from "vitest";
import { brainShapeOf, type BrainMap } from "../shared/communityBrain";

test("a pod's shape keeps the dots and how they connect, and drops every word", () => {
  const map: BrainMap = {
    center: { name: "Founders", kind: "pod" }, counts: { courses: 0, lessons: 0, learned: 3, this_week: 1 }, can_manage: true,
    courses: [], pods: [], hidden: { "subject:Divorce": 4 },
    subjects: [{ name: "Divorce", first_at: "2026-11-01T00:00:00.000Z", size: 2 }],
    points: [
      { id: "note:a", title: "Ana's custody worry", kind: "learned", at: { kind: "subject", name: "Divorce" }, learned_at: "2026-11-02T00:00:00.000Z", fresh: false, use: 3, mine: true },
      { id: "note:b", title: "Host's pricing note", kind: "taught", at: { kind: "subject", name: "Divorce" }, learned_at: "2026-11-20T00:00:00.000Z", fresh: true, use: 0, mine: false },
      { id: "note:c", title: "Loose", kind: "learned", at: { kind: "other" }, learned_at: "2026-11-21T00:00:00.000Z", fresh: true, use: 1, mine: false },
    ],
    arcs: [{ a: "note:a", b: "note:b", count: 2 }, { a: "note:a", b: "resource:x", count: 1 }],
  };
  const shape = brainShapeOf(map);
  const text = JSON.stringify(shape);
  expect(text).not.toMatch(/Divorce|custody|pricing|Ana|Loose|note:a|note:b/);
  expect(shape.points.map((p) => [p.id, p.title, p.kind, p.mine, p.at])).toEqual([
    ["note:p1", null, "learned", false, { kind: "subject", name: "s1" }],
    ["note:p2", null, "learned", false, { kind: "subject", name: "s1" }],
    ["note:p3", null, "learned", false, { kind: "other" }],
  ]);
  expect(shape.arcs).toEqual([{ a: "note:p1", b: "note:p2", count: 2 }]);
  expect(shape.hidden).toEqual({});
  expect(shape.can_manage).toBe(false);
  expect(shape.counts).toEqual({ courses: 0, lessons: 0, learned: 3, this_week: 1 });
});
