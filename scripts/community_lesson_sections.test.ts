import { expect, test } from "vitest";
import {
  COMMUNITY_LESSON_SECTION_MAX_CHARS, checkCommunityResourceBody, communityLessonSectionTexts, communityLessonSections,
} from "../shared/communityLessonSections";

test("a lesson splits at its ## headings, not at headings inside code or at deeper headings", () => {
  const body = ["Intro text.", "## First", "One.", "### Detail", "```md", "## not a section", "```", "## First", "Again."].join("\n");
  const sections = communityLessonSectionTexts(body);
  expect(sections.map((section) => [section.heading, section.id])).toEqual([[null, "start"], ["First", "first"], ["First", "first-2"]]);
  expect(sections.map((section) => section.text).join("")).toBe(body);
  expect(sections[1].text).toContain("## not a section");
});

test("a lesson that opens with a heading has no empty opening section", () => {
  expect(communityLessonSections("## Only\nText").map((section) => section.heading)).toEqual(["Only"]);
  expect(communityLessonSections("")).toEqual([]);
});

test("the limits are per section, and the message says how to fix it", () => {
  const big = "x".repeat(COMMUNITY_LESSON_SECTION_MAX_CHARS + 1);
  expect(checkCommunityResourceBody(`## A\n${"y".repeat(15_000)}\n## B\n${"z".repeat(15_000)}`)).toEqual([]);
  const [problem] = checkCommunityResourceBody(`## Fine\nok\n## Huge\n${big}`);
  expect(problem).toMatchObject({ code: "section_too_long", section: { heading: "Huge" } });
  expect(problem.message).toContain("Add a ## heading inside it");
  expect(checkCommunityResourceBody("x".repeat(250_000)).map((p) => p.code)).toContain("body_too_long");
});
