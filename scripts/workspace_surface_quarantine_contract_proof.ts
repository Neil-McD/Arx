import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readLegacyWorkspaceRouteContext } from "../shared/webAppRouteState.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const routes = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const launchSetupRoute = read("apps/web/src/communityLaunchSetupRoute.ts");
const mobileController = read("apps/web/src/controllers/useWebMobileShellController.ts");
const mobileTopBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const desktopHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const mainSurface = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const mcp = read("convex/httpMcp.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const emailEvents = read("convex/emailEvents.ts");
const emailDigests = read("convex/emailDigests.ts");
const eventReminders = read("convex/eventReminders.ts");

assert.deepEqual(readLegacyWorkspaceRouteContext("/workspace"), {
  kind: "root",
  communitySlug: null,
});
assert.deepEqual(readLegacyWorkspaceRouteContext("/workspace/thread/legacy-thread"), {
  kind: "thread",
  communitySlug: null,
});
assert.deepEqual(readLegacyWorkspaceRouteContext("/m/workspace/polynet"), {
  kind: "community",
  communitySlug: "polynet",
});
assert.equal(readLegacyWorkspaceRouteContext("/discover"), null);
assert.doesNotThrow(() => readLegacyWorkspaceRouteContext("/workspace/%E0%A4%A"));

const workspaceRouteBranch =
  routes.match(/if \(segments\[0\] === "workspace"\) \{[\s\S]*?\n  \}\n\n  if \(segments\[0\] === "settings"\)/)?.[0] ?? "";
assert.match(
  workspaceRouteBranch,
  /page: "community"[\s\S]*communityTab: "settings"/,
  "legacy launch setup URLs must restore on the community settings surface",
);
assert.match(
  workspaceRouteBranch,
  /return \{[\s\S]*page: "landing"/,
  "ordinary legacy Workspace URLs must enter a non-Workspace holding state",
);
assert.doesNotMatch(
  workspaceRouteBranch,
  /page: "workspace"/,
  "legacy Workspace parsing must never mount the Workspace product surface",
);
assert.match(
  routeLifecycle,
  /isLegacyWorkspaceRoutePath\(window\.location\.pathname\)\) return/,
  "path canonicalization must wait for the auth-aware legacy redirect",
);
assert.match(
  app,
  /legacyWorkspaceRedirectRef[\s\S]*readLegacyWorkspaceRouteContext[\s\S]*resolveAndEnterMemberDestination[\s\S]*buildCommunityFunnelPath/,
  "App must route legacy URLs through authoritative member destination resolution",
);
assert.match(
  app,
  /session && isCommunityLaunchSetupRoutePath\(pathname\)\) return/,
  "only authenticated legacy setup routes may remain in place for restoration",
);
assert.match(
  app,
  /shouldHoldLandingForAuth[\s\S]*isLegacyWorkspaceRoutePath\(window\.location\.pathname/,
  "legacy redirects must render a neutral hold instead of flashing another product surface",
);
assert.doesNotMatch(
  app,
  /navigateTo\("\/workspace/,
  "first-party App navigation must not directly enter Workspace",
);
assert.doesNotMatch(
  operatorGateway,
  /path: "\/workspace"/,
  "operator deploy probes must not advertise Workspace as a product route",
);
for (const [label, source] of [
  ["transactional email", emailEvents],
  ["community digest", emailDigests],
  ["event reminder", eventReminders],
] as const) {
  assert.doesNotMatch(source, /["'`]\/workspace(?:[\/"'`]|$)/, `${label} links must not enter Workspace`);
}
assert.match(
  app,
  /useState<MobileRootPage>\("community"\)[\s\S]*forceCommunityRoot: showMobileShell/,
  "reachable mobile navigation must remain community-scoped",
);
assert.match(
  mobileController,
  /handleExitMobileSettings[\s\S]*openMobileCommunitySurface\(\)/,
  "mobile settings must exit to a community or Discover",
);
assert.match(
  mobileTopBar,
  /\{!forceCommunityRoot \? \([\s\S]*Agent[\s\S]*\) : null\}/,
  "the obsolete mobile Agent selector must be hidden on reachable routes",
);
assert.match(
  desktopHeader,
  /onBackToCommunity[\s\S]*backTargetLabel \?\? "community"/,
  "desktop back navigation must use community language and behavior",
);
assert.match(
  launchSetupRoute,
  /buildCommunityTabPath\(communitySlug, "settings", null, "community"\)[\s\S]*community_launch_setup/,
  "new launch setup URLs must live under community settings",
);
assert.doesNotMatch(
  launchSetupRoute,
  /buildWorkspace(?:Community)?DraftPath/,
  "new launch setup URLs must not be generated under Workspace",
);

assert.match(
  mainSurface,
  /import \{ WebWorkspaceSurfaceHost \}[\s\S]*activePage === "workspace"[\s\S]*WebWorkspaceSurfaceHost/,
  "the protected Workspace implementation must remain isolated for later migration",
);
assert.match(
  mcp,
  /community_context: "workspace_context"/,
  "MCP wire compatibility must remain unchanged during UI quarantine",
);

console.log("workspace_surface_quarantine_contract_proof: ok");
