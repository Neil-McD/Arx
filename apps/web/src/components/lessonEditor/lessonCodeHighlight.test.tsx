import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "../../../../../shared/markdownUi";
import { highlightRanges } from "./lessonCodeHighlight";

test("highlight ranges map highlight.js HTML back to text offsets, entities counted once", () => {
  const html = '<span class="hljs-keyword">const</span> a = <span class="hljs-string">&quot;&lt;b&gt;&quot;</span>;';
  expect(highlightRanges(html)).toEqual([
    { from: 0, to: 5, className: "hljs-keyword" },
    { from: 10, to: 15, className: "hljs-string" },
  ]);
});

test("lessons show even a one-line fenced command as a code card with Copy", () => {
  const md = "```\nnpm install polynet\n```";
  const lesson = renderToStaticMarkup(<>{renderMarkdown(md, { codeCards: true })}</>);
  expect(lesson).toContain("code-block-wrapper");
  expect(lesson).toContain(">Copy</button>");
  const chat = renderToStaticMarkup(<>{renderMarkdown(md)}</>);
  expect(chat).not.toContain("code-block-wrapper");
});
