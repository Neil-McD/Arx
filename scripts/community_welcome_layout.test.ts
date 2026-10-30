import { describe, expect, it } from "vitest";
import {
  legacyWelcomeLayout, normalizeWelcomeLayout, welcomeLayoutIssue, welcomeLayoutWithForms, welcomeScreens, type WelcomeBlock,
} from "../shared/communityWelcomeLayout";

const text = (markdown: string): WelcomeBlock => ({ type: "text", markdown });
const form = (formKey: string): WelcomeBlock => ({ type: "form", formKey });
const lesson = (resourceId: string): WelcomeBlock => ({ type: "lesson", resourceId });
const next: WelcomeBlock = { type: "next" };

describe("welcome page layout", () => {
  it("splits the page into screens at each Next, and a second step on one screen starts its own", () => {
    const screens = welcomeScreens([text("Hi"), text("https://youtu.be/x"), next, text("About you"), form("intake"), lesson("l1"), next, next]);
    expect(screens.map((screen) => [screen.blocks.length, screen.step?.type ?? null])).toEqual([[2, null], [2, "form"], [1, "lesson"]]);
  });

  it("carries over a page saved before blocks: words and media first, each step on its own screen", () => {
    expect(legacyWelcomeLayout({ message: "Hello", mediaUrl: "https://youtu.be/x", formKeys: ["intake"], lessonIds: ["l1"] }))
      .toEqual([text("Hello\n\nhttps://youtu.be/x"), form("intake"), next, lesson("l1")]);
    expect(welcomeScreens(legacyWelcomeLayout({ message: "", mediaUrl: null, formKeys: ["a", "b"], lessonIds: [] }))).toHaveLength(2);
  });

  it("adds join forms the page doesn't place yet as screens at the end", () => {
    expect(welcomeLayoutWithForms([text("Hi"), form("a")], ["a", "b"])).toEqual([text("Hi"), form("a"), next, form("b")]);
  });

  it("tidies what the editor sends", () => {
    expect(normalizeWelcomeLayout([next, text("  Hi \r\n there "), text("  "), next, next, form(" a "), next]))
      .toEqual([text("Hi \n there"), next, form("a")]);
  });

  it("names what can't be saved", () => {
    expect(welcomeLayoutIssue([form("a"), next, form("a")])).toBe("welcome_step_duplicate");
    expect(welcomeLayoutIssue([text("x".repeat(4_001))])).toBe("welcome_text_too_long");
    expect(welcomeLayoutIssue(Array.from({ length: 41 }, () => text("x")))).toBe("welcome_layout_too_long");
    expect(welcomeLayoutIssue(Array.from({ length: 6 }, (_, i) => lesson(`l${i}`)))).toBe("welcome_lessons_too_many");
    expect(welcomeLayoutIssue([text("Hi"), form("a"), next, lesson("l1")])).toBeNull();
  });

  it("keeps a choice as content on its screen, not a step, and tidies its cards", () => {
    const pick = (labels: string[]): WelcomeBlock => ({ type: "choice", prompt: " Which app? ", options: labels.map((label) => ({ label, hint: " ", markdown: " steps \r\n " })) });
    const screens = welcomeScreens([pick(["Codex", "Claude Code"]), next, form("intake")]);
    expect(screens.map((screen) => [screen.blocks[0].type, screen.step?.type ?? null])).toEqual([["choice", null], ["form", "form"]]);
    expect(normalizeWelcomeLayout([pick(["  Codex  ", ""])])).toEqual([
      { type: "choice", prompt: "Which app?", options: [{ label: "Codex", hint: "", markdown: "steps" }, { label: "", hint: "", markdown: "steps" }] },
    ]);
    expect(normalizeWelcomeLayout([{ type: "choice", prompt: "Q", options: [{ label: " ", hint: "x", markdown: " " }] }])).toEqual([]);
  });

  it("names what can't be saved on a choice", () => {
    const card = (label: string, markdown = "Do this") => ({ label, hint: "", markdown });
    const choice = (options: ReturnType<typeof card>[]): WelcomeBlock => ({ type: "choice", prompt: "Which app?", options });
    expect(welcomeLayoutIssue([choice([card("Codex"), card("Cowork")]), next, form("a")])).toBeNull();
    expect(welcomeLayoutIssue([choice([card(""), card("Cowork")])])).toBe("welcome_choice_invalid");
    expect(welcomeLayoutIssue([choice(Array.from({ length: 5 }, (_, i) => card(`c${i}`)))])).toBe("welcome_choice_invalid");
    expect(welcomeLayoutIssue([choice([card("Codex", "x".repeat(8_001))])])).toBe("welcome_choice_too_long");
    expect(welcomeLayoutIssue(Array.from({ length: 4 }, () => choice([card("a")])))).toBe("welcome_choices_too_many");
    // Long setup prompts don't use up the page's 12,000 characters of text.
    expect(welcomeLayoutIssue([text("x".repeat(4_000)), choice([card("a", "y".repeat(8_000)), card("b", "y".repeat(8_000))])])).toBeNull();
  });

  it("takes a card icon only as an https link or a small inline image", () => {
    const withIcon = (icon: string): WelcomeBlock => ({ type: "choice", prompt: "Which app?", options: [{ label: "Claude", hint: "", markdown: "steps", icon }] });
    expect(welcomeLayoutIssue([withIcon("https://example.com/claude.svg")])).toBeNull();
    expect(welcomeLayoutIssue([withIcon("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")])).toBeNull();
    expect(welcomeLayoutIssue([withIcon("javascript:alert(1)")])).toBe("welcome_choice_invalid");
    expect(welcomeLayoutIssue([withIcon("data:text/html;base64,PGI+")])).toBe("welcome_choice_invalid");
    expect(welcomeLayoutIssue([withIcon(`data:image/png;base64,${"A".repeat(8_001)}`)])).toBe("welcome_choice_invalid");
    expect(normalizeWelcomeLayout([withIcon("  https://example.com/a.png ")])[0]).toMatchObject({ options: [{ icon: "https://example.com/a.png" }] });
    expect(normalizeWelcomeLayout([withIcon("  ")])[0]).toEqual({ type: "choice", prompt: "Which app?", options: [{ label: "Claude", hint: "", markdown: "steps" }] });
  });

  it("keeps a choice's agent flag only when it is on", () => {
    const choice = (agent?: boolean): WelcomeBlock => ({ type: "choice", prompt: "Which app?", options: [{ label: "Claude", hint: "", markdown: "steps" }], agent });
    expect(normalizeWelcomeLayout([choice(true)])[0]).toMatchObject({ agent: true });
    expect(normalizeWelcomeLayout([choice(false)])[0]).not.toHaveProperty("agent");
  });
});
