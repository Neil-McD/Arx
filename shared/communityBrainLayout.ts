// Where everything on the community brain's map goes (shared/communityBrain.ts
// is what it holds). Fixed rules, not a simulation: each thing's place comes
// from itself alone, so the map keeps its shape as it grows and people learn
// their way around it.
// - Hubs (courses, subjects, pods) sit around the centre by the golden angle,
//   in a fixed order: a new hub takes the next angle and moves none before it.
// - A course is a fibre out from the centre with its lessons along it, in
//   order; subjects and pods sit on rings outside the longest fibre, a core
//   and a cortex, so a fibre never runs through a subject.
// - A learned thing branches off its lesson, subject or pod: its angle comes
//   from its own id, its reach from its age (newer reaches further).
// Units are layout units; the drawing scales the whole to fit its box.
import type { BrainAttach, BrainMap, BrainPoint } from "./communityBrain";

export const GOLDEN_ANGLE = 137.50776405003785;
const COURSE_INNER = 64;
// Subjects sit this far outside the longest fibre (so no fibre crosses
// them), and pods this far outside the subjects. A small community's map is
// small; the rings only widen when its longest course does.
const SUBJECT_GAP = 72;
const SUBJECT_RING_MIN = 150;
const POD_GAP = 84;
// With many subjects or pods, every other one sits this much further out.
const RING_STAGGER = 34;
const LESSON_STEP = 64;
const FIBRE_MAX = 300;
// A hub's name, roughly, so the map makes room for it.
const HUB_CHAR_W = 8.2;
// A learned thing's reach from its anchor: newest, and settled.
const REACH_NEW = 74;
const REACH_OLD = 30;
const REACH_SETTLE_DAYS = 90;
const DAY_MS = 86_400_000;

