import { describe, expect, test } from "vitest";

import {
  computeCommunityLessonStages,
  gradeCommunityLessonResponse,
  parseCommunityLessonElements,
  redactCommunityLessonAnswers,
  normalizeCommunityLessonFields,
  parseCommunityLessonMarkdown,
  projectCommunityLessonBody,
  splitCommunityLessonSlides,
} from "../shared/communityLessonContract";

const PORTAL_FILE = [
  "---",
  "title: Set up Draw.io",
  "stage: Map the business",
  "stage_order: 1",
  "order: 1",
  "type: build",
  "minutes: 10   # rough",
  "video: https://share.descript.com/embed/42pEyvI1VyH",
  "gate: yes",
  "summary: Why this matters: a map first.",
  "---",
  "Draw.io holds the visual outputs.",
  "",
  "### In Cowork",
  "",
  "Open **Settings → Connectors** and paste:",
  "",
  "```",
  "https://mcp.draw.io/mcp",
  "```",
  "",
  "### In Claude Code",
  "",
  "```bash",
  "claude mcp add --transport http drawio https://mcp.draw.io/mcp",
  "```",
  "",
  "### In Codex",
  "",
  "Ask Codex to connect the project.",
  "",
  "## Slides",
  "",
  "![Slide 1: why](media/x/01.png)",
  "",
  "First note.",
  "",
  "![Slide 2: anatomy](media/x/02.png)",
  "",
  "Second note, **bold**.",
].join("\n");

describe("lesson fields", () => {
  test("portal front matter becomes lesson fields and a body", () => {
    const parsed = parseCommunityLessonMarkdown(PORTAL_FILE);
    expect(parsed.title).toBe("Set up Draw.io");
    expect(parsed.lesson).toEqual({
      kind: "build",
      stage: "Map the business",
      stage_order: 1,
      order: 1,
      minutes: 10,
      video_url: "https://share.descript.com/embed/42pEyvI1VyH",
      gate: true,
      summary: "Why this matters: a map first.",
    });
    expect(parsed.body_md.startsWith("Draw.io holds")).toBe(true);
  });

  test("a # inside text is kept; comments only trail numbers and yes/no", () => {
    const parsed = parseCommunityLessonMarkdown(
      ["---", "title: Share it in #wins", "stage: Map", "summary: Post your result in #wins", "order: 3 # third", "gate: yes # checkpoint", "---", "Body"].join("\n"),
    );
    expect(parsed.title).toBe("Share it in #wins");
    expect(parsed.lesson).toEqual({ stage: "Map", summary: "Post your result in #wins", order: 3, gate: true });
  });

  test("a file without front matter is all body", () => {
    expect(parseCommunityLessonMarkdown("# Hi\n\nText")).toEqual({ title: null, lesson: null, body_md: "# Hi\n\nText" });
  });

  test("empty input clears the fields", () => {
    expect(normalizeCommunityLessonFields(null)).toBeNull();
    expect(normalizeCommunityLessonFields({})).toBeNull();
    expect(normalizeCommunityLessonFields({ gate: "no" })).toBeNull();
  });

  test("bad input is refused, not dropped", () => {
    expect(() => normalizeCommunityLessonFields({ colour: "red" })).toThrow("community_lesson_colour_invalid");
    expect(() => normalizeCommunityLessonFields({ kind: "quiz" })).toThrow("community_lesson_kind_invalid");
    expect(() => normalizeCommunityLessonFields({ order: -1 })).toThrow("community_lesson_order_invalid");
    expect(() => normalizeCommunityLessonFields({ minutes: 1.5 })).toThrow("community_lesson_minutes_invalid");
    expect(() => normalizeCommunityLessonFields({ video_url: "http://example.com/v" })).toThrow(
      "community_lesson_video_url_invalid",
    );
    expect(() => normalizeCommunityLessonFields({ video_url: "javascript:alert(1)" })).toThrow(
      "community_lesson_video_url_invalid",
    );
    expect(() => normalizeCommunityLessonFields({ gate: true })).toThrow("community_lesson_gate_without_stage_invalid");
    expect(() => normalizeCommunityLessonFields({ summary: "x".repeat(281) })).toThrow("community_lesson_summary_invalid");
  });
});

