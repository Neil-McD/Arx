import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseAppRouteFromPathname, buildAppRoutePath } from "../shared/webAppRouteState";
const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("old Members links resolve to the channel view", () => {
  const route = parseAppRouteFromPathname("/c/example/members");
  expect(route?.view).toBe("home");
  expect(route?.communityTab).toBe("chat");
  expect(buildAppRoutePath(route!)).toBe("/c/example/chat");
});
test("one member surface retains search, settings, profiles and admission", () => {
  expect(existsSync(new URL("../apps/web/src/components/WebCommunityMembersPanel.tsx", import.meta.url))).toBe(false);
  expect(existsSync(new URL("../apps/web/src/components/WebCommunityMembersProfile.tsx", import.meta.url))).toBe(false);
  expect(read("shared/CommunityNav.tsx")).not.toContain("community-nav-members");
  const roster = read("apps/web/src/components/ChannelRosterPanel.tsx");
  for (const token of ["useWebMemberDirectorySearch", "CommunityMemberSettingsDialog", "props.onOpenProfile", "CommunityAutoJoinControl", "CommunityJoinRequestReview", "searchResult.progress"]) expect(roster).toContain(token);
  expect(roster).not.toContain("Search further");
});
