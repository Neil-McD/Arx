// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

vi.mock("katex/dist/katex.min.css", () => ({}));

import { renderMarkdown } from "../shared/markdownUi";
import { WebCommunityResourceViewerContent } from "../apps/web/src/components/WebCommunityResourceViewerContent";
import type { CommunityResource } from "../apps/web/src/components/communityResourcesContracts";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = requireFromWeb("react") as typeof import("react");
const { renderToStaticMarkup } = requireFromWeb("react-dom/server") as typeof import("react-dom/server");

function renderResourceMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    createElement("div", null, renderMarkdown(markdown, { headingLevelOffset: 1 })),
  );
}

describe("community resource markdown rendering", () => {
  it("keeps a numbered list's number when it picks up after a paragraph", () => {
    const markup = renderResourceMarkdown("1. First question?\n\nSome answers\n\n2. Second question?");
    expect(markup).toContain('<ol class="md-list" start="2">');
    expect(markup).not.toContain('start="1"');
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

  it("plays a lesson's video from its lesson fields when the page has no link", () => {
    const resource: CommunityResource = {
      id: "lesson-3",
      module_id: "course-1",
      directory_uri: "community://resources/lesson-3",
      directory_path: "/lesson-3",
      type: "post",
      resource_role: "page",
      resource_status: "published",
      title: "Video from the board",
      body_md: "Lesson body",
      url: null,
      lesson: { kind: "video", video_url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
      pinned: false,
      sort_order: 0,
      created_at: "2026-08-11T00:00:00.000Z",
    };
    const markup = renderToStaticMarkup(
      createElement(WebCommunityResourceViewerContent, { resource }),
    );

    expect(markup).toContain('data-community-youtube-embed="M7lc1UVf-VE"');
    expect(markup).toContain("Watch on YouTube");
  });

  it("shows a lesson checklist inside a slide note as the checklist, not code", () => {
    const resource: CommunityResource = {
      id: "lesson-2",
      module_id: "course-1",
      directory_uri: "community://resources/lesson-2",
      directory_path: "/lesson-2",
      type: "post",
      resource_role: "page",
      resource_status: "published",
      title: "Deck with a checklist",
      body_md: "## Slides\n\n![First](https://example.com/1.png)\n\nTick these off:\n\n```checklist steps\n- [ ] Open the terminal\n```",
      lesson: { kind: "build" },
      pinned: false,
      sort_order: 0,
      created_at: "2026-08-11T00:00:00.000Z",
    };
    const progress = {
      statusByRef: {}, responsesByRef: {}, loaded: true, error: null,
      setStatus: () => {}, answer: async () => ({ ok: true }) as never,
    };
    const markup = renderToStaticMarkup(
      createElement(WebCommunityResourceViewerContent, {
        resource,
        lessonActivity: { progress, signedIn: true, onRequireSignIn: () => {}, forms: null },
      }),
    );

    expect(markup).toContain("lesson-slide-deck-note");
    expect(markup).toContain("lesson-element--checklist");
    expect(markup).toContain("Open the terminal");
    expect(markup).not.toContain("language-checklist");
  });
  it("shows a callout's typed title and icon, never its type's name", () => {
    const titled = renderResourceMarkdown("> [!TIP] One tool first\n> Connect one tool before the next.");
    expect(titled).toContain('class="md-callout is-tip"');
    expect(titled).toContain('<p class="md-callout-title">One tool first</p>');
    expect(titled).toContain("Connect one tool before the next.");
    expect(titled).not.toContain("[!TIP]");
    expect(titled).not.toContain(">Tip<");
    const untitled = renderResourceMarkdown("> [!WARNING]\n> Keys stay out of the chat.");
    expect(untitled).not.toContain("md-callout-title");
    expect(untitled).not.toContain(">Warning<");
    expect(untitled).toContain("Keys stay out of the chat.");
  });
});
