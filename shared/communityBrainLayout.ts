// Where everything on the community brain's map goes (shared/communityBrain.ts
// is what it holds). Fixed rules, not a simulation: each thing's place comes
// from itself alone, so the map keeps its shape as it grows and people learn
// their way around it.
// - Links decide: every thing is a node, what joins two things is a spring,
//   and nodes push apart. The same rounds run from the same seed every time,
//   so one map always gives one picture; it shifts a little when the map changes.
// - A course is a node with its lessons in a ring round it, a faint path
//   through them in order. Courses share the circle round the centre.
// - Subjects and pods start on rings outside the courses.
// - A learned thing hangs off its lesson, subject or pod (newer reaches
//   further); what answers read together pulls together.
// Units are layout units; the drawing scales the whole to fit its box.
import type { BrainAttach, BrainMap, BrainPoint } from "./communityBrain";

export const GOLDEN_ANGLE = 137.50776405003785;
// Subjects sit this far outside the longest fibre (so no fibre crosses
// them), and pods this far outside the subjects. A small community's map is
// small; the rings only widen when its longest course does.
const SUBJECT_GAP = 72;
const SUBJECT_RING_MIN = 150;
const POD_GAP = 84;
// With many subjects or pods, every other one sits this much further out.
const RING_STAGGER = 34;
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
// trunk: the centre to a course. spoke: a course to one of its lessons.
// order: through a course's lessons, first to last.
export type LayoutFibre = { key: string; kind: "trunk" | "spoke" | "order"; path: Placed[] };
// A course's own node, in the middle of its lessons (its hub entry is where its name goes).
export type LayoutCourse = Placed & { key: string };
export type LayoutArc = { a: Placed; b: Placed; count: number; ids: [string, string] };
// A lesson that names another lesson or a course.
export type LayoutLink = { a: Placed; b: Placed; ids: [string, string] };
export type BrainLayout = {
  center: Placed;
  hubs: LayoutHub[];
  courses: LayoutCourse[];
  fibres: LayoutFibre[];
  lessons: LayoutLesson[];
  points: LayoutPoint[];
  arcs: LayoutArc[];
  links: LayoutLink[];
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

// ---------- where things go: links decide
//
// Every thing is a node; what joins two things is a spring with a length it
// wants to be. Nodes push each other apart and never overlap. Starting from a
// tidy seed (courses spaced round the centre, each course's lessons in a ring
// round its node) the same fixed number of rounds runs every time, with no
// randomness: one map, one picture.
type Node = Placed & { id: string; r: number; fixed?: boolean };
type Spring = { a: number; b: number; len: number; k: number };

const ROUNDS = 260;
// Lessons round a course: this far apart along their ring, which is never
// tighter than RING_MIN.
const LESSON_GAP = 30;
const RING_MIN = 26;
// Room between one course's ring and the next.
const CLUSTER_GAP = 46;
const PUSH = 1100;
const PUSH_REACH = 150;

export function courseRing(lessonCount: number): number {
  return Math.max(RING_MIN, (Math.max(1, lessonCount) * LESSON_GAP) / (2 * Math.PI));
}

// Every pair of nodes within `reach` of each other, once, lower index first
// and in a fixed order. Nodes are sorted into a grid of squares `reach` wide,
// so a big map costs about its size, not its size squared.
function nearPairs(nodes: Node[], reach: number, each: (i: number, j: number) => void): void {
  const cells = new Map<string, number[]>();
  const cellOf = (n: Node) => [Math.floor(n.x / reach), Math.floor(n.y / reach)] as const;
  nodes.forEach((node, i) => {
    const [cx, cy] = cellOf(node);
    const key = `${cx},${cy}`;
    const list = cells.get(key);
    if (list) list.push(i); else cells.set(key, [i]);
  });
  for (let i = 0; i < nodes.length; i++) {
    const [cx, cy] = cellOf(nodes[i]);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = cells.get(`${cx + dx},${cy + dy}`);
      if (!list) continue;
      for (const j of list) if (j > i) each(i, j);
    }
  }
}

// How many rounds a map of this many nodes gets: fewer as it grows, so the
// work stays within a frame or two however big the community is.
export function settleRounds(nodeCount: number): number {
  return Math.max(36, Math.min(ROUNDS, Math.round((ROUNDS * 320) / Math.max(1, nodeCount))));
}

