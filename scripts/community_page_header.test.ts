import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);

const design = { v1: true };
vi.doMock("../shared/designSystem", () => ({ isDesignV1Active: () => design.v1 }));
const { CommunityPageFrame, CommunityPageHeader } = await import("../apps/web/src/components/CommunityPageHeader");

const page = React.createElement(
  CommunityPageHeader,
  { title: "Events", actions: React.createElement("button", null, "New event") },
  React.createElement("div", { className: "classic-row" }, "Events, the old way"),
);

test("classic: the frame is the old wrapper and the page keeps its own title row", () => {
  design.v1 = false;
  const html = renderToStaticMarkup(React.createElement(CommunityPageFrame, null, page));
  expect(html).toBe('<div class="community-tab-scroll"><div class="web-community-centered-pane"><div class="classic-row">Events, the old way</div></div></div>');
});

test("design v1: the frame owns one header line above the content, and the old title row is gone", () => {
  design.v1 = true;
  const html = renderToStaticMarkup(React.createElement(CommunityPageFrame, null, page));
  // The line is the channel header's element, so every page's header matches a channel's.
  // The header line is the first row of the content column, so it lines up with the content.
  // Then the right column's panel button (shown only on narrower windows, by CSS).
  expect(html).toMatch(/^<div class="community-page-body"><header class="community-channel-header community-page-header"><\/header><div class="community-page-rail-toggle"><button type="button" class="right-column-toggle"[\s\S]*?<\/button><\/div><div class="community-tab-scroll">/);
  // The right column's slot follows the content; a page that has nothing for it leaves it empty.
  expect(html).toContain('<aside class="community-page-rail"></aside>');
  expect(html).not.toContain("classic-row");
});

test("design v1: a page used outside the frame still shows its own title row", () => {
  design.v1 = true;
  expect(renderToStaticMarkup(page)).toContain("classic-row");
});