export type Placed = { x: number; y: number };
export type LayoutHub = Placed & { key: string; kind: "course" | "subject" | "pod" | "other"; label: string; angle: number; inside: boolean; count: number };
export type LayoutLesson = Placed & { id: string; courseKey: string; order: number; title: string; done: boolean; use: number; r: number };
export type LayoutPoint = Placed & { id: string; anchor: Placed; point: BrainPoint; r: number };
export type LayoutFibre = { key: string; path: Placed[] };
export type LayoutArc = { a: Placed; b: Placed; count: number; ids: [string, string] };
export type BrainLayout = {
  center: Placed;
  hubs: LayoutHub[];
  fibres: LayoutFibre[];
  lessons: LayoutLesson[];
  points: LayoutPoint[];
  arcs: LayoutArc[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  // Where things are, with no room for names: what a view frames.
  extent: { minX: number; minY: number; maxX: number; maxY: number };
};

// A number in [0, 1) from a string, the same every time.
export function hashUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function polar(angleDeg: number, r: number, from: Placed = { x: 0, y: 0 }): Placed {
  const a = (angleDeg * Math.PI) / 180;
  return { x: from.x + r * Math.cos(a), y: from.y + r * Math.sin(a) };
}

// A point's size: how often answers read it, on a square-root scale.
export function sizeFor(use: number, base = 2.2, step = 1.1, max = 7): number {
  return Math.min(max, base + Math.sqrt(Math.max(0, use)) * step);
}

// How far a learned thing reaches from its anchor: newest furthest, easing in
// over three months. A day's ageing moves it under a unit.
export function reachFor(learnedAtIso: string, nowMs: number): number {
  const days = Math.max(0, (nowMs - Date.parse(learnedAtIso)) / DAY_MS);
  const settle = Math.min(1, days / REACH_SETTLE_DAYS);
  return REACH_NEW - (REACH_NEW - REACH_OLD) * settle;
}

// The hubs in their fixed order: courses (the builder's order), then
// subjects (when each first appeared), then pods, then "nowhere yet".
function hubOrder(map: BrainMap): Array<Omit<LayoutHub, "x" | "y" | "angle">> {
  const hubs: Array<Omit<LayoutHub, "x" | "y" | "angle">> = [];
  for (const course of map.courses) hubs.push({ key: course.id, kind: "course", label: course.name, inside: true, count: course.lessons.length });
  for (const subject of map.subjects) hubs.push({ key: `subject:${subject.name}`, kind: "subject", label: subject.name, inside: true, count: subject.size });
  for (const pod of map.pods) hubs.push({ key: pod.id, kind: "pod", label: pod.name, inside: pod.inside, count: pod.count });
  if (map.points.some((point) => point.at.kind === "other")) hubs.push({ key: "other", kind: "other", label: "Not filed yet", inside: true, count: 0 });
  return hubs;
}

export function layoutBrain(map: BrainMap, nowMs: number): BrainLayout {
  const center = { x: 0, y: 0 };
  const hubs: LayoutHub[] = [];
  const fibres: LayoutFibre[] = [];
  const lessons: LayoutLesson[] = [];
  const anchors = new Map<string, { at: Placed; out: number }>();

  const fibreEnd = (lessonCount: number) => {
    const n = Math.max(1, lessonCount);
    return COURSE_INNER + (n - 1) * Math.min(LESSON_STEP, (FIBRE_MAX - COURSE_INNER) / n);
  };
  const subjectRing = Math.max(SUBJECT_RING_MIN, Math.max(0, ...map.courses.map((course) => fibreEnd(course.lessons.length))) + SUBJECT_GAP);
  const podRing = subjectRing + POD_GAP;
  // Each kind keeps its own run of the golden angle, so a new hub of one kind
  // moves no hub of another (they sit on different rings).
  const seen: Record<string, number> = {};
  const KIND_OFFSET: Record<string, number> = { course: 200, subject: 250, pod: 300, other: 160 };
  hubOrder(map).forEach((hub, index) => {
    const slot = seen[hub.kind] = (seen[hub.kind] ?? -1) + 1;
    const angle = (slot * GOLDEN_ANGLE + KIND_OFFSET[hub.kind]) % 360;
    if (hub.kind === "course") {
      const course = map.courses.find((entry) => entry.id === hub.key)!;
      const n = Math.max(1, course.lessons.length);
      // A long course packs its lessons closer; it never reaches past the core.
      const step = Math.min(LESSON_STEP, (FIBRE_MAX - COURSE_INNER) / n);
      // A fibre bends a little, the same way every time.
      const bend = (hashUnit(hub.key) - 0.5) * 16;
      const path: Placed[] = [center];
      course.lessons.forEach((lesson, i) => {
        const at = polar(angle + bend * (i / n), COURSE_INNER + i * step);
        path.push(at);
        lessons.push({ ...at, id: lesson.id, courseKey: hub.key, order: lesson.order, title: lesson.title, done: lesson.done, use: lesson.use, r: Math.min(sizeFor(lesson.use, 4.6, 0.8, 8), Math.max(1.6, step / 2.4)) });
        anchors.set(`lesson:${lesson.id}`, { at, out: angle + bend * (i / n) });
      });
      const end = polar(angle + bend, COURSE_INNER + n * step - step / 2);
      fibres.push({ key: hub.key, path });
      hubs.push({ ...hub, ...end, angle });
      return;
    }
    // Subjects on their ring, pods outside them; with many, alternate rings so neighbours don't touch.
    const base = hub.kind === "pod" ? podRing : subjectRing;
    const r = base + (slot % 2 === 0 ? 0 : RING_STAGGER);
    const at = polar(angle, r);
    hubs.push({ ...hub, ...at, angle });
    const key = hub.kind === "subject" ? hub.key : hub.kind === "pod" ? `pod:${hub.key.replace(/^pod:/, "")}` : "other";
    anchors.set(key, { at, out: angle });
  });

  const anchorFor = (at: BrainAttach) => anchors.get(at.kind === "lesson" ? `lesson:${at.id}` : at.kind === "subject" ? `subject:${at.name}` : at.kind === "pod" ? `pod:${at.id.replace(/^pod:/, "")}` : "other");
  const points: LayoutPoint[] = [];
  for (const point of map.points) {
    const anchor = anchorFor(point.at) ?? anchors.get("other");
    if (!anchor) continue;
    // A lesson's things fan to either side of its fibre; a subject's or pod's outward.
    const lessonSide = point.at.kind === "lesson" ? (hashUnit(`${point.id}:side`) < 0.5 ? -1 : 1) : 0;
    const spread = point.at.kind === "lesson" ? 70 : 150;
    const centreAngle = point.at.kind === "lesson" ? anchor.out + lessonSide * 90 : anchor.out;
    const angle = centreAngle + (hashUnit(point.id) - 0.5) * spread;
    const reach = reachFor(point.learned_at, nowMs) * (0.85 + hashUnit(`${point.id}:reach`) * 0.3);
    const at = polar(angle, reach, anchor.at);
    points.push({ ...at, id: point.id, anchor: anchor.at, point, r: sizeFor(point.use) });
  }

  const where = new Map<string, Placed>([...points.map((p) => [p.id, p] as const), ...lessons.map((l) => [l.id, l] as const)]);
  const arcs: LayoutArc[] = map.arcs.flatMap((arc) => {
    const a = where.get(arc.a);
    const b = where.get(arc.b);
    return a && b ? [{ a, b, count: arc.count, ids: [arc.a, arc.b] as [string, string] }] : [];
  });

  const all: Placed[] = [center, ...hubs, ...lessons, ...points];
  const extent = {
    minX: Math.min(...all.map((p) => p.x)), minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)), maxY: Math.max(...all.map((p) => p.y)),
  };
  // Room for each hub's name: a course's runs on from its fibre's end; a
  // subject's or pod's sits centred on it.
  for (const hub of hubs) {
    const w = hub.label.length * HUB_CHAR_W;
    if (hub.kind === "course") all.push({ x: hub.x + (Math.cos((hub.angle * Math.PI) / 180) >= -0.2 ? w + 8 : -w - 8), y: hub.y });
    else all.push({ x: hub.x - w / 2, y: hub.y - 30 }, { x: hub.x + w / 2, y: hub.y + (hub.kind === "pod" ? 66 : 20) });
  }
  const pad = 40;
  const bounds = {
    minX: Math.min(...all.map((p) => p.x)) - pad, minY: Math.min(...all.map((p) => p.y)) - pad,
    maxX: Math.max(...all.map((p) => p.x)) + pad, maxY: Math.max(...all.map((p) => p.y)) + pad,
  };
  return { center, hubs, fibres, lessons, points, arcs, bounds, extent };
}

