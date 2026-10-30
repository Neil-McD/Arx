import { Node, mergeAttributes, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Blockquote from "@tiptap/extension-blockquote";
import Heading from "@tiptap/extension-heading";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";

// The lesson editor's document model, without any React. Every node here maps
// to one Markdown construct (lessonMarkdown.ts), so the editor can only make
// what body_md can hold. Node views are attached in LessonEditor.tsx.

// A list's "tight" flag decides whether Markdown puts blank lines between its
// items, which changes how members see it. Kept so a list stays as written.
const tightAttribute = {
  tight: {
    default: true,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-tight") !== "false",
    renderHTML: (attributes: { tight?: boolean }) => ({ "data-tight": attributes.tight === false ? "false" : "true" }),
  },
};

// Members read "## Heading" one level down (renderMarkdown's headingLevelOffset),
// so the editor draws it the same size they will see it.
const LessonHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const level = Math.min(6, Number(node.attrs.level) + 1);
    return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

const LessonBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tightAttribute };
  },
});

const LessonOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tightAttribute };
  },
});

// What a quote, callout or list item may hold: text blocks only. A slide deck,
// a follow-along card (quiz, checklist, button, form) or a raw Markdown block
// can't be wrapped into one: Markdown can't hold them there, so on the next
// save their contents came back as loose text.
const WRAPPABLE_BLOCKS = "paragraph | heading | bulletList | orderedList | blockquote | codeBlock | horizontalRule | image | video";

const LessonListItem = ListItem.extend({
  content: `paragraph (${WRAPPABLE_BLOCKS})*`,
});

/** A quote, or a callout when its first line names a type: `> [!TIP]`. */
export const LessonBlockquote = Blockquote.extend({
  content: `(${WRAPPABLE_BLOCKS})+`,
  addAttributes() {
    return {
      callout: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-callout"),
        renderHTML: (attributes: { callout?: string | null }) => (attributes.callout ? { "data-callout": attributes.callout } : {}),
      },
      /** The callout's own title, typed by the author: `> [!TIP] Title`. */
      calloutTitle: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-callout-title"),
        renderHTML: (attributes: { calloutTitle?: string | null }) => (attributes.calloutTitle ? { "data-callout-title": attributes.calloutTitle } : {}),
      },
    };
  },
});

/** A picture on its own line: `![alt](src)`. */
export const LessonImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      title: { default: null },
      // Set while a pasted or dropped file is uploading; never saved.
      uploadId: { default: null, rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: "img[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
});

/** A video link on its own line, which members see as the player. */
export const LessonVideo = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-lesson-video]", getAttrs: (element) => ({ url: (element as HTMLElement).getAttribute("data-url") ?? "" }) }];
  },
  renderHTML({ node }) {
    return ["div", { "data-lesson-video": "", "data-url": node.attrs.url }];
  },
});

/**
 * A fenced block the editor shows as a card: follow-along elements
 * (button, checklist, quiz, form) and polynet-embed widgets. `language` and
 * `info` are the opening line after the fence, `body` everything inside.
 */
export const LessonFencedBlock = Node.create({
  name: "lessonBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      language: { default: "button" },
      info: { default: "" },
      body: { default: "" },
    };
  },
  parseHTML() {
    return [{
      tag: "div[data-lesson-block]",
      getAttrs: (element) => {
        const el = element as HTMLElement;
        return {
          language: el.getAttribute("data-language") ?? "button",
          info: el.getAttribute("data-info") ?? "",
          body: el.getAttribute("data-body") ?? "",
        };
      },
    }];
  },
  renderHTML({ node }) {
    return ["div", {
      "data-lesson-block": "",
      "data-language": node.attrs.language,
      "data-info": node.attrs.info,
      "data-body": node.attrs.body,
    }];
  },
});

/**
 * Markdown the editor has no block for (tables, HTML, task lists, math),
 * kept exactly as written and edited as text.
 */
export const LessonRawMarkdown = Node.create({
  name: "rawMarkdown",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { source: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-raw-markdown]", getAttrs: (element) => ({ source: (element as HTMLElement).getAttribute("data-source") ?? "" }) }];
  },
  renderHTML({ node }) {
    return ["div", { "data-raw-markdown": "", "data-source": node.attrs.source }];
  },
});

export type LessonSlide = { src: string; alt: string; note: string };

// A lesson's "## Slides" section: the deck members page through.
export const LessonSlideDeck = Node.create({
  name: "slideDeck",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      lead: { default: "" },
      slides: { default: [] as LessonSlide[] },
    };
  },
  parseHTML() {
    return [{
      tag: "div[data-slide-deck]",
      getAttrs: (element) => {
        const el = element as HTMLElement;
        let slides: LessonSlide[] = [];
        try {
          slides = JSON.parse(el.getAttribute("data-slides") ?? "[]");
        } catch {
          slides = [];
        }
        return { lead: el.getAttribute("data-lead") ?? "", slides };
      },
    }];
  },
  renderHTML({ node }) {
    return ["div", { "data-slide-deck": "", "data-lead": node.attrs.lead, "data-slides": JSON.stringify(node.attrs.slides) }];
  },
});

export function lessonEditorBaseExtensions(): AnyExtension[] {
  return [
    // The editor writes the reader's own class names, so a lesson looks the
    // same while it is written as when it is read.
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      underline: false,
      paragraph: { HTMLAttributes: { class: "md-paragraph" } },
      blockquote: false,
      horizontalRule: { HTMLAttributes: { class: "md-hr" } },
      code: { HTMLAttributes: { class: "md-inline-code" } },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        protocols: ["mailto"],
        HTMLAttributes: { class: "md-link", rel: "noreferrer", target: "_blank" },
      },
      codeBlock: { HTMLAttributes: { class: "lesson-editor-code", spellcheck: "false" } },
      dropcursor: { class: "lesson-editor-dropcursor", width: 3 },
    }),
    LessonHeading.configure({ HTMLAttributes: { class: "md-header" } }),
    LessonBlockquote.configure({ HTMLAttributes: { class: "md-blockquote" } }),
    LessonBulletList.configure({ HTMLAttributes: { class: "md-list" } }),
    LessonOrderedList.configure({ HTMLAttributes: { class: "md-list" } }),
    LessonListItem,
    LessonImage,
    LessonVideo,
    LessonFencedBlock,
    LessonRawMarkdown,
    LessonSlideDeck,
  ];
}
