import { describe, expect, it } from "vitest";
import { readKnowledgeDraft } from "../apps/web/src/v1/KitKnowledgeList";

describe("what Knowledge's add box holds", () => {
  it("is nothing while empty", () => {
    expect(readKnowledgeDraft("  \n ")).toBeNull();
  });
  it("reads lines of links as links", () => {
    expect(readKnowledgeDraft("https://a.example/guide\n http://b.example ")).toEqual({ kind: "links", links: ["https://a.example/guide", "http://b.example"] });
  });
  it("treats a link inside a sentence as a note", () => {
    expect(readKnowledgeDraft("See https://a.example for more")?.kind).toBe("note");
  });
  it("uses a short first line as the note's title", () => {
    expect(readKnowledgeDraft("Office hours\nThursdays at 4pm Eastern.")).toEqual({ kind: "note", title: "Office hours", text: "Thursdays at 4pm Eastern." });
  });
  it("names a one-line note by how it starts and keeps every word", () => {
    const line = "Office hours are Thursdays at 4pm Eastern in General, and you should bring one client.";
    const draft = readKnowledgeDraft(line);
    expect(draft).toMatchObject({ kind: "note", text: line });
    expect(draft && draft.kind === "note" && draft.title.length).toBeLessThanOrEqual(60);
  });
});

import { readCourseOutline, COURSE_OUTLINE_LESSON_LIMIT } from "../apps/web/src/v1/KitKnowledgeList";

describe("a course typed as an outline", () => {
  it("is nothing while empty", () => {
    expect(readCourseOutline(" \n ")).toBeNull();
  });
  it("takes the first line as the course and the rest as lessons", () => {
    expect(readCourseOutline("Client onboarding\nKickoff call\n\nAccess checklist\n The first week ")).toEqual({ name: "Client onboarding", lessons: ["Kickoff call", "Access checklist", "The first week"] });
  });
  it("a name alone is a course with no lessons yet", () => {
    expect(readCourseOutline("Client onboarding")).toEqual({ name: "Client onboarding", lessons: [] });
  });
  it("drops the numbers and bullets people write lists with", () => {
    expect(readCourseOutline("Pricing\n1. Anchors\n2) Tiers\n- Discounts\n• Renewals")?.lessons).toEqual(["Anchors", "Tiers", "Discounts", "Renewals"]);
    // A number that is part of the name stays.
    expect(readCourseOutline("Pricing\n3 mistakes to avoid")?.lessons).toEqual(["3 mistakes to avoid"]);
  });
  it("stops at a sane number of lessons", () => {
    const many = ["Big course", ...Array.from({ length: 50 }, (_, index) => `Lesson ${index + 1}`)].join("\n");
    expect(readCourseOutline(many)?.lessons).toHaveLength(COURSE_OUTLINE_LESSON_LIMIT);
  });
});
