import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
test("workflow avatars reuse the feed holder without local sizing", () => {
  for (const file of ["WebCommunityWorkflowMemberStub.tsx", "WebCommunityWorkflowMemberDossierModal.tsx", "WebCommunityProfilePanel.tsx"]) {
    const source = readFileSync(new URL(`../apps/web/src/components/${file}`, import.meta.url), "utf8");
    expect(source).toContain('className="community-interaction-avatar"');
  }
  const css = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowsSection.css", import.meta.url), "utf8");
  expect(css).not.toContain(".workflow-member-stub-avatar");
  expect(css).not.toContain(".workflow-member-dossier-avatar");
  const communityCss = readFileSync(new URL("../apps/web/src/styles/community-and-content.css", import.meta.url), "utf8");
  expect(communityCss).not.toContain(".community-profile-panel-avatar");
});
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
  expect(html).toContain("community-members-list");
  expect(html).toContain("community-interaction-avatar");
  expect(html).not.toContain("community-context-member-avatar-media");
  expect(html).toContain("Open Member Name&#x27;s profile");
  expect(html).not.toContain("Active now");
  expect(html).not.toContain("community-context-member-activity");
  expect(html).not.toContain('aria-label="Manage');
  expect(html).not.toContain('aria-label="Message');
  expect(html).not.toContain("is-offline");
});
test("manager affordance is explicit and never appears on the owner stub", () => {
  const html = render(true);
  expect(html).toContain('aria-label="Manage Member Name"');
  expect(html).not.toContain('aria-label="Manage Owner Name"');
});
