import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { lessonPatchFor, readLessonLink } = await import("../apps/web/src/v1/KitLessonEditor");

describe("a lesson's resources", () => {
  const lesson = { title: "Finding the bottleneck", url: null, body_md: "Words.", lesson_links: [{ title: "The talk", url: "https://example.com/talk" }] };
  it("reads a pasted address as a link, named by the host or by where it goes", () => {
    expect(readLessonLink("example.org/map/", "")).toEqual({ title: "example.org/map", url: "https://example.org/map/" });
    expect(readLessonLink(" https://www.example.com/talk ", " The talk ")).toEqual({ title: "The talk", url: "https://www.example.com/talk" });
    expect(readLessonLink("javascript:alert(1)", "x")).toBeNull();
    expect(readLessonLink("not a link", "")).toBeNull();
    expect(readLessonLink("", "")).toBeNull();
  });
  it("sends the links only when they changed", () => {
    const draft = { title: lesson.title, video: "", body: "Words." };
    expect(lessonPatchFor(lesson, { ...draft, links: lesson.lesson_links })).toBeNull();
    expect(lessonPatchFor(lesson, draft)).toBeNull();
    expect(lessonPatchFor(lesson, { ...draft, links: [] })?.lesson_links).toEqual([]);
    const added = [...lesson.lesson_links, { title: "Map", url: "https://example.org/map" }];
    expect(lessonPatchFor(lesson, { ...draft, links: added })?.lesson_links).toEqual(added);
    // A change to the words alone doesn't resend the links.
    expect(lessonPatchFor(lesson, { ...draft, body: "New words.", links: lesson.lesson_links })).toEqual({ title: lesson.title, url: null, body_md: "New words." });
  });
});

const { lessonLinkPlace } = await import("../apps/web/src/v1/KitLessonEditor");
describe("where a lesson's link goes", () => {
  it("is said once: not repeated when the name is the address", () => {
    expect(lessonLinkPlace({ title: "example.com/handoff-map", url: "https://example.com/handoff-map" })).toBe("");
    expect(lessonLinkPlace({ title: "The talk", url: "https://www.example.com/talk/" })).toBe("example.com/talk");
  });
});
