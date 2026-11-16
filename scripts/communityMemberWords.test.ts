import { expect, test } from "vitest";
import { courseProgressWord, lessonBodyWithoutRepeatedTitle, memberRoleLine, memberRoleTag } from "../shared/communityMemberWords";

test("a lesson's text that opens with its own title doesn't say it twice", () => {
  expect(lessonBodyWithoutRepeatedTitle("Reading the board", "# Reading the board\n\nEvery problem is a set of lit holds.")).toBe("Every problem is a set of lit holds.");
  // Any heading level, bold marks, a trailing colon, different case.
  expect(lessonBodyWithoutRepeatedTitle("Reading the board", "\n\n## **reading the Board:**\nFirst line.")).toBe("First line.");
  // A different first heading stays.
  const other = "# Before you start\n\nBring tape.";
  expect(lessonBodyWithoutRepeatedTitle("Reading the board", other)).toBe(other);
  // The title as ordinary words, or further down, stays.
  const prose = "Reading the board\n\n# Reading the board";
  expect(lessonBodyWithoutRepeatedTitle("Reading the board", prose)).toBe(prose);
  expect(lessonBodyWithoutRepeatedTitle("Reading the board", "")).toBe("");
  expect(lessonBodyWithoutRepeatedTitle("", "# \n\nText")).toBe("# \n\nText");
});

test("course progress is a word at the ends and a number in between", () => {
  expect(courseProgressWord(0)).toBe("Not started");
  expect(courseProgressWord(33.3)).toBe("33%");
  expect(courseProgressWord(100)).toBe("Done");
});

test("a member's role is said once, in words", () => {
  expect(memberRoleLine("owner", false)).toBe("Host · runs this community");
  expect(memberRoleLine("moderator", true)).toBe("Moderator · here now");
  expect(memberRoleLine("member", false)).toBe("Member");
  expect(memberRoleTag("owner")).toBe("host");
  expect(memberRoleTag("member")).toBeNull();
});
