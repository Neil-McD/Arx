// @vitest-environment node
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  isPlainLeftClick,
  navigateInternalPolynetPath,
  registerInternalNavigationGuard,
  resolveInternalPolynetPath,
} from "../shared/internalPolynetLink";
import { renderMarkdown } from "../shared/markdownUi";
import { renderTextWithLinks } from "../shared/linkEmbedUi";

describe("internal Polynet link resolution", () => {
  it("recognizes course, lesson, and other in-app Polynet URLs across canonical and same-origin hosts", () => {
    const rashidLessonUrl =
      "https://www.polynet.ai/c/ai-employee-builders/knowledge/rs78j465w9tj4brb7j0w0drt9x8jvg13/m978e4n9b44n2ph4w9cdjvvf3x8jvw93";
    expect(
      resolveInternalPolynetPath(rashidLessonUrl, {
        currentOrigin: "https://www.polynet.ai",
        currentPathname: "/c/ai-employee-builders/knowledge/rs1/m1",
      }),
    ).toBe(
      "/c/ai-employee-builders/knowledge/rs78j465w9tj4brb7j0w0drt9x8jvg13/m978e4n9b44n2ph4w9cdjvvf3x8jvw93",
    );

    // Apex domain resolves cleanly even when viewing on staging/localhost.
    expect(
      resolveInternalPolynetPath("https://polynet.ai/c/builders/knowledge/rs1", {
        currentOrigin: "https://polynet-staging.vercel.app",
        currentPathname: "/c/builders/chat/general",
      }),
    ).toBe("/c/builders/knowledge/rs1");

    // Same-origin preview / dev URLs resolve in-app.
    expect(
      resolveInternalPolynetPath("http://localhost:5174/c/builders/chat/general/root_1?tab=1#top", {
        currentOrigin: "http://localhost:5174",
        currentPathname: "/c/builders/home",
      }),
    ).toBe("/c/builders/chat/general/root_1?tab=1#top");

    // Relative in-app links resolve in-app.
    expect(
      resolveInternalPolynetPath("/c/builders/knowledge/rs2/m9", {
        currentOrigin: "https://www.polynet.ai",
        currentPathname: "/c/builders/knowledge/rs1/m1",
      }),
    ).toBe("/c/builders/knowledge/rs2/m9");

    // Public community join page, Discover, Docs, and Settings resolve in-app.
    expect(resolveInternalPolynetPath("https://www.polynet.ai/c/builders")).toBe("/c/builders");
    expect(resolveInternalPolynetPath("https://www.polynet.ai/discover")).toBe("/discover");
    expect(resolveInternalPolynetPath("https://www.polynet.ai/docs/guides/builder-quickstart")).toBe(
      "/docs/guides/builder-quickstart",
    );
    expect(resolveInternalPolynetPath("https://www.polynet.ai/settings/account")).toBe(
      "/settings/account",
    );
  });

  it("preserves mobile /m prefix on phones and strips /m on desktop", () => {
    expect(
      resolveInternalPolynetPath(
        "https://www.polynet.ai/c/ai-employee-builders/knowledge/rs1/m2",
        {
          currentOrigin: "https://www.polynet.ai",
          currentPathname: "/m/c/ai-employee-builders/knowledge/rs1/m1",
        },
      ),
    ).toBe("/m/c/ai-employee-builders/knowledge/rs1/m2");

    expect(
      resolveInternalPolynetPath(
        "https://www.polynet.ai/m/c/ai-employee-builders/knowledge/rs1/m2",
        {
          currentOrigin: "https://www.polynet.ai",
          currentPathname: "/c/ai-employee-builders/knowledge/rs1/m1",
        },
      ),
    ).toBe("/c/ai-employee-builders/knowledge/rs1/m2");
  });

  it("leaves external sites, static public pages, server routes, and unsafe URLs untouched", () => {
    expect(resolveInternalPolynetPath("https://youtube.com/watch?v=abc")).toBeNull();
    expect(resolveInternalPolynetPath("https://example.com/c/builders/knowledge/rs1")).toBeNull();
    expect(resolveInternalPolynetPath("https://www.polynet.ai/")).toBeNull();
    expect(resolveInternalPolynetPath("https://www.polynet.ai/privacy")).toBeNull();
    expect(resolveInternalPolynetPath("https://www.polynet.ai/terms")).toBeNull();
    expect(resolveInternalPolynetPath("https://www.polynet.ai/ai")).toBeNull();
    expect(resolveInternalPolynetPath("https://www.polynet.ai/api/auth/login")).toBeNull();
    expect(resolveInternalPolynetPath("https://www.polynet.ai/runtime/mcp")).toBeNull();
    expect(resolveInternalPolynetPath("//evil.com/c/builders/knowledge/rs1")).toBeNull();
    expect(resolveInternalPolynetPath("mailto:support@polynet.ai")).toBeNull();
    expect(resolveInternalPolynetPath("javascript:alert(1)")).toBeNull();
  });

  it("only intercepts unmodified primary left clicks", () => {
    expect(isPlainLeftClick({ button: 0 })).toBe(true);
    expect(isPlainLeftClick({ button: 1 })).toBe(false);
    expect(isPlainLeftClick({ button: 0, metaKey: true })).toBe(false);
    expect(isPlainLeftClick({ button: 0, ctrlKey: true })).toBe(false);
    expect(isPlainLeftClick({ button: 0, shiftKey: true })).toBe(false);
    expect(isPlainLeftClick({ button: 0, altKey: true })).toBe(false);
    expect(isPlainLeftClick({ button: 0, defaultPrevented: true })).toBe(false);
  });

  it("honors registered unsaved-changes guards before navigating in-app", async () => {
    let pathname = "/c/builders/knowledge/rs1/m1";
    let popstateCount = 0;
    const prevWindow = globalThis.window;
    const prevPopStateEvent = globalThis.PopStateEvent;
    try {
      (globalThis as unknown as { PopStateEvent: typeof Event }).PopStateEvent = Event;
      (globalThis as unknown as { window: unknown }).window = {
        location: {
          get pathname() {
            return pathname;
          },
          search: "",
          hash: "",
        },
        history: {
          pushState: (_state: unknown, _title: string, next: string) => {
            pathname = next;
          },
        },
        dispatchEvent: () => {
          popstateCount += 1;
          return true;
        },
      };

      const unregister = registerInternalNavigationGuard(async () => false);
      const blocked = await navigateInternalPolynetPath("/c/builders/knowledge/rs2/m9");
      expect(blocked).toBe(false);
      expect(pathname).toBe("/c/builders/knowledge/rs1/m1");
      expect(popstateCount).toBe(0);

      unregister();
      const allowed = await navigateInternalPolynetPath("/c/builders/knowledge/rs2/m9");
      expect(allowed).toBe(true);
      expect(pathname).toBe("/c/builders/knowledge/rs2/m9");
      expect(popstateCount).toBe(1);
    } finally {
      (globalThis as unknown as { window: unknown }).window = prevWindow;
      (globalThis as unknown as { PopStateEvent: unknown }).PopStateEvent = prevPopStateEvent;
    }
  });
});

