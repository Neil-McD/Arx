import { expect, test } from "vitest";
import { continueLesson, courseLessons, courseProgress, coursePath, lessonEnd, orderAfterDrop, pageOf, shelfColumnsForWidth, shelfPageSize, shelfStart } from "../shared/communityClassroom";

const lesson = (id: string, module_id: string, sort_order: number | null, role = "page") =>
  ({ id, module_id, resource_role: role, title: id, sort_order, created_at: `2026-01-0${sort_order ?? 9}` });

test("a course's lessons are its pages, in the host's order", () => {
  const resources = [lesson("b", "m", 2), lesson("src", "m", 1, "source"), lesson("a", "m", 1), lesson("x", "other", 1)];
  expect(courseLessons(resources, "m").map((l) => l.id)).toEqual(["a", "b"]);
});

test("progress is a true percentage and names the next lesson", () => {
  const lessons = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(courseProgress(lessons, new Set(["a"]))).toEqual({ done: 1, total: 3, percent: 33, nextLessonId: "b", finished: false });
  expect(courseProgress(lessons, new Set(["a", "b", "c"]))).toMatchObject({ percent: 100, nextLessonId: null, finished: true });
  expect(courseProgress([], new Set())).toMatchObject({ percent: 0, finished: false });
});

test("Continue is the unfinished course you touched last; nothing before you start", () => {
  const courses = [
    { course: { id: "launch" }, lessons: [{ id: "l1" }, { id: "l2" }, { id: "l3" }] },
    { course: { id: "pricing" }, lessons: [{ id: "p1" }, { id: "p2" }] },
    { course: { id: "calls" }, lessons: [{ id: "c1" }] },
  ];
  expect(continueLesson(courses, new Map())).toBeNull();
  const doneAt = new Map([["l1", "2026-11-01"], ["p1", "2026-11-05"], ["c1", "2026-11-09"]]);
  // calls is finished, so pricing (touched later than launch) wins.
  expect(continueLesson(courses, doneAt)).toMatchObject({ course: { id: "pricing" }, lesson: { id: "p2" }, index: 1, total: 2 });
});

test("the shelf comes in pages", () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  expect(pageOf(items, 0, 3)).toEqual({ items: [1, 2, 3], page: 0, pages: 3, from: 1, to: 3 });
  expect(pageOf(items, 9, 3)).toMatchObject({ items: [7], page: 2, from: 7, to: 7 });
  expect(pageOf([], 0, 3)).toMatchObject({ items: [], pages: 1, from: 0, to: 0 });
});

test("the shelf sizes each page to complete rows for the monitor width, never stalling after one row of 6", () => {
  expect(shelfColumnsForWidth(0)).toBe(3);
  expect(shelfColumnsForWidth(900)).toBe(3);
  expect(shelfColumnsForWidth(1200)).toBe(4);
  expect(shelfColumnsForWidth(1800)).toBe(6);

  expect(shelfPageSize(0)).toBe(12);
  expect(shelfPageSize(900)).toBe(12);
  expect(shelfPageSize(1200)).toBe(12);
  expect(shelfPageSize(1500)).toBe(15);
  expect(shelfPageSize(1800)).toBe(18);
  // Every page size above the minimum is an exact multiple of the column count.
  for (const width of [900, 1200, 1500, 1800, 2100]) {
    expect(shelfPageSize(width) % shelfColumnsForWidth(width)).toBe(0);
  }
});

test("the path puts you on the first unfinished course, in the host's order", () => {
  const courses = [
    { course: { id: "one" }, lessons: [{ id: "a" }, { id: "b" }] },
    { course: { id: "two" }, lessons: [{ id: "c" }, { id: "d" }] },
    { course: { id: "three" }, lessons: [{ id: "e" }] },
  ];
  // Nothing done: step one is where you start, at its first lesson.
  const fresh = coursePath(courses, new Set());
  expect(fresh.map((step) => step.state)).toEqual(["now", "later", "later"]);
  expect(fresh[0].nextLesson?.id).toBe("a");
  // Course one finished and one lesson into course two.
  const mid = coursePath(courses, new Set(["a", "b", "c"]));
  expect(mid.map((step) => step.state)).toEqual(["done", "now", "later"]);
  expect([mid[1].done, mid[1].total, mid[1].nextLesson?.id]).toEqual([1, 2, "d"]);
  // A later course finished out of order stays done; you are still on the first unfinished one.
  expect(coursePath(courses, new Set(["e"])).map((step) => step.state)).toEqual(["now", "later", "done"]);
  // Everything finished: no step is "now".
  expect(coursePath(courses, new Set(["a", "b", "c", "d", "e"])).every((step) => step.state === "done")).toBe(true);
});

