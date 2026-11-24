import { expect, test } from "vitest";
import { brainCourseAction, brainLessonOf, clipWords } from "../apps/web/src/v1/brainPanels";

const lesson = (id: string, order: number, done: boolean) => ({ id: `resource:${id}`, title: `Lesson ${order}`, order, done, use: 0 });

test("a course's button starts it, carries on from the next lesson, or reviews it", () => {
  expect(brainCourseAction({ lessons: [lesson("a", 1, false), lesson("b", 2, false)] })).toEqual({ label: "Start: Lesson 1", lessonId: "resource:a" });
  expect(brainCourseAction({ lessons: [lesson("b", 2, false), lesson("a", 1, true)] })).toEqual({ label: "Continue: Lesson 2", lessonId: "resource:b" });
  expect(brainCourseAction({ lessons: [lesson("a", 1, true), lesson("b", 2, true)] })).toEqual({ label: "Review the course", lessonId: null });
  expect(brainCourseAction({ lessons: [] })).toEqual({ label: "Open the course", lessonId: null });
});

test("a lesson dot finds only a lesson this person has loaded", () => {
  const loaded = [{ id: "a", title: "A" }, { id: "b", title: "B" }] as any[];
  expect(brainLessonOf(loaded, "resource:b")?.title).toBe("B");
  // A lesson Knowledge didn't give this person (a draft, another course): nothing.
  expect(brainLessonOf(loaded, "resource:hidden")).toBeNull();
  expect(brainLessonOf(undefined, "resource:a")).toBeNull();
});

test("long words are cut at a word, with an ellipsis", () => {
  expect(clipWords("short", 40)).toBe("short");
  const cut = clipWords("Polynet is a place to build a community that can think, remember and act.", 40);
  expect(cut.endsWith("…")).toBe(true);
  expect(cut.length).toBeLessThanOrEqual(41);
  expect(cut).not.toMatch(/ …$/);
});
