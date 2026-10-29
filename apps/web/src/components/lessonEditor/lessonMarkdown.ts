import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer, type MarkdownSerializerState } from "prosemirror-markdown";
import { Fragment, type Node as PMNode, type Schema } from "@tiptap/pm/model";

import { COMMUNITY_LESSON_ELEMENT_TYPES } from "../../../../../shared/communityLessonContract";
import { COMMUNITY_EMBED_LANGUAGE } from "../../../../../shared/communityEmbed";
import { extractLessonCalloutTitles, lessonCalloutMarker, lessonCalloutType, LESSON_CALLOUT_MARKER } from "../../../../../shared/lessonCallouts";

// body_md <-> editor document, one top-level block at a time.
//
// The lesson body stays Markdown: agents, the CLI and `polynet push` read and
// write it, and the server parses follow-along blocks out of it. So the editor
// must never change what it didn't touch. Each top-level block remembers the
// exact source it came from; ProseMirror keeps an unchanged node as the same
// object, so on save an untouched block writes its original text back and
// only edited blocks are written fresh. A block the editor can't represent
// faithfully (tables, HTML, task lists, math, anything whose fresh Markdown
// would read differently) becomes a raw Markdown block, edited as text.

export const LESSON_CARD_LANGUAGES: readonly string[] = [...COMMUNITY_LESSON_ELEMENT_TYPES, COMMUNITY_EMBED_LANGUAGE];

export type LessonMarkdownOptions = {
  /** True for a link members see as a player (YouTube, Loom, ...). */
  isVideoUrl?: (url: string) => boolean;
};

export type LessonSlide = { src: string; alt: string; note: string };

// encodeURIComponent leaves ( and ) alone, and either would end a Markdown link.
const encodeUrlChar = (c: string) => (c === "(" ? "%28" : c === ")" ? "%29" : encodeURIComponent(c));

// The deck's own reading of a slides section (shared/communityLessonContract.ts
// parseSlides): an image alone on a line starts a slide, and the lines under it
// are its note. Lines before the first image are kept as the deck's lead.
const SLIDE_IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
export const SLIDES_HEADING = "## Slides";

/** The slides in the text under a "## Slides" heading; null when it holds no image lines. */
export function readSlidesSection(text: string): { lead: string; slides: LessonSlide[] } | null {
  const lead: string[] = [];
  const slides: { src: string; alt: string; note: string[] }[] = [];
  for (const line of text.split("\n")) {
    const image = SLIDE_IMAGE.exec(line.trim());
    if (image) slides.push({ src: image[2], alt: image[1], note: [] });
    else if (slides.length) slides[slides.length - 1].note.push(line);
    else lead.push(line);
  }
  if (!slides.length) return null;
  return {
    lead: lead.join("\n").trim(),
    slides: slides.map((slide) => ({ src: slide.src, alt: slide.alt, note: slide.note.join("\n").trim() })),
  };
}

/** The Markdown for a deck, in the shape the reader, the server and the CLI read. */
export function slidesSectionMarkdown(lead: string, slides: readonly LessonSlide[]): string {
  const parts = [SLIDES_HEADING];
  if (lead.trim()) parts.push(lead.trim());
  for (const slide of slides) {
    const src = slide.src.trim().replace(/[()\s]/g, encodeUrlChar);
    if (!src) continue;
    // One line, no brackets: anything else would stop the line reading as a slide.
    parts.push(`![${slide.alt.replace(/[[\]\n]/g, " ").replace(/\s+/g, " ").trim()}](${src})`);
    if (slide.note.trim()) parts.push(slide.note.trim());
  }
  return parts.join("\n\n");
}

export type LessonDocument = {
  doc: PMNode;
  /** Writes the document back to Markdown, reusing the source of untouched blocks. */
  serialize: (doc: PMNode) => string;
};

type SourceRecord = { index: number; source: string };

// Bare URLs are links (as remark-gfm reads them), so writing one back never
// escapes characters inside it. Only full URLs: "example.com" stays text.
const tokenizer = MarkdownIt("commonmark", { html: true, linkify: true }).enable(["table", "strikethrough", "linkify"]);
tokenizer.linkify.set({ fuzzyLink: false, fuzzyEmail: false });