describe("lesson body projection", () => {
  const projection = projectCommunityLessonBody(parseCommunityLessonMarkdown(PORTAL_FILE).body_md);

  test("platform sections become variants", () => {
    expect(projection.intro_md).toBe("Draw.io holds the visual outputs.");
    expect(projection.variants.map((variant) => [variant.key, variant.label])).toEqual([
      ["cowork", "Cowork"],
      ["claude_code", "Claude Code"],
      ["codex", "Codex"],
    ]);
    expect(projection.variants[2].body_md).toBe("Ask Codex to connect the project.");
  });

  test("fenced blocks become commands tagged by variant", () => {
    expect(projection.commands).toEqual([
      { variant: "cowork", language: null, text: "https://mcp.draw.io/mcp" },
      { variant: "claude_code", language: "bash", text: "claude mcp add --transport http drawio https://mcp.draw.io/mcp" },
    ]);
  });

  test("the slides section becomes a deck and stays out of the variants", () => {
    expect(projection.slides).toEqual([
      { image: "media/x/01.png", alt: "Slide 1: why", note_md: "First note." },
      { image: "media/x/02.png", alt: "Slide 2: anatomy", note_md: "Second note, **bold**." },
    ]);
    expect(projection.variants.some((variant) => variant.body_md.includes("Slide"))).toBe(false);
  });

  test("a reader can split the deck out and keep the text around it", () => {
    const body = parseCommunityLessonMarkdown(PORTAL_FILE).body_md + "\n\n## Next\n\nAfter the deck.";
    const split = splitCommunityLessonSlides(body)!;
    expect(split.slides.map((slide) => [slide.image, slide.note_md])).toEqual([
      ["media/x/01.png", "First note."],
      ["media/x/02.png", "Second note, **bold**."],
    ]);
    expect(split.before.endsWith("Ask Codex to connect the project.")).toBe(true);
    expect(split.after).toBe("## Next\n\nAfter the deck.");
    expect(splitCommunityLessonSlides("Text only")).toBeNull();
    expect(splitCommunityLessonSlides("## Slides\n\nNo images here.")).toBeNull();
  });

  test("the deck keeps text before its first image, and code examples stay text", () => {
    const split = splitCommunityLessonSlides("Intro.\n\n## Slides\n\nRead these first.\n\n![A](a.png)\n\nNote A.\n\n```md\n![B](b.png)\n## Not a section\n```\n\n![C](c.png)")!;
    expect(split.before).toBe("Intro.\n\nRead these first.");
    expect(split.slides.map((slide) => slide.image)).toEqual(["a.png", "c.png"]);
    expect(split.slides[0].note_md).toBe("Note A.\n\n```md\n![B](b.png)\n## Not a section\n```");
    expect(split.after).toBe("");
    // A "## Slides" heading inside a code example is not a deck.
    const example = "How to write one:\n\n```md\n## Slides\n\n![X](x.png)\n```";
    expect(splitCommunityLessonSlides(example)).toBeNull();
    expect(projectCommunityLessonBody(example)).toMatchObject({ slides: [], intro_md: example });
    // Fences follow Markdown: a ```c# or indented opener is a fence, and a
    // backtick line with words after it doesn't close one.
    for (const opener of ["```c#", "  ```", "~~~~"]) {
      const close = opener.trim().startsWith("~") ? "~~~~" : "```";
      const body = `## Slides\n\n![A](a.png)\n\n${opener}\n![B](b.png)\n${close}`;
      expect(splitCommunityLessonSlides(body)!.slides.map((slide) => slide.image)).toEqual(["a.png"]);
    }
    const notClosed = splitCommunityLessonSlides("## Slides\n\n![A](a.png)\n\n```md\n```not-a-close\n![B](b.png)\n```\n\n![C](c.png)")!;
    expect(notClosed.slides.map((slide) => slide.image)).toEqual(["a.png", "c.png"]);
    // More slides than a deck shows: the body reads as written, nothing dropped.
    const many = ["## Slides", ...Array.from({ length: 61 }, (_, i) => `![S${i}](s${i}.png)`)].join("\n\n");
    expect(splitCommunityLessonSlides(many)).toBeNull();
  });

  test("a plain body has an intro and nothing else", () => {
    expect(projectCommunityLessonBody("Just text.")).toEqual({
      intro_md: "Just text.",
      variants: [],
      slides: [],
      commands: [],
      elements: [],
    });
  });
});

