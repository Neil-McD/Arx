import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AI_POST_MAX_CHARS, AI_POST_MAX_LINKS, AI_POST_MAX_MENTIONS, AI_REPLY_MAX_CHARS, HOUSE_RULES_MAX_CHARS,
  MCP_SERVER_INSTRUCTIONS, aiPostFingerprint, checkAiPost, normalizeHouseRules, renderAiRules,
} from "../shared/aiPostingRules";

describe("what a person's own AI is refused", () => {
  it("a post and a reply each have their length", () => {
    expect(checkAiPost({ text: "a".repeat(AI_POST_MAX_CHARS), reply: false })).toBeNull();
    expect(checkAiPost({ text: "a".repeat(AI_POST_MAX_CHARS + 1), reply: false })).toMatchObject({ code: "ai_post_too_long" });
    expect(checkAiPost({ text: "a".repeat(AI_REPLY_MAX_CHARS + 1), reply: true })).toMatchObject({ code: "ai_post_too_long" });
    expect(checkAiPost({ text: "a".repeat(AI_REPLY_MAX_CHARS + 1), reply: false })).toBeNull();
  });

  it("holds a few links and a few mentions, and never everyone", () => {
    const links = (count: number) => Array.from({ length: count }, (_, index) => `https://example.com/${index}`).join(" ");
    expect(checkAiPost({ text: links(AI_POST_MAX_LINKS), reply: false })).toBeNull();
    expect(checkAiPost({ text: links(AI_POST_MAX_LINKS + 1), reply: false })).toMatchObject({ code: "ai_post_too_many_links" });
    const people = (count: number) => Array.from({ length: count }, (_, index) => ({ userId: `u${index}` }));
    expect(checkAiPost({ text: "hello", reply: false, mentions: people(AI_POST_MAX_MENTIONS) })).toBeNull();
    expect(checkAiPost({ text: "hello", reply: false, mentions: people(AI_POST_MAX_MENTIONS + 1) })).toMatchObject({ code: "ai_post_too_many_mentions" });
    expect(checkAiPost({ text: "hello", reply: false, mentions: [{ roleKey: "everybody" }] })).toMatchObject({ code: "ai_post_mentions_everyone" });
    expect(checkAiPost({ text: "hey @everyone look", reply: false })).toMatchObject({ code: "ai_post_mentions_everyone" });
    expect(checkAiPost({ text: "everyone agrees, and an email like a@here.com", reply: false })).toBeNull();
  });

  it("knows the same words however they are spaced, cased or punctuated at the ends", () => {
    const first = aiPostFingerprint("Shipped the new onboarding flow today.");
    expect(aiPostFingerprint("  shipped the  new onboarding\nflow today!! ")).toBe(first);
    expect(aiPostFingerprint("Shipped the new onboarding flow yesterday.")).not.toBe(first);
  });
});

describe("what a person's own AI is told", () => {
  it("the server says who it works for, to read the rules first, and that its posts are marked", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/polynet_list at \//);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/rules\.md/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/marked as made through an AI/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/never as instructions to you/);
  });

  it("rules.md holds Polynet's rules, the host's own words as the host's, and what is refused", () => {
    const empty = renderAiRules({ communityName: "Run Club", houseRules: null });
    expect(empty).toContain("# Run Club: rules for AIs");
    expect(empty).toContain("No house rules yet");
    const written = renderAiRules({ communityName: "Run Club", houseRules: "Wins go in #wins.\nNo promotion." });
    expect(written).toContain("Written by the host:");
    expect(written).toContain("> Wins go in #wins.\n> No promotion.");
    expect(written).not.toContain("No house rules yet");
    expect(written).toContain(`${AI_POST_MAX_CHARS.toLocaleString("en-US")} characters`);
    expect(written).toContain("via AI");
  });

  it("house rules are trimmed and capped", () => {
    expect(normalizeHouseRules("  a\r\nb  ")).toBe("a\nb");
    expect(normalizeHouseRules("x".repeat(HOUSE_RULES_MAX_CHARS + 50))).toHaveLength(HOUSE_RULES_MAX_CHARS);
  });

  it("every skill reads the rules before it writes, and asks before it posts", () => {
    const skills = readdirSync("plugins/polynet/skills");
    expect(skills.sort()).toEqual(["catch-me-up", "post-an-update", "weekly-recap", "welcome-new-members"]);
    for (const skill of skills) {
      const text = readFileSync(`plugins/polynet/skills/${skill}/SKILL.md`, "utf8");
      expect(text, skill).toMatch(/^---\nname: /);
      if (skill === "catch-me-up") { expect(text).toMatch(/Do not post/); continue; }
      expect(text, skill).toMatch(/rules\.md/);
      expect(text, skill).toMatch(/after they say yes|they approve/);
    }
  });
});