function listIsTight(tokens: Token[], index: number): boolean {
  let i = index;
  while (++i < tokens.length) {
    if (tokens[i].type !== "list_item_open") return tokens[i].hidden;
  }
  return false;
}

function parserFor(schema: Schema): MarkdownParser {
  return new MarkdownParser(schema, tokenizer, {
    blockquote: { block: "blockquote" },
    paragraph: { block: "paragraph" },
    list_item: { block: "listItem" },
    bullet_list: { block: "bulletList", getAttrs: (_tok, tokens, i) => ({ tight: listIsTight(tokens, i) }) },
    ordered_list: {
      block: "orderedList",
      getAttrs: (tok, tokens, i) => ({ start: Number(tok.attrGet("start") ?? 1) || 1, tight: listIsTight(tokens, i) }),
    },
    heading: { block: "heading", getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) }) },
    code_block: { block: "codeBlock", noCloseToken: true },
    fence: { block: "codeBlock", getAttrs: (tok) => ({ language: tok.info.trim() || null }), noCloseToken: true },
    hr: { node: "horizontalRule" },
    hardbreak: { node: "hardBreak" },
    em: { mark: "italic" },
    strong: { mark: "bold" },
    s: { mark: "strike" },
    link: { mark: "link", getAttrs: (tok) => ({ href: tok.attrGet("href"), title: tok.attrGet("title") || null }) },
    code_inline: { mark: "code", noCloseToken: true },
  });
}

