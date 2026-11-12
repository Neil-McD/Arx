// The classroom (design v1 Knowledge): courses, their lessons in order, and a
// member's progress through them. Pure, so the page and the tests agree.

type LessonLike = { id: string; module_id: string | null; resource_role: string; title: string; sort_order: number | null; created_at: string };

// A course's lessons: its pages (never sources), in the host's order.
export function courseLessons<T extends LessonLike>(resources: T[], moduleId: string): T[] {
  return resources
    .filter((resource) => resource.module_id === moduleId && resource.resource_role !== "source" && resource.title.trim())
    .sort((a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export type CourseProgress = { done: number; total: number; percent: number; nextLessonId: string | null; finished: boolean };

// How far someone is, and the lesson to do next (the first one not done).
export function courseProgress(lessons: Array<{ id: string }>, done: ReadonlySet<string>): CourseProgress {
  const total = lessons.length;
  const count = lessons.filter((lesson) => done.has(lesson.id)).length;
  const next = lessons.find((lesson) => !done.has(lesson.id)) ?? null;
  return { done: count, total, percent: total ? Math.round((count / total) * 100) : 0, nextLessonId: next?.id ?? null, finished: total > 0 && count === total };
}

// "Continue": the course you last worked on that isn't finished, and its next
// lesson. Nothing until you have finished at least one lesson somewhere.
export function continueLesson<C extends { id: string }, L extends { id: string }>(
  courses: Array<{ course: C; lessons: L[] }>,
  doneAt: ReadonlyMap<string, string>,
): { course: C; lesson: L; index: number; total: number; lastDoneAt: string } | null {
  const done = new Set(doneAt.keys());
  let best: { course: C; lesson: L; index: number; total: number; lastDoneAt: string } | null = null;
  for (const { course, lessons } of courses) {
    const progress = courseProgress(lessons, done);
    if (progress.done === 0 || progress.finished || !progress.nextLessonId) continue;
    const last = lessons.map((lesson) => doneAt.get(lesson.id) ?? "").sort().pop() ?? "";
    const index = lessons.findIndex((lesson) => lesson.id === progress.nextLessonId);
    if (!best || last > best.lastDoneAt) best = { course, lesson: lessons[index], index, total: lessons.length, lastDoneAt: last };
  }
  return best;
}

// One page of the course shelf.
export function pageOf<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  const from = current * size;
  return { items: items.slice(from, from + size), page: current, pages, from: items.length ? from + 1 : 0, to: Math.min(items.length, from + size) };
}
