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
// Subjects and pods sit outside the longest fibre, so fibres never cross them.
const SUBJECT_RING = 380;
const POD_RING = 480;
const LESSON_STEP = 64;
const FIBRE_MAX = 300;
// A hub's name, roughly, so the map makes room for it.
const HUB_CHAR_W = 7.4;
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
    const base = hub.kind === "pod" ? POD_RING : SUBJECT_RING;
    const r = base + (slot % 2 === 0 ? 0 : 44);
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
  return { center, hubs, fibres, lessons, points, arcs, bounds };
}

// Which learned things get a name on the full page: what the viewer may read,
// new this week or most used, and only where the name doesn't cover another.
export type LabelBox = { x: number; y: number; w: number; h: number };
export function chooseLabels(layout: BrainLayout, opts: { max?: number; charW?: number; lineH?: number; taken?: LabelBox[] } = {}): Array<{ id: string; box: LabelBox; right: boolean }> {
  const max = opts.max ?? 10;
  const charW = opts.charW ?? 6.2;
  const lineH = opts.lineH ?? 13;
  const taken: LabelBox[] = [...(opts.taken ?? [])];
  const overlaps = (a: LabelBox) => taken.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
  const candidates = layout.points.filter((p) => p.point.title)
    .sort((a, b) => Number(b.point.fresh) - Number(a.point.fresh) || b.point.use - a.point.use || a.id.localeCompare(b.id));
  const chosen: Array<{ id: string; box: LabelBox; right: boolean }> = [];
  for (const p of candidates) {
    if (chosen.length >= max) break;
    const right = p.x >= p.anchor.x;
    const w = Math.min(28, p.point.title!.length) * charW;
    const box = { x: right ? p.x + p.r + 5 : p.x - p.r - 5 - w, y: p.y - lineH / 2, w, h: lineH };
    if (overlaps(box)) continue;
    taken.push(box);
    chosen.push({ id: p.id, box, right });
  }
  return chosen;
}
