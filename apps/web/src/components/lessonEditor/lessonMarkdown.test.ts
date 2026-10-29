import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { describe, expect, it } from "vitest";

import { parseCommunityLessonElements, parseCommunityLessonMarkdown, projectCommunityLessonBody } from "../../../../../shared/communityLessonContract";
import { lessonEditorBaseExtensions } from "./lessonEditorSchema";
import { parseLessonMarkdown, serializeLessonDocument } from "./lessonMarkdown";

const schema = getSchema(lessonEditorBaseExtensions());
const isVideoUrl = (url: string) => /youtube\.com|youtu\.be|loom\.com|vimeo\.com|wistia/.test(url);

// What members see: the Markdown tree remark (the lesson renderer) reads,
// without positions and with runs of whitespace folded.
function readerTree(markdown: string): unknown {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown);
  const strip = (node: any): any => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "position") continue;
      if (key === "spread") continue;
      out[key] = key === "value" && typeof value === "string" && node.type === "text" ? value.replace(/\s+/g, " ") : strip(value);
    }
    return out;
  };
  return strip(tree);
}

// The parts the server and CLI derive from a body. Their Markdown slices are
// compared as members read them, since fresh Markdown may wrap lines differently.
function lessonShape(markdown: string) {
  const projection = projectCommunityLessonBody(markdown);
  return {
    intro: readerTree(projection.intro_md),
    variants: projection.variants.map((variant) => ({ ...variant, body_md: readerTree(variant.body_md) })),
    slides: projection.slides.map((slide) => ({ ...slide, note_md: readerTree(slide.note_md) })),
    commands: projection.commands,
    elements: projection.elements,
  };
}

function replaceBlock(doc: PMNode, index: number, next: PMNode): PMNode {
  const blocks: PMNode[] = [];
  doc.forEach((node, _offset, i) => blocks.push(i === index ? next : node));
  return doc.type.create(doc.attrs, blocks);
}

const LESSON = `Your workspace now knows where your **files** live. It also needs your *live* data —
emails, tasks and \`client records\`.

## Why this matters

Paste this into your chat:

\`\`\`
Connect my business tools. Ask me what systems my business actually runs on.
\`\`\`

- Notion
- Google Drive
  - Shared drives too
- An inbox

1. Open settings
2. Click **Connect**

> **Tip:** Notion asks you to tick which pages it may read.

![Slide 1: why a skill](media/canvases/v1-what-is-a-skill/01-why-a-skill.png)

https://www.youtube.com/watch?v=dQw4w9WgXcQ

---

### In Claude Code

Run \`claude\` in a terminal. See [the docs](https://docs.anthropic.com/claude-code "Docs") or https://example.com/a_b_c.

\`\`\`quiz pick-tool required
Which app runs on your own computer?
- [ ] Claude in the browser
- [x] Claude Code
> Claude Code runs locally, so it can read your files.
\`\`\`

\`\`\`checklist setup-done
Before you move on:
- Installed Claude Code
- Signed in {#signed-in}
\`\`\`

\`\`\`button finished action=mark_done
I've connected my tools
\`\`\`

\`\`\`form intake form=welcome-intake
Tell us about your business.
\`\`\`

\`\`\`polynet-embed
src: embeds/xray.html
title: Business X-Ray
height: 720
fallback: media/xray.png
\`\`\`

| Tool | Runs on |
| --- | --- |
| Claude Code | Your computer |

- [ ] A task list item
- [x] Done item

$$
E = mc^2
$$

<div class="note">Raw HTML stays.</div>

Price is $79 a month, 2*3 = 6 and snake_case_names stay.
Line one\\
Line two`;

