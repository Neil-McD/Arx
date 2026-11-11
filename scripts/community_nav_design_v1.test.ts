import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { CommunityNav } = await import("../shared/CommunityNav");
const { WebAccountMenu } = await import("../apps/web/src/components/WebAccountMenu");
const { WebCommunitySwitcher } = await import("../apps/web/src/components/WebCommunitySwitcher");

const baseProps = {
  activeCommunity: { name: "Test" },
  communityTab: "chat" as const,
  canViewMembersActiveCommunity: false,
  canViewActiveCommunitySettings: false,
  canManageMembersActiveCommunity: false,
  canViewActiveCommunityAnalytics: false,
  onSelectTab: () => {},
  channels: [{ id: "c1", slug: "general", name: "general", is_general: true, position: 0 }],
};

function labelsInOrder(html: string): string[] {
  return [...html.matchAll(/<span class="nav-item-label">([^<]+)<\/span>|<div class="community-nav-section-label">([^<]+)<\/div>/g)]
    .map((match) => match[1] ?? match[2]);
}

test("the classic left column is unchanged: channels, then Agent, Knowledge and Events", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityNav, baseProps));
  expect(labelsInOrder(html)).toEqual(["general", "Agent", "Knowledge", "Events"]);
  expect(html).not.toContain("community-nav-account");
});

test("design v1 puts Home first and labels Channels and Community", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityNav, {
    ...baseProps,
    layout: "v1",
    accountSlot: React.createElement("span", { "data-testid": "account" }, "account"),
  }));
  expect(labelsInOrder(html)).toEqual(["Home", "Channels", "general", "Community", "Knowledge", "Events"]);
  expect(html).not.toContain(">Agent<");
  expect(html).toMatch(/<button[^>]*title="Home"/);
  expect(html).toContain('<div class="community-nav-account"><span data-testid="account">account</span></div>');
});

test("Home is today's agent page, selected on that tab", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityNav, { ...baseProps, layout: "v1", communityTab: "agent" as const }));
  expect(html).toMatch(/<button class="nav-item active"[^>]*title="Home"/);
});

test("the account row names the person and their role, with the menu closed", () => {
  const html = renderToStaticMarkup(React.createElement(WebAccountMenu, {
    name: "Maya Chen",
    avatarUrl: null,
    roleLabel: "Member",
    appTheme: "dark",
    onSetAppTheme: () => {},
    onOpenSettings: () => {},
    onSignOut: async () => {},
  }));
  expect(html).toContain("Maya Chen");
  expect(html).toContain("Member");
  expect(html).toContain('aria-haspopup="menu"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('role="menu"');
  expect(html).toContain(">M<");
});

const hostProps = {
  ...baseProps,
  layout: "v1" as const,
  canViewMembersActiveCommunity: true,
  canViewActiveCommunitySettings: true,
  canManageMembersActiveCommunity: true,
  canViewActiveCommunityAnalytics: true,
  onOpenInbox: () => {},
  inboxUnreadCount: 4,
  onOpenMembers: () => {},
  memberCount: 214,
  identitySlot: React.createElement("span", { "data-testid": "switcher" }, "switcher"),
};

test("design v1 adds Inbox under Home and Members under Events, with their counts", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityNav, hostProps));
  expect(labelsInOrder(html)).toEqual([
    "Home", "Inbox", "Channels", "general", "Community", "Knowledge", "Events", "Members", "Manage",
  ]);
  expect(html).toContain('<span class="nav-item-count" aria-label="4 unread">4</span>');
  expect(html).toContain('<span class="nav-item-hint">214</span>');
  // The direct messages panel closes on outside clicks but spares this class,
  // so pressing Inbox again closes it instead of closing and reopening.
  expect(html).toMatch(/<button class="nav-item community-nav-inbox"[^>]*title="Inbox"/);
});

test("design v1 swaps the name and settings gear for the switcher; Manage opens settings", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityNav, hostProps));
  expect(html).toContain('<span data-testid="switcher">switcher</span>');
  expect(html).not.toContain("community-nav-settings");
  expect(html).not.toContain("community-nav-identity-name");
  expect(html).toMatch(/<button class="nav-item"[^>]*title="Manage"/);
});

test("the foot is the mock's Your guide and Manage; Analytics moves to the account menu", () => {
  let items: Array<{ key: string; label: string }> = [];
  const html = renderToStaticMarkup(React.createElement(CommunityNav, {
    ...hostProps,
    onOpenGuide: () => {},
    accountSlot: (communityItems: Array<{ key: string; label: string }>) => {
      items = communityItems;
      return React.createElement("span", null, "account");
    },
  }));
  const labels = labelsInOrder(html);
  expect(labels.slice(-2)).toEqual(["Your guide", "Manage"]);
  expect(labels).not.toContain("Analytics");
  expect(items.map((item) => item.key)).toContain("analytics");
});

test("a member sees no host rows, and Members only when they may see members", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityNav, {
    ...baseProps,
    layout: "v1" as const,
    onOpenInbox: () => {},
    onOpenMembers: () => {},
  }));
  expect(labelsInOrder(html)).toEqual(["Home", "Inbox", "Channels", "general", "Community", "Knowledge", "Events"]);
  expect(html).not.toContain("nav-item-count");
});

test("the classic column keeps its gear and gains none of the v1 rows", () => {
  const html = renderToStaticMarkup(React.createElement(CommunityNav, { ...hostProps, layout: "classic" as const }));
  expect(html).toContain("community-nav-settings");
  expect(html).not.toContain(">Inbox<");
  expect(html).not.toContain(">Manage<");
  expect(html).not.toContain('data-testid="switcher"');
});

test("the switcher names the community, closed, and flags news elsewhere", () => {
  const communities = [
    { id: "a", slug: "kiln", name: "Kiln", avatar_url: null },
    { id: "b", slug: "de", name: "Distribution Engineer", avatar_url: null },
  ];
  const props = {
    activeCommunityName: "Kiln",
    communities,
    selectedCommunitySlug: "kiln",
    attentionById: { b: true } as Record<string, boolean>,
    onSelectCommunity: () => {},
    onOpenDiscover: () => {},
    onCreateCommunity: () => {},
  };
  const html = renderToStaticMarkup(React.createElement(WebCommunitySwitcher, props));
  expect(html).toContain("Kiln");
  expect(html).toContain('aria-haspopup="menu"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('role="menu"');
  expect(html).toContain("community-switcher-news");
  // News in the community you are already in is not "elsewhere".
  const quiet = renderToStaticMarkup(React.createElement(WebCommunitySwitcher, { ...props, attentionById: { a: true } }));
  expect(quiet).not.toContain("community-switcher-news");
});

test("design v1 words the add row 'Add a channel'; classic keeps 'Add Channel'", () => {
  const host = { ...baseProps, canManageMembersActiveCommunity: true, onCreateChannel: async () => true };
  expect(renderToStaticMarkup(React.createElement(CommunityNav, { ...host, layout: "v1" as const }))).toContain(">Add a channel<");
  expect(renderToStaticMarkup(React.createElement(CommunityNav, host))).toContain(">Add Channel<");
});