describe("markdown and chat link rendering for internal vs external URLs", () => {
  it("renders internal Polynet links in markdown without target=_blank while keeping external links in a new tab", () => {
    const internalUrl =
      "https://www.polynet.ai/c/ai-employee-builders/knowledge/rs78j465w9tj4brb7j0w0drt9x8jvg13/m978e4n9b44n2ph4w9cdjvvf3x8jvw93";
    const markup = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        renderMarkdown(
          `See [Module 2](${internalUrl}), [Relative lesson](/c/ai-employee-builders/knowledge/rs2/m5), and [Docs](https://example.com/guide).`,
        ),
      ),
    );

    expect(markup).toContain(
      '<a class="md-link" href="/c/ai-employee-builders/knowledge/rs78j465w9tj4brb7j0w0drt9x8jvg13/m978e4n9b44n2ph4w9cdjvvf3x8jvw93">Module 2</a>',
    );
    expect(markup).toContain(
      '<a class="md-link" href="/c/ai-employee-builders/knowledge/rs2/m5">Relative lesson</a>',
    );
    expect(markup).toContain(
      '<a class="md-link" href="https://example.com/guide" target="_blank" rel="noreferrer">Docs</a>',
    );
  });

  it("renders internal Polynet links in chat/DMs without target=_blank while keeping external URLs in a new tab", () => {
    const internalUrl =
      "https://www.polynet.ai/c/ai-employee-builders/knowledge/rs78j465w9tj4brb7j0w0drt9x8jvg13/m978e4n9b44n2ph4w9cdjvvf3x8jvw93";
    const markup = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        renderTextWithLinks(`Check ${internalUrl} and https://example.com/resource`),
      ),
    );

    expect(markup).toContain(
      `<a class="chat-link" href="/c/ai-employee-builders/knowledge/rs78j465w9tj4brb7j0w0drt9x8jvg13/m978e4n9b44n2ph4w9cdjvvf3x8jvw93">${internalUrl}</a>`,
    );
    expect(markup).toContain(
      '<a class="chat-link" href="https://example.com/resource" target="_blank" rel="noreferrer noopener">https://example.com/resource</a>',
    );
  });
});