function settle(nodes: Node[], springs: Spring[]): void {
  const rounds = settleRounds(nodes.length);
  const widest = Math.max(1, ...nodes.map((node) => node.r)) * 2;
  const aside = (a: Node, b: Node) => { const t = hashUnit(`${a.id}|${b.id}`) * Math.PI * 2; return { dx: Math.cos(t), dy: Math.sin(t), d: 1 }; };
  for (let round = 0; round < rounds; round++) {
    const heat = 1 - round / rounds;
    const move = nodes.map(() => ({ x: 0, y: 0 }));
    for (const s of springs) {
      const a = nodes[s.a], b = nodes[s.b];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d < 1e-6) ({ dx, dy, d } = aside(a, b));
      const f = (s.k * (d - s.len)) / d;
      move[s.a].x += dx * f; move[s.a].y += dy * f;
      move[s.b].x -= dx * f; move[s.b].y -= dy * f;
    }
    nearPairs(nodes, PUSH_REACH, (i, j) => {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d > PUSH_REACH) return;
      if (d < 1e-6) ({ dx, dy, d } = aside(a, b));
      const f = Math.min(5, PUSH / (d * d)) / d;
      move[i].x -= dx * f; move[i].y -= dy * f;
      move[j].x += dx * f; move[j].y += dy * f;
    });
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].fixed) continue;
      const step = Math.hypot(move[i].x, move[i].y);
      const cap = step > 14 ? 14 / step : 1;
      nodes[i].x += move[i].x * cap * (0.25 + heat * 0.75);
      nodes[i].y += move[i].y * cap * (0.25 + heat * 0.75);
    }
    // Nothing sits on anything else.
    nearPairs(nodes, widest, (i, j) => {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const need = a.r + b.r;
      if (d >= need) return;
      if (d < 1e-6) ({ dx, dy, d } = aside(a, b));
      const push = (need - d) / d / (a.fixed || b.fixed ? 1 : 2);
      if (!a.fixed) { a.x -= dx * push; a.y -= dy * push; }
      if (!b.fixed) { b.x += dx * push; b.y += dy * push; }
    });
  }
}