test("a course with no lessons is never the step you are on", () => {
  const courses = [{ course: { id: "empty" }, lessons: [] as Array<{ id: string }> }, { course: { id: "real" }, lessons: [{ id: "a" }] }];
  expect(coursePath(courses, new Set()).map((step) => step.state)).toEqual(["later", "now"]);
});

test("dropping a lesson or a course moves only that one, and a drop that changes nothing saves nothing", () => {
  const ids = ["a", "b", "c", "d"];
  expect(orderAfterDrop(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  expect(orderAfterDrop(ids, "a", null)).toEqual(["b", "c", "d", "a"]);
  expect(orderAfterDrop(ids, "a", "c")).toEqual(["b", "a", "c", "d"]);
  // Onto itself, back where it was, or something that is not in the list.
  expect(orderAfterDrop(ids, "b", "b")).toBeNull();
  expect(orderAfterDrop(ids, "b", "c")).toBeNull();
  expect(orderAfterDrop(ids, "d", null)).toBeNull();
  expect(orderAfterDrop(ids, "x", "a")).toBeNull();
  expect(orderAfterDrop(ids, "a", "x")).toBeNull();
});

test("the shelf's start block never points at a finished course, and says when everything is finished", () => {
  const courses = [
    { course: { id: "one" }, lessons: [{ id: "a" }, { id: "b" }] },
    { course: { id: "empty" }, lessons: [] as Array<{ id: string }> },
    { course: { id: "two" }, lessons: [{ id: "c" }] },
  ];
  expect(shelfStart(coursePath(courses, new Set()))).toMatchObject({ kind: "course", index: 0, step: { course: { id: "one" } } });
  // Course one finished: the block moves on to two, past the course with no lessons.
  expect(shelfStart(coursePath(courses, new Set(["a", "b"])))).toMatchObject({ kind: "course", index: 2, step: { course: { id: "two" }, state: "now" } });
  // Everything with lessons finished.
  expect(shelfStart(coursePath(courses, new Set(["a", "b", "c"])))).toEqual({ kind: "all_finished" });
  // No lessons anywhere: nothing to show.
  expect(shelfStart(coursePath([{ course: { id: "empty" }, lessons: [] as Array<{ id: string }> }], new Set()))).toBeNull();
  expect(shelfStart(coursePath([], new Set()))).toBeNull();
});

test("the end of a lesson offers the next lesson, or the finish and the next course", () => {
  const courses = [
    { course: { id: "one" }, lessons: [{ id: "a" }, { id: "b" }] },
    { course: { id: "two" }, lessons: [{ id: "c" }, { id: "d" }] },
    { course: { id: "empty" }, lessons: [] as Array<{ id: string }> },
    { course: { id: "three" }, lessons: [{ id: "e" }] },
  ];
  // Lessons left in this course: the next one, and none on the last.
  expect(lessonEnd(courses, "one", "a", new Set())).toEqual({ kind: "next_lesson", lesson: { id: "b" } });
  expect(lessonEnd(courses, "one", "b", new Set(["b"]))).toEqual({ kind: "next_lesson", lesson: null });
  // Finished: the way on is the first unfinished course in the host's order.
  expect(lessonEnd(courses, "one", "b", new Set(["a", "b"]))).toMatchObject({ kind: "finished", course: { id: "one" }, nextCourse: { course: { id: "two" }, done: 0 } });
  // Finished on a middle lesson (the rest done earlier): still the finish, not the next lesson.
  expect(lessonEnd(courses, "two", "c", new Set(["c", "d"]))).toMatchObject({ kind: "finished", course: { id: "two" }, nextCourse: { course: { id: "one" } } });
  // A course already finished and one with no lessons are skipped.
  expect(lessonEnd(courses, "one", "b", new Set(["a", "b", "c", "d"]))).toMatchObject({ kind: "finished", nextCourse: { course: { id: "three" } } });
  // Every course finished: nothing left.
  expect(lessonEnd(courses, "three", "e", new Set(["a", "b", "c", "d", "e"]))).toEqual({ kind: "finished", course: { id: "three" }, nextCourse: null });
  // Undoing a lesson takes the finish away again.
  expect(lessonEnd(courses, "one", "b", new Set(["a"]))).toEqual({ kind: "next_lesson", lesson: null });
  // A lesson a host adds later makes the course unfinished.
  const grown = [{ course: { id: "one" }, lessons: [{ id: "a" }, { id: "b" }, { id: "new" }] }];
  expect(lessonEnd(grown, "one", "b", new Set(["a", "b"]))).toEqual({ kind: "next_lesson", lesson: { id: "new" } });
});
