import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertNotIncludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} not to include ${needle}`);
}

function extractSection(source: string, startNeedle: string, endNeedle: string, label: string): string {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `expected to find ${label} start`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `expected to find ${label} end`);
  return source.slice(start, end);
}

function main() {
  const communityPublic = readText(new URL("../convex/communityPublic.ts", import.meta.url));
  const app = readText(new URL("../apps/web/src/App.tsx", import.meta.url));
  const publicFunnelActions = readText(
    new URL("../apps/web/src/controllers/useWebPublicFunnelActions.ts", import.meta.url),
  );
  const discoverPanel = readText(new URL("../apps/web/src/components/WebDiscoverPanel.tsx", import.meta.url));
  const baseCss = readText(new URL("../apps/web/src/base.css", import.meta.url));
  const webAppRouteState = readText(new URL("../shared/webAppRouteState.ts", import.meta.url));
  const appShellNavigation = readText(new URL("../shared/appShellNavigation.ts", import.meta.url));
  const pathRouteLifecycle = readText(
    new URL("../apps/web/src/controllers/useWebPathRouteLifecycle.ts", import.meta.url),
  );
  const discoverMarketplace = readText(new URL("../convex/discoverMarketplace.ts", import.meta.url));
  const discoverController = readText(new URL("../shared/useWebDiscoverController.ts", import.meta.url));
  const discoverPreloadLifecycle = readText(
    new URL("../apps/web/src/controllers/useWebDiscoverPreloadLifecycle.ts", import.meta.url),
  );
  const discoverMarketplaceGateway = readText(
    new URL("../shared/cloudDiscoverMarketplaceGateway.ts", import.meta.url),
  );
  const webDiscoverAppCatalog = readText(new URL("../apps/web/src/lib/discoverCatalog.ts", import.meta.url));
  const webDiscoverSkillCatalog = readText(
    new URL("../apps/web/src/lib/discoverSkillCatalog.ts", import.meta.url),
  );
  const cloudCommunityAccessGateway = readText(
    new URL("../shared/cloudCommunityAccessGateway.ts", import.meta.url),
  );

  const listDiscover = extractSection(
    communityPublic,
    "export const listPublicDiscoverCommunities = query({",
    "export const getMyJoinRequestBySlug = query({",
    "public Discover community listing",
  );
  assertIncludes(
    listDiscover,
    '.withIndex("by_visibility_updatedAt", (q) => q.eq("visibility", "published"))',
    "Discover lists only published communities",
  );
  assertNotIncludes(
    listDiscover,
    "communityMemberships",
    "Discover listing does not derive or grant membership access",
  );
  assertNotIncludes(
    listDiscover,
    "communitySubscriptions",
    "Discover listing does not derive subscription access",
  );

  const resolveFunnel = extractSection(
    communityPublic,
    "export const resolvePublicFunnelBySlug = query({",
    "export const resolvePublicFunnelStatsBySlug = query({",
    "public funnel resolver",
  );
  assertIncludes(
    resolveFunnel,
    '.withIndex("by_slug", (q) => q.eq("slug", slug))',
    "public funnel resolves by direct slug",
  );
  assertIncludes(
    resolveFunnel,
    "visibility: community.visibility",
    "public funnel returns visibility for direct-link presentation",
  );
  assertNotIncludes(
    resolveFunnel,
    'q.eq("visibility", "published")',
    "public funnel is not limited to Discover-published communities",
  );
  assertNotIncludes(
    resolveFunnel,
    'community.visibility !== "published"',
    "unlisted direct-link funnel is not blocked by visibility",
  );

  const activateDiscoverCard = extractSection(
    app,
    "const activateDiscoverCommunityCard = useCallback((opts: {",
    "const settingsPanelsProps: WebSettingsPanelsProps = {",
    "Discover card activation",
  );
  assertIncludes(
    activateDiscoverCard,
    "publicCommunityUi.setPublicCommunityAccess(null);",
    "Discover card activation clears access instead of granting it",
  );
  assertIncludes(
    activateDiscoverCard,
    "openPublicCommunityFunnel(slug, { pushSnapshot: true });",
    "Discover card activation opens the public funnel for unknown communities",
  );
  assertNotIncludes(
    activateDiscoverCard,
    "joinPublicCommunity(",
    "Discover card activation does not directly join the community",
  );
  assertNotIncludes(
    activateDiscoverCard,
    "setActivePage(\"community\")",
    "Discover card activation does not directly enter the community surface",
  );

  assertIncludes(
    discoverPanel,
    "onActivate: () => args.onActivateCommunity(community)",
    "Discover cards delegate activation through the funnel-aware app handler",
  );
  assertNotIncludes(
    discoverPanel,
    "RefreshCw",
    "Discover does not render a redundant in-app refresh icon",
  );
  assertNotIncludes(
    discoverPanel,
    "onRefreshDiscover",
    "Discover panel does not carry a redundant manual refresh prop",
  );
  assertNotIncludes(
    baseCss,
    "discover-refresh-button",
    "Discover refresh button styles are removed with the control",
  );
  assertIncludes(
    publicFunnelActions,
    "fetchCloudMyCommunityAccessBySlug<AuthSession, CommunityAccessT>({",
    "public funnel verifies signed-in access separately from Discover state",
  );
  assertIncludes(
    publicFunnelActions,
    "access && (access.can_enter_community || access.is_owner)",
    "public funnel requires entitlement before opening the community",
  );
  assertIncludes(
    cloudCommunityAccessGateway,
    'client.query("community:getMyCommunityAccessBySlug" as any',
    "frontend access check calls canonical Convex access query",
  );
  assertIncludes(
    discoverMarketplace,
    "export const listDiscoverMarketplaceCatalog = query({",
    "Discover marketplace catalog is exposed from Convex",
  );
  assertIncludes(
    discoverMarketplace,
    'from "../shared/discoverCatalog"',
    "Discover app catalog source is shared with the Convex read model",
  );
  assertIncludes(
    discoverMarketplace,
    'from "../shared/discoverSkillCatalog"',
    "Discover skill catalog source is shared with the Convex read model",
  );
  assertIncludes(
    discoverMarketplaceGateway,
    '"discoverMarketplace:listDiscoverMarketplaceCatalog" as any',
    "frontend marketplace gateway calls the Convex read model",
  );
  assertIncludes(
    discoverController,
    "listCloudDiscoverMarketplaceCatalog()",
    "Discover controller loads marketplace catalog through the gateway",
  );
  assertIncludes(
    discoverController,
    "current.setDiscoverApps(marketplaceCatalog.apps);",
    "Discover controller projects server apps into Discover state",
  );
  assertIncludes(
    discoverController,
    "current.setDiscoverSkills(marketplaceCatalog.skills);",
    "Discover controller projects server skills into Discover state",
  );
  assertIncludes(
    discoverController,
    "current.setLastDiscoverLoadAttemptedAt(Date.now());",
    "Discover load attempts are timestamped before network work starts",
  );
  assertIncludes(
    discoverPreloadLifecycle,
    "const DISCOVER_STALE_WINDOW_MS = 60_000;",
    "Discover reloads are bounded by a short freshness window",
  );
  assertIncludes(
    discoverPreloadLifecycle,
    "if (!isStale) return;",
    "Discover preload lifecycle throttles both empty and failed load attempts",
  );
  assertIncludes(
    appShellNavigation,
    'export type DiscoverTab = "communities" | "apps" | "skills";',
    "Discover tab identity is shared outside the panel",
  );
  assertIncludes(
    webAppRouteState,
    'if (tab === "apps") {',
    "Discover Apps tab has a refresh-stable route",
  );
  assertIncludes(
    webAppRouteState,
    'return appId ? `/discover/apps/${encodeURIComponent(appId)}` : "/discover/apps";',
    "Discover app detail has a refresh-stable route",
  );
  assertIncludes(
    webAppRouteState,
    'discoverAppId: discoverTab === "apps" ? String(segments[2] ?? "").trim() || null : null,',
    "Discover app detail route restores selected app id",
  );
  assertIncludes(
    webAppRouteState,
    'if (tab === "skills") return "/discover/skills";',
    "Discover Skills tab has a refresh-stable route",
  );
  assertIncludes(
    pathRouteLifecycle,
    "discoverTab: params.discoverTab,",
    "route lifecycle preserves Discover tab while replacing app route",
  );
  assertIncludes(
    pathRouteLifecycle,
    "discoverAppId: params.discoverAppId,",
    "route lifecycle preserves selected Discover app while replacing app route",
  );
  assertIncludes(
    app,
    "() => initialAppRoute?.discoverTab ?? \"communities\"",
    "App initializes Discover tab from the route",
  );
  assertIncludes(
    app,
    "() => initialAppRoute?.discoverAppId ?? null",
    "App initializes selected Discover app from the route",
  );
  assertIncludes(
    app,
    "discoverTab: discoverActiveTab,",
    "App writes active Discover tab back to the app route",
  );
  assertIncludes(
    app,
    "discoverAppId: selectedDiscoverAppId,",
    "App writes selected Discover app back to the app route",
  );
  assertIncludes(
    discoverPanel,
    '<span className="discover-app-action">View</span>',
    "Discover app rows use a neutral view action",
  );
  assertIncludes(
    discoverPanel,
    "const shouldShowHeroCopy = !selectedApp;",
    "Discover app detail removes the redundant page hero copy",
  );
  assertIncludes(
    discoverPanel,
    "{shouldShowHeroCopy ? (",
    "Discover page hero copy is only rendered when useful",
  );
  assertIncludes(
    discoverPanel,
    'className="discover-breadcrumb discover-hero-breadcrumb"',
    "Discover app detail breadcrumb is rendered in the fixed header",
  );
  assertNotIncludes(
    discoverPanel,
    '? "Add"\n                            : "Catalog"',
    "Discover app rows do not mix add/catalog labels into the row action",
  );
  assertNotIncludes(
    discoverPanel,
    "DISCOVER_APP_CATALOG",
    "Discover panel does not read the static app catalog directly",
  );
  assertNotIncludes(
    discoverPanel,
    "DISCOVER_SKILL_CATALOG",
    "Discover panel does not read the static skill catalog directly",
  );
  assertIncludes(
    webDiscoverAppCatalog.trim(),
    'export * from "../../../../shared/discoverCatalog";',
    "web app catalog module delegates to shared canonical catalog",
  );
  assertIncludes(
    webDiscoverSkillCatalog.trim(),
    'export * from "../../../../shared/discoverSkillCatalog";',
    "web skill catalog module delegates to shared canonical catalog",
  );

  console.log(
    "PASS: Discover lists only published communities, routes access through funnel gates, and reads marketplace catalog through the server gateway.",
  );
}

main();
