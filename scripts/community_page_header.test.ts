import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);

const { CommunityPageFrame, CommunityPageHeader } = await import("../apps/web/src/components/CommunityPageHeader");

const page = React.createElement(
  CommunityPageHeader,
  { title: "Events", actions: React.createElement("button", null, "New event") },
  React.createElement("div", { className: "classic-row" }, "Events, the old way"),
);

test("the frame owns one header line above the content, and the old title row is gone", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityPageFrame, null, page));
  // The line is the channel header's element, so every page's header matches a channel's.
  // The header line is the first row of the content column, so it lines up with the content.
  expect(html).toMatch(/^<div class="community-page-body"><header class="community-channel-header community-page-header"><\/header><div class="community-tab-scroll">/);
  // The right column's slot follows the content; a page that has nothing for it leaves it empty.
  expect(html).toContain('<aside class="community-page-rail"></aside>');
  expect(html).not.toContain("classic-row");
});

test("a page used outside the frame still shows its own title row", () => {
  expect(renderToStaticMarkup(page)).toContain("classic-row");
});
