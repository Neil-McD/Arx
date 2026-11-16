import { expect, test } from "vitest";
import type { BrainMap, BrainPoint } from "../shared/communityBrain";
import { BRAIN_FIT_MAX, BRAIN_ZOOM_MAX, chooseLabels, fitScale, fitStage, fitView, isFitView, layoutBrain, lensLayout, panBy, reachFor, revealPoint, scaleLayout, stageWindow, zoomAt } from "../shared/communityBrainLayout";

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

// Looking at the map: zoom and pan.
const B = { minX: -400, minY: -300, maxX: 400, maxY: 300 };

test("zooming keeps the point under the cursor where it is", () => {
  const start = fitView(B);
  // The cursor is 120 right and 60 down of the middle; the layout point there is (120, 60).
  const zoomed = zoomAt(start, 120, 60, 3, B);
  expect(zoomed.k).toBe(3);
  expect(zoomed.cx + 120 / zoomed.k).toBeCloseTo(120);
  expect(zoomed.cy + 60 / zoomed.k).toBeCloseTo(60);
  // And again from there, at another spot.
  const again = zoomAt(zoomed, -50, 20, 5, B);
  expect(again.cx + -50 / again.k).toBeCloseTo(zoomed.cx + -50 / zoomed.k);
});

test("zoom has limits, panning stays on the map, and all the way out is the whole map again", () => {
  expect(zoomAt(fitView(B), 0, 0, 99, B).k).toBe(BRAIN_ZOOM_MAX);
  const out = zoomAt(panBy(zoomAt(fitView(B), 100, 0, 4, B), -9_999, 0, B), 0, 0, 0.2, B);
  expect(out).toEqual(fitView(B));
  const far = panBy(zoomAt(fitView(B), 0, 0, 2, B), -99_999, 99_999, B);
  expect(far.cx).toBe(B.maxX);
  expect(far.cy).toBe(B.minY);
  // Dragging right moves the map right: the middle of the view moves left.
  expect(panBy({ k: 2, cx: 0, cy: 0 }, 40, 0, B).cx).toBe(-20);
});

test("a zoomed map is the same layout spread apart, seen through a window the size of the stage", () => {
  const layout = layoutBrain(map(), NOW);
  const spread = scaleLayout(layout, 2);
  expect(spread.points[0].x).toBeCloseTo(layout.points[0].x * 2);
  expect(spread.points[0].r).toBe(layout.points[0].r);
  expect(spread.lessons[0].r).toBe(layout.lessons[0].r);
  expect(spread.extent.maxX).toBeCloseTo(layout.extent.maxX * 2);
  expect(scaleLayout(layout, 1)).toBe(layout);
  const stage = { w: 900, h: 600 };
  const close = stageWindow({ k: 3, cx: 10, cy: -5 }, 3 * 0.8, stage);
  expect([close.w, close.h]).toEqual([900, 600]);
  expect(close.x + close.w / 2).toBeCloseTo(24);
  // Closer in, more things can be named.
  const many = layoutBrain(map({ points: Array.from({ length: 30 }, (_, i) => point(`n${i}`, { kind: "subject", name: "Subject 0" }, i % 5)) }), NOW);
  expect(chooseLabels(scaleLayout(many, 4), { max: 30 }).length).toBeGreaterThan(chooseLabels(many, { max: 30 }).length);
});

test("the whole map fits the stage, whatever its shape, and a small map is not blown up", () => {
  const layout = layoutBrain(map({ courses: 6, subjects: 10, pods: 3 }), NOW);
  const inset = { x: 100, y: 50 };
  for (const stage of [{ w: 1400, h: 700 }, { w: 500, h: 900 }, { w: 800, h: 800 }]) {
    const scale = fitScale(layout.extent, stage, inset);
    expect((layout.extent.maxX - layout.extent.minX) * scale).toBeLessThanOrEqual(stage.w - 200 + 0.01);
    expect((layout.extent.maxY - layout.extent.minY) * scale).toBeLessThanOrEqual(stage.h - 100 + 0.01);
  }
  const tiny = { minX: -20, minY: -20, maxX: 20, maxY: 20 };
  expect(fitScale(tiny, { w: 1400, h: 900 }, inset)).toBe(BRAIN_FIT_MAX);
});

test("a small community's map is small: its rings sit close to its one short course", () => {
  const small = map({ courses: 1, subjects: 2, pods: 0 });
  small.courses[0].lessons = small.courses[0].lessons.slice(0, 2);
  const big = map({ courses: 3, subjects: 2, pods: 0 });
  big.courses[0].lessons = Array.from({ length: 12 }, (_, l) => ({ id: `resource:big${l}`, title: `L${l}`, order: l + 1, done: false, use: 0 }));
  const ring = (m: BrainMap) => Math.min(...layoutBrain(m, NOW).hubs.filter((h) => h.kind === "subject").map((h) => Math.hypot(h.x, h.y)));
  expect(ring(small)).toBeLessThan(ring(big));
  expect(ring(small)).toBeLessThan(201);
});

test("the map can be dragged at rest, and Fit knows when there is nothing to do", () => {
  const moved = panBy(fitView(B), 60, 0, B);
  expect(moved).toEqual({ k: 1, cx: -60, cy: 0 });
  expect(isFitView(moved, B)).toBe(false);
  expect(isFitView(fitView(B), B)).toBe(true);
});