describe("lesson editor Markdown", () => {
  it("gives back exactly the body it read when nothing is edited", () => {
    const { doc, serialize } = parseLessonMarkdown(schema, LESSON, { isVideoUrl });
    expect(serialize(doc)).toBe(LESSON);
  });

  it("reads lesson elements and widgets as cards, and odd Markdown as raw blocks", () => {
    const { doc } = parseLessonMarkdown(schema, LESSON, { isVideoUrl });
    const names: string[] = [];
    doc.forEach((node) => names.push(node.type.name === "lessonBlock" ? `lessonBlock:${node.attrs.language}` : node.type.name));
    expect(names).toContain("lessonBlock:quiz");
    expect(names).toContain("lessonBlock:checklist");
    expect(names).toContain("lessonBlock:button");
    expect(names).toContain("lessonBlock:form");
    expect(names).toContain("lessonBlock:polynet-embed");
    expect(names).toContain("image");
    expect(names).toContain("video");
    expect(names.filter((name) => name === "rawMarkdown").length).toBe(4); // table, task list, math, HTML
  });

  it("writes fresh Markdown that reads the same to members, the server and the CLI", () => {
    const { doc } = parseLessonMarkdown(schema, LESSON, { isVideoUrl });
    const fresh = serializeLessonDocument(schema, doc);
    expect(readerTree(fresh)).toEqual(readerTree(LESSON));
    expect(parseCommunityLessonElements(fresh, { strict: true })).toEqual(parseCommunityLessonElements(LESSON, { strict: true }));
    expect(lessonShape(fresh)).toEqual(lessonShape(LESSON));
  });

  it("reads a slides section as one deck and writes edits back as a deck", () => {
    const deck = "Intro.\n\n## Slides\n\nLead line.\n\n![One](media/x/01.png)\n\nFirst note.\n\n![Two](media/x/02.png)\n\nSecond note, **bold**.\n\n## Next\n\nAfter.";
    const { doc, serialize } = parseLessonMarkdown(schema, deck, { isVideoUrl });
    const names: string[] = [];
    doc.forEach((node) => names.push(node.type.name));
    expect(names).toEqual(["paragraph", "slideDeck", "heading", "paragraph"]);
    expect(serialize(doc)).toBe(deck);
    let deckIndex = -1;
    doc.forEach((node, _offset, index) => {
      if (node.type.name === "slideDeck") deckIndex = index;
    });
    const node = doc.child(deckIndex);
    const slides = [...node.attrs.slides];
    slides[0] = { ...slides[0], note: "First note, longer." };
    slides.splice(1, 0, { src: "https://cdn.example/03 (b).png", alt: "Step [3]", note: "Third note." });
    const out = serialize(replaceBlock(doc, deckIndex, node.type.create({ ...node.attrs, slides })));
    expect(out.startsWith("Intro.\n\n## Slides\n\nLead line.\n\n![One](media/x/01.png)\n\nFirst note, longer.")).toBe(true);
    expect(out.endsWith("\n\n## Next\n\nAfter.")).toBe(true);
    expect(projectCommunityLessonBody(out).slides.map((slide) => [slide.image, slide.alt, slide.note_md])).toEqual([
      ["media/x/01.png", "One", "First note, longer."],
      ["https://cdn.example/03%20%28b%29.png", "Step 3", "Third note."],
      ["media/x/02.png", "Two", "Second note, **bold**."],
    ]);
    // Reading it again gives the same deck.
    const again = parseLessonMarkdown(schema, out, { isVideoUrl }).doc;
    let reread: unknown = null;
    again.forEach((child) => {
      if (child.type.name === "slideDeck") reread = child.attrs.slides;
    });
    expect((reread as { note: string }[]).map((slide) => slide.note)).toEqual(["First note, longer.", "Third note.", "Second note, **bold**."]);
  });

  it("leaves a slides heading with no pictures as ordinary text", () => {
    const body = "## Slides\n\nNothing here yet.";
    const { doc, serialize } = parseLessonMarkdown(schema, body, { isVideoUrl });
    expect(doc.child(0).type.name).toBe("heading");
    expect(serialize(doc)).toBe(body);
  });

  it("rewrites only the block that changed", () => {
    const { doc, serialize } = parseLessonMarkdown(schema, LESSON, { isVideoUrl });
    let headingIndex = -1;
    doc.forEach((node, _offset, index) => {
      if (headingIndex < 0 && node.type.name === "heading") headingIndex = index;
    });
    const heading = doc.child(headingIndex);
    const edited = replaceBlock(doc, headingIndex, heading.type.create(heading.attrs, schema.text("Why this matters most")));
    const out = serialize(edited);
    expect(out).toBe(LESSON.replace("## Why this matters\n", "## Why this matters most\n"));
  });

  it("writes an edited card back as a block the server accepts", () => {
    const { doc, serialize } = parseLessonMarkdown(schema, LESSON, { isVideoUrl });
    let quizIndex = -1;
    doc.forEach((node, _offset, index) => {
      if (node.type.name === "lessonBlock" && node.attrs.language === "quiz") quizIndex = index;
    });
    const quiz = doc.child(quizIndex);
    const body = "``` starts a fence. Which one?\n- [x] This one\n- [ ] Not this";
    const out = serialize(replaceBlock(doc, quizIndex, quiz.type.create({ ...quiz.attrs, body })));
    const quizElement = parseCommunityLessonElements(out, { strict: true }).find((element) => element.id === "pick-tool");
    expect(quizElement?.prompt).toBe("``` starts a fence. Which one?");
    expect(quizElement?.correct).toEqual(["this-one"]);
    expect(out).toContain("````quiz pick-tool required\n");
  });

  it("moves a block with one blank line around it", () => {
    const { doc, serialize } = parseLessonMarkdown(schema, "Intro\n\n- a\n- b\n\nOutro", { isVideoUrl });
    const blocks: PMNode[] = [];
    doc.forEach((node) => blocks.push(node));
    expect(serialize(doc.type.create(null, [blocks[1], blocks[0], blocks[2]]))).toBe("- a\n- b\n\nIntro\n\nOutro");
  });

  it("drops the empty paragraphs a writer leaves while typing", () => {
    const { doc, serialize } = parseLessonMarkdown(schema, "First\n\nSecond", { isVideoUrl });
    const blocks: PMNode[] = [];
    doc.forEach((node) => blocks.push(node));
    const edited = doc.type.create(null, [blocks[0], schema.nodes.paragraph.create(), blocks[1], schema.nodes.paragraph.create()]);
    expect(serialize(edited)).toBe("First\n\nSecond");
  });

  it("keeps two lists the writer split apart as two lists", () => {
    const { doc, serialize } = parseLessonMarkdown(schema, "- a\n- b", { isVideoUrl });
    const list = doc.child(0);
    const item = (text: string) => schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text(text)));
    const edited = doc.type.create(null, [
      list.type.create(list.attrs, [item("a")]),
      list.type.create(list.attrs, [item("b")]),
    ]);
    const out = serialize(edited);
    expect(readerTree(out)).toEqual(readerTree("- a\n\n* b"));
  });

  it("starts an empty lesson with one empty paragraph and saves it as nothing", () => {
    const { doc, serialize } = parseLessonMarkdown(schema, "", { isVideoUrl });
    expect(doc.childCount).toBe(1);
    expect(serialize(doc)).toBe("");
  });

  // Real course content lives outside the repo (it is paid content). Point
  // LESSON_EDITOR_CORPUS at a folder of portal .md files to check every one.
  const corpus = process.env.LESSON_EDITOR_CORPUS;
  it.runIf(Boolean(corpus))("round-trips every lesson in LESSON_EDITOR_CORPUS", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith(".md")) files.push(full);
      }
    };
    walk(corpus!);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const body = parseCommunityLessonMarkdown(readFileSync(file, "utf8")).body_md;
      const { doc, serialize } = parseLessonMarkdown(schema, body, { isVideoUrl });
      expect(serialize(doc), file).toBe(body);
      const fresh = serializeLessonDocument(schema, doc);
      expect(readerTree(fresh), file).toEqual(readerTree(body));
      expect(lessonShape(fresh), file).toEqual(lessonShape(body));
    }
  }, 60_000);
});

