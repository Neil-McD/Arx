// The community brain (docs/specs/agent-system-end-state.md): what a place
// knows, as one map. Courses are its fibres, each lesson along one in order;
// what the community learned hangs off the lesson or subject it is filed
// under; arcs join what the guide keeps answering with together. This file
// holds the rules for what a viewer is shown, free of the database so they
// can be tested on their own; convex/communityBrain.ts gathers the records.

// The most learned things one map draws; the rest are counted on their place.
export const BRAIN_POINTS_MAX = 150;
export const BRAIN_ARCS_MAX = 12;
export const BRAIN_FRESH_MS = 7 * 24 * 60 * 60_000;
// The fewest drawable nodes (lessons, learned notes, and pods) worth a map;
// fewer, and a list says more.
export const BRAIN_MAP_MIN_NODES = 3;

// Where a learned thing hangs: a lesson, a subject, a pod (on the
// community's map), or nowhere yet.
export type BrainAttach =
  | { kind: "lesson"; id: string }
  | { kind: "subject"; name: string }
  | { kind: "pod"; id: string }
  | { kind: "other" };

export function attachKey(attach: BrainAttach): string {
  return attach.kind === "lesson" ? `lesson:${attach.id}` : attach.kind === "subject" ? `subject:${attach.name}`
    : attach.kind === "pod" ? `pod:${attach.id}` : "other";
}

export type BrainPoint = {
  id: string; // note:<id>
  // Null when this viewer may not read its name.
  title: string | null;
  kind: "learned" | "taught";
  at: BrainAttach;
  learned_at: string;
  fresh: boolean;
  use: number;
  // Learned from the viewer's own posts.
  mine: boolean;
};

export type BrainLesson = { id: string; title: string; order: number; done: boolean; use: number };
export type BrainCourse = { id: string; name: string; order: number; lessons: BrainLesson[] };
export type BrainSubject = { name: string; first_at: string; size: number };
export type BrainPod = { id: string; name: string; inside: boolean; count: number };
export type BrainArc = { a: string; b: string; count: number };

export type BrainMap = {
  center: { name: string; kind: "community" | "pod" };
  counts: { courses: number; lessons: number; learned: number; this_week: number };
  can_manage: boolean;
  courses: BrainCourse[];
  subjects: BrainSubject[];
  points: BrainPoint[];
  pods: BrainPod[];
  arcs: BrainArc[];
  // Lessons that name another lesson or a course (shared/communityLessonMentions.ts):
  // from a lesson, to a lesson or a course. stale: the list is behind what
  // the lessons say now, and the app should ask for it to be worked out again.
  mentions?: Array<{ from: string; to: string }>;
  mentions_stale?: boolean;
  // Learned things not drawn, by where they hang (attachKey).
  hidden: Record<string, number>;
};

// A note as the map sees it, before this viewer's rules.
export type BrainNoteInput = {
  id: string;
  title: string;
  // A builder taught it, or the guide learned it from posts.
  taught: boolean;
  // Every post it came from is one this viewer can read now.
  sourcesOpen: boolean;
  mine: boolean;
  createdAt: number;
  at: BrainAttach;
};

// Whether this viewer may read a learned thing's name: a builder always; a
// member only for what the guide learned from posts they can read
// themselves, never what a host taught it (its name could say more than
// they may see), and never once its posts are gone.
export function brainTitleFor(note: Pick<BrainNoteInput, "title" | "taught" | "sourcesOpen">, viewer: { canManage: boolean; insidePod?: boolean }): string | null {
  if (viewer.canManage || viewer.insidePod) return note.title;
  return !note.taught && note.sourcesOpen ? note.title : null;
}

// Which learned things a map draws when there are too many: what is new this
// week first, then what answers use most, then the newest.
export function choosePoints<T extends { fresh: boolean; use: number; createdAt: number }>(notes: T[], max = BRAIN_POINTS_MAX): { kept: T[]; dropped: T[] } {
  const ranked = [...notes].sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.use - a.use || b.createdAt - a.createdAt);
  return { kept: ranked.slice(0, max), dropped: ranked.slice(max) };
}

// The strongest "answered together" pairs between things this map draws.
export function chooseArcs(together: BrainArc[], drawn: ReadonlySet<string>, max = BRAIN_ARCS_MAX): BrainArc[] {
  return together.filter((pair) => drawn.has(pair.a) && drawn.has(pair.b))
    .sort((x, y) => y.count - x.count || x.a.localeCompare(y.a) || x.b.localeCompare(y.b)).slice(0, max);
}

// A subject's place stays put: it is ordered by when it first appeared.
export function subjectsOf(notes: Array<Pick<BrainNoteInput, "at" | "createdAt">>): BrainSubject[] {
  const found = new Map<string, { first: number; size: number }>();
  for (const note of notes) {
    if (note.at.kind !== "subject") continue;
    const entry = found.get(note.at.name) ?? { first: note.createdAt, size: 0 };
    entry.first = Math.min(entry.first, note.createdAt);
    entry.size += 1;
    found.set(note.at.name, entry);
  }
  return [...found].map(([name, entry]) => ({ name, first_at: new Date(entry.first).toISOString(), size: entry.size }))
    .sort((a, b) => a.first_at.localeCompare(b.first_at) || a.name.localeCompare(b.name));
}

// Total drawable knowledge nodes on a map: learned/taught notes, published
// course lessons, and visible pods.
export function brainNodeCount(map: BrainMap): number {
  return map.points.length + map.counts.lessons + map.pods.length;
}

// Whether a community or pod has any knowledge worth projecting in the brain
// panel or opening on the brain page.
export function brainHasContent(map: BrainMap | null | undefined): boolean {
  if (!map) return false;
  return map.counts.learned > 0 || map.counts.lessons > 0 || map.points.length > 0 || map.pods.length > 0;
}

// Whether a map has enough nodes to draw the visual network instead of a list.
export function brainCanDrawMap(map: BrainMap | null | undefined): boolean {
  return Boolean(map && brainNodeCount(map) >= BRAIN_MAP_MIN_NODES);
}

// What a panel says of a map in a few words, under it: "14 learned · 7 new
// this week", "14 learned" in a quiet week, or course/lesson counts when the
// community has published courses before notes accumulate.
export function brainFact(map: BrainMap): string | null {
  if (map.counts.learned > 0) {
    return map.counts.this_week ? `${map.counts.learned} learned · ${map.counts.this_week} new this week` : `${map.counts.learned} learned`;
  }
  if (map.counts.lessons > 0) {
    const courses = `${map.counts.courses} ${map.counts.courses === 1 ? "course" : "courses"}`;
    const lessons = `${map.counts.lessons} ${map.counts.lessons === 1 ? "lesson" : "lessons"}`;
    return `${courses} · ${lessons}`;
  }
  if (map.pods.length > 0) {
    return `${map.pods.length} ${map.pods.length === 1 ? "pod" : "pods"}`;
  }
  return null;
}

// The latest things learned that this viewer may read by name (the map
// already holds only the names they may read). On a community's map a pod's
// things are the pod's, not the community's.
export function latestLearned(map: BrainMap, max: number): Array<{ id: string; title: string; at: string }> {
  return map.points.filter((point) => point.title && (map.center.kind === "pod" || point.at.kind !== "pod"))
    .sort((a, b) => b.learned_at.localeCompare(a.learned_at) || a.id.localeCompare(b.id))
    .slice(0, max).map((point) => ({ id: point.id, title: point.title!, at: point.learned_at }));
}
