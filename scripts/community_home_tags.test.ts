// Home's tag lines, worded and capped (shared/communityHomeTags.ts).
import { expect, test } from "vitest";
import { HOME_TAGS_SHOWN, homeTagLines, tagLineText, tagLineTitle, type HomeTag } from "../shared/communityHomeTags";

const tag = (id: string, createdAt: number, extra: Partial<HomeTag> = {}): HomeTag => ({
  id, author: "Maya", everybody: false, room: "General", isPod: false, channelSlug: "general",
  rootId: `root-${id}`, text: `@neil message ${id}`, createdAt, ...extra,
});

test("a line says who tagged you and where: a channel with its #, a pod by its name", () => {
  expect(tagLineTitle(tag("a", 1))).toBe("Maya tagged you in #General");
  expect(tagLineTitle(tag("a", 1, { room: "Founders", isPod: true }))).toBe("Maya tagged you in Founders");
  expect(tagLineTitle(tag("a", 1, { everybody: true }))).toBe("Maya tagged everybody in #General");
});

test("the message's start: its opening tags dropped, one line, cut at a word", () => {
  expect(tagLineText("@neil @sara, can you look?")).toBe("can you look?");
  expect(tagLineText("@everybody: call moved to Friday")).toBe("call moved to Friday");
  // A tag in the middle is the message's own words.
  expect(tagLineText("Thanks @neil for the deck")).toBe("Thanks @neil for the deck");
  // Nothing but a tag: shown as written.
  expect(tagLineText("@neil")).toBe("@neil");
  expect(tagLineText("@neil one\n\n two")).toBe("one two");
  const long = tagLineText(`@neil ${"word ".repeat(40)}`);
  expect(long.length).toBeLessThanOrEqual(80);
  expect(long.endsWith("word…")).toBe(true);
});

test("newest first, three lines, then one line for the rest that opens the next one's room", () => {
  expect(HOME_TAGS_SHOWN).toBe(3);
  const tags = [tag("a", 1), tag("b", 5, { room: "Founders", isPod: true, channelSlug: "founders", author: "Dev" }), tag("c", 3), tag("d", 4), tag("e", 2)];
  const result = homeTagLines(tags);
  expect(result.lines.map((line) => line.detail)).toEqual(["message b", "message d", "message c"]);
  expect(result.lines[0]).toEqual({ key: "tag:b", title: "Dev tagged you in Founders", detail: "message b", channelSlug: "founders", rootId: "root-b" });
  expect(result.more).toEqual({ count: 2, title: "And 2 more tags", detail: "The next is Maya's, in #General.", action: "Open #General", channelSlug: "general" });
  expect(homeTagLines(tags.slice(0, 4)).more).toMatchObject({ count: 1, title: "And 1 more tag" });
  expect(homeTagLines(tags.slice(0, 3)).more).toBeNull();
  expect(homeTagLines([])).toEqual({ lines: [], more: null });
});