describe("callouts", () => {
  const BODY = `Intro.

> [!TIP]
> Connect one tool first.
>
> Then the **rest**.

> [!caution] Keys stay out of the chat.

> A plain quote.`;

  it("reads a typed quote as a callout without its marker, and keeps the source", () => {
    const parsed = parseLessonMarkdown(schema, BODY);
    const [, tip, caution, quote] = (() => { const out: PMNode[] = []; parsed.doc.forEach((n) => out.push(n)); return out; })();
    expect(tip.type.name).toBe("blockquote");
    expect(tip.attrs.callout).toBe("tip");
    expect(tip.firstChild!.textContent).toBe("Connect one tool first.");
    expect(tip.childCount).toBe(2);
    expect(caution.attrs.callout).toBe("warning");
    // Text after the marker on its own line is the callout's title.
    expect(caution.attrs.calloutTitle).toBe("Keys stay out of the chat.");
    expect(caution.textContent).toBe("");
    expect(quote.attrs.callout).toBeNull();
    expect(parsed.serialize(parsed.doc)).toBe(BODY);
  });

  it("writes a changed callout as a GitHub-style alert that reads back the same", () => {
    const parsed = parseLessonMarkdown(schema, BODY);
    const tip = parsed.doc.child(1);
    const doc = replaceBlock(parsed.doc, 1, tip.type.create({ callout: "action" }, tip.content));
    const out = parsed.serialize(doc);
    expect(out).toContain("> [!ACTION]\n> Connect one tool first.\n>\n> Then the **rest**.");
    const again = parseLessonMarkdown(schema, out).doc.child(1);
    expect(again.eq(doc.child(1))).toBe(true);
    // Members' reader sees a blockquote whose text starts with the marker.
    expect(JSON.stringify(readerTree(out))).toContain("[!ACTION]");
  });

  it("keeps a typed title on the marker line and reads it back", () => {
    const parsed = parseLessonMarkdown(schema, "Intro.");
    const titled = schema.nodes.blockquote.create({ callout: "tip", calloutTitle: "One tool first" }, [schema.nodes.paragraph.create(null, schema.text("Connect one tool."))]);
    const out = serializeLessonDocument(schema, parsed.doc.type.create(null, [titled]));
    expect(out).toBe("> [!TIP] One tool first\n> Connect one tool.");
    const again = parseLessonMarkdown(schema, out).doc.child(0);
    expect(again.attrs.calloutTitle).toBe("One tool first");
    expect(again.textContent).toBe("Connect one tool.");
  });

  it("drops an empty new callout and turns a plain quote into one", () => {
    const parsed = parseLessonMarkdown(schema, "Intro.");
    const empty = schema.nodes.blockquote.create({ callout: "tip" }, [schema.nodes.paragraph.create()]);
    const withEmpty = parsed.doc.type.create(null, [parsed.doc.child(0), empty]);
    expect(parsed.serialize(withEmpty)).toBe("Intro.");
    const note = schema.nodes.blockquote.create({ callout: "note" }, [schema.nodes.paragraph.create(null, schema.text("Drive needs Workspace."))]);
    expect(serializeLessonDocument(schema, parsed.doc.type.create(null, [note]))).toBe("> [!NOTE]\n> Drive needs Workspace.");
  });
});

describe("blocks Markdown can't nest", () => {
  it("can't be wrapped into a callout or a list item", () => {
    const deck = schema.nodes.slideDeck.create({ lead: "", slides: [{ src: "https://x.test/1.png", alt: "", note: "" }] });
    const quiz = schema.nodes.lessonBlock.create({ language: "quiz", info: "pick", body: "Which?\n- [ ] A\n- [x] B" });
    const raw = schema.nodes.rawMarkdown.create({ source: "| a |\n|---|" });
    for (const node of [deck, quiz, raw]) {
      expect(schema.nodes.blockquote.validContent(schema.nodes.blockquote.create().content.append(
        schema.nodes.blockquote.create(null, node).content,
      ))).toBe(false);
      expect(() => schema.nodes.blockquote.createChecked(null, node)).toThrow();
      expect(() => schema.nodes.listItem.createChecked(null, [schema.nodes.paragraph.create(), node])).toThrow();
    }
    expect(() => schema.nodes.blockquote.createChecked(null, schema.nodes.paragraph.create(null, schema.text("ok")))).not.toThrow();
  });
});
