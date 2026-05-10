import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DISCOVER_SKILL_CATALOG,
  deriveDiscoverSkillMentionToken,
  formatDiscoverSkillInvocation,
} from "../shared/discoverSkillCatalog.ts";
import { buildSkillMentionToken } from "../shared/skillMentionToken.ts";

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
  const communityJoinPolicy = readText(new URL("../apps/web/src/communityJoinPolicy.ts", import.meta.url));
  const publicFunnel = readText(new URL("../apps/web/src/components/WebPublicCommunityFunnel.tsx", import.meta.url));
  const communityFunnelUi = readText(new URL("../shared/communityFunnelUi.ts", import.meta.url));
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
  const sharedDiscoverSkillCatalog = readText(
    new URL("../shared/discoverSkillCatalog.ts", import.meta.url),
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
    communityJoinPolicy,
    "export function deriveCommunityFunnelAction",
    "community funnel action is derived from canonical entry policy",
  );
  assertNotIncludes(
    communityJoinPolicy,
    "CommunityJoinMode",
    "community policy no longer exposes legacy join mode as a first-class type",
  );
  assertIncludes(
    publicFunnelActions,
    "deriveCommunityFunnelAction(payload.community as { entry_policy?: unknown }) === \"request_access\"",
    "public funnel actions use semantic funnel action instead of legacy join mode",
  );
  assertNotIncludes(
    app,
    "deriveCommunityJoinMode",
    "App does not derive behavior from legacy join mode",
  );
  assertNotIncludes(
    publicFunnelActions,
    "deriveCommunityJoinMode",
    "public funnel actions do not derive behavior from legacy join mode",
  );
  assertNotIncludes(
    publicFunnel,
    "join_free",
    "public funnel component does not render legacy free-join mode",
  );
  assertNotIncludes(
    publicFunnel,
    "join_approval",
    "public funnel component does not render legacy approval-join mode",
  );
  assertNotIncludes(
    communityFunnelUi,
    "join_free",
    "shared funnel copy does not use legacy free-join mode",
  );
  assertNotIncludes(
    communityFunnelUi,
    "join_approval",
    "shared funnel copy does not use legacy approval-join mode",
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
    'return skillId ? `/discover/skills/${encodeURIComponent(skillId)}` : "/discover/skills";',
    "Discover Skills tab has a refresh-stable route",
  );
  assertIncludes(
    webAppRouteState,
    'discoverSkillId: discoverTab === "skills" ? String(segments[2] ?? "").trim() || null : null,',
    "Discover skill detail route restores selected skill id",
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
    pathRouteLifecycle,
    "discoverSkillId: params.discoverSkillId,",
    "route lifecycle preserves selected Discover skill while replacing app route",
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
    "() => initialAppRoute?.discoverSkillId ?? null",
    "App initializes selected Discover skill from the route",
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
    app,
    "discoverSkillId: selectedDiscoverSkillId,",
    "App writes selected Discover skill back to the app route",
  );
  assertIncludes(
    app,
    "selectedSkillId: selectedDiscoverSkillId,",
    "App passes selected Discover skill into the Discover panel",
  );
  assertIncludes(
    discoverPanel,
    '<span className="discover-app-action">View</span>',
    "Discover app rows use a neutral view action",
  );
  assertIncludes(
    discoverPanel,
    "const isDetailView = Boolean(selectedApp || selectedSkill);",
    "Discover detail pages share one detail-view predicate",
  );
  assertIncludes(
    discoverPanel,
    "{!isDetailView ? (",
    "Discover selector is only rendered on collection pages",
  );
  assertIncludes(
    discoverPanel,
    'className="discover-breadcrumb discover-hero-breadcrumb"',
    "Discover detail breadcrumb is rendered in the fixed header",
  );
  assertIncludes(
    discoverPanel,
    'className="discover-fixed-app-detail-header"',
    "Discover app identity header is rendered outside the scroll body",
  );
  assertIncludes(
    discoverPanel,
    "const renderSelectedAppHeader = () => {",
    "Discover app detail header has one canonical renderer",
  );
  assertIncludes(
    discoverPanel,
    "const renderSelectedSkillHeader = () => {",
    "Discover skill detail header has one canonical renderer",
  );
  const appDetailView = extractSection(
    discoverPanel,
    "{isAppsTab && selectedApp ? (",
    ") : isSkillsTab && selectedSkill ? (",
    "Discover app detail view",
  );
  assertNotIncludes(
    appDetailView,
    "selectedApp.heroNote",
    "Discover app detail does not render a promo spotlight banner",
  );
  assertNotIncludes(
    appDetailView,
    "discover-connect-status",
    "Discover app detail does not render redundant setup/status cards",
  );
  assertIncludes(
    appDetailView,
    "Description",
    "Discover app detail labels the capability section as Description",
  );
  assertIncludes(
    appDetailView,
    "Information",
    "Discover app detail keeps the information section",
  );
  const skillDetailView = extractSection(
    discoverPanel,
    ") : isSkillsTab && selectedSkill ? (",
    "          ) : (\n            <div className=\"discover-grid\">",
    "Discover skill detail view",
  );
  assertNotIncludes(
    skillDetailView,
    "selectedSkill.heroNote",
    "Discover skill detail does not render a promo spotlight banner",
  );
  assertNotIncludes(
    skillDetailView,
    "discover-connect-status",
    "Discover skill detail does not render redundant setup/status cards",
  );
  assertIncludes(
    skillDetailView,
    "Description",
    "Discover skill detail labels the capability section as Description",
  );
  assertIncludes(
    skillDetailView,
    "Information",
    "Discover skill detail keeps the information section",
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
  assertIncludes(
    sharedDiscoverSkillCatalog,
    'catalogSkillId: "hyperframes"',
    "Discover skill catalog includes canonical HyperFrames skill",
  );
  assertIncludes(
    sharedDiscoverSkillCatalog,
    'catalogSkillId: "higgsfield"',
    "Discover skill catalog includes canonical Higgsfield skill",
  );
  assertIncludes(
    sharedDiscoverSkillCatalog,
    "If project workspace tools are not active, produce the composition plan and code/file structure, but do not claim a preview or render completed.",
    "HyperFrames video skill keeps execution claims tied to active workspace tools",
  );
  assertIncludes(
    sharedDiscoverSkillCatalog,
    "bash for short npx hyperframes commands",
    "HyperFrames video skill reuses the existing workspace command tool instead of a bespoke execution surface",
  );
  assertIncludes(
    sharedDiscoverSkillCatalog,
    "If execution tools are not available, produce the creative brief, prompt set, reference-asset checklist, generation plan, and validation checklist, but do not claim an image or video was generated.",
    "Higgsfield media skill keeps generation claims tied to verified tools",
  );
  assertIncludes(
    sharedDiscoverSkillCatalog,
    "Be credit-aware. Call out actions that may spend provider credits before execution",
    "Higgsfield media skill keeps provider credit spend explicit",
  );
  assertNotIncludes(
    sharedDiscoverSkillCatalog,
    "invocation:",
    "Discover skills do not keep invocation as a second source of truth",
  );
  assertNotIncludes(
    discoverPanel,
    ".invocation",
    "Discover UI does not read manual skill invocation fields",
  );
  assertIncludes(
    discoverPanel,
    "selectedAppRelatedSkillPersonalActionLabel",
    "Discover app detail can project a related skill personal action",
  );
  assertIncludes(
    discoverPanel,
    "selectedAppRelatedSkillCommunityActionLabel",
    "Discover app detail can project a related skill community action",
  );
  assertIncludes(
    discoverPanel,
    "findRelatedDiscoverSkillForApp(selectedApp, discoverSkills)",
    "Discover app detail resolves one related skill until bundle UX exists",
  );
  assertNotIncludes(
    discoverPanel,
    "listRelatedDiscoverSkillsForApp",
    "Discover app detail does not carry a multi-skill helper before bundle UX exists",
  );
  assertIncludes(
    discoverPanel,
    "handleAddSkill(selectedAppPrimaryRelatedSkill)",
    "Discover related app skill action reuses the canonical skill install flow",
  );
  assertIncludes(
    discoverPanel,
    "handleAddSkillToCommunity(selectedAppPrimaryRelatedSkill)",
    "Discover related app skill action reuses the canonical community skill install flow",
  );
  assertNotIncludes(
    discoverPanel,
    "Add ${selectedAppPrimaryRelatedSkill.name} skill",
    "Discover related app primary CTA should use app-style Add copy, not implementation-specific skill copy",
  );
  for (const skill of DISCOVER_SKILL_CATALOG) {
    if (!skill.installInput) continue;
    const expectedToken = buildSkillMentionToken(skill.installInput.name, "");
    assert.equal(
      deriveDiscoverSkillMentionToken(skill),
      expectedToken,
      `expected ${skill.id} invocation token to derive from installInput.name`,
    );
    assert.equal(
      formatDiscoverSkillInvocation(skill),
      `$${expectedToken}`,
      `expected ${skill.id} display invocation to match derived token`,
    );
  }

  console.log(
    "PASS: Discover lists only published communities, routes access through funnel gates, and reads marketplace catalog through the server gateway.",
  );
}

main();
