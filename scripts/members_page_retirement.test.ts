import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseAppRouteFromPathname, buildAppRoutePath } from "../shared/webAppRouteState";
const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("old Members links resolve to the channel view unless the community's layout shows Members", () => {
  const route = parseAppRouteFromPathname("/c/example/members");
  expect(route?.view).toBe("home");
  expect(route?.communityTab).toBe("members");
  expect(buildAppRoutePath(route!)).toBe("/c/example/members");
  // The default layout hides Members, so the shell sends the link on to chat.
  const host = read("apps/web/src/components/WebShellChromeHost.tsx");
  expect(host).toContain("layoutHidesActiveTab");
  expect(host).toContain('onSelectCommunityTab("chat")');
});
test("one member surface retains search, settings, profiles and admission", () => {
  expect(existsSync(new URL("../apps/web/src/components/WebCommunityMembersPanel.tsx", import.meta.url))).toBe(false);
  expect(existsSync(new URL("../apps/web/src/components/WebCommunityMembersProfile.tsx", import.meta.url))).toBe(false);
  expect(read("shared/CommunityNav.tsx")).not.toContain("community-nav-members");
  expect(existsSync(new URL("../apps/web/src/components/CommunityContextPanel.tsx", import.meta.url))).toBe(false);
  expect(read("apps/web/src/components/WebCommunityInteractionProjection.tsx")).not.toContain("CommunityInteractionContextPanelSurface");
  expect(read("shared/appShellNavigation.ts")).not.toContain('"community_members"');
  const roster = read("apps/web/src/components/ChannelRosterPanel.tsx");
  for (const token of ["useWebMemberDirectorySearch", "CommunityMemberSettingsDialog", "props.onOpenProfile", "CommunityAutoJoinControl", "CommunityJoinRequestReview", "searchResult.progress"]) expect(roster).toContain(token);
  expect(roster).not.toContain("Search further");
  expect(roster).toContain("searchResult.hasMore && !searchResult.paused");
  expect(roster).toContain("communityPresenceLeaseIsActive");
  expect(roster).toContain('member.role !== "owner"');
  expect(roster).toContain("<UserAvatar");
});
