import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { highlightCodeHtml } from "../../../../../shared/markdownUi";

// Code blocks in the lesson editor wear the same colours members see, and have
// the same Copy button at the top right. The colours are decorations over the
// text, so the block stays plain text that saves to Markdown unchanged.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", "#x27": "'", "#39": "'" };

/** Character ranges and their highlight.js classes, read from its HTML. */
export function highlightRanges(html: string): Array<{ from: number; to: number; className: string }> {
  const ranges: Array<{ from: number; to: number; className: string }> = [];
  const open: Array<{ className: string; from: number }> = [];
  let offset = 0;
  const pattern = /<span class="([^"]+)">|<\/span>|&(#?\w+);|[^<&]+/g;
  for (const match of html.matchAll(pattern)) {
    if (match[1] !== undefined) open.push({ className: match[1], from: offset });
    else if (match[0] === "</span>") {
      const span = open.pop();
      if (span && offset > span.from) ranges.push({ from: span.from, to: offset, className: span.className });
    } else if (match[2] !== undefined) offset += (ENTITIES[match[2]] ?? match[0]).length;
    else offset += match[0].length;
  }
  return ranges;
}

function copyButton(text: () => string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-block-copy lesson-editor-code-copy";
  button.contentEditable = "false";
  button.textContent = "Copy";
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void navigator.clipboard?.writeText(text()).catch(() => undefined);
    button.textContent = "Copied";
    button.classList.add("is-copied");
    window.setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("is-copied");
    }, 2000);
  });
  return button;
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return true;
    const text = node.textContent;
    const start = pos + 1;
    decorations.push(Decoration.widget(start, () => copyButton(() => text), {
      side: -1, ignoreSelection: true, key: `copy:${text.length}:${text.slice(0, 40)}`,
    }));
    const html = text ? highlightCodeHtml(text, node.attrs.language as string | null) : null;
    if (html) {
      for (const range of highlightRanges(html)) {
        decorations.push(Decoration.inline(start + range.from, start + range.to, { class: range.className }));
      }
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

const key = new PluginKey<DecorationSet>("lessonCodeHighlight");

export const lessonCodeHighlightExtension = Extension.create({
  name: "lessonCodeHighlight",
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key,
      state: {
        init: (_config, state) => buildDecorations(state.doc),
        apply: (tr, previous) => tr.docChanged ? buildDecorations(tr.doc) : previous,
      },
      props: { decorations: (state) => key.getState(state) },
    })];
  },
});
