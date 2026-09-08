import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const requireFromRoot = createRequire(import.meta.url);
if (requireFromWeb.resolve("react") !== requireFromRoot.resolve("react")) {
  vi.doMock(requireFromWeb.resolve("react"), () => React);
}
const { CommunityContextPanel } = await import("../apps/web/src/components/CommunityContextPanel");

const members = [
  { id: "owner:community", community_id: "community", user_id: "owner", display_name: "Owner Name", role: "owner", created_at: "", last_active_at: "" },
  { id: "membership", community_id: "community", user_id: "member", display_name: "Member Name", role: "member", created_at: "", last_active_at: "" },
];
function render(canManageMembers: boolean) {
  return renderToStaticMarkup(createElement(CommunityContextPanel, {
    communityName: "Community", ownerId: "owner", members, memberCount: 2,
    onlineUserIds: new Set(["owner"]), canManageMembers,
    onOpenMemberSettings: () => {}, onOpenMemberProfile: () => {},
    displayName: id => id, getInitials: () => "MN", getAvatarColor: () => "#aaa",
  }));
}
test("member stubs expose profiles, role and activity without management or message clutter", () => {
  const html = render(false);
  expect(html).toContain("community-members-grid");
  expect(html).toContain("Open Member Name&#x27;s profile");
  expect(html).toContain("Active now");
  expect(html).not.toContain('aria-label="Manage');
  expect(html).not.toContain('aria-label="Message');
  expect(html).not.toContain("is-offline");
});
test("manager affordance is explicit and never appears on the owner stub", () => {
  const html = render(true);
  expect(html).toContain('aria-label="Manage Member Name"');
  expect(html).not.toContain('aria-label="Manage Owner Name"');
});
