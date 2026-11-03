import { expect, test } from "vitest";
import { buildCommunitySearchQuery, buildCommunitySearchText, COMMUNITY_SEARCH_TEXT_MAX_CHARS, stemSearchWord } from "../shared/communitySearchText";

// The index matches whole words only, so documents carry stems and queries are
// stemmed the same way. Consistency is the contract: both sides meet.
test("word forms meet at one stem", () => {
  for (const group of [
    ["climb", "climbs", "climbing", "climbed", "climber", "climbers"],
    ["tape", "taped", "tapes", "taping"],
    ["story", "stories"],
    ["run", "running"],
    ["warm", "warming", "warmed"],
  ]) {
    expect(new Set(group.map(stemSearchWord)).size, group.join(",")).toBe(1);
  }
});

test("short words, s-endings that aren't plurals, and non-letters are left alone", () => {
  for (const word of ["bus", "this", "class", "status", "basis", "being", "v5", "5:30", "café"]) {
    expect(stemSearchWord(word), word).toBe(word.toLowerCase());
  }
  expect(stemSearchWord("falling")).toBe("fall");
});

test("search text: context line, full body, then stems; bounded", () => {
  const text = buildCommunitySearchText({ channelName: "Beta", threadOpening: "Yellow V5 beta?", authorName: "Maya Chen", body: "Same here, toe-hooking the volume works." });
  expect(text.split("\n")[0]).toBe("#Beta · re: Yellow V5 beta? · by Maya Chen");
  expect(text).toContain("Same here, toe-hooking the volume works.");
  expect(text.split("\n").at(-1)!.split(" ")).toEqual(expect.arrayContaining(["hook", "work"]));
  const long = buildCommunitySearchText({ body: "word ".repeat(5_000) + "needle" });
  expect(long.length).toBeLessThanOrEqual(COMMUNITY_SEARCH_TEXT_MAX_CHARS);
});

test("queries are stemmed, deduplicated and capped at 16 terms", () => {
  expect(buildCommunitySearchQuery("Climbing tips? climbs!")).toBe("climb tip");
  expect(buildCommunitySearchQuery(Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ")).split(" ")).toHaveLength(16);
  expect(buildCommunitySearchQuery("  ?? ")).toBe("");
});
