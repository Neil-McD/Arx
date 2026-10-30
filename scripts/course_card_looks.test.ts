import { expect, test } from "vitest";
import { DEFAULT_COMMUNITY_THEME, normalizeCommunityTheme } from "../shared/communityTheme";
import { COURSE_CARD_LOOKS, matchingCourseCardLook } from "../shared/communityCourseCardLooks";

test("every course card look is a valid theme and is recognised once applied", () => {
  expect(new Set(COURSE_CARD_LOOKS.map((look) => look.id)).size).toBe(COURSE_CARD_LOOKS.length);
  for (const look of COURSE_CARD_LOOKS) {
    const applied = normalizeCommunityTheme({ ...DEFAULT_COMMUNITY_THEME, ...look.tokens });
    if (!applied.ok) throw new Error(`${look.id} is not a valid theme`);
    expect(matchingCourseCardLook(applied.theme)?.id).toBe(look.id);
  }
});

test("Polynet's default cards are the Classroom look", () => {
  expect(matchingCourseCardLook(DEFAULT_COMMUNITY_THEME)?.id).toBe("classroom");
});
