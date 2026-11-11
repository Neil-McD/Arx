import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { canPreviewAsMember, memberPreviewAccess, memberPreviewChannels } = await import("../shared/communityMemberPreview");
const { deriveCommunityAccessCapabilities, deriveCommunitySettingsLayer } = await import("../shared/communityAccessViewModel");
const { WebAccountMenu } = await import("../apps/web/src/components/WebAccountMenu");
import type { CommunityAccess } from "../shared/communityTypes";

const owner: CommunityAccess = {
  community_id: "c1", user_id: "u1", relation: "owner", is_owner: true, is_entitled: true,
  entitlement_role: "owner", entitlement_ends_at: null, effective_role: "owner",
  can_view_landing: true, can_enter_community: true, can_read_chat: true, can_post_chat: true,
  can_view: true, can_post_message: true, can_manage_resources: true, can_moderate_content: true,
  can_manage_members: true, can_review_join_requests: true, can_manage_pricing: true,
  can_manage_branding: true, can_manage_publishing: true, can_manage_payouts: true,
};

test("only the people who run the community may preview as a member", () => {
  expect(canPreviewAsMember(owner)).toBe(true);
  expect(canPreviewAsMember({ ...owner, is_owner: false, effective_role: "admin" })).toBe(true);
  expect(canPreviewAsMember({ ...owner, is_owner: false, effective_role: "moderator" })).toBe(false);
  expect(canPreviewAsMember({ ...owner, is_owner: false, effective_role: "member" })).toBe(false);
  expect(canPreviewAsMember(null)).toBe(false);
});

test("the preview keeps reading and posting and takes every host power away", () => {
  const seen = memberPreviewAccess(owner);
  expect(seen).toMatchObject({
    is_owner: false, effective_role: "member", relation: "member",
    can_enter_community: true, can_read_chat: true, can_post_chat: true, can_post_message: true,
  });
  for (const [key, value] of Object.entries(seen)) {
    if (/^can_(manage|moderate|review)/.test(key)) expect(value, key).toBe(false);
  }
  const can = deriveCommunityAccessCapabilities(seen);
  expect(can).toMatchObject({ isOwner: false, canManageMembers: false, canViewAnalytics: false, canModerateContent: false });
  expect(deriveCommunitySettingsLayer(seen)).toBe("member");
});

test("the preview hides restricted channels, which a new member has no grant to", () => {
  const channels = [
    { id: "g", access_mode: "all_members" as const },
    { id: "f", access_mode: "restricted" as const },
    { id: "w" },
  ];
  expect(memberPreviewChannels(channels).map((channel) => channel.id)).toEqual(["g", "w"]);
});

test("the account menu offers View as a member, and Host view to come back", () => {
  const base = { name: "Neil", avatarUrl: null, appTheme: "dark" as const, onSetAppTheme: () => {}, onOpenSettings: () => {}, onSignOut: async () => {} };
  const source = renderToStaticMarkup(React.createElement(WebAccountMenu, { ...base, roleLabel: "Viewing as a member", memberView: { active: true, onToggle: () => {} } }));
  // Closed, the card says whose eyes you are looking through.
  expect(source).toContain("Viewing as a member");
});
