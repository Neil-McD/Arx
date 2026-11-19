// Hosts see who has started a course (Neil, Nov 18): the row wording, and
// the line that tells members their host can see it.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { courseProgressPersonLine, courseProgressMoreLine, HOST_SEES_PROGRESS } = await import("../apps/web/src/v1/KitClassroom");

const NOW = Date.parse("2026-11-18T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

describe("a person's row in a course's people", () => {
  it("says how far, the last lesson and how long ago", () => {
    expect(courseProgressPersonLine({ done: 3, of: 8, last_lesson: "Easy miles", last_done_at: daysAgo(6), finished: false }, NOW))
      .toBe("3 of 8 · last: Easy miles · 6 days ago");
    expect(courseProgressPersonLine({ done: 1, of: 8, last_lesson: "Shoes", last_done_at: daysAgo(1), finished: false }, NOW))
      .toBe("1 of 8 · last: Shoes · yesterday");
  });
  it("says Finished, and when", () => {
    expect(courseProgressPersonLine({ done: 8, of: 8, last_lesson: "Race day", last_done_at: daysAgo(2), finished: true }, NOW)).toBe("Finished · 2 days ago");
  });
  it("says how many more there are past the cap, and nothing when all are shown", () => {
    expect(courseProgressMoreLine(200, 0)).toBeNull();
    expect(courseProgressMoreLine(200, 1)).toBe("Showing the 200 most in need of a look. 1 more has started.");
    expect(courseProgressMoreLine(200, 34)).toBe("Showing the 200 most in need of a look. 34 more have started.");
  });
});

describe("where the people and the members' line show", () => {
  const page = readFileSync(new URL("../apps/web/src/v1/KitClassroom.tsx", import.meta.url), "utf8");
  it("tells members, in the shelf's Start here / Continue block, which hosts never get", () => {
    expect(HOST_SEES_PROGRESS).toBe("Your host can see which lessons you've finished.");
    // The block is drawn only for someone who doesn't manage (start is null for a host).
    expect(page).toMatch(/const start = props\.canManage \? null : shelfStart\(coursePath\(courses, done\)\);/);
    const hero = page.slice(page.indexOf("{here ? ("), page.indexOf("{/* One course: the block above is the whole shelf. */}"));
    expect(hero).toContain("{HOST_SEES_PROGRESS}");
    // And once more for a member who has finished every course, who has no such block.
    expect(page).toMatch(/start\?\.kind === "all_finished" \? <p[^>]*>\{HOST_SEES_PROGRESS\}<\/p> : null/);
    expect(page.match(/\{HOST_SEES_PROGRESS\}/g)).toHaveLength(2);
  });
  it("opens a course's people for hosts only, in the lessons' place, on a phone too", () => {
    expect(page).toMatch(/const peopleCourse = open && props\.canManage && peopleFor === open\.course\.id/);
    expect(page).toMatch(/\{peopleList \?\? <>\{lessonList\}\{lessonListFoot\}<\/>\}/);
    expect(page).toMatch(/<div className=\{cx\("klist", "solo"\)\}>\{lessonPanelTop\}\{peopleList\}<\/div>/);
    expect(page).toContain("Nobody has started this yet.");
    expect(page).toMatch(/onClick=\{\(\) => goToMembersPage\(person\.member_key\)\}/);
  });
});
