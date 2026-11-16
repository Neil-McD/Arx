import { expect, test } from "vitest";
import type { BrainMap, BrainPoint } from "../shared/communityBrain";
import { chooseLabels, layoutBrain, reachFor } from "../shared/communityBrainLayout";

const NOW = Date.UTC(2026, 10, 15);
const DAY = 86_400_000;

function point(id: string, at: BrainPoint["at"], daysAgo = 10, extra: Partial<BrainPoint> = {}): BrainPoint {
  return { id: `note:${id}`, title: id, kind: "learned", at, learned_at: new Date(NOW - daysAgo * DAY).toISOString(), fresh: daysAgo <= 7, use: 0, mine: false, ...extra };
}

function map(opts: { courses?: number; subjects?: number; pods?: number; points?: BrainPoint[] } = {}): BrainMap {
  const courses = Array.from({ length: opts.courses ?? 2 }, (_, c) => ({
    id: `course:c${c}`, name: `Course ${c}`, order: c,
    lessons: Array.from({ length: 4 }, (_, l) => ({ id: `resource:c${c}l${l}`, title: `Lesson ${l}`, order: l + 1, done: false, use: 0 })),
  }));
  const subjects = Array.from({ length: opts.subjects ?? 3 }, (_, s) => ({ name: `Subject ${s}`, first_at: new Date(NOW - (100 - s) * DAY).toISOString(), size: 1 }));
  const pods = Array.from({ length: opts.pods ?? 1 }, (_, p) => ({ id: `pod:p${p}`, name: `Pod ${p}`, inside: true, count: 0 }));
  return {
    center: { name: "Club", kind: "community" }, counts: { courses: courses.length, lessons: 0, learned: 0, this_week: 0 }, can_manage: true,
    courses, subjects, pods, points: opts.points ?? [point("a", { kind: "lesson", id: "resource:c0l1" }), point("b", { kind: "subject", name: "Subject 0" })],
    arcs: [], hidden: {},
  };
}

const where = (layout: ReturnType<typeof layoutBrain>) => new Map<string, string>([
  ...layout.hubs.map((h) => [h.key, `${h.x.toFixed(3)},${h.y.toFixed(3)}`] as const),
  ...layout.lessons.map((l) => [l.id, `${l.x.toFixed(3)},${l.y.toFixed(3)}`] as const),
  ...layout.points.map((p) => [p.id, `${p.x.toFixed(3)},${p.y.toFixed(3)}`] as const),
]);

test("the same map always lays out the same", () => {
  expect(where(layoutBrain(map(), NOW))).toEqual(where(layoutBrain(map(), NOW)));
});

test("adding a learned thing moves no other point", () => {
  const before = where(layoutBrain(map(), NOW));
  const grown = map();
  grown.points = [...grown.points, point("new", { kind: "lesson", id: "resource:c0l1" }, 0), point("other", { kind: "other" }, 3)];
  const after = where(layoutBrain(grown, NOW));
  for (const [key, at] of before) expect(after.get(key)).toBe(at);
});

test("adding a subject or a pod moves no hub, lesson or point already there", () => {
  const before = where(layoutBrain(map({ courses: 2, subjects: 3, pods: 1 }), NOW));
  // A new course, subject and pod each: everything already there stays put.
  const after = where(layoutBrain(map({ courses: 3, subjects: 4, pods: 2 }), NOW));
  for (const [key, at] of before) expect(after.get(key)).toBe(at);
});

test("twenty hubs keep their distance", () => {
  const layout = layoutBrain(map({ courses: 5, subjects: 12, pods: 3 }), NOW);
  const others = layout.hubs.filter((h) => h.kind !== "course");
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      expect(Math.hypot(others[i].x - others[j].x, others[i].y - others[j].y)).toBeGreaterThan(40);
    }
  }
});

test("newer reaches further, and a day's ageing barely moves a point", () => {
  expect(reachFor(new Date(NOW).toISOString(), NOW)).toBeGreaterThan(reachFor(new Date(NOW - 60 * DAY).toISOString(), NOW));
  const today = layoutBrain(map(), NOW).points[0];
  const tomorrow = layoutBrain(map(), NOW + DAY).points[0];
  expect(Math.hypot(today.x - tomorrow.x, today.y - tomorrow.y)).toBeLessThan(1);
});

test("everything sits inside the bounds", () => {
  const layout = layoutBrain(map({ courses: 6, subjects: 10, pods: 3, points: Array.from({ length: 150 }, (_, i) => point(`n${i}`, { kind: "subject", name: `Subject ${i % 10}` }, i % 90)) }), NOW);
  for (const p of [...layout.hubs, ...layout.lessons, ...layout.points]) {
    expect(p.x).toBeGreaterThanOrEqual(layout.bounds.minX);
    expect(p.x).toBeLessThanOrEqual(layout.bounds.maxX);
    expect(p.y).toBeGreaterThanOrEqual(layout.bounds.minY);
    expect(p.y).toBeLessThanOrEqual(layout.bounds.maxY);
  }
});

test("names never overlap, and a point the viewer may not read is never named", () => {
  const points = Array.from({ length: 40 }, (_, i) => point(`n${i}`, { kind: "subject", name: "Subject 0" }, i % 5, { title: i % 3 === 0 ? null : `Thing number ${i}`, use: i }));
  const layout = layoutBrain(map({ points }), NOW);
  const labels = chooseLabels(layout, { max: 20 });
  for (let i = 0; i < labels.length; i++) {
    expect(layout.points.find((p) => p.id === labels[i].id)!.point.title).not.toBeNull();
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i].box, b = labels[j].box;
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }
  }
});

test("arcs join only what the map draws", () => {
  const m = map();
  m.arcs = [{ a: "note:a", b: "resource:c0l1", count: 2 }, { a: "note:a", b: "note:missing", count: 9 }];
  expect(layoutBrain(m, NOW).arcs.map((arc) => arc.ids)).toEqual([["note:a", "resource:c0l1"]]);
});

test("a long course stays inside the core", () => {
  const m = map();
  m.courses[0].lessons = Array.from({ length: 100 }, (_, l) => ({ id: `resource:long${l}`, title: `L${l}`, order: l + 1, done: false, use: 0 }));
  const layout = layoutBrain(m, NOW);
  for (const lesson of layout.lessons) expect(Math.hypot(lesson.x, lesson.y)).toBeLessThanOrEqual(305);
});
