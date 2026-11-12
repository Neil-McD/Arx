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

// The kit's section labels (hashed CSS Module class names, the mock's .lab).
function labels(html: string): string[] {
  return [...html.matchAll(/<span class="_lab_[^"]*">([^<]+)<\/span>/g)].map((match) => match[1]);
}

test("design v1: the channel panel is the mock's: pinned, memory, then who is here", () => {
  design.v1 = true;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, props));
  expect(labels(html)).toEqual(["Pinned", "Memory from this channel", "In this channel"]);
  expect(html).toContain("How to post a win");
  expect(html).toContain("4 here now");
  expect(html).toContain("Everyone");
  // The long member list and the agents list are not in the short panel.
  expect(html).not.toContain("community-context-members");
  expect(html).not.toContain("Agents");
});

test("design v1: nothing pinned, no Pinned section", () => {
  design.v1 = true;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, pinned: null }));
  expect(labels(html)).toEqual(["Memory from this channel", "In this channel"]);
});

test("design v1: an open thread takes the panel's place", () => {
  design.v1 = true;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, memberDetailOpen: true }));
  expect(html).toMatch(/<aside class="community-context-panel channel-roster-panel is-v1 is-kit"[^>]*style="display:none"/);
});

test("the classic panel is unchanged", () => {
  design.v1 = false;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, props));
  expect(html).not.toContain("channel-rail-label");
  expect(html).toContain("community-context-members");
  expect(html).toContain("Kiln");
});

test("design v1: a thread names itself and its channel, and has a close button", async () => {
  const { CommunityThreadHeader } = await import("../apps/web/src/components/CommunityThreadHeader");
  const html = renderToStaticMarkup(React.createElement(CommunityThreadHeader, { channelName: "wins", onClose: () => {} }));
  expect(html).toContain('<h2 class="community-thread-title">Thread<span> · #wins</span></h2>');
  expect(html).toMatch(/<button class="community-thread-close"[^>]*aria-label="Close thread"/);
  const bare = renderToStaticMarkup(React.createElement(CommunityThreadHeader, { onClose: () => {} }));
  expect(bare).toContain('<h2 class="community-thread-title">Thread</h2>');
});

test("design v1: asking for members shows the Members page, not a pop-up", () => {
  design.v1 = true;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, narrowOpen: true, onCloseNarrow: () => {} }));
  // A member gets the kit directory (who is here, what they shared); the
  // person they open is the right column.
  expect(html).toContain('<section class="members-page is-kit" aria-label="Community members">');
  expect(html).toContain('class="community-context-panel members-page-record"');
  expect(html).not.toContain("modal-overlay");
  // The short channel panel steps aside for it.
  expect(html).not.toContain("channel-rail-label");
});

test("design v1: people who manage members get the table and the record", () => {
  design.v1 = true;
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, {
    ...props, narrowOpen: true, memberSettings: { ...props.memberSettings, canManageMembers: true } }));
  expect(html).toContain('class="members-page is-kit"');
  expect(html).toContain('aria-label="Member record"');
});

test("design v1: a thread names itself and its channel, and has a close button", async () => {
  const { CommunityThreadHeader } = await import("../apps/web/src/components/CommunityThreadHeader");
  const html = renderToStaticMarkup(React.createElement(CommunityThreadHeader, { channelName: "wins", onClose: () => {} }));
  expect(html).toContain('<h2 class="community-thread-title">Thread<span> · #wins</span></h2>');
  expect(html).toMatch(/<button class="community-thread-close"[^>]*aria-label="Close thread"/);
  const bare = renderToStaticMarkup(React.createElement(CommunityThreadHeader, { onClose: () => {} }));
  expect(bare).toContain('<h2 class="community-thread-title">Thread</h2>');
});