describe("lesson stages and gates", () => {
  const lessons = [
    { ref: "resource:a1", lesson: { stage: "Map", stage_order: 1 } },
    { ref: "resource:a2", lesson: { stage: "Map", stage_order: 1, gate: true } },
    { ref: "resource:b1", lesson: { stage: "Skill", stage_order: 2, gate: true } },
    { ref: "resource:c1", lesson: { stage: "System", stage_order: 3 } },
    { ref: "resource:lib", lesson: { kind: "doc" as const } },
    { ref: "resource:plain", lesson: null },
  ];

  test("an unfinished gate locks every later stage", () => {
    const { stages, lockedRefs } = computeCommunityLessonStages({ lessons, doneRefs: new Set(["resource:a1"]) });
    expect(stages).toEqual([
      { name: "Map", order: 1, lesson_count: 2, done_count: 1, locked: false, blocked_by: null },
      { name: "Skill", order: 2, lesson_count: 1, done_count: 0, locked: true, blocked_by: "resource:a2" },
      { name: "System", order: 3, lesson_count: 1, done_count: 0, locked: true, blocked_by: "resource:a2" },
    ]);
    expect([...lockedRefs].sort()).toEqual(["resource:b1", "resource:c1"]);
  });

  test("finishing a gate opens the next stage only", () => {
    const { stages, lockedRefs } = computeCommunityLessonStages({ lessons, doneRefs: new Set(["resource:a2"]) });
    expect(stages.map((stage) => [stage.name, stage.locked, stage.blocked_by])).toEqual([
      ["Map", false, null],
      ["Skill", false, null],
      ["System", true, "resource:b1"],
    ]);
    expect(lockedRefs.has("resource:lib")).toBe(false);
  });
});

