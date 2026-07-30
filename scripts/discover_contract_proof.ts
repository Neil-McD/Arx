import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function extractSection(
  source: string,
  startNeedle: string,
  endNeedle: string,
  label: string,
): string {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `expected to find ${label} start`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `expected to find ${label} end`);
  return source.slice(start, end);
}

function main() {
  const communityPublic = readText(
    new URL("../convex/communityPublic.ts", import.meta.url),
  );
  const app = readText(new URL("../apps/web/src/App.tsx", import.meta.url));
  const discoverActivationController = readText(
    new URL(
      "../apps/web/src/controllers/useWebDiscoverActivationController.ts",
      import.meta.url,
    ),
  );
  const discoverPanel = readText(
    new URL("../apps/web/src/components/WebDiscoverPanel.tsx", import.meta.url),
  );
  const discoverController = readText(
    new URL("../shared/useWebDiscoverController.ts", import.meta.url),
  );
  const appShellNavigation = readText(
    new URL("../shared/appShellNavigation.ts", import.meta.url),
  );
  const webAppRouteState = readText(
    new URL("../shared/webAppRouteState.ts", import.meta.url),
  );
  const pathRouteLifecycle = readText(
    new URL(
      "../apps/web/src/controllers/useWebPathRouteLifecycle.ts",
      import.meta.url,
    ),
  );
  const navSnapshot = readText(
    new URL("../shared/navSnapshot.ts", import.meta.url),
  );
  const accountSettings = readText(
    new URL(
      "../apps/web/src/components/WebSettingsPanels.tsx",
      import.meta.url,
    ),
  );

  const listDiscover = extractSection(
    communityPublic,
    "export const listPublicDiscoverCommunities = query({",
    "export const getMyJoinRequestBySlug = query({",
    "public Discover community listing",
  );
  assert.match(
    listDiscover,
    /\.withIndex\("by_visibility_updatedAt", \(q\) => q\.eq\("visibility", "published"\)\)/,
    "Discover must list only published communities",
  );
  assert.doesNotMatch(
    listDiscover,
    /communityMemberships|communitySubscriptions/,
    "Discover listing must not derive access or entitlement",
  );

  const resolveFunnel = extractSection(
    communityPublic,
    "export const resolvePublicFunnelBySlug = query({",
    "export const resolvePublicFunnelStatsBySlug = query({",
    "public funnel resolver",
  );
  assert.match(
    resolveFunnel,
    /\.withIndex\("by_slug", \(q\) => q\.eq\("slug", slug\)\)/,
    "community funnels must resolve direct links by slug",
  );
  assert.doesNotMatch(
    resolveFunnel,
    /community\.visibility !== "published"/,
    "unlisted direct-link funnels must remain reachable",
  );

  assert.match(
    discoverActivationController,
    /openPublicCommunityFunnel\(slug, \{\s*pushSnapshot: true,\s*\}\)/,
    "Discover cards must enter the canonical community funnel",
  );
  assert.doesNotMatch(
    discoverActivationController,
    /joinPublicCommunity\(|setActivePage\("community"\)/,
    "Discover cards must not bypass the gate",
  );

  assert.doesNotMatch(
    appShellNavigation,
    /DiscoverTab|parseDiscoverTab/,
    "single-mode Discover must not retain tab state",
  );

  assert.match(
    webAppRouteState,
    /if \(segments\[0\] === "discover"[\s\S]*page: "discover"/,
    "legacy Discover URLs must parse into the communities route",
  );
  assert.doesNotMatch(
    webAppRouteState,
    /discoverTab|discoverAppId|discoverSkillId/,
    "route state must not retain dead catalog metadata",
  );
  assert.match(
    webAppRouteState,
    /if \(state\.page === "discover"\) \{\s*return "\/discover";/,
    "all Discover state must serialize to the canonical path",
  );
  assert.doesNotMatch(
    webAppRouteState,
    /`\/discover\/(apps|skills)/,
    "route building must not emit retired catalog URLs",
  );
  assert.doesNotMatch(
    pathRouteLifecycle,
    /discoverTab|discoverAppId|discoverSkillId/,
    "route lifecycle must not carry retired catalog state",
  );

  assert.match(
    discoverController,
    /listCloudDiscoverCommunities\(\{ limit: 60 \}\)/,
    "Discover must load communities",
  );
  assert.doesNotMatch(
    discoverController,
    /Marketplace|setDiscoverApps|setDiscoverSkills/,
    "Discover must not fetch or store marketplace catalogs",
  );
  assert.match(
    discoverPanel,
    />Discover Communities</,
    "Discover must identify its sole purpose",
  );
  assert.match(
    discoverPanel,
    /<DiscoverCommunityCard/,
    "Discover must render community cards",
  );
  assert.doesNotMatch(
    discoverPanel,
    /DiscoverTab|DiscoverApp|DiscoverSkill|tablist|selectedApp|selectedSkill/,
    "Discover UI must not retain catalog or tab machinery",
  );

  assert.doesNotMatch(
    app,
    /discoverActiveTab|selectedDiscoverAppId|selectedDiscoverSkillId|discoverApps|discoverSkills/,
    "App must not retain retired Discover state",
  );
  assert.doesNotMatch(
    accountSettings,
    /openDiscoverApps|openDiscoverSkills|Browse apps|Browse skills/,
    "settings must not route back into retired Discover catalogs",
  );
  assert.doesNotMatch(
    navSnapshot,
    /\| "apps"|\| "skills"|formatDiscoverRouteBackTargetLabel/,
    "back navigation must not model retired catalog destinations",
  );

  console.log("discover_contract_proof: ok (communities only)");
}

main();
