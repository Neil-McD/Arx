import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { communityAgentSessionKey, showCommunityAgentWorkspace } from "../shared/communityAgentPageState";
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

test("conversation identity changes for community/account switches but not tab navigation", () => {
  expect(communityAgentSessionKey("member-a", "community-a")).not.toBe(communityAgentSessionKey("member-a", "community-b"));
  expect(communityAgentSessionKey("member-a", "community-a")).not.toBe(communityAgentSessionKey("member-b", "community-a"));
  expect(communityAgentSessionKey("member-a", "community-a")).toBe(communityAgentSessionKey("member-a", "community-a"));
  expect(communityAgentSessionKey(null, "community-a")).not.toBe(communityAgentSessionKey("member-a", "community-a"));
});

test("suppressed or unavailable Agent page keeps the primary content host visible", () => {
  const active = { pageMode: true, pageActive: true, isVisible: true };
  expect(showCommunityAgentWorkspace(active)).toBe(true);
  for (const patch of [{ isVisible: false }, { pageActive: false }, { pageMode: false }, { isSuppressed: true }]) {
    expect(showCommunityAgentWorkspace({ ...active, ...patch })).toBe(false);
  }
});

test("both conversation mounts and workspace containers use the scope/visibility boundary", () => {
  const source = readFileSync(new URL("../apps/web/src/components/WebAppCompositionRoot.tsx", import.meta.url), "utf8");
  expect(source.match(/key=\{agentSessionKey\}/g)).toHaveLength(2);
  expect(source).toContain('display: showAgentWorkspace ? "none" : "contents"');
  expect(source).toContain('display: showAgentWorkspace ? undefined : "none"');
});
