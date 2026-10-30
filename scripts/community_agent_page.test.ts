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

test("DM overlays preserve the desktop Agent page while retaining mobile and voice suppression", () => {
  const controller = readFileSync(new URL("../apps/web/src/controllers/useWebCommunityAgentSurfaceController.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
  expect(controller).toContain('(params.pageMode || !params.isDirectMessagesOpen)');
  expect(controller).toContain('(!isVisible || params.isDirectMessagesOpen || scopeChanged)');
  expect(app).toMatch(/useWebCommunityAgentSurfaceController\(\{\s*pageMode: !showMobileShell/);
  expect(controller).toContain('!params.isOnboardingModalOpen');
});

test("the old floating controls stay retired; only the Classroom layout floats the agent", () => {
  const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const component = read("apps/web/src/components/WebCommunityAgentDock.tsx");
  expect(component).not.toMatch(/setIsOpen|community-agent-dock-launcher/);
  expect(component).toContain("Boolean(props.mobileShellActive && props.mobileRoot)");
  expect(component).toContain("props.onRequestOpen?.()");
  expect(component).toContain("Start fresh conversation");
  // The one floating mode is opt-in from the shell, for a top-nav (Classroom) layout.
  expect(component).toContain("props.floating && !props.floating.open");
  expect(read("apps/web/src/App.tsx")).toContain('const floatingCommunityAgent = !showMobileShell && communityLayoutPosition === "top";');
  const styles = read("apps/web/src/components/WebCommunityAgentDock.css");
  expect(styles).not.toMatch(/community-agent-dock-launcher|working-pulse/);
  expect(styles).toContain(".community-agent-launcher");
  expect(styles).toContain(".community-agent-dock.mobile-root");
  expect(styles).toContain(".community-agent-dock.community-agent-page");
  expect(styles).toMatch(/prefers-reduced-motion[\s\S]*animation: none/);
  expect(read("apps/web/src/styles/community-and-content.css")).not.toContain("community-agent-desktop-launcher-clearance");
  expect(read("apps/web/src/index.css")).not.toContain("community-agent-dock-launcher");
});

test("both conversation mounts and workspace containers use the scope/visibility boundary", () => {
  const source = readFileSync(new URL("../apps/web/src/components/WebAppCompositionRoot.tsx", import.meta.url), "utf8");
  expect(source.match(/key=\{agentSessionKey\}/g)).toHaveLength(2);
  expect(source).toContain('display: showAgentWorkspace ? "none" : "contents"');
  expect(source).toContain('display: showAgentWorkspace ? undefined : "none"');
});

test("mobile Agent routing stays in the existing shell controller", () => {
  const app = readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../apps/web/src/controllers/useWebMobileShellController.ts", import.meta.url), "utf8");
  expect(app).not.toMatch(/\buseEffect\b/);
  expect(app).toContain('isCommunityAgentPage: activePage === "community" && communityTab === "agent"');
  expect(controller).toContain('params.showMobileShell && params.isCommunityAgentPage');
  expect(controller).toContain('params.setMobileRootPage("agent")');
});