// Which learned things get a name on the full page: what the viewer may read,
// new this week or most used, and only where the name doesn't cover another.
export type LabelBox = { x: number; y: number; w: number; h: number };
export function chooseLabels(layout: BrainLayout, opts: { max?: number; charW?: number; lineH?: number; taken?: LabelBox[]; within?: LabelBox; dot?: number; clearOfDots?: boolean } = {}): Array<{ id: string; box: LabelBox; right: boolean }> {
  const max = opts.max ?? 10;
  const charW = opts.charW ?? 6.2;
  const lineH = opts.lineH ?? 13;
  const dot = opts.dot ?? 1;
  const taken: LabelBox[] = [...(opts.taken ?? [])];
  // A name never sits on another thing's dot.
  if (opts.clearOfDots) {
    for (const p of layout.points) taken.push({ x: p.x - p.r * dot - 1, y: p.y - p.r * dot - 1, w: p.r * dot * 2 + 2, h: p.r * dot * 2 + 2 });
    for (const l of layout.lessons) taken.push({ x: l.x - 7, y: l.y - 7, w: 14, h: 14 });
  }
  const overlaps = (a: LabelBox) => taken.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
  // In view: the dot, and (checked below) the whole of its name.
  const inside = (b: LabelBox) => !opts.within || (b.x >= opts.within.x && b.x + b.w <= opts.within.x + opts.within.w && b.y >= opts.within.y && b.y + b.h <= opts.within.y + opts.within.h);
  const candidates = layout.points.filter((p) => p.point.title && inside({ x: p.x, y: p.y, w: 0, h: 0 }))
    .sort((a, b) => Number(b.point.fresh) - Number(a.point.fresh) || b.point.use - a.point.use || a.id.localeCompare(b.id));
  const chosen: Array<{ id: string; box: LabelBox; right: boolean }> = [];
  for (const p of candidates) {
    if (chosen.length >= max) break;
    const right = p.x >= p.anchor.x;
    const w = Math.min(28, p.point.title!.length) * charW;
    const box = { x: right ? p.x + p.r * dot + 5 : p.x - p.r * dot - 5 - w, y: p.y - lineH / 2, w, h: lineH };
    if (!inside(box) || overlaps(box)) continue;
    taken.push(box);
    chosen.push({ id: p.id, box, right });
  }
  return chosen;
}

