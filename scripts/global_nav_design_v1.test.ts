import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { WebGlobalNavV1 } = await import("../apps/web/src/components/WebGlobalNavV1");

const communityShell = {
  railCommunities: [
    { id: "a", slug: "kiln", name: "Kiln", avatar_url: null },
    { id: "b", slug: "de", name: "Distribution Engineer", avatar_url: null },
  ],
  communityRailAttentionById: { b: true },
  canOpenDirectMessages: true,
  isDirectMessagesOpen: false,
  directMessagesUnreadCount: 2,
  onToggleDirectMessages: () => {},
  onSelectActiveCommunity: () => true,
  onOpenCommunityChat: () => {},
  onOpenDiscover: () => {},
  onOpenCommunityCreateCta: () => {},
  account: {
    name: "Maya Chen", avatarUrl: null, roleLabel: "Member", appTheme: "dark",
    onSetAppTheme: () => {}, onOpenSettings: () => {}, onSignOut: async () => {},
  },
} as any;
const settingsSidebar = { showMobileSettingsShell: false, isGlobalSettings: true, settingsGroup: "account", onSelectPage: () => {} } as any;

function rows(html: string): string[] {
  return [...html.matchAll(/<button class="nav-item[^"]*"[^>]*title="([^"]+)"/g)].map((match) => match[1]);
}

test("Discover's left column: Discover, Inbox, your communities, start one, your account", () => {
  const html = renderToStaticMarkup(React.createElement(WebGlobalNavV1, {
    mode: "discover", communityShell, settingsSidebar, onBackFromSettings: () => {},
  }));
  expect(rows(html)).toEqual(["Discover", "Inbox", "Kiln", "Distribution Engineer", "Start a community"]);
  expect(html).toContain('<div class="community-nav-section-label">Your communities</div>');
  expect(html).toContain('aria-label="2 unread"');
  expect((html.match(/nav-item-dot/g) ?? []).length).toBe(1);
  expect(html).toContain("Maya Chen");
});

test("Settings' left column: Back, your own sections with the open one marked, then the community's by role", () => {
  const html = renderToStaticMarkup(React.createElement(WebGlobalNavV1, {
    mode: "settings", communityShell, settingsSidebar, onBackFromSettings: () => {},
  }));
  // No community open: only your own sections.
  expect(rows(html)).toEqual(["Back", "Profile", "Account", "Billing", "Appearance"]);
  expect(html).toContain('<div class="community-nav-section-label">You</div>');
  expect(html).toMatch(/<button class="nav-item active"[^>]*title="Account"[^>]*aria-current="page"/);
  expect(html).not.toContain("Your communities");
  // A host: the community's sections under its name; the owner's are the owner's.
  const inCommunity = { ...communityShell, activeCommunity: { id: "a", slug: "kiln", name: "Kiln" }, canViewActiveCommunitySettings: true, onOpenCommunitySettingsPane: () => {} };
  const owner = renderToStaticMarkup(React.createElement(WebGlobalNavV1, {
    mode: "settings", settingsSidebar, onBackFromSettings: () => {},
    communityShell: { ...inCommunity, canManageMembersActiveCommunity: true, isActiveCommunityOwner: true },
  }));
  expect(rows(owner)).toEqual(["Back", "Profile", "Account", "Billing", "Appearance", "General", "Public page", "Plans and pricing", "Your app", "Guide", "Danger"]);
  expect(owner).toContain('<div class="community-nav-section-label">Kiln</div>');
  const admin = renderToStaticMarkup(React.createElement(WebGlobalNavV1, {
    mode: "settings", settingsSidebar, onBackFromSettings: () => {},
    communityShell: { ...inCommunity, canManageMembersActiveCommunity: true, isActiveCommunityOwner: false },
  }));
  expect(rows(admin).slice(5)).toEqual(["General", "Guide"]);
  // A member: their own membership here, none of the community's sections.
  const member = renderToStaticMarkup(React.createElement(WebGlobalNavV1, {
    mode: "settings", settingsSidebar, onBackFromSettings: () => {},
    communityShell: { ...inCommunity, canManageMembersActiveCommunity: false },
  }));
  expect(rows(member).slice(5)).toEqual(["Membership"]);
  expect(member).toContain('<div class="community-nav-section-label">You in Kiln</div>');
});

