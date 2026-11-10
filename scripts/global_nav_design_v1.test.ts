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

test("Settings' left column: Back, Inbox, then the settings sections with the open one marked", () => {
  const html = renderToStaticMarkup(React.createElement(WebGlobalNavV1, {
    mode: "settings", communityShell, settingsSidebar, onBackFromSettings: () => {},
  }));
  expect(rows(html).slice(0, 2)).toEqual(["Back", "Inbox"]);
  expect(html).toContain('<div class="community-nav-section-label">Settings</div>');
  expect(html).toMatch(/<button class="nav-item active"[^>]*aria-current="page"[^>]*aria-label="Account"/);
  expect(html).not.toContain("Your communities");
});