// ---------- looking at the map: zoom and pan
//
// The map is drawn in screen pixels. A view says how far in (k) and which
// layout point is at the middle; the drawing multiplies every position by
// the stage's fit times k and leaves sizes alone, so a dot or a name is the
// same size on screen however far in you are.

// k: how far in (1 = the whole map fits). cx, cy: the layout point at the middle of the view.
export type BrainView = { k: number; cx: number; cy: number };
export const BRAIN_ZOOM_MAX = 6;
// A small map is not blown up past this many pixels per layout unit.
export const BRAIN_FIT_MAX = 1.9;

type Bounds = BrainLayout["bounds"];
export type BrainStage = { w: number; h: number };

export function fitView(bounds: Bounds): BrainView {
  return { k: 1, cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2 };
}

// Pixels per layout unit at which the whole map fits the stage, leaving the
// insets free on each side (room for names and the controls over the map).
export function fitScale(extent: Bounds, stage: BrainStage, inset: { x: number; y: number }): number {
  const w = Math.max(1, extent.maxX - extent.minX);
  const h = Math.max(1, extent.maxY - extent.minY);
  const fit = Math.min((stage.w - inset.x * 2) / w, (stage.h - inset.y * 2) / h);
  return Math.min(BRAIN_FIT_MAX, Math.max(0.05, fit));
}

// The fit that also keeps hub names on the stage: names are a fixed size on
// screen, so a narrow stage draws the map smaller to leave them room (never
// under two fifths of its plain fit), and centres on the map with its names. Learned
// things are only named where there is room, so they ask for none. Returns the pixels per layout unit and
// the frame a view is fitted to and kept inside.
export function fitStage(layout: BrainLayout, stage: BrainStage, opts: { inset: { x: number; y: number }; hubCharW: number; edge: number }): { scale: number; frame: Bounds } {
  const { extent } = layout;
  // Each name: where it hangs, and how far it runs left and right of there, in pixels.
  const names: Array<{ x: number; left: number; right: number }> = [];
  for (const hub of layout.hubs) {
    const w = hub.label.length * opts.hubCharW;
    if (hub.kind === "course") names.push(Math.cos((hub.angle * Math.PI) / 180) >= -0.2 ? { x: hub.x, left: 0, right: w + 8 } : { x: hub.x, left: w + 8, right: 0 });
    else names.push({ x: hub.x, left: w / 2, right: w / 2 });
  }
  const span = (at: number) => ({
    min: Math.min(extent.minX * at, ...names.map((n) => n.x * at - n.left)),
    max: Math.max(extent.maxX * at, ...names.map((n) => n.x * at + n.right)),
  });
  const room = Math.max(40, stage.w - opts.edge * 2);
  let scale = fitScale(extent, stage, opts.inset);
  if (span(scale).max - span(scale).min > room) {
    // Names don't shrink with the map, so find the largest scale that fits.
    let low = 0.02, high = scale;
    for (let pass = 0; pass < 24; pass++) {
      const mid = (low + high) / 2;
      if (span(mid).max - span(mid).min > room) high = mid; else low = mid;
    }
    scale = Math.max(low, scale * 0.4);
  }
  const { min: minPx, max: maxPx } = span(scale);
  const cx = (minPx + maxPx) / 2 / scale;
  const half = Math.max(cx - extent.minX, extent.maxX - cx);
  return { scale, frame: { minX: cx - half, maxX: cx + half, minY: extent.minY, maxY: extent.maxY } };
}

