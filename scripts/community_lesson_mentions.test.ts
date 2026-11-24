import { expect, test } from "vitest";
import { lessonMentionsFingerprint, lessonMentions, lessonNameIndex, type CourseName, type LessonName } from "../shared/communityLessonMentions";

const courses: CourseName[] = [
  { ref: "course:start", name: "Start here" },
  { ref: "course:build", name: "Build your community, A to Z" },
  { ref: "course:ai", name: "Your community's AI" },
];
const lessons: LessonName[] = [
  { ref: "resource:tour", title: "A tour", courseRef: "course:start" },
  { ref: "resource:path", title: "Pick your path", courseRef: "course:start" },
  { ref: "resource:pods", title: "Pods", courseRef: "course:build" },
  { ref: "resource:paid", title: "Get paid", courseRef: "course:build" },
  { ref: "resource:guide", title: "Turn on your guide", courseRef: "course:ai" },
  { ref: "resource:w1", title: "Welcome", courseRef: "course:build" },
  { ref: "resource:w2", title: "Welcome", courseRef: "course:ai" },
];
const index = lessonNameIndex(lessons, courses);
const of = (ref: string) => lessons.find((lesson) => lesson.ref === ref)!;

test("a lesson that names a course or another lesson links to it", () => {
  const body = "Now pick where to go next. The course **Build your community, A to Z** takes you from nothing to live. Or read Turn on your guide first.";
  expect(lessonMentions(of("resource:path"), body, index)).toEqual(["course:build", "resource:guide"]);
});

test("a short or one-word name only counts when the writer marked it", () => {
  expect(lessonMentions(of("resource:paid"), "Small groups work well in pods. Take a tour of the settings.", index)).toEqual([]);
  expect(lessonMentions(of("resource:paid"), "See **Pods** and the lesson \"A tour\".", index)).toEqual(["resource:pods", "resource:tour"]);
  expect(lessonMentions(of("resource:paid"), "Read [Pods](https://example.com) next.", index)).toEqual(["resource:pods"]);
});

test("a lesson never links itself or its own course, and a shared name links nothing", () => {
  expect(lessonMentions(of("resource:path"), "This is Pick your path, in Start here. **Welcome** back.", index)).toEqual([]);
});

test("the apostrophe and the case a writer used do not matter; code is skipped", () => {
  expect(lessonMentions(of("resource:paid"), "then YOUR COMMUNITY’S AI covers it. `Turn on your guide`", index)).toEqual(["course:ai"]);
});

test("a longer name uses up its words: a shorter name inside it is not also named", () => {
  const more = lessonNameIndex([...lessons, { ref: "resource:byc", title: "Build your community", courseRef: "course:ai" }], courses);
  expect(lessonMentions(of("resource:tour"), "See Build your community, A to Z.", more)).toEqual(["course:build"]);
});

test("the fingerprint changes with a name, the words, or the set of lessons, and not otherwise", () => {
  const withBody = (body: string) => lessons.map((lesson) => ({ ...lesson, body }));
  const base = lessonMentionsFingerprint(withBody("h1"), courses);
  expect(lessonMentionsFingerprint(withBody("h1"), courses)).toBe(base);
  expect(lessonMentionsFingerprint(withBody("h2"), courses)).not.toBe(base);
  expect(lessonMentionsFingerprint(withBody("h1").slice(1), courses)).not.toBe(base);
  expect(lessonMentionsFingerprint(withBody("h1"), [{ ...courses[0], name: "Begin" }, ...courses.slice(1)])).not.toBe(base);
});
