import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { CommunityNav } = await import("../shared/CommunityNav");
const { WebAccountMenu } = await import("../apps/web/src/components/WebAccountMenu");

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