test("a picked point under the panel is brought just into the free part, and one already seen stays put", () => {
  const stage = { w: 1000, h: 600 };
  const free = { left: 60, right: 440, top: 60, bottom: 60 };
  const view = fitView(B);
  // At scale 1 the layout point (300, 0) is at screen x 800: under a panel covering the right 380.
  const shown = revealPoint(view, { x: 300, y: 0 }, 1, stage, free, B);
  expect((300 - shown.cx) * 1 + stage.w / 2).toBeCloseTo(stage.w - free.right);
  expect(shown.cy).toBe(view.cy);
  expect(revealPoint(view, { x: -100, y: 50 }, 1, stage, free, B)).toBe(view);
  // A stage almost all under the panel: the point goes to the middle of what is left, never off it.
  const tight = revealPoint(view, { x: 100, y: 0 }, 1, { w: 500, h: 600 }, { left: 70, right: 440, top: 60, bottom: 60 }, B);
  const sx = (100 - tight.cx) + 250;
  expect(sx).toBeGreaterThan(0);
  expect(sx).toBeLessThan(60);
});

test("only what is in view is named", () => {
  const points = Array.from({ length: 30 }, (_, i) => point(`n${i}`, { kind: "subject", name: `Subject ${i % 3}` }, i % 5));
  const layout = layoutBrain(map({ points }), NOW);
  const within = { x: layout.extent.minX, y: layout.extent.minY, w: (layout.extent.maxX - layout.extent.minX) / 2, h: layout.extent.maxY - layout.extent.minY };
  const named = chooseLabels(layout, { max: 30, within });
  expect(named.length).toBeGreaterThan(0);
  for (const label of named) expect(layout.points.find((p) => p.id === label.id)!.x).toBeLessThanOrEqual(within.x + within.w);
});

test("on a narrow stage the map is drawn smaller so its names stay on it", () => {
  const m = map({ courses: 3, subjects: 4, pods: 1 });
  m.courses.forEach((course, i) => { course.name = `Course number ${i}`; });
  const layout = layoutBrain(m, NOW);
  const opts = { inset: { x: 40, y: 64 }, hubCharW: 8.2, edge: 16 };
  const narrow = fitStage(layout, { w: 430, h: 800 }, opts);
  const wide = fitStage(layout, { w: 1400, h: 850 }, opts);
  expect(narrow.scale).toBeLessThan(wide.scale);
  const view = fitView(narrow.frame);
  for (const hub of layout.hubs.filter((h) => h.kind === "course")) {
    const right = Math.cos((hub.angle * Math.PI) / 180) >= -0.2;
    const sx = (hub.x - view.cx) * narrow.scale + 430 / 2;
    const end = sx + (right ? 1 : -1) * (hub.label.length * 8.2 + 8);
    expect(end).toBeGreaterThanOrEqual(15);
    expect(end).toBeLessThanOrEqual(415);
  }
});

test("the small map's lens keeps every direction and order, pulls far things in, and fills its box", () => {
  const m = map({ courses: 3, subjects: 6, pods: 2, points: Array.from({ length: 40 }, (_, i) => point(`n${i}`, i % 2 ? { kind: "subject", name: `Subject ${i % 6}` } : { kind: "lesson", id: `resource:c${i % 3}l${i % 4}` }, i % 30)) });
  const layout = layoutBrain(m, NOW);
  const box = { w: 300, h: 210 };
  const small = lensLayout(layout, box);
  const angle = (p: { x: number; y: number }, c: { x: number; y: number }) => Math.atan2(p.y - c.y, p.x - c.x);
  const dist = (p: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(p.x - c.x, p.y - c.y);
  const before = [...layout.hubs, ...layout.lessons, ...layout.points];
  const after = [...small.hubs, ...small.lessons, ...small.points];
  // Same direction from the centre, and inside the box.
  after.forEach((p, i) => {
    expect(Math.cos(angle(p, small.center) - angle(before[i], layout.center))).toBeCloseTo(1, 6);
    expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(box.w);
    expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(box.h);
  });
  // Nearer stays nearer: a course's lessons keep their order.
  for (const fibre of layout.fibres) {
    const lessons = small.lessons.filter((l) => l.courseKey === fibre.key).sort((a, b) => a.order - b.order);
    for (let i = 1; i < lessons.length; i++) expect(dist(lessons[i], small.center)).toBeGreaterThan(dist(lessons[i - 1], small.center));
  }
  // Far things are pulled in more than near ones: the nearest thing sits further out, relative to the furthest, than it did.
  const ratio = (all: Array<{ x: number; y: number }>, c: { x: number; y: number }) => Math.min(...all.map((p) => dist(p, c))) / Math.max(...all.map((p) => dist(p, c)));
  expect(ratio(after, small.center)).toBeGreaterThan(ratio(before, layout.center) * 1.5);
  // It fills the box one way or the other, and sizes are left alone.
  const w = small.extent.maxX - small.extent.minX, h = small.extent.maxY - small.extent.minY;
  expect(Math.max(w / (box.w - 28), h / (box.h - 28))).toBeCloseTo(1, 3);
  expect(small.points[0].r).toBe(layout.points[0].r);
  // The same map always draws the same.
  expect(lensLayout(layout, box)).toEqual(small);
});