export function layoutBrain(map: BrainMap, nowMs: number): BrainLayout {
  const center = { x: 0, y: 0 };
  const nodes: Node[] = [{ id: "center", x: 0, y: 0, r: 16, fixed: true }];
  const springs: Spring[] = [];
  const index = new Map<string, number>([["center", 0]]);
  const add = (node: Node): number => { index.set(node.id, nodes.length); nodes.push(node); return nodes.length - 1; };

  // Courses round the centre, each given the share of the circle its ring needs.
  const rings = map.courses.map((course) => courseRing(course.lessons.length));
  const widths = rings.map((ring) => ring * 2 + CLUSTER_GAP);
  const around = widths.reduce((sum, w) => sum + w, 0);
  const courseReach = Math.max(Math.max(0, ...rings) + 64, around / (2 * Math.PI));
  let turned = 0;
  map.courses.forEach((course, i) => {
    // Loose on purpose: each course sits a little off its even share of the
    // circle and at its own distance, and each lesson hangs at its own length
    // from its course, all from their ids, so the map reads as grown, not drawn.
    const angle = -90 + ((turned + widths[i] / 2) / Math.max(1, around)) * 360 + (hashUnit(`${course.id}:turn`) - 0.5) * 26;
    turned += widths[i];
    const reach = courseReach * (0.72 + hashUnit(`${course.id}:reach`) * 0.56);
    const at = polar(angle, reach);
    const hub = add({ id: course.id, ...at, r: 9 });
    springs.push({ a: 0, b: hub, len: reach, k: 0.05 });
    course.lessons.forEach((lesson, j) => {
      const r = sizeFor(lesson.use, 4.6, 0.8, 8);
      const len = rings[i] * (0.45 + hashUnit(`${lesson.id}:len`) * 0.95);
      const node = add({ id: lesson.id, ...polar(hashUnit(`${lesson.id}:turn`) * 360, len, at), r: r + 4 });
      springs.push({ a: hub, b: node, len, k: 0.1 });
      // A lesson stays loosely near the one before it.
      if (j > 0) springs.push({ a: node - 1, b: node, len: LESSON_GAP * 1.2, k: 0.012 });
    });
  });

  // Subjects, pods and "not filed yet" start on rings outside the courses.
  const subjectRing = Math.max(SUBJECT_RING_MIN, map.courses.length ? courseReach + Math.max(0, ...rings) + SUBJECT_GAP : 0);
  const podRing = subjectRing + POD_GAP;
  // Each takes the middle of a gap between two courses (widest gap first),
  // so its line from the centre runs between clusters, not through one.
  // A gap is measured between the edges of two clusters, not their middles.
  const spans = map.courses.map((course, i) => {
    const n = nodes[index.get(course.id)!];
    const half = (Math.atan2(rings[i] * 1.3, Math.hypot(n.x, n.y)) * 180) / Math.PI;
    return { at: (Math.atan2(n.y, n.x) * 180) / Math.PI, half };
  }).sort((x, y) => x.at - y.at);
  const gaps = spans.map((from, i) => {
    const to = i + 1 < spans.length ? spans[i + 1] : { at: spans[0].at + 360, half: spans[0].half };
    const start = from.at + from.half, end = to.at - to.half;
    return { mid: (start + end) / 2, size: end - start };
  }).sort((x, y) => y.size - x.size || x.mid - y.mid);
  const seen: Record<string, number> = {};
  const KIND_OFFSET: Record<string, number> = { subject: 250, pod: 300, other: 160 };
  const outer = hubOrder(map).filter((hub) => hub.kind !== "course");
  outer.forEach((hub, place) => {
    const slot = seen[hub.kind] = (seen[hub.kind] ?? -1) + 1;
    const gap = gaps.length > 1 ? gaps[place % gaps.length] : null;
    // More of them than gaps: later ones sit a little to one side, further out.
    const lap = gaps.length ? Math.floor(place / gaps.length) : 0;
    const angle = gap ? gap.mid + (lap ? (lap % 2 ? 1 : -1) * Math.min(gap.size / 5, 9) * Math.ceil(lap / 2) : 0) : (slot * GOLDEN_ANGLE + KIND_OFFSET[hub.kind]) % 360;
    const reach = (hub.kind === "pod" ? podRing : subjectRing) + (slot % 2 === 0 ? 0 : RING_STAGGER) + lap * RING_STAGGER;
    const id = hub.kind === "subject" ? hub.key : hub.kind === "pod" ? `pod:${hub.key.replace(/^pod:/, "")}` : "other";
    const node = add({ id, ...polar(angle, reach), r: hub.kind === "pod" ? 14 : 11 });
    springs.push({ a: 0, b: node, len: reach, k: 0.05 });
  });

  // Learned things hang off where they are filed: the newer, the further.
  const anchorId = (at: BrainAttach) => at.kind === "lesson" ? at.id : at.kind === "subject" ? `subject:${at.name}` : at.kind === "pod" ? `pod:${at.id.replace(/^pod:/, "")}` : "other";
  const hung: Array<{ point: BrainPoint; node: number; anchor: number }> = [];
  for (const point of map.points) {
    const anchor = index.get(anchorId(point.at)) ?? index.get("other");
    if (anchor === undefined) continue;
    const from = nodes[anchor];
    const out = (Math.atan2(from.y, from.x) * 180) / Math.PI;
    const reach = reachFor(point.learned_at, nowMs) * (0.85 + hashUnit(`${point.id}:reach`) * 0.3);
    const r = sizeFor(point.use);
    const node = add({ id: point.id, ...polar(out + (hashUnit(point.id) - 0.5) * 150, reach, from), r: r + 3 });
    springs.push({ a: anchor, b: node, len: reach, k: 0.1 });
    hung.push({ point, node, anchor });
  }

  // What answers read together pulls together.
  for (const arc of map.arcs) {
    const a = index.get(arc.a), b = index.get(arc.b);
    if (a !== undefined && b !== undefined) springs.push({ a, b, len: 60, k: 0.03 * Math.min(3, arc.count) });
  }

  // A lesson that names another lesson or a course is drawn toward it.
  const mentioned: Array<{ from: string; to: string }> = [];
  for (const link of map.mentions ?? []) {
    const a = index.get(link.from), b = index.get(link.to);
    if (a === undefined || b === undefined || a === b) continue;
    // Gently: a mention leans two clusters toward each other; it must not
    // fold the map in on itself when there are many.
    springs.push({ a, b, len: 150, k: 0.012 });
    mentioned.push(link);
  }

  settle(nodes, springs);

  const placed = (id: string): Placed => { const node = nodes[index.get(id)!]; return { x: node.x, y: node.y }; };
  const hubs: LayoutHub[] = [];
  const courses: LayoutCourse[] = [];
  const fibres: LayoutFibre[] = [];
  const lessons: LayoutLesson[] = [];
  const named: Array<{ hub: Omit<LayoutHub, "x" | "y" | "angle">; at: Placed; angle: number; path: Placed[] }> = [];
  for (const hub of hubOrder(map)) {
    if (hub.kind === "course") {
      const course = map.courses.find((entry) => entry.id === hub.key)!;
      const at = placed(hub.key);
      const angle = (Math.atan2(at.y, at.x) * 180) / Math.PI;
      const path: Placed[] = [];
      for (const lesson of course.lessons) {
        const spot = placed(lesson.id);
        path.push(spot);
        lessons.push({ ...spot, id: lesson.id, courseKey: hub.key, order: lesson.order, title: lesson.title, done: lesson.done, use: lesson.use, r: sizeFor(lesson.use, 4.6, 0.8, 8) });
        fibres.push({ key: `${hub.key}|${lesson.id}`, kind: "spoke", path: [at, spot] });
      }
      fibres.push({ key: `${hub.key}|trunk`, kind: "trunk", path: [center, at] });
      courses.push({ ...at, key: hub.key });
      named.push({ hub, at, angle, path });
      continue;
    }
    const id = hub.kind === "subject" ? hub.key : hub.kind === "pod" ? `pod:${hub.key.replace(/^pod:/, "")}` : "other";
    const at = placed(id);
    hubs.push({ ...hub, ...at, angle: (Math.atan2(at.y, at.x) * 180) / Math.PI });
  }
  // A course's name goes just past its outermost lesson, on the side away
  // from the centre, and steps further out until it covers no dot.
  const dots: Placed[] = nodes.slice(1).map((node) => ({ x: node.x, y: node.y }));
  for (const { hub, at, angle, path } of named) {
    const ux = Math.cos((angle * Math.PI) / 180), uy = Math.sin((angle * Math.PI) / 180);
    const far = Math.max(0, ...path.map((p) => (p.x - at.x) * ux + (p.y - at.y) * uy));
    const w = hub.label.length * HUB_CHAR_W;
    const right = ux >= -0.2;
    let spot = at;
    for (let out = far + 12; out <= far + 12 + 10 * 8; out += 10) {
      spot = { x: at.x + ux * out, y: at.y + uy * out };
      // Straight up or down, the name is centred on its cluster.
      if (Math.abs(ux) < 0.45) spot = { x: spot.x + (right ? -w / 2 : w / 2), y: spot.y };
      const box = { x0: right ? spot.x - 6 : spot.x - w - 6, x1: right ? spot.x + w + 6 : spot.x + 6, y0: spot.y - 13, y1: spot.y + 11 };
      if (!dots.some((d) => d.x > box.x0 && d.x < box.x1 && d.y > box.y0 && d.y < box.y1)) break;
    }
    hubs.push({ ...hub, ...spot, angle });
  }
  // Courses first, as before: the order hubs are listed in.
  hubs.sort((a, b) => Number(b.kind === "course") - Number(a.kind === "course"));
  const points: LayoutPoint[] = hung.map(({ point, node, anchor }) => ({
    x: nodes[node].x, y: nodes[node].y, id: point.id, anchor: { x: nodes[anchor].x, y: nodes[anchor].y }, point, r: sizeFor(point.use),
  }));

  const where = new Map<string, Placed>([...points.map((p) => [p.id, p] as const), ...lessons.map((l) => [l.id, l] as const)]);
  const arcs: LayoutArc[] = map.arcs.flatMap((arc) => {
    const a = where.get(arc.a);
    const b = where.get(arc.b);
    return a && b ? [{ a, b, count: arc.count, ids: [arc.a, arc.b] as [string, string] }] : [];
  });

  const spot = new Map<string, Placed>([...lessons.map((l) => [l.id, l] as const), ...courses.map((c) => [c.key, c] as const)]);
  const links: LayoutLink[] = mentioned.flatMap((link) => {
    const a = spot.get(link.from), b = spot.get(link.to);
    return a && b ? [{ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, ids: [link.from, link.to] as [string, string] }] : [];
  });

  const all: Placed[] = [center, ...hubs, ...courses, ...lessons, ...points];
  const extent = {
    minX: Math.min(...all.map((p) => p.x)), minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)), maxY: Math.max(...all.map((p) => p.y)),
  };
  // Room for each hub's name: a course's runs on outward from its ring; a
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
  return { center, hubs, courses, fibres, lessons, points, arcs, links, bounds, extent };
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
  // Too little free room to aim for an edge: aim for its middle.
  if (stage.w - free.left - free.right < 40) free = { ...free, left: (stage.w - free.right) / 2, right: free.right + (stage.w - free.right) / 2 - 1 };
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
    courses: layout.courses.map(at),
    fibres: layout.fibres.map((fibre) => ({ ...fibre, path: fibre.path.map(at) })),
    lessons: layout.lessons.map(at),
    points: layout.points.map((p) => ({ ...at(p), anchor: at(p.anchor) })),
    arcs: layout.arcs.map((arc) => ({ ...arc, a: at(arc.a), b: at(arc.b) })),
    links: layout.links.map((link) => ({ ...link, a: at(link.a), b: at(link.b) })),
    bounds: box(layout.bounds),
    extent: box(layout.extent),
  };
}

