// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

vi.mock("katex/dist/katex.min.css", () => ({}));

import { renderMarkdown } from "../shared/markdownUi";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = requireFromWeb("react") as typeof import("react");
const { renderToStaticMarkup } = requireFromWeb("react-dom/server") as typeof import("react-dom/server");

function renderResourceMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    createElement("div", null, renderMarkdown(markdown, { headingLevelOffset: 1 })),
  );
}

describe("community resource markdown rendering", () => {
  it("leaves the shared renderer hierarchy unchanged unless a surface opts in", () => {
    const markup = renderToStaticMarkup(
      createElement("div", null, renderMarkdown("# Original heading")),
    );

    expect(markup).toContain('<h1 class="md-header">Original heading</h1>');
  });

  it("keeps the lesson title as the only h1 by offsetting authored headings", () => {
    const markup = renderResourceMarkdown("# Section\n\n## Detail\n\n###### Fine print");

    expect(markup).toContain('<h2 class="md-header">Section</h2>');
    expect(markup).toContain('<h3 class="md-header">Detail</h3>');
    expect(markup).toContain('<h6 class="md-header">Fine print</h6>');
    expect(markup).not.toContain("<h1");
  });

  it("preserves nested bullets under numbered steps", () => {
    const markup = renderResourceMarkdown([
      "1. First step",
      "   - First detail",
      "   - Second detail",
      "2. Second step",
    ].join("\n"));

    expect(markup).toContain('<ol class="md-list">');
    expect(markup).toContain('<ul class="md-list">');
    expect(markup).toContain("First detail");
    expect(markup).toContain("Second step");
  });

  it("keeps raw HTML inert", () => {
    const markup = renderResourceMarkdown("Before <script>alert('nope')</script> after");

    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("alert('nope')");
  });
});
