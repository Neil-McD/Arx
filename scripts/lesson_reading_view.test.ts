import { describe, expect, test } from "vitest";
import { isLessonFileLink, lessonBodyForPlatform, lessonPlatforms, lessonTocSlug } from "../shared/lessonReadingView";

const LESSON = [
  "Draw.io holds the visual outputs.",
  "",
  "### In Cowork",
  "",
  "Paste the connector.",
  "",
  "```",
  "### In Fake",
  "```",
  "",
  "### In Claude Code",
  "",
  "Run the command.",
  "",
  "## Next",
  "",
  "Everyone reads this.",
].join("\n");

describe("platform tabs", () => {
  test("finds each platform once, ignoring headings inside code", () => {
    expect(lessonPlatforms(LESSON)).toEqual([{ key: "cowork", label: "Cowork" }, { key: "claude_code", label: "Claude Code" }]);
  });
  test("one platform needs no tabs", () => {
    expect(lessonPlatforms("### In Cowork\n\nOnly this.")).toEqual([]);
  });
  test("keeps the chosen platform and every shared section", () => {
    const body = lessonBodyForPlatform(LESSON, "claude_code");
    expect(body).toContain("Run the command.");
    expect(body).not.toContain("Paste the connector.");
    expect(body).not.toContain("### In Claude Code");
    expect(body).toContain("Draw.io holds");
    expect(body).toContain("Everyone reads this.");
  });
  test("an unknown pick falls back to the first platform", () => {
    expect(lessonBodyForPlatform(LESSON, "zzz")).toContain("Paste the connector.");
  });
});

test("contents ids are unique and readable", () => {
  const taken = new Set<string>();
  expect(lessonTocSlug("Connect the MCP", taken)).toBe("lesson-connect-the-mcp");
  expect(lessonTocSlug("Connect the MCP", taken)).toBe("lesson-connect-the-mcp-2");
});

test("file links are recognised for the side column", () => {
  expect(isLessonFileLink("https://example.com/map-template.drawio")).toBe(true);
  expect(isLessonFileLink("https://example.com/guide.pdf?dl=1")).toBe(true);
  expect(isLessonFileLink("https://mcp.draw.io/mcp")).toBe(false);
});
