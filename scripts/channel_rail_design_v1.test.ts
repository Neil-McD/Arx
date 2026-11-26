import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);

const { ChannelRosterPanel, CommunityMembersPagePanel } = await import("../apps/web/src/components/ChannelRosterPanel");

const props = {
  communityName: "Kiln",
  presenceSummary: { online_count: 4, online_count_capped: false, online_faces: [] } as any,
  canManageMembers: false,
  getAvatarColor: () => "#000",
  getInitials: (name: string) => name.slice(0, 1),
  pinned: { label: "How to post a win", author: "Maya Chen", at: null, title: "How to post a win", excerpt: "Say what you sent, the grade, and one thing that made it go.", onOpen: () => {} },
};

// The kit's section labels (hashed CSS Module class names, the mock's .lab).
function labels(html: string): string[] {
  return [...html.matchAll(/<span class="_lab_[^"]*">([^<]+)/g)].map((match) => match[1]);
}

// No notes here: they are the guide's memory, kept by builders in Knowledge
// (Neil, Nov 14), not something a channel lists.
test("design v1: the channel panel is what it is for, its pinned post, then who is here; no notes, no summary", () => {
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, channelDescription: "Share what you sent this week." }));
  expect(labels(html)).toEqual(["About", "Pinned", "Here"]);
  expect(html).toContain("Share what you sent this week.");
  expect(html).not.toContain("Memory");
  expect(html).not.toContain("Your guide");
  // The pinned post is a card: who posted it, its title and how it starts.
  expect(html).toContain('aria-label="Open the pinned post by Maya Chen"');
  expect(html).toContain("How to post a win");
  expect(html).toContain("one thing that made it go");
  // The feed drops its own pinned card only while this one is shown.
  expect(html).toContain("kit-channel-rail has-pinned");
  // Only the people who run the channel can take the pin off.
  expect(html).not.toContain("Unpin");
  expect(renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, pinned: { ...props.pinned, onUnpin: () => {} } }))).toContain("Unpin");
  expect(html).toContain("4 here now");
  expect(html).toContain("Everyone");
  // The long member list and the agents list are not in the short panel.
  expect(html).not.toContain("community-context-members");
  expect(html).not.toContain("Agents");
});

test("design v1: nothing pinned, no Pinned section", () => {
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, pinned: null }));
  // No description either: the panel is just who is here.
  expect(labels(html)).toEqual(["Here"]);
  expect(html).not.toContain("has-pinned");
});

test("design v1: an open thread takes the panel's place", () => {
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, memberDetailOpen: true }));
  expect(html).toMatch(/<aside class="community-context-panel channel-roster-panel is-v1 is-kit"[^>]*style="display:none"/);
});

test("design v1: a thread names itself and its channel, and has a close button", async () => {
  const { CommunityThreadHeader } = await import("../apps/web/src/components/CommunityThreadHeader");
  const html = renderToStaticMarkup(React.createElement(CommunityThreadHeader, { channelName: "wins", onClose: () => {} }));
  expect(html).toContain('<h2 class="community-thread-title">Thread<span> · #wins</span></h2>');
  expect(html).toMatch(/<button class="community-thread-close"[^>]*aria-label="Close thread"/);
  const bare = renderToStaticMarkup(React.createElement(CommunityThreadHeader, { onClose: () => {} }));
  expect(bare).toContain('<h2 class="community-thread-title">Thread</h2>');
});

test("design v1: the Members page draws the directory, with no channel around it", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityMembersPagePanel, props));
  // A member gets the kit directory (who is here, what they shared); the
  // person they open is the right column.
  expect(html).toContain('<section class="members-page is-kit" aria-label="Community members">');
  expect(html).toContain('class="community-context-panel members-page-record"');
  expect(html).not.toContain("modal-overlay");
  expect(html).not.toContain("channel-rail-label");
});

test("design v1: beside a channel, asking for members never draws them over the channel", () => {
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, { ...props, narrowOpen: true, onCloseNarrow: () => {} }));
  // The page is its own address now; the channel's panel stays the panel.
  expect(html).not.toContain("members-page");
  expect(html).not.toContain("modal-overlay");
});

test("design v1: people who manage members get the table and the record", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityMembersPagePanel, {
    ...props, canManageMembers: true }));
  // The host's page is fetched on demand: its place is held while it loads.
  expect(html).toContain('class="members-page is-kit"');
  expect(html).toContain('aria-label="Member record"');
});

test("design v1: the host's Members page is a toolbar and a table, with nobody opened", async () => {
  const { KitMembersPage } = await import("../apps/web/src/v1/KitMembersPage");
  const html = renderToStaticMarkup(React.createElement(KitMembersPage, {
    communityName: "Kiln", joinRequests: [{ id: "r", userId: "u", displayName: "Kai", avatarUrl: null, message: null, createdAtLabel: "today" }],
    decidingJoinRequestId: null, onApprove: () => {}, onDecline: () => {}, currentUserId: null, recordContainer: null,
    getAvatarColor: () => "#000", getInitials: (name: string) => name.slice(0, 1) }));
  expect(html).toContain('class="members-page is-kit"');
  expect(html).not.toContain("has-picked");
  expect(html).toContain('aria-label="Search members by name"');
  expect(html).toContain("One person is waiting to join");
  expect(html).toContain("Review");
});

test("design v1: a thread names itself and its channel, and has a close button", async () => {
  const { CommunityThreadHeader } = await import("../apps/web/src/components/CommunityThreadHeader");
  const html = renderToStaticMarkup(React.createElement(CommunityThreadHeader, { channelName: "wins", onClose: () => {} }));
  expect(html).toContain('<h2 class="community-thread-title">Thread<span> · #wins</span></h2>');
  expect(html).toMatch(/<button class="community-thread-close"[^>]*aria-label="Close thread"/);
  const bare = renderToStaticMarkup(React.createElement(CommunityThreadHeader, { onClose: () => {} }));
  expect(bare).toContain('<h2 class="community-thread-title">Thread</h2>');
});