// ---------- the small map: one layout, another lens
//
// The page shows true distances: it has names to fit between things, and it
// zooms. A panel's map is a couple of hundred pixels with no words, so the
// room names need is waste there, and a few far hubs would squeeze the rest
// to specks. The lens keeps every thing's direction from the centre and
// pulls far things in more than near ones (distance to a power under one),
// then fits what it drew to the box. Same shape, read at a glance.

// How hard far things are pulled in: 1 = true distances, lower = tighter.
export const BRAIN_LENS_POWER = 0.55;

export function lensLayout(layout: BrainLayout, box: BrainStage, opts: { power?: number; pad?: number } = {}): BrainLayout {
  const power = opts.power ?? BRAIN_LENS_POWER;
  const pad = opts.pad ?? 14;
  const c = layout.center;
  const things: Placed[] = [...layout.hubs, ...layout.courses, ...layout.lessons, ...layout.points];
  const far = Math.max(1, ...things.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
  const pull = (p: Placed): Placed => {
    const dx = p.x - c.x, dy = p.y - c.y;
    const r = Math.hypot(dx, dy);
    if (r === 0) return { x: 0, y: 0 };
    const to = Math.pow(r / far, power) / r;
    return { x: dx * to, y: dy * to };
  };
  // Fit what is drawn to the box, centred.
  const pulled = [{ x: 0, y: 0 }, ...things.map(pull)];
  const minX = Math.min(...pulled.map((p) => p.x)), maxX = Math.max(...pulled.map((p) => p.x));
  const minY = Math.min(...pulled.map((p) => p.y)), maxY = Math.max(...pulled.map((p) => p.y));
  const scale = Math.min((box.w - pad * 2) / Math.max(1e-6, maxX - minX), (box.h - pad * 2) / Math.max(1e-6, maxY - minY));
  const ox = box.w / 2 - ((minX + maxX) / 2) * scale, oy = box.h / 2 - ((minY + maxY) / 2) * scale;
  const at = <T extends Placed>(p: T): T => { const q = pull(p); return { ...p, x: q.x * scale + ox, y: q.y * scale + oy }; };
  return {
    center: at(c),
    hubs: layout.hubs.map(at),
    courses: layout.courses.map(at),
    fibres: layout.fibres.map((fibre) => ({ ...fibre, path: fibre.path.map(at) })),
    lessons: layout.lessons.map(at),
    points: layout.points.map((p) => ({ ...at(p), anchor: at(p.anchor) })),
    arcs: layout.arcs.map((arc) => ({ ...arc, a: at(arc.a), b: at(arc.b) })),
    links: layout.links.map((link) => ({ ...link, a: at(link.a), b: at(link.b) })),
    bounds: { minX: 0, minY: 0, maxX: box.w, maxY: box.h },
    extent: { minX: minX * scale + ox, minY: minY * scale + oy, maxX: maxX * scale + ox, maxY: maxY * scale + oy },
  };
}
