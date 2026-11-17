import { expect, test } from "vitest";
import { continueLesson, courseLessons, courseProgress, coursePath, pageOf } from "../shared/communityClassroom";

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
