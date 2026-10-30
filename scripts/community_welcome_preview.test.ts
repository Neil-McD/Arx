// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

vi.mock("katex/dist/katex.min.css", () => ({}));

import { WelcomeScreenView, skippableScreen } from "../apps/web/src/components/WebCommunityWelcome";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = requireFromWeb("react") as typeof import("react");
const { renderToStaticMarkup } = requireFromWeb("react-dom/server") as typeof import("react-dom/server");

const screens = [
  { blocks: [{ type: "text" as const, markdown: "Glad you're **here**." }], step: null },
  { blocks: [{ type: "text" as const, markdown: "About you" }, { type: "form" as const, formKey: "intake" }], step: { type: "form" as const, formKey: "intake" } },
];
const render = (index: number, headingLevel?: number) => renderToStaticMarkup(createElement(WelcomeScreenView, {
  title: "Welcome to the 2-Hour Club", screens, index, headingLevel, onNext: () => {},
  renderStep: (step) => createElement("div", { "data-step": step.type === "form" ? step.formKey : step.resourceId }),
}));

describe("welcome page screens", () => {
  it("opens with the headline, a level down when it sits under Settings' Preview heading, and a Next for a screen without a step", () => {
    const markup = render(0, 3);
    expect(markup).toContain('<h1 tabindex="-1" aria-level="3">Welcome to the 2-Hour Club</h1>');
    expect(markup).toContain("<strong>here</strong>");
    expect(markup).toContain("Step 1 of 2");
    expect(markup).toContain(">Next</button>");
  });

  it("shows a later screen's words and its step where it was placed, with no Next of its own", () => {
    const markup = render(1);
    expect(markup).not.toContain("<h1");
    expect(markup).toContain("Step 2 of 2");
    expect(markup.indexOf("About you")).toBeLessThan(markup.indexOf('data-step="intake"'));
    expect(markup).not.toContain(">Next</button>");
  });

  it("offers Skip for now only on a setup screen (one with a choice), and only where the page can skip", () => {
    const setup = { blocks: [{ type: "choice" as const, prompt: "Which app?", options: [{ label: "Claude", hint: "", markdown: "steps", icon: "https://example.com/c.svg" }] }], step: null };
    expect(skippableScreen(setup)).toBe(true);
    expect(skippableScreen(screens[0])).toBe(false);
    expect(skippableScreen(screens[1])).toBe(false);
    const markup = (onSkip?: () => void) => renderToStaticMarkup(createElement(WelcomeScreenView, {
      title: "Welcome", screens: [setup, ...screens], index: 0, onNext: () => {}, onSkip, renderStep: () => null,
    }));
    expect(markup(() => {})).toContain("Skip for now");
    expect(markup(() => {})).toContain("community-welcome-choice-icon-mark");
    expect(markup()).not.toContain("Skip for now");
  });
});
