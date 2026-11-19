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

// The courses as one ordered path, in the host's order: the ones you've
// finished, the one you're on (the first unfinished course that has lessons),
// and what comes after it. Nothing is locked; this only says where you are.
export type CoursePathStep<C, L> = {
  course: C;
  lessons: L[];
  state: "done" | "now" | "later";
  done: number;
  total: number;
  nextLesson: L | null;
};
export function coursePath<C extends { id: string }, L extends { id: string }>(
  courses: Array<{ course: C; lessons: L[] }>,
  done: ReadonlySet<string>,
): Array<CoursePathStep<C, L>> {
  let placed = false;
  return courses.map(({ course, lessons }) => {
    const progress = courseProgress(lessons, done);
    const nextLesson = lessons.find((lesson) => lesson.id === progress.nextLessonId) ?? null;
    let state: "done" | "now" | "later" = "later";
    if (progress.finished) state = "done";
    else if (!placed && lessons.length > 0) { state = "now"; placed = true; }
    return { course, lessons, state, done: progress.done, total: progress.total, nextLesson };
  });
}

// The shelf's "Start here / Continue" block: the step you are on, never a
// course you've finished. When every course with lessons is finished it says
// so; with no lessons anywhere there is nothing to show.
export type ShelfStart<C, L> =
  | { kind: "course"; step: CoursePathStep<C, L>; index: number }
  | { kind: "all_finished" }
  | null;
export function shelfStart<C, L>(path: Array<CoursePathStep<C, L>>): ShelfStart<C, L> {
  const index = path.findIndex((step) => step.state === "now");
  if (index >= 0) return { kind: "course", step: path[index], index };
  return path.some((step) => step.state === "done") ? { kind: "all_finished" } : null;
}

// What the end of a lesson offers a member. While the course has lessons left
// to do: the next lesson in it (null on its last lesson). Once every lesson in
// it is done: the course is finished, and the way on is the course the shelf
// would start them on next (the first unfinished one, in the host's order),
// or none. Derived from their own progress and the lessons they can see, so
// a lesson undone, or a lesson a host adds, makes it unfinished again.
export type LessonEnd<C, L> =
  | { kind: "next_lesson"; lesson: L | null }
  | { kind: "finished"; course: C; nextCourse: CoursePathStep<C, L> | null };
export function lessonEnd<C extends { id: string }, L extends { id: string }>(
  courses: Array<{ course: C; lessons: L[] }>,
  courseId: string,
  lessonId: string,
  done: ReadonlySet<string>,
): LessonEnd<C, L> {
  const open = courses.find((entry) => entry.course.id === courseId);
  if (!open) return { kind: "next_lesson", lesson: null };
  if (courseProgress(open.lessons, done).finished) {
    const next = shelfStart(coursePath(courses, done));
    return { kind: "finished", course: open.course, nextCourse: next?.kind === "course" ? next.step : null };
  }
  const index = open.lessons.findIndex((lesson) => lesson.id === lessonId);
  return { kind: "next_lesson", lesson: index >= 0 ? open.lessons[index + 1] ?? null : null };
}

// Dropping one thing in a list before another (or at the end, with null).
// Null when nothing would move, so nothing is saved.
export function orderAfterDrop(ids: string[], dragged: string, before: string | null): string[] | null {
  if (!ids.includes(dragged) || dragged === before) return null;
  const rest = ids.filter((id) => id !== dragged);
  const at = before === null ? rest.length : rest.indexOf(before);
  if (at < 0) return null;
  const next = [...rest.slice(0, at), dragged, ...rest.slice(at)];
  return next.every((id, index) => id === ids[index]) ? null : next;
}

// One page of the course shelf.
export function pageOf<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  const from = current * size;
  return { items: items.slice(from, from + size), page: current, pages, from: items.length ? from + 1 : 0, to: Math.min(items.length, from + size) };
}