// The view kept inside its limits: no closer than the cap, no further out
// than the whole map, and its middle never off the map.
export function clampView(view: BrainView, bounds: Bounds): BrainView {
  const k = Math.min(BRAIN_ZOOM_MAX, Math.max(1, view.k));
  return { k, cx: Math.min(bounds.maxX, Math.max(bounds.minX, view.cx)), cy: Math.min(bounds.maxY, Math.max(bounds.minY, view.cy)) };
}

// Whether a view is the whole map, centred (nothing for "Fit" to do).
export function isFitView(view: BrainView, bounds: Bounds): boolean {
  const fit = fitView(bounds);
  return view.k === 1 && Math.abs(view.cx - fit.cx) < 0.5 && Math.abs(view.cy - fit.cy) < 0.5;
}

// Zooms to k keeping fixed the point under the cursor. dx, dy: the cursor's
// offset from the middle of the view, in layout units at k = 1 (pixels
// divided by the stage's fit).
export function zoomAt(view: BrainView, dx: number, dy: number, k: number, bounds: Bounds): BrainView {
  const next = Math.min(BRAIN_ZOOM_MAX, Math.max(1, k));
  const px = view.cx + dx / view.k;
  const py = view.cy + dy / view.k;
  // All the way out is the whole map again, centred.
  if (next === 1) return fitView(bounds);
  return clampView({ k: next, cx: px - dx / next, cy: py - dy / next }, bounds);
}

// Drags the map by dx, dy (the same units as zoomAt).
export function panBy(view: BrainView, dx: number, dy: number, bounds: Bounds): BrainView {
  return clampView({ k: view.k, cx: view.cx - dx / view.k, cy: view.cy - dy / view.k }, bounds);
}

// The window onto the scaled layout, in pixels: the stage, centred on the view.
export function stageWindow(view: BrainView, scale: number, stage: BrainStage): { x: number; y: number; w: number; h: number } {
  return { x: view.cx * scale - stage.w / 2, y: view.cy * scale - stage.h / 2, w: stage.w, h: stage.h };
}

// The view moved the least that brings a layout point inside the part of
// the stage that is free (a panel may cover its right side). scale: pixels
// per layout unit now (fit times k).
export function revealPoint(view: BrainView, at: Placed, scale: number, stage: BrainStage, free: { left: number; right: number; top: number; bottom: number }, bounds: Bounds): BrainView {
  const sx = (at.x - view.cx) * scale + stage.w / 2;
  const sy = (at.y - view.cy) * scale + stage.h / 2;
  const dx = sx < free.left ? sx - free.left : sx > stage.w - free.right ? sx - (stage.w - free.right) : 0;
  const dy = sy < free.top ? sy - free.top : sy > stage.h - free.bottom ? sy - (stage.h - free.bottom) : 0;
  if (!dx && !dy) return view;
  return clampView({ k: view.k, cx: view.cx + dx / scale, cy: view.cy + dy / scale }, bounds);
}

// The layout with every position multiplied by k; sizes stay as they are.
export function scaleLayout(layout: BrainLayout, k: number): BrainLayout {
  if (k === 1) return layout;
  const at = <T extends Placed>(p: T): T => ({ ...p, x: p.x * k, y: p.y * k });
  const box = (b: Bounds): Bounds => ({ minX: b.minX * k, minY: b.minY * k, maxX: b.maxX * k, maxY: b.maxY * k });
  return {
    center: at(layout.center),
    hubs: layout.hubs.map(at),
    fibres: layout.fibres.map((fibre) => ({ key: fibre.key, path: fibre.path.map(at) })),
    lessons: layout.lessons.map(at),
    points: layout.points.map((p) => ({ ...at(p), anchor: at(p.anchor) })),
    arcs: layout.arcs.map((arc) => ({ ...arc, a: at(arc.a), b: at(arc.b) })),
    bounds: box(layout.bounds),
    extent: box(layout.extent),
  };
}