describe("follow-along elements", () => {
  const BODY = [
    "Intro.",
    "```bash",
    "npm i -g @anthropic-ai/claude-code",
    "```",
    "```quiz multi required",
    "Which two run locally?",
    "- [x] Claude Code",
    "- [ ] Claude in the browser",
    "- [X] Codex CLI {#codex}",
    "> Both run in your terminal.",
    "```",
    "```checklist steps",
    "- Open the terminal",
    "- [ ] Run claude",
    "```",
  ].join("\n");

  test("parses elements and keeps them out of commands", () => {
    const elements = parseCommunityLessonElements(BODY);
    expect(elements.map((element) => [element.id, element.type, element.required])).toEqual([
      ["multi", "quiz", true],
      ["steps", "checklist", false],
    ]);
    expect(elements[0]).toMatchObject({
      multiple: true, correct: ["claude-code", "codex"], explanation_md: "Both run in your terminal.",
    });
    expect(elements[1].choices?.map((choice) => choice.id)).toEqual(["open-the-terminal", "run-claude"]);
    const projection = projectCommunityLessonBody(BODY);
    expect(projection.commands).toEqual([{ variant: null, language: "bash", text: "npm i -g @anthropic-ai/claude-code" }]);
    expect(projection.elements[0]).not.toHaveProperty("correct");
    expect(projection.elements[0]).not.toHaveProperty("explanation_md");
    expect(projection.intro_md).not.toContain("[x]");
    expect(projection.intro_md).not.toContain("Both run");
  });

  test("redaction strips only quiz answers", () => {
    const redacted = redactCommunityLessonAnswers(BODY);
    expect(redacted).toContain("- [ ] Claude Code");
    expect(redacted).toContain("- [ ] Codex CLI {#codex}");
    expect(redacted).not.toContain("Both run");
    expect(redacted).toContain("npm i -g");
    expect(redactCommunityLessonAnswers("- [x] my own todo")).toBe("- [x] my own todo");
  });

  test("strict parsing names the broken block; lenient parsing skips it", () => {
    const broken = "```quiz q1\nWhich?\n- [ ] A\n- [ ] B\n```\n```button ok\nGo\n```";
    expect(() => parseCommunityLessonElements(broken, { strict: true })).toThrow("community_lesson_element_invalid:q1:answer");
    expect(parseCommunityLessonElements(broken).map((element) => element.id)).toEqual(["ok"]);
    expect(() => parseCommunityLessonElements("```button no!\nGo\n```", { strict: true })).toThrow(":id");
    expect(() => parseCommunityLessonElements("```button a\nGo\n```\n```button a\nAgain\n```", { strict: true }))
      .toThrow("duplicate_id");
  });

  test("grades responses", () => {
    const [quiz, checklist] = parseCommunityLessonElements(BODY);
    expect(gradeCommunityLessonResponse(quiz, ["codex", "claude-code"])).toEqual({
      value: ["codex", "claude-code"], correct: true, complete: true,
    });
    expect(gradeCommunityLessonResponse(quiz, ["codex"])).toMatchObject({ correct: false, complete: false });
    expect(() => gradeCommunityLessonResponse(quiz, ["nope"])).toThrow();
    expect(() => gradeCommunityLessonResponse(quiz, [])).toThrow();
    expect(gradeCommunityLessonResponse(checklist, ["run-claude", "open-the-terminal"])).toMatchObject({ complete: true, correct: null });
    expect(gradeCommunityLessonResponse(checklist, [])).toMatchObject({ complete: false });
    const [button] = parseCommunityLessonElements("```button done\nI did it\n```");
    expect(gradeCommunityLessonResponse(button, true)).toEqual({ value: true, correct: null, complete: true });
    expect(() => gradeCommunityLessonResponse(button, false)).toThrow();
  });

  test("buttons call existing actions and form blocks point at a Polynet Form", () => {
    const body = [
      "```button finish action=mark_done",
      "I'm done",
      "```",
      "```button help action=ask_agent",
      "Review my map",
      "```",
      "```button open action=open_form:map-checkpoint",
      "Submit my map",
      "```",
      "```form proof form=map-checkpoint",
      "Send your map for review.",
      "```",
    ].join("\n");
    const elements = parseCommunityLessonElements(body, { strict: true });
    expect(elements.map((element) => [element.id, element.type, element.action ?? null, element.form_key ?? null])).toEqual([
      ["finish", "button", "mark_done", null],
      ["help", "button", "ask_agent", null],
      ["open", "button", "open_form", "map-checkpoint"],
      ["proof", "form", null, "map-checkpoint"],
    ]);
    expect(parseCommunityLessonElements("```button ok\nGo\n```")[0].action).toBe("confirm");
    expect(() => parseCommunityLessonElements("```button x action=open_form\nGo\n```", { strict: true })).toThrow(":flag");
    expect(() => parseCommunityLessonElements("```button x action=delete_all\nGo\n```", { strict: true })).toThrow(":flag");
    expect(() => parseCommunityLessonElements("```form f required form=k\nGo\n```", { strict: true })).toThrow(":flag");
    expect(() => parseCommunityLessonElements("```form f\nGo\n```", { strict: true })).toThrow(":form");
    expect(() => gradeCommunityLessonResponse(elements[3], true)).toThrow();
  });
});