function backtickFence(body: string, min = 3): string {
  let longest = 0;
  for (const match of body.matchAll(/^[ \t]*(`{3,})/gm)) longest = Math.max(longest, match[1].length);
  return "`".repeat(Math.max(min, longest + 1));
}

/** One fenced block from its parts, with a fence longer than any inside it. */
export function fencedBlockMarkdown(language: string, info: string, body: string): string {
  const fence = backtickFence(body);
  const opening = [language, info.trim()].filter(Boolean).join(" ");
  const inner = body.replace(/\n+$/, "");
  return `${fence}${opening}\n${inner ? `${inner}\n` : ""}${fence}`;
}

const serializer = new MarkdownSerializer(
  {
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write(`${"#".repeat(node.attrs.level)} `);
      state.renderInline(node, false);
      state.closeBlock(node);
    },
    blockquote(state, node) {
      const callout = lessonCalloutType(node.attrs.callout);
      state.wrapBlock("> ", null, node, () => {
        if (callout) {
          const title = typeof node.attrs.calloutTitle === "string" ? node.attrs.calloutTitle.replace(/\s+/g, " ").trim() : "";
          state.write(title ? `${lessonCalloutMarker(callout)} ${title}` : lessonCalloutMarker(callout));
          state.ensureNewLine();
        }
        state.renderContent(node);
      });
    },
    bulletList(state, node) {
      (state as MarkdownSerializerState & { inTightList: boolean }).inTightList = node.attrs.tight;
      state.renderList(node, "  ", () => "- ");
    },
    orderedList(state, node) {
      const start = node.attrs.start || 1;
      const width = String(start + node.childCount - 1).length;
      const space = " ".repeat(width + 2);
      state.renderList(node, space, (i) => {
        const number = String(start + i);
        return `${" ".repeat(width - number.length)}${number}. `;
      });
    },
    listItem(state, node) {
      state.renderContent(node);
    },
    codeBlock(state, node) {
      const text = node.textContent;
      const fence = backtickFence(text);
      state.write(`${fence}${node.attrs.language ?? ""}\n`);
      state.text(text, false);
      state.ensureNewLine();
      state.write(fence);
      state.closeBlock(node);
    },
    horizontalRule(state, node) {
      state.write("---");
      state.closeBlock(node);
    },
    hardBreak(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i += 1) {
        if (parent.child(i).type !== node.type) {
          state.write("\\\n");
          return;
        }
      }
    },
    text(state, node) {
      state.text(node.text ?? "", !(state as MarkdownSerializerState & { inAutolink?: boolean }).inAutolink);
    },
    image(state, node) {
      // No brackets in alt text: the slide deck reads image lines with a strict pattern.
      const alt = state.esc(String(node.attrs.alt ?? "").replace(/[[\]]/g, ""));
      const src = String(node.attrs.src ?? "").replace(/[()\s]/g, encodeUrlChar);
      const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : "";
      state.write(`![${alt}](${src}${title})`);
      state.closeBlock(node);
    },
    video(state, node) {
      state.write(String(node.attrs.url ?? ""));
      state.closeBlock(node);
    },
    lessonBlock(state, node) {
      state.text(fencedBlockMarkdown(node.attrs.language, node.attrs.info ?? "", node.attrs.body ?? ""), false);
      state.closeBlock(node);
    },
    slideDeck(state, node) {
      state.text(slidesSectionMarkdown(String(node.attrs.lead ?? ""), (node.attrs.slides ?? []) as LessonSlide[]), false);
      state.closeBlock(node);
    },
    rawMarkdown(state, node) {
      state.text(String(node.attrs.source ?? "").replace(/^\n+|\n+$/g, ""), false);
      state.closeBlock(node);
    },
  },
  {
    italic: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
    bold: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
    strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    link: defaultMarkdownSerializer.marks.link,
    code: defaultMarkdownSerializer.marks.code,
  },
  { strict: false },
);

/** Blocks with nothing to save yet: empty paragraphs and callouts, images still uploading, a video with no link. */
function isUnsaved(node: PMNode): boolean {
  if (node.type.name === "paragraph" && node.childCount === 0) return true;
  if (node.type.name === "blockquote" && node.attrs.callout && !node.textContent.trim() && !node.attrs.calloutTitle) return true;
  if (node.type.name === "video") return !String(node.attrs.url ?? "").trim();
  if (node.type.name === "slideDeck") return !((node.attrs.slides ?? []) as LessonSlide[]).some((slide) => slide.src.trim());
  return node.type.name === "image" && (Boolean(node.attrs.uploadId) || !node.attrs.src);
}

function serializeBlock(schema: Schema, node: PMNode): string {
  return serializer.serialize(schema.topNodeType.create(null, [node]), { tightLists: false }).replace(/\n+$/, "");
}

const URL_LINE = /^https?:\/\/\S+$/;
const TASK_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\](?:\s|$)/m;
const MATH = /\$\$|\\\[|\\\(/;

type Chunk = { start: number; end: number; tokens: Token[]; deck?: { lead: string; slides: LessonSlide[] } };

const isH2 = (chunk: Chunk) => chunk.tokens[0]?.type === "heading_open" && chunk.tokens[0].tag === "h2";

/** The first "## Slides" section, up to the next "## " heading, becomes one deck chunk. */
function groupSlides(lines: string[], chunks: Chunk[]): Chunk[] {
  const at = chunks.findIndex((chunk) => isH2(chunk) && /^## Slides[ \t]*$/.test(lines[chunk.start]));
  if (at < 0) return chunks;
  let end = at + 1;
  while (end < chunks.length && !isH2(chunks[end])) end += 1;
  const last = chunks[end - 1];
  const deck = readSlidesSection(lines.slice(chunks[at].start + 1, last.end).join("\n"));
  if (!deck) return chunks;
  return [...chunks.slice(0, at), { start: chunks[at].start, end: last.end, tokens: [], deck }, ...chunks.slice(end)];
}

/** Top-level blocks with their line ranges; lines no block claims become their own chunk. */
function chunkSource(lines: string[], tokens: Token[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.level !== 0 || !token.map) continue;
    let j = i;
    if (token.nesting === 1) {
      let depth = 0;
      for (; j < tokens.length; j += 1) {
        depth += tokens[j].nesting;
        if (depth === 0) break;
      }
    }
    // A list's range runs past the blank line after it; the block ends at its text.
    let end = token.map[1];
    while (end > token.map[0] + 1 && !lines[end - 1]?.trim()) end -= 1;
    chunks.push({ start: token.map[0], end, tokens: tokens.slice(i, j + 1) });
    i = j;
  }
  // Text no token claims (link reference definitions) keeps its own block.
  const out: Chunk[] = [];
  let line = 0;
  for (const chunk of [...chunks, { start: lines.length, end: lines.length, tokens: [] }]) {
    let gapStart = line;
    while (gapStart < chunk.start && !lines[gapStart].trim()) gapStart += 1;
    let gapEnd = chunk.start;
    while (gapEnd > gapStart && !lines[gapEnd - 1].trim()) gapEnd -= 1;
    if (gapEnd > gapStart) out.push({ start: gapStart, end: gapEnd, tokens: [] });
    if (chunk.end > chunk.start) out.push(chunk);
    line = Math.max(line, chunk.end);
  }
  return out;
}

function singleInline(chunk: Chunk): Token | null {
  const [open, inline, close] = chunk.tokens;
  if (chunk.tokens.length !== 3 || open.type !== "paragraph_open" || inline.type !== "inline" || close.type !== "paragraph_close") return null;
  return inline;
}

/** A quote that starts with "[!TIP]" becomes a callout, without the marker in its text. */
function readCallout(schema: Schema, node: PMNode, titles: string[]): PMNode {
  if (node.type.name !== "blockquote") return node;
  const paragraph = node.firstChild;
  const first = paragraph?.type.name === "paragraph" ? paragraph.firstChild : null;
  if (!paragraph || !first?.isText || first.marks.length) return node;
  const match = LESSON_CALLOUT_MARKER.exec(first.text ?? "");
  const callout = match ? lessonCalloutType(match[1]) : null;
  if (!match || !callout) return node;
  const calloutTitle = titles.shift() || null;
  // The marker's line break reads as a space; it isn't part of the text.
  const lead = /^\s*/.exec((first.text ?? "").slice(match[0].length))![0].length;
  const rest = paragraph.content.cut(match[0].length + lead);
  const children: PMNode[] = [];
  if (rest.size) children.push(paragraph.copy(rest));
  node.forEach((child, _offset, index) => {
    if (index > 0) children.push(child);
  });
  return node.type.create({ ...node.attrs, callout, calloutTitle }, children.length ? children : [schema.nodes.paragraph.create()]);
}

function parseBlocks(schema: Schema, parser: MarkdownParser, source: string): PMNode {
  // Titles come off their marker lines first: the parser would join them to the text.
  const extracted = extractLessonCalloutTitles(source);
  const parsed = parser.parse(extracted.source);
  const blocks: PMNode[] = [];
  parsed.forEach((node) => blocks.push(readCallout(schema, node, extracted.titles)));
  return parsed.copy(Fragment.from(blocks));
}

function rawBlock(schema: Schema, source: string): PMNode {
  return schema.nodes.rawMarkdown.create({ source });
}

function blockFromChunk(schema: Schema, parser: MarkdownParser, chunk: Chunk, source: string, options: LessonMarkdownOptions): PMNode[] {
  const first = chunk.tokens[0];
  if (!first) return [rawBlock(schema, source)];
  if (first.type === "fence") {
    const [language = "", ...rest] = first.info.trim().split(/\s+/);
    // A follow-along or widget block is a card only when its closing fence
    // is where the lesson contract also ends it.
    const sourceLines = source.split("\n");
    const closes = sourceLines.length > 1 && sourceLines[0].startsWith(first.markup) && sourceLines[sourceLines.length - 1].startsWith(first.markup);
    if (LESSON_CARD_LANGUAGES.includes(language) && closes && first.markup.startsWith("`")) {
      return [schema.nodes.lessonBlock.create({ language, info: rest.join(" "), body: first.content.replace(/\n$/, "") })];
    }
  }
  if (first.type === "html_block" || first.type === "table_open" || first.type === "code_block") return [rawBlock(schema, source)];
  if (TASK_ITEM.test(source) || MATH.test(source)) return [rawBlock(schema, source)];
  const inline = singleInline(chunk);
  if (inline) {
    const children = inline.children ?? [];
    if (children.length === 1 && children[0].type === "image") {
      const image = children[0];
      return [schema.nodes.image.create({
        src: image.attrGet("src") ?? "",
        alt: image.content ?? "",
        title: image.attrGet("title") || null,
      })];
    }
    const text = inline.content.trim();
    if (URL_LINE.test(text) && options.isVideoUrl?.(text)) {
      return [schema.nodes.video.create({ url: text })];
    }
  }
  let nodes: PMNode[];
  try {
    const parsed = parseBlocks(schema, parser, source);
    parsed.check();
    nodes = [];
    parsed.forEach((node) => nodes.push(node));
  } catch {
    return [rawBlock(schema, source)];
  }
  if (nodes.length !== 1) return [rawBlock(schema, source)];
  // The block must come back the same from its fresh Markdown; if it
  // wouldn't, keep it as text rather than risk changing it on the next edit.
  try {
    const again = parseBlocks(schema, parser, serializeBlock(schema, nodes[0]));
    if (again.childCount !== 1 || !again.child(0).eq(nodes[0])) return [rawBlock(schema, source)];
  } catch {
    return [rawBlock(schema, source)];
  }
  return nodes;
}

/** Reads a lesson body into an editor document. */
export function parseLessonMarkdown(schema: Schema, markdown: string, options: LessonMarkdownOptions = {}): LessonDocument {
  const original = String(markdown ?? "");
  const text = original.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const parser = parserFor(schema);
  const sources = new WeakMap<PMNode, SourceRecord>();
  const gaps: string[] = [];
  const blocks: PMNode[] = [];
  const chunks = groupSlides(lines, chunkSource(lines, tokenizer.parse(text, {})));
  chunks.forEach((chunk, index) => {
    const source = lines.slice(chunk.start, chunk.end).join("\n");
    const nodes = chunk.deck
      ? [schema.nodes.slideDeck.create(chunk.deck)]
      : blockFromChunk(schema, parser, chunk, source, options);
    if (nodes.length === 1) sources.set(nodes[0], { index, source });
    blocks.push(...nodes);
    const next = chunks[index + 1];
    gaps.push(next ? lines.slice(chunk.end, next.start).map(() => "\n").join("") + "\n" : "");
  });
  const leading = chunks.length ? lines.slice(0, chunks[0].start).map(() => "\n").join("") : "";
  const trailing = chunks.length ? lines.slice(chunks[chunks.length - 1].end).join("\n") : "";
  const trailingText = trailing.trim() ? `\n${trailing}` : "";
  if (!blocks.length) blocks.push(schema.nodes.paragraph.create());
  const doc = schema.topNodeType.create(null, blocks);
  const initial = doc;

  const serialize = (next: PMNode): string => {
    // Nothing changed: hand back exactly what came in.
    if (next === initial || next.eq(initial)) return original;
    const parts: string[] = [];
    let previous: { record: SourceRecord | undefined; node: PMNode } | null = null;
    next.forEach((node) => {
      if (isUnsaved(node)) {
        // Empty lines the writer left between blocks are not content.
        previous = previous ? { ...previous, record: undefined } : null;
        return;
      }
      const record = sources.get(node);
      let markdownText = record ? record.source : serializeBlock(schema, node);
      if (previous) {
        const keepGap = record && previous.record && previous.record.index + 1 === record.index;
        // Two lists in a row would merge into one; a different bullet keeps them apart.
        if (!record && node.type.name === "bulletList" && previous.node.type.name === "bulletList") {
          markdownText = markdownText.replace(/^- /gm, "* ");
        }
        parts.push(keepGap ? gaps[previous.record!.index] : "\n\n");
      }
      parts.push(markdownText);
      previous = { record, node };
    });
    const body = parts.join("");
    return body ? `${leading}${body}${trailingText}` : "";
  };

  return { doc, serialize };
}

/** Markdown for pasted text: the same reading the editor uses on load. */
export function parseMarkdownFragment(schema: Schema, markdown: string, options: LessonMarkdownOptions = {}): PMNode[] {
  const { doc } = parseLessonMarkdown(schema, markdown, options);
  const nodes: PMNode[] = [];
  doc.forEach((node) => nodes.push(node));
  return nodes;
}

/** Fresh Markdown for a document, ignoring any original source (tests, previews). */
export function serializeLessonDocument(schema: Schema, doc: PMNode): string {
  const parts: string[] = [];
  doc.forEach((node) => {
    if (!isUnsaved(node)) parts.push(serializeBlock(schema, node));
  });
  return parts.join("\n\n");
}
