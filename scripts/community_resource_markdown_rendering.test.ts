// @vitest-environment node

import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("katex/dist/katex.min.css", () => ({}));
vi.mock("highlight.js/styles/github-dark.css", () => ({}));

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const requireFromRoot = createRequire(import.meta.url);
if (requireFromWeb.resolve("react") !== requireFromRoot.resolve("react")) {
  vi.doMock(requireFromWeb.resolve("react"), () => React);
}

const { loadMarkdownHighlight, loadMarkdownMath, renderMarkdown } = await import("../shared/markdownUi");
const { PublicFrame } = await import("../apps/web/src/components/polynetLanding/ConversionLanding");
const { WebCommunityResourceViewerContent } = await import("../apps/web/src/components/WebCommunityResourceViewerContent");
import type { CommunityResource } from "../apps/web/src/components/communityResourcesContracts";

const { createElement } = React;

function renderResourceMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    createElement("div", null, renderMarkdown(markdown, { headingLevelOffset: 1 })),
  );
}

describe("deferred markdown math and syntax highlighting", () => {
  it("renders plain code blocks and fallback math before deferred modules load, then highlights and formats after resolution", async () => {
    const preCodeMarkup = renderResourceMarkdown("```ts\nconst answer = 42;\n```");
    expect(preCodeMarkup).toContain("const answer = 42;");
    expect(preCodeMarkup).not.toContain("hljs-keyword");

    const preMathMarkup = renderResourceMarkdown("Before $a +\nb$ after");
    expect(preMathMarkup).toContain("Before");
    expect(preMathMarkup).not.toContain('class="katex"');

    await Promise.all([loadMarkdownHighlight(), loadMarkdownMath()]);

    const postCodeMarkup = renderResourceMarkdown("```ts\nconst answer = 42;\n```");
    expect(postCodeMarkup).toContain("hljs-keyword");

    const postMathMarkup = renderResourceMarkdown("Before $a +\nb$ after");
    expect(postMathMarkup).toContain('class="katex"');
    expect(postMathMarkup).toContain("Before");
    expect(postMathMarkup).toContain("after");
  });

  it("links the public landing footer directly to standalone /privacy and /terms pages", () => {
    const markup = renderToStaticMarkup(
      createElement(PublicFrame, { onJoin: () => undefined }, createElement("p", null, "Body")),
    );
    expect(markup).toContain('href="/privacy"');
    expect(markup).toContain('href="/terms"');
    expect(markup).not.toContain("polynet-onboarding-legal-modal");
  });
});

describe("community resource markdown rendering", () => {
  beforeAll(async () => {
    await loadMarkdownMath();
  });

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

  it("renders inline fractions and display equations without losing surrounding content", () => {
    const markup = renderResourceMarkdown("Before $\\frac{1}{2}$ after\n\n$$\nx^2 + y^2 = z^2\n$$");

    expect(markup).toContain('class="katex"');
    expect(markup).toContain('class="katex-display"');
    expect(markup).toContain("<mfrac>");
    expect(markup).not.toContain('class="katex-error"');
    expect(markup).toContain("Before");
    expect(markup).toContain("after");
  });

  it("keeps malformed math local to the expression instead of breaking the resource", () => {
    const markup = renderResourceMarkdown("Before $\\frac{$ after");

    expect(markup).toContain('class="katex-error"');
    expect(markup).toContain("Before");
    expect(markup).toContain("after");
  });

  it("does not activate unsafe links or external image commands in math", () => {
    const markup = renderResourceMarkdown("$\\href{javascript:alert(1)}{click}$\n\n$\\includegraphics{https://example.com/untrusted.png}$");

    expect(markup).not.toMatch(/href=["']javascript:/i);
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<script");
  });

  it.each([
    ["root", createRequire(new URL("../package.json", import.meta.url))],
    ["web", requireFromWeb],
  ])("%s KaTeX does not inherit trust from the options prototype", (_graph, load) => {
    const katex = load("katex") as typeof import("katex");
    const expression = "\\href{https://example.com/allowed-only-with-trust}{link}";
    const inheritedOptions = Object.create({ trust: true });

    expect(katex.renderToString(expression, inheritedOptions)).not.toContain("<a ");
    expect(katex.renderToString(expression, { trust: true })).toContain("<a ");
  });

  it("defers the native lesson player until layout and viewport are known", () => {
    const resource: CommunityResource = {
      id: "lesson-1",
      module_id: "course-1",
      directory_uri: "community://resources/lesson-1",
      directory_path: "/lesson-1",
      type: "link",
      resource_role: "page",
      resource_status: "published",
      title: "Fast lesson switching",
      body_md: "Lesson body",
      url: "https://youtu.be/M7lc1UVf-VE?t=42",
      pinned: false,
      sort_order: 0,
      created_at: "2026-08-11T00:00:00.000Z",
    };
    const markup = renderToStaticMarkup(
      createElement(WebCommunityResourceViewerContent, { resource }),
    );

    expect(markup).toContain('data-community-youtube-embed="M7lc1UVf-VE"');
    expect(markup).not.toContain("i.ytimg.com");
    expect(markup).toContain("Watch on YouTube");
    expect(markup).not.toContain("<iframe");
  });
});

describe("markdown pieces stay the same between draws", () => {
  const pieces = (node: unknown) => (node as { props: { components: unknown } }).props.components;

  it("uses one set of components for the same options, so text is not rebuilt on every redraw", () => {
    expect(pieces(renderMarkdown("one"))).toBe(pieces(renderMarkdown("two")));
    expect(pieces(renderMarkdown("one", { headingLevelOffset: 1, embedStandaloneMedia: true })))
      .toBe(pieces(renderMarkdown("two", { headingLevelOffset: 1, embedStandaloneMedia: true })));
  });

  it("keeps different options and copy handlers apart", () => {
    const copy = () => undefined;
    expect(pieces(renderMarkdown("one"))).not.toBe(pieces(renderMarkdown("one", { headingLevelOffset: 1 })));
    expect(pieces(renderMarkdown("one"))).not.toBe(pieces(renderMarkdown("one", { onCopyCode: copy })));
    expect(pieces(renderMarkdown("one", { onCopyCode: copy }))).toBe(pieces(renderMarkdown("two", { onCopyCode: copy })));
  });
});
