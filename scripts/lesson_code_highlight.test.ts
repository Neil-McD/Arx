import { expect, test } from "vitest";
import { highlightRanges } from "../apps/web/src/components/lessonEditor/lessonCodeHighlight";

test("highlight ranges map highlight.js HTML back to text offsets, entities counted once", () => {
  const html = '<span class="hljs-keyword">const</span> a = <span class="hljs-string">&quot;&lt;b&gt;&quot;</span>;';
  expect(highlightRanges(html)).toEqual([
    { from: 0, to: 5, className: "hljs-keyword" },
    { from: 10, to: 15, className: "hljs-string" },
  ]);
});
