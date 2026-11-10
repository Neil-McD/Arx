import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);

const design = { v1: true };
vi.doMock("../shared/designSystem", () => ({ isDesignV1Active: () => design.v1 }));
const { ChannelRosterPanel } = await import("../apps/web/src/components/ChannelRosterPanel");

const props = {
  communityName: "Kiln",
  presenceSummary: { online_count: 4, online_count_capped: false, online_faces: [] } as any,
  memberSettings: {} as any,
  getAvatarColor: () => "#000",
  getInitials: (name: string) => name.slice(0, 1),
  pinned: { label: "How to post a win", onOpen: () => {} },
};

function labels(html: string): string[] {
  return [...html.matchAll(/<h3 class="channel-rail-label">([^<]+)<\/h3>/g)].map((match) => match[1]);
}

test("design v1: the channel panel is pinned, notes, then who is here", () => {
  design.v1 = true;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, props));
  expect(labels(html)).toEqual(["Pinned", "Community notes", "In this channel"]);
  expect(html).toContain("How to post a win");
  expect(html).toContain("4 here now");
  expect(html).toContain("View all");
  // The long member list and the agents list are not in the short panel.
  expect(html).not.toContain("community-context-members");
  expect(html).not.toContain("Agents");
});

test("design v1: nothing pinned, no Pinned section", () => {
  design.v1 = true;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, pinned: null }));
  expect(labels(html)).toEqual(["Community notes", "In this channel"]);
});

test("design v1: an open thread takes the panel's place", () => {
  design.v1 = true;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, memberDetailOpen: true }));
  expect(html).toMatch(/<aside class="community-context-panel channel-roster-panel is-v1"[^>]*style="display:none"/);
});

test("the classic panel is unchanged", () => {
  design.v1 = false;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, props));
  expect(html).not.toContain("channel-rail-label");
  expect(html).toContain("community-context-members");
  expect(html).toContain("Kiln");
});
