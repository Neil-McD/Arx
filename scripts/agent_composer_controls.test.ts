import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { CommunityComposerControls } from "../apps/web/src/components/CommunityComposerControls";
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = requireWeb("react") as typeof import("react");
const { renderToStaticMarkup } = requireWeb("react-dom/server") as typeof import("react-dom/server");
const base = { contextKey: "test", groupLabel: "Message tools", attachLabel: "Attach images", toolsDisabled: false, attachDisabled: false, onAttach: () => {}, voiceControl: null, sendControl: null };
test("agent controls omit emoji and mentions when those capabilities are absent", () => {
  const html = renderToStaticMarkup(createElement(CommunityComposerControls, base));
  expect(html).toContain("Attach images");
  expect(html).not.toContain("Add emoji");
  expect(html).not.toContain("ask-mention");
});
test("channel controls retain emoji and mentions", () => {
  const html = renderToStaticMarkup(createElement(CommunityComposerControls, { ...base, onMention: () => {}, mentionLabel: "Mention someone", onEmoji: () => {} }));
  expect(html).toContain("Add emoji");
  expect(html).toContain("Mention someone");
});
