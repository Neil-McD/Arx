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
