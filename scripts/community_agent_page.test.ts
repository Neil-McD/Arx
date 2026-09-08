import { expect, test } from "vitest";
import { parseCommunityTab, isCommunityTabAllowedForAccess } from "../shared/appShellNavigation";
import { parseAppRouteFromPathname as parseAppRouteFromPath, deriveWebDestinationFromAppRoute } from "../shared/webAppRouteState";

test("Agent route opens the member conversation while agent settings remain separate", () => {
  expect(parseCommunityTab("agent")).toBe("agent");
  expect(parseCommunityTab("ai_agent")).toBe("settings");
  const route = parseAppRouteFromPath("/c/test-community/agent");
  expect(route?.communityTab).toBe("agent");
  expect(deriveWebDestinationFromAppRoute(route!)).toEqual({ kind: "community_agent", slug: "test-community" });
  expect(isCommunityTabAllowedForAccess("agent", { canViewSettings: false, canManageMembers: false, canViewAnalytics: false })).toBe(true);
  expect(parseAppRouteFromPath("/c/test-community/settings/agent")?.communityTab).toBe("settings");
});
